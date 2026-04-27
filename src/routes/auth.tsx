import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { CountrySelect } from "@/components/CountrySelect";
import { PasswordInput, isStrongPassword } from "@/components/PasswordInput";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: () => <Navigate to="/" />,
  head: () => ({
    meta: [
      { title: "Sign in or Create Account — Ecomedic Squad" },
      { name: "description", content: "Sign in to Ecomedic Squad or create your free researcher account." },
    ],
  }),
});

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

function AuthPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState("signin");

  useEffect(() => {
    if (!loading && user) navigate({ to: isAdmin ? "/admin" : "/dashboard" });
  }, [user, isAdmin, loading, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="container mx-auto px-4 py-6">
        <Logo />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md glass-strong rounded-2xl p-6 md:p-8">
          <Tabs value={authMode} onValueChange={setAuthMode} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/30">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-6"><SignInForm /></TabsContent>
            <TabsContent value="signup" className="mt-6"><SignUpForm /></TabsContent>
          </Tabs>
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

  const onSubmit = async (e: React.FormEvent) => {
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
      let email = identifier;
      // If not an email, look up by username
      if (!identifier.includes("@")) {
        // We can't query auth.users from client; ask user to sign in with email if username lookup fails.
        // For demo, fetch profile by username then use a sign-in via username->email mapping is not possible.
        // Instead, we surface a clear message.
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
        // We don't have a server function yet; suggest using email
        toast.error("Please sign in with your email address.");
        setSubmitting(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        setSubmitting(false);
        return;
      }
      toast.success("Welcome back!");
      // AuthProvider listener will update; redirect handled by /auth effect
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
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
      // Check username uniqueness early (best-effort)
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
      toast.success("Account created! Signing you in…");
      // With auto-confirm enabled, session is set automatically
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
