import type { SlaSettings } from "@workspace/api-client-react";

export type SlaLevel = "none" | "ok" | "risk" | "breach";

export interface SlaInfo {
  level: SlaLevel;
  /** Short badge text, e.g. "1st reply 3m late" or "Waiting 4m". */
  label: string | null;
}

interface SlaFields {
  slaStatus?: string;
  openedAt?: string | null;
  firstResponseAt?: string | null;
  awaitingReplySince?: string | null;
  resolvedAt?: string | null;
}

function fmtDur(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Compute the live SLA state of a conversation from its timestamps and the
 * configured limits. "risk" = ≥80% of the limit used, "breach" = over it.
 */
export function slaInfo(conv: SlaFields, settings?: SlaSettings): SlaInfo {
  if (!settings) return { level: "none", label: null };
  if (conv.slaStatus === "resolved") return { level: "ok", label: "Resolved" };
  const now = Date.now();

  // Waiting clock: customer has an unanswered message.
  if (conv.awaitingReplySince) {
    const waitingMs = now - new Date(conv.awaitingReplySince).getTime();
    const firstResponse = !conv.firstResponseAt;
    const limitMs =
      (firstResponse ? settings.firstResponseMins : settings.waitingReplyMins) * 60_000;
    const prefix = firstResponse ? "1st reply" : "Waiting";
    if (waitingMs >= limitMs)
      return { level: "breach", label: `${prefix} ${fmtDur(waitingMs - limitMs)} late` };
    if (waitingMs >= limitMs * 0.8)
      return { level: "risk", label: `${prefix} due soon` };
  }

  // Resolution clock.
  if (conv.openedAt) {
    const openMs = now - new Date(conv.openedAt).getTime();
    const limitMs = settings.resolutionHours * 3_600_000;
    if (openMs >= limitMs)
      return { level: "breach", label: `Unresolved ${fmtDur(openMs)}` };
    if (openMs >= limitMs * 0.8)
      return { level: "risk", label: "Resolution due soon" };
    return { level: "ok", label: null };
  }

  return { level: "none", label: null };
}
