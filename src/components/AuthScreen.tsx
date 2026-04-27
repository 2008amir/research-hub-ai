import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Logo } from "@/components/Logo";
import { CountrySelect } from "@/components/CountrySelect";
import { PasswordInput, isStrongPassword } from "@/components/PasswordInput";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

const signInSchema = z.object({
  identifier: z.string().min(1, "Required").max(255),
  password: z.string().min(1, "Required"),
});

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "Required").max(60),
  lastName: z.string().trim().min(1, "Required").max(60),
  username: z.string().trim().min(3, "Min 3 chars").max(30).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, _ only"),
  email: z.string().trim().email("Invalid email").max(255),
  country: z.string().min(1, "Select a country"),
  password: z.string().refine(isStrongPassword, { message: "Password doesn't meet all requirements" }),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

export function AuthScreen() {
  const { user, isAdmin, rolesLoaded, loading } = useAuth();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState("signin");

  useEffect(() => {
    // Wait for auth + roles to fully load before redirecting,
    // otherwise admins can briefly look like regular users and get sent to /dashboard.
    if (loading || !user || !rolesLoaded) return;
    navigate({ to: isAdmin ? "/admin" : "/dashboard" });
  }, [user, isAdmin, rolesLoaded, loading, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="container mx-auto px-4 py-6">
        <Logo />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md glass-strong rounded-2xl p-6 md:p-8">
          <div className="w-full">
            <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  authMode === "signin" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  authMode === "signup" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create account
              </button>
            </div>
            <div className="mt-6">
              <div style={{ display: authMode === "signin" ? "block" : "none" }}>
                <SignInForm />
              </div>
              <div style={{ display: authMode === "signup" ? "block" : "none" }}>
                <SignUpForm />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SignInForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = signInSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ identifier: flat.identifier?.[0] ?? "", password: flat.password?.[0] ?? "" });
      return;
    }
    setSubmitting(true);
    try {
      if (!identifier.includes("@")) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", identifier)
          .maybeSingle();
        if (!profile) {
          toast.error("Username not found. Please use your email to sign in.");
          setSubmitting(false);
          return;
        }
        toast.error("Please sign in with your email address.");
        setSubmitting(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) {
        toast.error(error.message);
        setSubmitting(false);
        return;
      }
      toast.success("Welcome back!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">Email or Username</Label>
        <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@example.com" autoComplete="username" className="glass" />
        {errors.identifier && <p className="text-xs text-destructive">{errors.identifier}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" className="glass" />
        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
      </div>
      <Button type="submit" disabled={submitting} className="w-full gradient-bg text-primary-foreground hover:opacity-90 glow">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}

function SignUpForm() {
  const [form, setForm] = useState({
    firstName: "", lastName: "", username: "", email: "", country: "", password: "", confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const e: Record<string, string> = {};
      for (const k in flat) e[k] = flat[k as keyof typeof flat]?.[0] ?? "";
      setErrors(e);
      return;
    }
    setSubmitting(true);
    try {
      const { data: existing } = await supabase
        .from("profiles").select("id").eq("username", form.username).maybeSingle();
      if (existing) {
        setErrors({ username: "Username already taken" });
        setSubmitting(false);
        return;
      }

      const redirectUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            first_name: form.firstName,
            last_name: form.lastName,
            username: form.username,
            country: form.country,
          },
        },
      });
      if (error) {
        toast.error(error.message);
        setSubmitting(false);
        return;
      }
      toast.success("Account created! Check your email to verify your account.");
      setSubmitting(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" value={form.firstName} onChange={set("firstName")} className="glass" />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" value={form.lastName} onChange={set("lastName")} className="glass" />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" value={form.username} onChange={set("username")} className="glass" />
        {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={form.email} onChange={set("email")} className="glass" />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <CountrySelect id="country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
        {errors.country && <p className="text-xs text-destructive">{errors.country}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" value={form.password} onChange={set("password")} className="glass" showStrength />
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput id="confirmPassword" value={form.confirmPassword} onChange={set("confirmPassword")} className="glass" />
          {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
        </div>
      </div>
      <Button type="submit" disabled={submitting} className="w-full gradient-bg text-primary-foreground hover:opacity-90 glow">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create account
      </Button>
    </form>
  );
}