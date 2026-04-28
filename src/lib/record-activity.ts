import { supabase } from "@/integrations/supabase/client";

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
  if (typeof window !== "undefined" && window.localStorage.getItem(key)) return false;
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
          window.dispatchEvent(
            new CustomEvent("ecomedic:activity-recorded", { detail: { userId, day } }),
          );
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