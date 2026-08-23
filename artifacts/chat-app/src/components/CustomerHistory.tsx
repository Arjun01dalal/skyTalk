import { useState } from "react";
import {
  useListTickets,
  getListTicketsQueryKey,
  type Ticket,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { History, MessageSquare, Ticket as TicketIcon } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { BrandedLoader } from "./BrandedLoader";
import { TicketTranscriptDialog } from "../pages/history";

/**
 * Customer-facing chat history: a header button that lists the customer's
 * own past (ended) chats as tickets; tapping one opens the full transcript.
 */
export function CustomerHistoryDialog({ label, small }: { label?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const { data: tickets, isLoading } = useListTickets({
    query: { queryKey: getListTicketsQueryKey(), enabled: open },
  });

  return (
    <>
      {label ? (
        <Button
          variant={small ? "ghost" : "outline"}
          size={small ? "sm" : "default"}
          onClick={() => setOpen(true)}
          className={small ? "h-6 rounded-full px-2.5 text-xs font-semibold text-primary hover:text-primary" : undefined}
          data-testid="button-customer-history"
        >
          {!small && <History className="h-4 w-4 mr-2" />} {label}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous chats"
          title="Previous chats"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground rounded-full"
          data-testid="button-customer-history"
        >
          <History className="h-5 w-5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Previous chats
            </DialogTitle>
            <DialogDescription>
              Your past support chats, each saved under a ticket number.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-3">
            {isLoading ? (
              <BrandedLoader message="Loading your chats…" className="py-10" />
            ) : (tickets ?? []).length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <TicketIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No previous chats yet.</p>
              </div>
            ) : (
              <div className="space-y-2 py-1">
                {(tickets ?? []).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setOpenTicket(t)}
                    className="w-full text-left border border-border rounded-xl p-3 bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center gap-3"
                    data-testid={`customer-ticket-${t.ticketNo}`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <TicketIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono font-bold text-primary text-xs">{t.ticketNo}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {t.categoryTitle ? `${t.categoryTitle} · ` : ""}
                        {format(new Date(t.closedAt), "MMM d, yyyy HH:mm")}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {t.messageCount}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <TicketTranscriptDialog
        ticket={openTicket}
        onClose={() => setOpenTicket(null)}
        customerView
      />
    </>
  );
}
