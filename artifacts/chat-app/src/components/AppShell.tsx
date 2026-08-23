import { useState } from "react";
import { Link, useLocation } from "wouter";
import { MessageSquare, Phone, ShieldCheck, Activity, Users, LogOut, Loader2, Bot, Zap, Timer, KeyRound, Headset, Ticket } from "lucide-react";
import { E2eeBackupDialog } from "./E2eeBackupDialog";
import { useAuthStore } from "../stores/auth";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { useLogout, useListConversations, User } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { CustomerHistoryDialog } from "./CustomerHistory";

interface AppShellProps {
  children: React.ReactNode;
  user: User;
}

export function AppShell({ children, user }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const setAccessToken = useAuthStore((s: any) => s.setAccessToken);
  const queryClient = useQueryClient();
  const [backupOpen, setBackupOpen] = useState(false);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setAccessToken(null);
        // Drop all cached data (incl. the old user's profile) so the next
        // login starts clean — a stale mustChangePassword flag would
        // otherwise bounce the next user to the change-password screen.
        queryClient.clear();
        setLocation("/login");
      }
    });
  };

  // Plain users are bound to a single agent — no navigation, no chrome.
  const isPlainUser = user.role === "user";

  const navItems = [
    // Admin dashboard first for admins.
    ...(user.role === "admin" ? [{ href: "/admin", label: "Admin Dashboard", icon: ShieldCheck }] : []),
    { href: "/", label: "Messages", icon: MessageSquare },
    { href: "/calls", label: "Calls", icon: Phone },
    // Staff (agent + admin): archived tickets of ended support chats.
    { href: "/history", label: "Chat History", icon: Ticket },
    // Staff-only (agent + admin) domain reports.
    ...(user.role === "admin"
      ? [
          { href: "/monitor", label: "Live Monitor", icon: Activity },
          { href: "/directory", label: "User Directory", icon: Users },
          { href: "/ai-support", label: "AI Support Settings", icon: Bot },
          { href: "/sla", label: "SLA", icon: Timer },
          { href: "/templates", label: "Quick Reply Templates", icon: Zap },
        ]
      : []),
  ];

  const isActive = (href: string) =>
    location === href || (location.startsWith(href) && href !== "/");

  // Users get a full-screen conversation with no side rail or bottom bar,
  // plus a slim identity header (their name/photo + assigned support agent).
  if (isPlainUser) {
    return (
      <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden relative">
        <PlainUserHeader user={user} onLogout={handleLogout} loggingOut={logout.isPending} />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 relative z-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden relative">
      <div className="absolute inset-0 bg-noise z-0 pointer-events-none" />

      {/* Slim dark icon rail — desktop */}
      <aside className="hidden md:flex flex-col items-center w-[72px] bg-sidebar border-r border-sidebar-border py-6 z-20 shrink-0 shadow-lg relative">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-8 shadow-lg shadow-primary/20 shrink-0">
          <img src="/skytalk-logo.svg" alt="SkyTalk" className="w-7 h-7" />
        </div>

        <nav className="flex flex-col gap-4 w-full px-3">
          {navItems.map((item) => (
            <RailItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-4 w-full px-3">
          <button
            onClick={() => setBackupOpen(true)}
            title="Chat history backup"
            aria-label="Chat history backup"
            className="relative group flex items-center justify-center w-12 h-10 rounded-xl text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-300"
          >
            <KeyRound className="h-[20px] w-[20px]" />
            <span className="absolute left-16 px-3 py-1.5 bg-popover text-popover-foreground text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0 z-50 shadow-xl border border-border whitespace-nowrap">
              Chat history backup
            </span>
          </button>
          <div className="w-10 h-10 rounded-full border border-sidebar-border bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-foreground shadow-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            title="Log out"
            aria-label="Log out"
            className="relative group flex items-center justify-center w-12 h-10 rounded-xl text-sidebar-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-all duration-300 disabled:opacity-50"
          >
            {logout.isPending ? (
              <Loader2 className="h-[20px] w-[20px] animate-spin" />
            ) : (
              <LogOut className="h-[20px] w-[20px]" />
            )}
            <span className="absolute left-16 px-3 py-1.5 bg-popover text-popover-foreground text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0 z-50 shadow-xl border border-border whitespace-nowrap">
              Log out
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative z-10 bg-background">
        {children}
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-sidebar border-t border-sidebar-border flex items-center justify-around px-4 z-20 pb-safe">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} aria-label={item.label}>
            <Button
              variant="ghost"
              size="icon"
              aria-hidden
              tabIndex={-1}
              className={cn(
                "h-10 w-10 rounded-full transition-all duration-200",
                isActive(item.href)
                  ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                  : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
            </Button>
          </Link>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground/50 h-10 w-10 rounded-full hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
          aria-label="Chat history backup"
          onClick={() => setBackupOpen(true)}
        >
          <KeyRound className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground/50 h-10 w-10 rounded-full hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
          aria-label="Log out"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </nav>

      <E2eeBackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
    </div>
  );
}

function PlainUserHeader({
  user,
  onLogout,
  loggingOut,
}: {
  user: User;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  // The caller's assigned support agent is the other side of their
  // "caller" conversation.
  const { data: conversations } = useListConversations();
  const agent = conversations?.find((c) => c.type === "caller")?.otherUser ?? null;

  return (
    <header className="h-16 shrink-0 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 z-20 shadow-sm">
      <div className="flex items-center gap-3 min-w-0" data-testid="header-user-identity">
        <Avatar className="h-10 w-10 border border-border shadow-sm">
          {user.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={user.name} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary font-bold">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate leading-tight" data-testid="text-header-name">
            {user.name}
          </div>
          <div className="text-xs text-muted-foreground truncate leading-tight">
            {user.mobile ?? user.email}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div
          className="flex items-center gap-2 rounded-full bg-muted/60 border border-border px-3 py-1.5"
          data-testid="header-assigned-agent"
        >
          <Headset className="h-4 w-4 text-primary shrink-0" />
          <div className="text-xs leading-tight">
            <div className="text-muted-foreground hidden sm:block">Your support</div>
            <div className="font-semibold text-foreground truncate max-w-[120px] sm:max-w-[160px]">
              {agent?.name ?? "Support team"}
            </div>
          </div>
          {agent?.isOnline && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
        </div>
        <CustomerHistoryDialog />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Log out"
          title="Log out"
          onClick={onLogout}
          disabled={loggingOut}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
        >
          {loggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
        </Button>
      </div>
    </header>
  );
}
function RailItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "relative group flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 mx-auto",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-[22px] w-[22px] transition-transform duration-300",
          active ? "scale-100" : "group-hover:scale-110"
        )}
      />
      {/* Tooltip */}
      <span className="absolute left-16 px-3 py-1.5 bg-popover text-popover-foreground text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0 z-50 shadow-xl border border-border whitespace-nowrap">
        {label}
      </span>
    </Link>
  );
}
