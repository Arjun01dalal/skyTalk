import { useState } from "react";
import {
  useListTickets,
  getListTicketsQueryKey,
  useListTicketMessages,
  getListTicketMessagesQueryKey,
  useListTicketCalls,
  getListTicketCallsQueryKey,
  type Ticket,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Loader2, Ticket as TicketIcon, Search, MessageSquare, Paperclip, Phone, PhoneMissed } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const { data: tickets, isLoading } = useListTickets({
    query: { queryKey: getListTicketsQueryKey() },
  });
  const [search, setSearch] = useState("");
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = (tickets ?? []).filter(
    (t) =>
      !q ||
      t.ticketNo.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      (t.agentName ?? "").toLowerCase().includes(q) ||
      (t.categoryTitle ?? "").toLowerCase().includes(q),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TicketIcon className="h-6 w-6 text-primary" />
            Chat History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every ended support chat is archived here under a ticket number.
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search ticket no, customer, agent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <TicketIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No tickets yet</p>
            <p className="text-sm mt-1">When a chat is ended, it will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setOpenTicket(t)}
                className="w-full text-left border border-border rounded-xl p-4 bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors shadow-sm flex items-center gap-4"
                data-testid={`ticket-${t.ticketNo}`}
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TicketIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-primary text-sm">{t.ticketNo}</span>
                    {t.categoryTitle && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {t.categoryTitle}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-foreground mt-0.5 truncate">
                    <span className="font-semibold">{t.customerName}</span>
                    {t.agentName && <span className="text-muted-foreground"> ↔ {t.agentName}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    <MessageSquare className="h-3 w-3" /> {t.messageCount}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(t.closedAt), "MMM d, yyyy HH:mm")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <TicketTranscriptDialog ticket={openTicket} onClose={() => setOpenTicket(null)} />
      </div>
    </div>
  );
}

export function TicketTranscriptDialog({
  ticket,
  onClose,
  customerView = false,
}: {
  ticket: Ticket | null;
  onClose: () => void;
  /** Customers see messages in their own language; staff see English. */
  customerView?: boolean;
}) {
  const { data: messages, isLoading } = useListTicketMessages(ticket?.id ?? 0, {
    query: {
      queryKey: getListTicketMessagesQueryKey(ticket?.id ?? 0),
      enabled: ticket != null,
    },
  });
  const { data: calls } = useListTicketCalls(ticket?.id ?? 0, {
    query: {
      queryKey: getListTicketCallsQueryKey(ticket?.id ?? 0),
      enabled: ticket != null,
    },
  });

  // Merge messages and calls into one chronological transcript.
  const timeline = [
    ...(messages ?? []).map((m) => ({
      kind: "msg" as const,
      at: new Date(m.createdAt).getTime(),
      msg: m,
    })),
    ...(calls ?? []).map((c) => ({
      kind: "call" as const,
      at: new Date(c.startedAt).getTime(),
      call: c,
    })),
  ].sort((a, b) => a.at - b.at);

  return (
    <Dialog open={ticket != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-primary" />
            <span className="font-mono">{ticket?.ticketNo}</span>
          </DialogTitle>
          <DialogDescription>
            {ticket?.customerName}
            {ticket?.agentName ? ` ↔ ${ticket.agentName}` : ""} ·{" "}
            {ticket ? format(new Date(ticket.closedAt), "MMM d, yyyy HH:mm") : ""}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3 py-1">
              {timeline.map((item) => {
                if (item.kind === "call") {
                  const c = item.call;
                  const missed = c.status !== "answered";
                  const dur =
                    c.durationSeconds != null
                      ? ` · ${Math.floor(c.durationSeconds / 60)}:${String(c.durationSeconds % 60).padStart(2, "0")}`
                      : "";
                  return (
                    <div key={`call-${c.id}`} className="flex justify-center">
                      <div
                        className={cn(
                          "flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5",
                          missed
                            ? "text-destructive border-destructive/30 bg-destructive/5"
                            : "text-muted-foreground border-border bg-muted/50",
                        )}
                      >
                        {missed ? <PhoneMissed className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                        {missed ? "Missed call" : "Voice call"}
                        {dur}
                        <span className="opacity-70">{format(new Date(c.startedAt), "HH:mm")}</span>
                      </div>
                    </div>
                  );
                }
                const m = item.msg;
                const isCustomer = m.senderId === ticket?.customerId;
                const label = m.isAi ? "Support (AI)" : (m.senderName ?? "System");
                return (
                  <div key={m.id} className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm",
                        isCustomer
                          ? "bg-muted text-foreground rounded-bl-sm"
                          : "bg-primary/10 text-foreground rounded-br-sm",
                      )}
                    >
                      <div className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                        {label} · {format(new Date(m.createdAt), "HH:mm")}
                      </div>
                      {m.attachmentUrl && (
                        <a
                          href={m.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-primary underline mb-1"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {m.attachmentName ?? "Attachment"}
                        </a>
                      )}
                      <div className="whitespace-pre-wrap">
                        {m.encrypted
                          ? "🔒 Encrypted message"
                          : customerView
                            ? (m.content ?? m.contentEn ?? "")
                            : (m.contentEn ?? m.content ?? "")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
