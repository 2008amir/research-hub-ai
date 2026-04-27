import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { AuthScreen } from "@/components/AuthScreen";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RequireAuth({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { user, isAdmin, rolesLoaded, rolesError, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    // Only enforce admin requirement once roles have actually loaded —
    // otherwise transient DB errors bounce admins to /dashboard.
    if (requireAdmin && rolesLoaded && !rolesError && !isAdmin) {
      navigate({ to: "/dashboard" as never });
    }
  }, [user, isAdmin, rolesLoaded, rolesError, loading, requireAdmin, navigate]);

  if (requireAdmin && rolesLoaded && rolesError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-strong rounded-2xl p-6 max-w-sm text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-4 text-lg font-semibold">Admin access check failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{rolesError}</p>
          <Button onClick={refreshProfile} className="mt-5 gradient-bg text-primary-foreground hover:opacity-90">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!loading && !user) {
    return <AuthScreen />;
  }

  if (loading || !user || (requireAdmin && !rolesLoaded)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (requireAdmin && !isAdmin) return null;

  return <>{children}</>;
}
