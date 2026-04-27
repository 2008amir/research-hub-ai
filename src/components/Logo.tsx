import { FlaskConical } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 group">
      <div className="relative h-9 w-9 rounded-lg gradient-bg flex items-center justify-center glow group-hover:scale-105 transition-transform">
        <FlaskConical className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="leading-tight">
        <div className="font-bold text-base gradient-text">Ecomedic</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground -mt-0.5">Squad</div>
      </div>
    </Link>
  );
}
