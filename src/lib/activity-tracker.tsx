import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { recordActivity } from "@/lib/record-activity";

function currentDayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function ActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const lastFiredRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;
    const fingerprint = `${user.id}:${currentDayKey()}:${location.pathname}`;
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
