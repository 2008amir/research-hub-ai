import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

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

const ROLE_RETRY_DELAYS = [350, 800];
const ADMIN_EMAILS = new Set(["ecomedicsquad@gmail.com"]);

const isConfiguredAdminEmail = (email?: string | null) =>
  !!email && ADMIN_EMAILS.has(email.trim().toLowerCase());

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

  const loadRolesWithRetry = async (userId: string, email: string | null | undefined, requestId: number, attempt = 0): Promise<void> => {
    const emailIsAdmin = isConfiguredAdminEmail(email);
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (loadRequestRef.current !== requestId) return;
    if (error && attempt < ROLE_RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, ROLE_RETRY_DELAYS[attempt]));
      return loadRolesWithRetry(userId, email, requestId, attempt + 1);
    }
    if (error) {
      setIsAdmin(emailIsAdmin);
      setRolesError(emailIsAdmin ? null : "We couldn't verify your access. Please retry.");
      setRolesLoaded(true);
      return;
    }
    setIsAdmin(emailIsAdmin || !!data?.some((r) => r.role === "admin"));
    setRolesError(null);
    setRolesLoaded(true);
  };

  const loadProfileWithRetry = async (userId: string, requestId: number, attempt = 0): Promise<void> => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (loadRequestRef.current !== requestId) return;
    if (error && attempt < ROLE_RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, ROLE_RETRY_DELAYS[attempt]));
      return loadProfileWithRetry(userId, requestId, attempt + 1);
    }
    setProfile(data as Profile | null);
  };

  const loadUserData = async (currentUser: User) => {
    const requestId = ++loadRequestRef.current;
    const emailIsAdmin = isConfiguredAdminEmail(currentUser.email);
    setIsAdmin(emailIsAdmin);
    setRolesLoaded(emailIsAdmin);
    setRolesError(null);
    await Promise.allSettled([loadProfileWithRetry(currentUser.id, requestId), loadRolesWithRetry(currentUser.id, currentUser.email, requestId)]);
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("active_days").upsert({ user_id: currentUser.id, day: today }, { onConflict: "user_id,day" }).then(() => {});
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        const emailIsAdmin = isConfiguredAdminEmail(sess.user.email);
        setIsAdmin(emailIsAdmin);
        setRolesLoaded(emailIsAdmin);
        setRolesError(null);
        void loadUserData(sess.user);
      } else {
        loadRequestRef.current += 1;
        setProfile(null);
        setIsAdmin(false);
        setRolesError(null);
        setRolesLoaded(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setIsAdmin(isConfiguredAdminEmail(sess.user.email));
        loadUserData(sess.user).finally(() => setLoading(false));
      } else {
        setRolesLoaded(true);
        setLoading(false);
      }
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
