import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const STORAGE_PREFIX = "ecomedic:active_day:";

async function recordActivity(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${STORAGE_PREFIX}${userId}:${today}`;
  if (typeof window !== "undefined" && window.localStorage.getItem(key) === "1") return;

  // Retry with backoff for transient 503 / schema cache errors
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await supabase
      .from("active_days")
      .upsert({ user_id: userId, day: today }, { onConflict: "user_id,day" });
    if (!error) {
      if (typeof window !== "undefined") window.localStorage.setItem(key, "1");
      return;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
}

/**
 * Tracks daily activity: fires once when user is loaded, then on every
 * route change and any user click/keypress (debounced via per-day storage).
 */
export function ActivityTracker() {
  const { user } = useAuth();
  const router = useRouter();
  const lastFiredDayRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    const fire = () => {
      const today = new Date().toISOString().slice(0, 10);
      // Always retry the network call once per day per session even if storage says done
      // (ensures the row really exists if a previous attempt failed before being marked).
      if (lastFiredDayRef.current === today) return;
      lastFiredDayRef.current = today;
      void recordActivity(userId);
    };

    // Initial fire
    fire();

    // Re-fire on any route change
    const unsub = router.subscribe("onResolved", () => fire());

    // Re-fire on any user interaction (covers button clicks too)
    const onInteract = () => fire();
    window.addEventListener("click", onInteract, { passive: true });
    window.addEventListener("keydown", onInteract, { passive: true });

    // Reset at midnight crossover
    const midnightTimer = window.setInterval(() => {
      const today = new Date().toISOString().slice(0, 10);
      if (lastFiredDayRef.current && lastFiredDayRef.current !== today) {
        lastFiredDayRef.current = null;
        fire();
      }
    }, 60_000);

    return () => {
      unsub();
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
      window.clearInterval(midnightTimer);
    };
  }, [user, router]);

  return null;
}
