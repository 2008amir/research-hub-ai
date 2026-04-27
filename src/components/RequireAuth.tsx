import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export function RequireAuth({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { user, isAdmin, rolesLoaded, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    // Only enforce admin requirement once roles have actually loaded —
    // otherwise transient DB errors bounce admins to /dashboard.
    if (requireAdmin && rolesLoaded && !isAdmin) {
      navigate({ to: "/dashboard" as never });
    }
  }, [user, isAdmin, rolesLoaded, loading, requireAdmin, navigate]);

  if (loading || !user || (requireAdmin && !rolesLoaded) || (requireAdmin && !isAdmin)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
