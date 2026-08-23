import { useGetStatsSummary, useListUsers, useAdminListConversations } from "@workspace/api-client-react";
import type { User, AdminConversation } from "@workspace/api-client-react";
import {
  Users,
  UserCheck,
  Shield,
  PhoneCall,
  MessageSquare,
  ShieldCheck,
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Circle,
  Sparkles,
  LayoutGrid,
  Phone,
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const { data: stats } = useGetStatsSummary();
  const { data: users } = useListUsers();
  const { data: conversations } = useAdminListConversations();

  const team = (users ?? []).filter((u) => u.role === "agent" || u.role === "admin");
  const onlineTeam = team.filter((u) => u.isOnline).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
      {/* Subtle background gradients for elevated feel */}
      <div className="absolute top-[-10%] left-[20%] w-[50vw] h-[50vw] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="h-20 px-6 md:px-8 flex items-center justify-between border-b border-border bg-card/40 backdrop-blur-xl shrink-0 z-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Admin Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-muted-foreground font-medium mt-0.5">
            Real-time overview of your support operations
          </p>
        </div>
        <Link href="/directory" className="hidden sm:block">
          <Button className="rounded-xl shadow-sm gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-primary dark:hover:bg-primary/90">
            <LayoutGrid className="h-4 w-4 text-slate-400 dark:text-primary-foreground/70" />
            Open Directory
          </Button>
        </Link>
      </header>

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 z-10">
        <div className="max-w-[1600px] mx-auto space-y-6 md:space-y-8">
          {/* Primary stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-5">
            <StatCard
              title="Active Support Team"
              value={stats?.activeSupportTeam}
              icon={<Users className="h-5 w-5 text-blue-600" />}
              iconBg="bg-blue-50 dark:bg-blue-500/10"
              gradient="from-blue-500/25"
              href="/directory"
            />
            <StatCard
              title="Today Total Chat"
              value={stats?.todayTotalChat}
              icon={<MessageSquare className="h-5 w-5 text-primary" />}
              iconBg="bg-primary/10 dark:bg-primary/10"
              gradient="from-primary/25"
              href="/monitor"
            />
            <StatCard
              title="Unread / Unique"
              value={combine(stats?.totalUnreadMessages, stats?.totalUniqueChats)}
              icon={<Activity className="h-5 w-5 text-rose-600" />}
              iconBg="bg-rose-50 dark:bg-rose-500/10"
              gradient="from-rose-500/25"
              href="/monitor"
            />
            <StatCard
              title="Today Recordings"
              value={stats?.todayTotalRecordings}
              icon={<Phone className="h-5 w-5 text-amber-600" />}
              iconBg="bg-amber-50 dark:bg-amber-500/10"
              gradient="from-amber-500/25"
              href="/calls"
            />
            <StatCard
              title="Total Communication"
              value={stats?.totalCommunication}
              icon={<LayoutGrid className="h-5 w-5 text-primary" />}
              iconBg="bg-primary/10 dark:bg-primary/10"
              gradient="from-primary/25"
              href="/reports"
            />
          </div>

          {/* Secondary compact stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            <MiniStat title="Total Users" value={stats?.totalUsers} icon={Users} color="text-blue-500 bg-blue-50 dark:bg-blue-500/10" href="/directory" />
            <MiniStat title="Agents" value={stats?.totalAgents} icon={UserCheck} color="text-primary bg-primary/10 dark:bg-primary/10" href="/directory" />
            <MiniStat title="Admins" value={stats?.totalAdmins} icon={Shield} color="text-primary bg-primary/10 dark:bg-primary/10" href="/directory" />
            <MiniStat title="Online Now" value={stats?.onlineUsers} icon={Activity} color="text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" href="/directory" />
            <MiniStat title="Msgs Today" value={stats?.messagesToday} icon={MessageSquare} color="text-amber-500 bg-amber-50 dark:bg-amber-500/10" href="/monitor" />
            <MiniStat title="Calls Today" value={stats?.callsToday} icon={PhoneCall} color="text-rose-500 bg-rose-50 dark:bg-rose-500/10" href="/calls" />
          </div>

          {/* Main dash area */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Active Agents */}
            <div className="xl:col-span-1 bg-card/70 backdrop-blur-xl border border-border rounded-2xl shadow-sm flex flex-col">
              <div className="p-5 border-b border-slate-100/70 dark:border-border/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-foreground tracking-tight">Active Support Team</h2>
                  {onlineTeam > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-muted-foreground">
                  {onlineTeam}/{team.length} online
                </span>
              </div>
              <div className="p-3 flex flex-col gap-1 overflow-y-auto max-h-[420px]">
                {team.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400 dark:text-muted-foreground">No team members.</div>
                ) : (
                  team.map((u) => <AgentRow key={u.id} user={u} />)
                )}
              </div>
              <div className="p-4 mt-auto border-t border-slate-100/70 dark:border-border/60 bg-slate-50/50 dark:bg-muted/20 rounded-b-2xl">
                <Link href="/directory">
                  <button className="w-full py-2 text-sm text-slate-600 dark:text-muted-foreground font-medium hover:text-primary dark:hover:text-primary hover:bg-white dark:hover:bg-card rounded-lg transition-all border border-transparent hover:border-slate-200 dark:hover:border-border hover:shadow-sm flex items-center justify-center gap-2">
                    View All Agents <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </div>

            {/* Live Conversations */}
            <div className="xl:col-span-2 bg-card/70 backdrop-blur-xl border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-5 border-b border-slate-100/70 dark:border-border/60 flex items-center justify-between bg-white/30 dark:bg-transparent">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-900 dark:text-foreground tracking-tight">Live Conversations</h2>
                  <span className="px-2.5 py-1 rounded-md bg-primary/10 dark:bg-primary/10 text-primary dark:text-primary text-xs font-semibold border border-primary/20">
                    {conversations?.length ?? 0} Active
                  </span>
                </div>
                <Link href="/monitor">
                  <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground bg-white dark:bg-card border border-slate-200 dark:border-border rounded-lg shadow-sm hover:shadow transition-all">
                    Open Monitor <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50/40 dark:bg-muted/20 text-slate-500 dark:text-muted-foreground font-medium text-xs uppercase tracking-wider border-b border-slate-100 dark:border-border">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Participants</th>
                      <th className="px-6 py-4 font-semibold">Handled By</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Updated</th>
                      <th className="px-6 py-4 font-semibold">Last Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70 dark:divide-border/60">
                    {!conversations?.length ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-muted-foreground">
                          No active conversations.
                        </td>
                      </tr>
                    ) : (
                      conversations.slice(0, 8).map((c) => <ConversationRow key={c.id} conv={c} />)
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function combine(a?: number, b?: number): string {
  if (a == null && b == null) return "-";
  return `${a ?? 0} / ${b ?? 0}`;
}

function StatCard({
  title,
  value,
  icon,
  iconBg,
  gradient,
  href,
}: {
  title: string;
  value?: number | string;
  icon: React.ReactNode;
  iconBg: string;
  gradient: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-card/70 backdrop-blur-xl rounded-2xl p-5 pb-10 border border-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative group hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] hover:border-slate-300/60 dark:hover:border-border transition-all duration-300 overflow-hidden cursor-pointer flex flex-col">
      <div className="flex justify-between items-start mb-5 z-10">
        <div className={`p-2.5 rounded-xl ${iconBg} ring-1 ring-black/5`}>{icon}</div>
        <div className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md text-emerald-700 bg-emerald-50 border border-emerald-100/50 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20">
          <ArrowUpRight className="h-3 w-3 stroke-[3]" />
          Live
        </div>
      </div>
      <div className="z-10 mt-auto">
        <h3 className="text-slate-500 dark:text-muted-foreground text-xs font-semibold mb-1 uppercase tracking-wider">{title}</h3>
        <div className="text-2xl font-bold text-slate-900 dark:text-foreground tracking-tight">{value ?? "-"}</div>
      </div>
      {/* Decorative gradient footer (no time-series data available) */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t ${gradient} to-transparent opacity-50 group-hover:opacity-90 group-hover:h-16 transition-all duration-500 ease-out pointer-events-none`}
      />
    </Link>
  );
}

function MiniStat({
  title,
  value,
  icon: Icon,
  color,
  href,
}: {
  title: string;
  value?: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-card/70 backdrop-blur-xl border border-border rounded-2xl p-4 flex flex-col items-center text-center gap-2 shadow-sm hover:shadow-md hover:border-primary/30 cursor-pointer transition-all">
      <div className={`p-2 rounded-xl ring-1 ring-black/5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold font-mono text-slate-900 dark:text-foreground leading-none">{value ?? "-"}</p>
        <p className="text-[11px] text-slate-500 dark:text-muted-foreground font-semibold uppercase tracking-wider mt-1.5">{title}</p>
      </div>
    </Link>
  );
}

function AgentRow({ user }: { user: User }) {
  const isAdmin = user.role === "admin";
  const statusColor = user.isOnline ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600";
  return (
    <div className="flex items-center gap-3 p-2.5 hover:bg-slate-50/80 dark:hover:bg-muted/40 rounded-xl transition-colors group">
      <div className="relative shrink-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm ring-1 ring-black/5 ${
            isAdmin
              ? "bg-gradient-to-br from-primary/20 to-primary/5 text-foreground dark:from-primary/20 dark:to-primary/10 dark:text-primary"
              : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
          }`}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[2.5px] border-white dark:border-card ${statusColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-2 mb-0.5">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground truncate group-hover:text-primary dark:group-hover:text-primary transition-colors">
            {user.name}
          </h4>
          <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-muted-foreground bg-white dark:bg-muted border border-slate-200 dark:border-border px-2 py-0.5 rounded-md shadow-sm">
            {user.isOnline ? "online" : "offline"}
          </span>
        </div>
        <div className="text-xs text-slate-500 dark:text-muted-foreground truncate flex items-center gap-1.5 font-medium">
          {isAdmin && <Sparkles className="h-3 w-3 text-primary fill-primary/20" />}
          {isAdmin ? "Administrator" : "Support Agent"}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({ conv }: { conv: AdminConversation }) {
  const last = conv.lastMessage;
  const aiHandled = !!last?.isAi;
  const hasMessages = !!last;
  // Status derived honestly from real message data (no fabricated wait times).
  const status: "active" | "resolving" | "new" = !hasMessages ? "new" : aiHandled ? "resolving" : "active";

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <tr className="hover:bg-slate-50/80 dark:hover:bg-muted/40 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2 shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-muted dark:to-muted/60 text-slate-700 dark:text-foreground flex items-center justify-center text-xs font-bold shadow-sm ring-2 ring-white dark:ring-card">
              {initials(conv.userA.name)}
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-muted dark:to-muted/60 text-slate-700 dark:text-foreground flex items-center justify-center text-xs font-bold shadow-sm ring-2 ring-white dark:ring-card">
              {initials(conv.userB.name)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-foreground truncate group-hover:text-primary dark:group-hover:text-primary transition-colors">
              {conv.userA.name} ↔ {conv.userB.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-muted-foreground mt-0.5 truncate">{conv.userA.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        {aiHandled ? (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary dark:text-primary bg-primary/10 dark:bg-primary/10 px-2.5 py-1.5 rounded-md border border-primary/20 shadow-sm">
            <Bot className="h-3.5 w-3.5" /> AI Support
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-foreground font-medium">
            <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-muted text-[9px] flex items-center justify-center font-bold text-slate-500 dark:text-muted-foreground">
              {initials(conv.userB.name)}
            </div>
            <span className="truncate max-w-[120px]">{conv.userB.name}</span>
          </div>
        )}
      </td>
      <td className="px-6 py-4">
        <StatusBadge status={status} />
      </td>
      <td className="px-6 py-4 text-sm text-slate-500 dark:text-muted-foreground font-semibold whitespace-nowrap">
        {conv.updatedAt ? formatDistanceToNowStrict(new Date(conv.updatedAt), { addSuffix: true }) : "—"}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-muted-foreground truncate max-w-[280px] group-hover:text-slate-900 dark:group-hover:text-foreground transition-colors">
          {last?.content || (last ? "Attachment" : "No messages yet")}
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: "active" | "resolving" | "new" }) {
  const map = {
    active: "text-primary bg-primary/10 border-primary/20 dark:text-primary dark:bg-primary/10 dark:border-primary/20 fill-primary text-primary",
    resolving: "text-blue-700 bg-blue-50 border-blue-100/80 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20",
    new: "text-rose-700 bg-rose-50 border-rose-100/80 dark:text-rose-400 dark:bg-rose-500/10 dark:border-rose-500/20",
  } as const;
  const dot = {
    active: "fill-primary text-primary",
    resolving: "fill-blue-500 text-blue-500",
    new: "fill-rose-500 text-rose-500",
  } as const;
  const label = { active: "Active", resolving: "AI Resolving", new: "New" } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md border uppercase tracking-wide ${
        status === "active" ? map.active : status === "resolving" ? map.resolving : map.new
      }`}
    >
      <Circle className={`w-2 h-2 ${dot[status]}`} />
      {label[status]}
    </span>
  );
}
