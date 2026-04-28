import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  country: string;
  phone: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  rolesLoaded: boolean;
  rolesError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const ROLE_RETRY_DELAYS = [200, 450, 900];

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const initializedRef = useRef(false);

  const loadAuthStateWithRetry = async (requestId: number, currentUser: User, attempt = 0): Promise<void> => {

    const [profileResult, rolesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, username, country, phone, avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", currentUser.id),
    ]);

    if (loadRequestRef.current !== requestId) return;
    if (rolesResult.error && attempt < ROLE_RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, ROLE_RETRY_DELAYS[attempt]));
      return loadAuthStateWithRetry(requestId, currentUser, attempt + 1);
    }
    if (rolesResult.error) {
      setProfile(null);
      setIsAdmin(false);
      setRolesError("We couldn't verify your access. Please retry.");
      setRolesLoaded(true);
      return;
    }
    setProfile(profileResult.error ? null : ((profileResult.data as Profile | null) ?? null));
    setIsAdmin(Boolean(rolesResult.data?.some((r) => r.role === "admin")));
    setRolesError(null);
    setRolesLoaded(true);
  };

  const loadUserData = async (currentUser: User) => {
    const requestId = ++loadRequestRef.current;
    setRolesLoaded(false);
    setRolesError(null);
    await loadAuthStateWithRetry(requestId, currentUser);
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("active_days").upsert({ user_id: currentUser.id, day: today }, { onConflict: "user_id,day" }).then(() => {});
  };

  useEffect(() => {
    const applySession = (sess: Session | null, event?: AuthChangeEvent) => {
      if (event === "INITIAL_SESSION" && initializedRef.current) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setRolesLoaded(false);
        setRolesError(null);
        void loadUserData(sess.user);
      } else {
        loadRequestRef.current += 1;
        setProfile(null);
        setIsAdmin(false);
        setRolesError(null);
        setRolesLoaded(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "INITIAL_SESSION") return;
      applySession(sess, event);
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      initializedRef.current = true;
      applySession(sess);
      if (!sess?.user) setRolesLoaded(true);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) await loadUserData(user);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, rolesLoaded, rolesError, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
