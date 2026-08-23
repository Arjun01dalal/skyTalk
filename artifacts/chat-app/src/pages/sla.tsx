import { useState } from "react";
import { format } from "date-fns";
import { Loader2, Timer, CheckCircle2, AlertTriangle, MessageSquareWarning, Save } from "lucide-react";
import {
  useGetSlaReport,
  useUpdateSlaSettings,
  getGetSlaReportQueryKey,
  getGetSlaSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const KIND_LABEL: Record<string, string> = {
  first_response: "First response late",
  waiting: "Customer kept waiting",
  resolution: "Resolution overdue",
};

function fmtSecs(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export default function SlaPage() {
  const queryClient = useQueryClient();
  const { data: report, isLoading } = useGetSlaReport({
    query: { queryKey: getGetSlaReportQueryKey(), refetchInterval: 60_000 },
  });
  const updateSettings = useUpdateSlaSettings();

  const [edit, setEdit] = useState<{ firstResponseMins: string; waitingReplyMins: string; resolutionHours: string } | null>(null);
  const settings = report?.settings;
  const form = edit ?? (settings
    ? {
        firstResponseMins: String(settings.firstResponseMins),
        waitingReplyMins: String(settings.waitingReplyMins),
        resolutionHours: String(settings.resolutionHours),
      }
    : { firstResponseMins: "", waitingReplyMins: "", resolutionHours: "" });

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const fr = Number(form.firstResponseMins);
    const wr = Number(form.waitingReplyMins);
    const rh = Number(form.resolutionHours);
    if (![fr, wr, rh].every((n) => Number.isInteger(n) && n >= 1)) {
      toast({ variant: "destructive", title: "Invalid limits", description: "All time limits must be whole numbers of at least 1." });
      return;
    }
    updateSettings.mutate(
      { data: { firstResponseMins: fr, waitingReplyMins: wr, resolutionHours: rh } },
      {
        onSuccess: () => {
          setEdit(null);
          queryClient.invalidateQueries({ queryKey: getGetSlaReportQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSlaSettingsQueryKey() });
          toast({ title: "SLA limits updated" });
        },
        onError: () => toast({ variant: "destructive", title: "Could not save SLA limits" }),
      },
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-20 border-b border-border bg-card/40 backdrop-blur-xl flex items-center px-6 md:px-8 shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" /> SLA
          </h1>
          <p className="text-sm text-muted-foreground font-medium mt-0.5">
            Response-time targets, breaches, and reports
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
        {isLoading || !report ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Open conversations", value: String(report.openCount), icon: MessageSquareWarning },
                { label: "Resolved", value: String(report.resolvedCount), icon: CheckCircle2 },
                { label: "Avg first response", value: fmtSecs(report.avgFirstResponseSecs), icon: Timer },
                { label: "Avg resolution time", value: fmtSecs(report.avgResolutionSecs), icon: Timer },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
                  <s.icon className="h-4 w-4 text-muted-foreground mb-2" />
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Breach totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "First response breaches", value: report.breachTotals.firstResponse },
                { label: "Waiting-time breaches", value: report.breachTotals.waiting },
                { label: "Resolution breaches", value: report.breachTotals.resolution },
              ].map((b) => (
                <div key={b.label} className={cn(
                  "rounded-2xl p-5 border",
                  b.value > 0 ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900" : "bg-card border-border",
                )}>
                  <AlertTriangle className={cn("h-4 w-4 mb-2", b.value > 0 ? "text-rose-500" : "text-muted-foreground")} />
                  <div className="text-2xl font-bold">{b.value}</div>
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">{b.label}</div>
                </div>
              ))}
            </div>

            {/* Settings */}
            <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl">
              <h2 className="font-semibold mb-1">Time limits</h2>
              <p className="text-sm text-muted-foreground mb-4">
                When a limit is crossed the conversation turns red in the Live Monitor and admins get a Telegram alert.
              </p>
              <form onSubmit={saveSettings} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([
                  ["firstResponseMins", "First response (minutes)"],
                  ["waitingReplyMins", "Waiting for reply (minutes)"],
                  ["resolutionHours", "Resolution (hours)"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="text-sm font-medium space-y-1.5">
                    <span>{label}</span>
                    <Input
                      type="number"
                      min={1}
                      value={form[key]}
                      onChange={(e) => setEdit({ ...form, [key]: e.target.value })}
                      className="h-10"
                    />
                  </label>
                ))}
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={updateSettings.isPending || !edit}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save limits
                  </button>
                </div>
              </form>
            </div>

            {/* Recent breaches */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold">Recent breaches</h2>
              </div>
              {!report.recentBreaches.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No SLA breaches recorded. 🎉</div>
              ) : (
                <div className="divide-y divide-border">
                  {report.recentBreaches.map((b) => (
                    <div key={b.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                      <Badge className="bg-rose-100 text-rose-700 border-0 hover:bg-rose-100 shrink-0">
                        {KIND_LABEL[b.kind] ?? b.kind}
                      </Badge>
                      <span className="font-medium truncate">
                        {b.customerName ?? `Conversation #${b.conversationId}`}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(b.breachedAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
