import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const STORAGE_KEY = "ecomedic:active_day";
const RETRY_DELAYS = [2_000, 6_000, 15_000];
const lastAttemptByKey = new Map<string, number>();
const inFlightKeys = new Set<string>();

function todayStr() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export async function recordActivity(userId: string, options: { force?: boolean } = {}) {
  if (!userId) return false;

  const day = todayStr();
  const key = `${STORAGE_KEY}:${userId}:${day}`;
  const now = Date.now();
  const lastAttempt = lastAttemptByKey.get(key) ?? 0;
  if (inFlightKeys.has(key)) return false;
  if (!options.force && now - lastAttempt < 30_000) return false;

  lastAttemptByKey.set(key, now);
  inFlightKeys.add(key);

  try {
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      const { error } = await supabase
        .from("active_days")
        .upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true });

      if (!error) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, "1");
          window.dispatchEvent(new CustomEvent("ecomedic:activity-recorded", { detail: { userId, day } }));
        }
        return true;
      }

      if (attempt === RETRY_DELAYS.length) {
        console.error("Unable to record daily activity", error);
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  } finally {
    inFlightKeys.delete(key);
  }

  return false;
}

export function ActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const lastFiredRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;
    const fingerprint = `${user.id}:${todayStr()}:${location.pathname}`;
    if (lastFiredRef.current === fingerprint) return;
    lastFiredRef.current = fingerprint;
    void recordActivity(user.id, { force: true });
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user) return;

    const handler = () => { void recordActivity(user.id); };
    const forceHandler = () => { void recordActivity(user.id, { force: true }); };

    window.addEventListener("click", handler, true);
    window.addEventListener("keydown", handler, true);
    window.addEventListener("focus", forceHandler);
    document.addEventListener("visibilitychange", forceHandler);

    return () => {
      window.removeEventListener("click", handler, true);
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("focus", forceHandler);
      document.removeEventListener("visibilitychange", forceHandler);
    };
  }, [user]);

  useEffect(() => {
    const refreshStats = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    };
    window.addEventListener("ecomedic:activity-recorded", refreshStats);
    return () => window.removeEventListener("ecomedic:activity-recorded", refreshStats);
  }, [queryClient]);

  return null;
}
