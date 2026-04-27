import { forwardRef, useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  showStrength?: boolean;
};

export const passwordChecks = (pw: string) => ({
  length: pw.length >= 8,
  upper: /[A-Z]/.test(pw),
  lower: /[a-z]/.test(pw),
  number: /[0-9]/.test(pw),
  symbol: /[^A-Za-z0-9]/.test(pw),
});

export const isStrongPassword = (pw: string) =>
  Object.values(passwordChecks(pw)).every(Boolean);

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  ({ className, showStrength = false, value, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const pw = typeof value === "string" ? value : "";
    const checks = passwordChecks(pw);

    return (
      <div className="space-y-2">
        <div className="relative">
          <Input
            ref={ref}
            type={visible ? "text" : "password"}
            value={value}
            className={cn("pr-10", className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {showStrength && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <Rule ok={checks.length} label="8+ characters" />
            <Rule ok={checks.upper} label="Uppercase" />
            <Rule ok={checks.lower} label="Lowercase" />
            <Rule ok={checks.number} label="Number" />
            <Rule ok={checks.symbol} label="Symbol" />
          </ul>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 transition",
        ok ? "text-emerald-400" : "text-muted-foreground"
      )}
    >
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      <span>{label}</span>
    </li>
  );
}
