import { useListCalls, useAdminListCalls, getListCallsQueryKey, getAdminListCallsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, CalendarDays, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useGetMe } from "@workspace/api-client-react";

export default function Calls() {
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  // Admins see every call in the system; everyone else sees their own.
  const { data: ownCalls, isLoading: loadingOwn } = useListCalls({
    query: { enabled: !!me && !isAdmin, queryKey: getListCallsQueryKey() },
  });
  const { data: allCalls, isLoading: loadingAll } = useAdminListCalls({
    query: { enabled: !!me && isAdmin, queryKey: getAdminListCallsQueryKey() },
  });
  const calls = isAdmin ? allCalls : ownCalls;
  const isLoading = isAdmin ? loadingAll : loadingOwn;

  if (isLoading || !me) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-16 border-b border-border bg-card flex items-center px-6 shrink-0 sticky top-0 z-10 shadow-sm">
        <h1 className="font-bold text-xl">Call History</h1>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {!calls?.length ? (
             <div className="text-center py-20 flex flex-col items-center gap-4 text-muted-foreground">
               <div className="w-16 h-16 bg-card rounded-2xl flex items-center justify-center shadow-sm">
                 <Phone className="h-8 w-8 opacity-50" />
               </div>
               <p>No call history yet.</p>
             </div>
          ) : (
            calls.map(call => {
              const isParticipant = call.caller.id === me.id || call.callee.id === me.id;
              const isOutgoing = call.caller.id === me.id;
              const otherUser = isOutgoing ? call.callee : call.caller;
              // Admin viewing someone else's call: show "caller → callee".
              const displayName = isParticipant ? otherUser.name : `${call.caller.name} → ${call.callee.name}`;
              const avatarChar = isParticipant ? otherUser.name.charAt(0) : call.caller.name.charAt(0);
              
              let Icon = Phone;
              let statusColor = "text-muted-foreground";
              
              if (call.status === "missed" || call.status === "rejected") {
                Icon = PhoneMissed;
                statusColor = "text-destructive";
              } else if (!isParticipant) {
                Icon = Phone;
                statusColor = "text-green-500";
              } else if (isOutgoing) {
                Icon = PhoneOutgoing;
                statusColor = "text-primary";
              } else {
                Icon = PhoneIncoming;
                statusColor = "text-green-500";
              }

              const formatDuration = (secs: number) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                if (m === 0) return `${s}s`;
                return `${m}m ${s}s`;
              };

              return (
                <div key={call.id} className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:border-primary/30 group bg-card">
                  <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-lg">
                      {avatarChar}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base text-foreground truncate mb-1">
                      {displayName}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                      <span className={`flex items-center gap-1.5 ${statusColor}`}>
                        <Icon className="h-4 w-4" />
                        <span className="capitalize">{call.status}</span>
                      </span>
                      {call.durationSeconds != null && call.durationSeconds > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 opacity-70" />
                          {formatDuration(call.durationSeconds)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex flex-col items-end gap-1">
                    <div className="text-sm font-semibold text-foreground">
                      {format(new Date(call.startedAt), "HH:mm")}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                      <CalendarDays className="h-3 w-3" />
                      {format(new Date(call.startedAt), "MMM d")}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
