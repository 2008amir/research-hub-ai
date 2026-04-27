import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, FlaskConical, Microscope, Pill, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: isAdmin ? "/admin" : "/dashboard" });
    }
  }, [user, isAdmin, loading, navigate]);

  return (
    <div className="min-h-screen">
      <header className="container mx-auto flex items-center justify-between py-6 px-4">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" className="text-foreground hover:bg-muted/50">Sign in</Button>
          </Link>
          <Link to="/auth">
            <Button className="gradient-bg text-primary-foreground hover:opacity-90 glow">
              Get started
            </Button>
          </Link>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-12 md:py-20">
        <section className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Research for a Better Tomorrow
            </div>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Advancing Research.
              <br />
              <span className="gradient-text">Transforming Health<span className="text-accent">.</span></span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-xl">
              Ecomedic Squad is dedicated to advancing scientific research in drug discovery and disease understanding to create impactful healthcare solutions.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="gradient-bg text-primary-foreground hover:opacity-90 glow">
                  Explore Our Research <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="ghost" className="hover:bg-muted/50">
                  Learn More <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative aspect-square max-w-md mx-auto">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 via-accent/20 to-transparent blur-3xl" />
            <div className="relative h-full w-full glass-strong rounded-3xl flex items-center justify-center">
              <FlaskConical className="h-32 w-32 text-primary" strokeWidth={1.2} />
            </div>
          </div>
        </section>

        <section className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { n: "120+", l: "Research Studies", s: "Completed & Ongoing", I: Microscope },
            { n: "45+", l: "Drugs Analyzed", s: "Preclinical to Clinical", I: Pill },
            { n: "30+", l: "Diseases Studied", s: "Across Areas", I: Activity },
            { n: "25+", l: "Collaborators", s: "Global Partnerships", I: FlaskConical },
          ].map(({ n, l, s, I }) => (
            <div key={l} className="glass rounded-2xl p-6 text-center">
              <I className="h-8 w-8 mx-auto text-primary mb-3" />
              <div className="text-3xl font-bold">{n}</div>
              <div className="text-sm font-medium mt-1">{l}</div>
              <div className="text-xs text-muted-foreground">{s}</div>
            </div>
          ))}
        </section>
      </main>

      <footer className="container mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Ecomedic Squad. Advancing science for global health.
      </footer>
    </div>
  );
}
