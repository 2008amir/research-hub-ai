import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const loadRolesWithRetry = async (userId: string, attempt = 0): Promise<void> => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error && attempt < 5) {
      // Transient DB error (e.g. 503 recovery) — retry with backoff
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      return loadRolesWithRetry(userId, attempt + 1);
    }
    setIsAdmin(!!data?.some((r) => r.role === "admin"));
    setRolesLoaded(true);
  };

  const loadProfileWithRetry = async (userId: string, attempt = 0): Promise<void> => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error && attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      return loadProfileWithRetry(userId, attempt + 1);
    }
    setProfile(data as Profile | null);
  };

  const loadUserData = async (userId: string) => {
    setRolesLoaded(false);
    await Promise.all([loadProfileWithRetry(userId), loadRolesWithRetry(userId)]);
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("active_days").upsert({ user_id: userId, day: today }, { onConflict: "user_id,day" }).then(() => {});
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setRolesLoaded(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        loadUserData(sess.user.id).finally(() => setLoading(false));
      } else {
        setRolesLoaded(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) await loadUserData(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, rolesLoaded, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
