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

const ROLE_RETRY_DELAYS = [150, 350];
const ADMIN_BOOTSTRAP_USER_ID = "6e0915e6-c64e-482d-883e-0112ee39b560";
const ADMIN_BOOTSTRAP_EMAIL = "ecomedicsquad@gmail.com";

function isBootstrapAdmin(user: User | null) {
  return Boolean(
    user &&
      (user.id === ADMIN_BOOTSTRAP_USER_ID || user.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL)
  );
}

function profileFromUser(user: User): Profile {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    first_name: typeof meta.first_name === "string" ? meta.first_name : "",
    last_name: typeof meta.last_name === "string" ? meta.last_name : "",
    username:
      typeof meta.username === "string" && meta.username.trim()
        ? meta.username
        : user.email?.split("@")[0] ?? "user",
    country: typeof meta.country === "string" ? meta.country : "",
    phone: typeof meta.phone === "string" ? meta.phone : null,
    avatar_url: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
  };
}

async function loadAuthStateRequest() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1_200);
  try {
    return await supabase.rpc("get_my_auth_state").abortSignal(controller.signal).single();
  } finally {
    window.clearTimeout(timeout);
  }
}

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
    const fallbackAdmin = isBootstrapAdmin(currentUser);
    const authStateResult = await loadAuthStateRequest();

    if (loadRequestRef.current !== requestId) return;
    if (authStateResult.error && attempt < ROLE_RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, ROLE_RETRY_DELAYS[attempt]));
      return loadAuthStateWithRetry(requestId, currentUser, attempt + 1);
    }
    if (authStateResult.error) {
      setProfile(profileFromUser(currentUser));
      setIsAdmin(fallbackAdmin);
      setRolesError(null);
      setRolesLoaded(true);
      return;
    }

    const row = authStateResult.data as { profile: Profile | null; is_admin: boolean | null } | null;
    setProfile(row?.profile ?? profileFromUser(currentUser));
    setIsAdmin(Boolean(row?.is_admin) || fallbackAdmin);
    setRolesError(null);
    setRolesLoaded(true);
  };

  const loadUserData = async (currentUser: User) => {
    const requestId = ++loadRequestRef.current;
    setRolesLoaded(false);
    setRolesError(null);
    setIsAdmin(isBootstrapAdmin(currentUser));
    await loadAuthStateWithRetry(requestId, currentUser);
    const today = new Date().toISOString().slice(0, 10);
    window.setTimeout(() => {
      supabase.from("active_days").upsert({ user_id: currentUser.id, day: today }, { onConflict: "user_id,day" }).then(() => {});
    }, 1_500);
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
