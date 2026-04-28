import { useNavigate } from "@tanstack/react-router";
import { FileText, Home, LogOut, MessageCircle, Plus, Search, Shield, User, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { recordActivity } from "@/lib/record-activity";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  homeTo: string;
  profileTo: string;
};

export function TopBar({ search, onSearchChange, homeTo, profileTo }: Props) {
  const { profile, user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const initials = ((profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "")).toUpperCase() || (user?.email?.[0]?.toUpperCase() ?? "U");
  const goTo = (to: string) => {
    if (user?.id) void recordActivity(user.id, { force: true });
    navigate({ to: to as never });
  };

  return (
    <header className="sticky top-0 z-30 glass-strong border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center gap-3">
        <Logo to={homeTo as never} />
        <div className="flex-1 max-w-xl mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="AI search across research..."
            className="pl-9 glass"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full ring-2 ring-border hover:ring-primary transition">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback className="gradient-bg text-primary-foreground text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-56">
            <DropdownMenuLabel>
              <div className="font-semibold">{profile?.first_name} {profile?.last_name}</div>
              <div className="text-xs text-muted-foreground font-normal">@{profile?.username}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => goTo(homeTo)}>
              <Home className="mr-2 h-4 w-4" /> Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => goTo(profileTo)}>
              <User className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => goTo("/admin")}>
                  <Shield className="mr-2 h-4 w-4" /> Admin Overview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => goTo("/admin/users")}>
                  <Users className="mr-2 h-4 w-4" /> Users
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => goTo("/admin/chat")}>
                  <MessageCircle className="mr-2 h-4 w-4" /> Chat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => goTo("/admin/research")}>
                  <FileText className="mr-2 h-4 w-4" /> Research
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => goTo("/admin/research/new")}>
                  <Plus className="mr-2 h-4 w-4" /> Add Research
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
