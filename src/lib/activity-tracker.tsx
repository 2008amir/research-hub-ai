import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const STORAGE_KEY = "ecomedic:active_day";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function recordActivity(userId: string) {
  const today = todayStr();
  const key = `${STORAGE_KEY}:${userId}:${today}`;
  if (typeof window !== "undefined" && window.localStorage.getItem(key)) return;

  const { error } = await supabase
    .from("active_days")
    .upsert({ user_id: userId, day: today }, { onConflict: "user_id,day" });

  if (!error && typeof window !== "undefined") {
    window.localStorage.setItem(key, "1");
  }
}

export function ActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const lastFiredRef = useRef<string>("");

  // Fire on login & route change
  useEffect(() => {
    if (!user) return;
    const fingerprint = `${user.id}:${todayStr()}:${location.pathname}`;
    if (lastFiredRef.current === fingerprint) return;
    lastFiredRef.current = fingerprint;
    void recordActivity(user.id);
  }, [user, location.pathname]);

  // Fire on any click / keypress (throttled via localStorage per-day)
  useEffect(() => {
    if (!user) return;
    const handler = () => { void recordActivity(user.id); };
    window.addEventListener("click", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [user]);

  return null;
}
