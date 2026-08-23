import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Activity,
  Loader2,
  MessageSquare,
  Phone,
  PhoneMissed,
  Check,
  CheckCheck,
  File as FileIcon,
  Send,
  ArrowUpRight,
  Mic,
  Square,
  X,
  Paperclip,
} from "lucide-react";
import {
  useAdminListConversations,
  useAdminListMessages,
  useAdminListCalls,
  useAdminReplyConversation,
  useUploadFile,
  useGetSlaSettings,
  useEndConversation,
  getAdminListMessagesQueryKey,
  getAdminListCallsQueryKey,
  getAdminListConversationsQueryKey,
  type Message,
  type SlaSettings,
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { slaInfo } from "@/lib/sla";
import { TemplatePicker } from "./chat";
import { CheckCircle2, Timer } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { staffText, languageLabel } from "@/lib/language";

export default function AdminMonitor() {
  const [tab, setTab] = useState<"chats" | "calls">("chats");

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-20 border-b border-border bg-card/40 backdrop-blur-xl flex items-center px-6 md:px-8 shrink-0 sticky top-0 z-10 justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Live Monitor
          </h1>
          <p className="text-sm text-slate-500 dark:text-muted-foreground font-medium mt-0.5">
            Read-only view of conversations and calls
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-muted rounded-xl p-1">
          <button
            onClick={() => setTab("chats")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === "chats"
                ? "bg-card shadow-sm text-primary"
                : "text-slate-500 dark:text-muted-foreground hover:text-slate-700 dark:hover:text-foreground",
            )}
          >
            Conversations
          </button>
          <button
            onClick={() => setTab("calls")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === "calls"
                ? "bg-card shadow-sm text-primary"
                : "text-slate-500 dark:text-muted-foreground hover:text-slate-700 dark:hover:text-foreground",
            )}
          >
            Calls
          </button>
        </div>
      </div>

      {tab === "chats" ? <ChatsMonitor /> : <CallsMonitor />}
    </div>
  );
}

export function SlaBadge({ conv, settings }: { conv: Parameters<typeof slaInfo>[0]; settings?: SlaSettings }) {
  const info = slaInfo(conv, settings);
  if (info.level === "none" || !info.label) return null;
  if (info.level === "ok")
    return (
      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100 shrink-0">
        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> {info.label}
      </Badge>
    );
  return (
    <Badge
      className={cn(
        "text-[10px] px-1.5 py-0 h-4 border-0 shrink-0",
        info.level === "breach"
          ? "bg-rose-100 text-rose-700 hover:bg-rose-100"
          : "bg-amber-100 text-amber-700 hover:bg-amber-100",
      )}
    >
      <Timer className="w-2.5 h-2.5 mr-0.5" /> {info.label}
    </Badge>
  );
}

function ChatsMonitor() {
  const { data: conversations, isLoading } = useAdminListConversations({
    query: { queryKey: getAdminListConversationsQueryKey(), refetchInterval: 60_000 },
  });
  const { data: slaSettings } = useGetSlaSettings();
  const [activeId, setActiveId] = useState<number | null>(null);
  const active = conversations?.find((c) => c.id === activeId);

  return (
    <div className="flex-1 flex min-h-0">
      {/* Conversation list */}
      <div className="w-full md:w-96 border-r border-border bg-card/50 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 w-full min-h-0 overflow-y-auto">
          <div className="p-2 space-y-1 max-w-full">
            {isLoading ? (
              <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : !conversations?.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No conversations yet.</div>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                      isActive
                        ? "bg-primary text-white shadow-md shadow-primary/20"
                        : "hover:bg-slate-100 dark:hover:bg-muted/60",
                    )}
                  >
                    <div className="flex -space-x-3">
                      <Avatar className="h-9 w-9 border-2 border-card"><AvatarFallback className="text-xs">{c.userA.name.charAt(0)}</AvatarFallback></Avatar>
                      <Avatar className="h-9 w-9 border-2 border-card"><AvatarFallback className="text-xs">{c.userB.name.charAt(0)}</AvatarFallback></Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                        <span className="truncate">{c.userA.name} ↔ {c.userB.name}</span>
                        {c.adminEscalated && (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-rose-100 text-rose-700 border-0 hover:bg-rose-100 shrink-0">
                            <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" />
                            Needs admin
                          </Badge>
                        )}
                        <SlaBadge conv={c} settings={slaSettings} />
                      </div>
                      <div className={cn("text-xs truncate", isActive ? "text-white/80" : "text-muted-foreground")}>
                        {(c.lastMessage && staffText(c.lastMessage)) || (c.lastMessage ? "Attachment" : "No messages")}
                      </div>
                    </div>
                    <div className={cn("text-[11px] whitespace-nowrap", isActive ? "text-white/70" : "text-muted-foreground")}>
                      {c.lastMessage ? format(new Date(c.lastMessage.createdAt), "HH:mm") : ""}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Read-only transcript */}
      <div className="flex-1 hidden md:flex flex-col min-w-0 bg-card/30">
        {active ? (
          <Transcript
            conversationId={active.id}
            userAId={active.userA.id}
            userBId={active.userB.id}
            customerId={active.userA.role === "user" ? active.userA.id : active.userB.role === "user" ? active.userB.id : undefined}
            title={`${active.userA.name} ↔ ${active.userB.name}`}
            userAName={active.userA.name}
            userBName={active.userB.name}
            canReply={active.adminEscalated}
            language={active.language}
            slaConv={active}
            slaSettings={slaSettings}
            selectedCategoryId={active.selectedCategoryId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <MessageSquare className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a conversation to read the transcript.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Transcript({ conversationId, userAId, userBId, customerId, title, onBack, canReply, language, userAName, userBName, slaConv, slaSettings, selectedCategoryId }: { conversationId: number; userAId: number; userBId: number; customerId?: number; title: string; onBack?: () => void; canReply?: boolean; language?: string; userAName?: string; userBName?: string; slaConv?: Parameters<typeof slaInfo>[0]; slaSettings?: SlaSettings; selectedCategoryId?: number | null }) {
  const { data: messages, isLoading } = useAdminListMessages(conversationId, {
    query: { queryKey: getAdminListMessagesQueryKey(conversationId) },
  });
  const { data: allCalls } = useAdminListCalls({
    query: { queryKey: getAdminListCallsQueryKey() },
  });
  const adminReply = useAdminReplyConversation();
  const uploadFile = useUploadFile();
  const endConversation = useEndConversation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  // Attachment (image/file via picker, or a recorded voice message).
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const baseType = (recorder.mimeType || "audio/webm").split(";")[0]!.trim() || "audio/webm";
        const blob = new Blob(recordChunksRef.current, { type: baseType });
        if (blob.size > 0) {
          const stamp = format(new Date(), "HH-mm-ss");
          setVoiceFile(new File([blob], `voice-message-${stamp}.webm`, { type: baseType }));
        }
        setIsRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone unavailable", description: "Please allow microphone access to record a voice message.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleReply = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if ((!text && !voiceFile) || adminReply.isPending || uploadFile.isPending) return;

    let attachmentPayload: { attachmentUrl?: string; attachmentType?: string; attachmentName?: string } = {};
    if (voiceFile) {
      try {
        const res = await uploadFile.mutateAsync({ data: { file: voiceFile as any } });
        attachmentPayload = { attachmentUrl: res.url, attachmentType: res.type, attachmentName: res.name };
      } catch (err) {
        console.error("Upload failed", err);
        toast({ variant: "destructive", title: "Could not send attachment", description: "The upload failed. Please try again." });
        return;
      }
    }

    adminReply.mutate(
      { id: conversationId, data: { ...(text ? { content: text } : {}), ...attachmentPayload } },
      {
        onSuccess: (saved) => {
          setDraft("");
          setVoiceFile(null);
          queryClient.setQueryData<Message[]>(
            getAdminListMessagesQueryKey(conversationId),
            (old) => [...(old ?? []).filter((m) => m.id !== saved.id), saved],
          );
        },
      },
    );
  };

  // Calls between these two participants, merged into the transcript timeline.
  const threadCalls = (allCalls ?? []).filter(
    (c) =>
      (c.caller.id === userAId && c.callee.id === userBId) ||
      (c.caller.id === userBId && c.callee.id === userAId),
  );
  const timeline = [
    ...(messages ?? []).map((m) => ({ kind: "msg" as const, msg: m, at: new Date(m.createdAt).getTime() })),
    ...threadCalls.map((c) => ({ kind: "call" as const, call: c, at: new Date(c.startedAt).getTime() })),
  ].sort((a, b) => a.at - b.at);

  const fmtDur = (s?: number | null) => {
    if (s == null) return "";
    const m = Math.floor(s / 60);
    return ` · ${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-14 border-b border-border bg-card flex items-center px-5 shrink-0">
        {onBack && (
          <button onClick={onBack} className="md:hidden mr-3 -ml-1 text-muted-foreground" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        )}
        <span className="font-bold truncate">{title}</span>
        {language && language !== "en" && (
          <Badge className="ml-2 bg-sky-100 text-sky-700 border-0 hover:bg-sky-100 text-[11px]">{languageLabel(language)}</Badge>
        )}
        <span className="ml-2 text-xs text-muted-foreground">{canReply ? "(escalated to admin — you can reply)" : "(read-only)"}</span>
        {slaConv && (
          <span className="ml-2"><SlaBadge conv={slaConv} settings={slaSettings} /></span>
        )}
        {slaConv && slaConv.slaStatus === "open" && (
          <button
            type="button"
            onClick={() =>
              endConversation.mutate(
                { id: conversationId },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getAdminListConversationsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getAdminListMessagesQueryKey(conversationId) });
                    toast({ title: "Chat ended" });
                  },
                },
              )
            }
            disabled={endConversation.isPending}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {endConversation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            End chat
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !timeline.length ? (
          <div className="text-center text-muted-foreground text-sm py-10">No messages in this conversation.</div>
        ) : (
          timeline.map((item) => {
            if (item.kind === "call") {
              const call = item.call;
              const missed = call.status === "missed" || call.status === "rejected";
              return (
                <div key={`call-${call.id}`} className="flex justify-center">
                  <div className={cn(
                    "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border shadow-sm",
                    missed ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-card text-muted-foreground border-border",
                  )}>
                    {missed ? <PhoneMissed className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                    <span>
                      {call.caller.name} called{call.status === "answered" ? `${fmtDur(call.durationSeconds)}` : call.status === "rejected" ? " · declined" : " · missed"}
                    </span>
                    <span className="opacity-60">{format(new Date(call.startedAt), "MMM d, HH:mm")}</span>
                  </div>
                </div>
              );
            }
            const msg = item.msg;
            // Customer messages align right; AI + staff (agent/admin/caller)
            // messages align left.
            const left = msg.isAi || msg.senderId !== (customerId ?? userAId);
            const senderLabel = msg.isAi
              ? "Support"
              : msg.senderName
                ?? (msg.senderId === userAId
                  ? (userAName ?? "User")
                  : msg.senderId === userBId
                    ? (userBName ?? "Agent")
                    : "Admin");
            return (
              <div key={msg.id} className={cn("flex", left ? "justify-start" : "justify-end")}>
                <div className={cn("flex flex-col gap-1 max-w-[75%]", left ? "items-start" : "items-end")}>
                  <div className={cn(
                    "rounded-2xl px-4 py-2.5 shadow-sm text-[13px] leading-relaxed",
                    left ? "bg-card border border-border rounded-bl-sm" : "bg-primary text-primary-foreground rounded-br-sm",
                  )}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn("text-[11px] font-semibold", left ? "opacity-80" : "text-foreground")}>{senderLabel}</span>
                    </div>
                    {msg.attachmentUrl && (
                      msg.attachmentType?.startsWith("image/") ? (
                        <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="block mb-1 rounded-lg overflow-hidden border border-black/10 dark:border-white/10">
                          <img src={msg.attachmentUrl} alt="attachment" className="max-w-full h-auto max-h-60 object-contain" />
                        </a>
                      ) : msg.attachmentType?.startsWith("audio/") ? (
                        <div className="flex items-center gap-2 mb-1">
                          <Mic className="h-4 w-4 shrink-0 opacity-70" />
                          <audio controls preload="metadata" src={msg.attachmentUrl} className="max-w-[240px] h-10" />
                        </div>
                      ) : (
                        <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 mb-1 underline text-sm">
                          <FileIcon className="h-4 w-4" /> {msg.attachmentName || "Attachment"}
                        </a>
                      )
                    )}
                    {staffText(msg) && <p className="whitespace-pre-wrap break-words">{staffText(msg)}</p>}
                  </div>
                  <div className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                    {format(new Date(msg.createdAt), "MMM d, HH:mm")}
                    {msg.status === "read" ? <CheckCheck className="h-3 w-3" /> : msg.status === "delivered" ? <CheckCheck className="h-3 w-3 opacity-50" /> : <Check className="h-3 w-3 opacity-50" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {canReply && (
        <div className="border-t border-border bg-card px-4 py-3 shrink-0">
          {voiceFile && (
            <div className="mb-2 flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm max-w-sm border border-border">
              {voiceFile.type.startsWith("audio/") ? (
                <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate flex-1 font-medium">{voiceFile.name}</span>
              <button type="button" className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => setVoiceFile(null)} aria-label="Discard attachment">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <form onSubmit={handleReply} className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) setVoiceFile(e.target.files[0]);
                e.target.value = "";
              }}
              className="hidden"
            />
            <TemplatePicker
              onPick={(text) => setDraft((d) => (d ? d + "\n" + text : text))}
              selectedCategoryId={selectedCategoryId ?? null}
              customerName={(customerId === userAId ? userAName : customerId === userBId ? userBName : undefined) ?? "there"}
              agentName={(customerId === userAId ? userBName : userAName) ?? "our support team"}
            />
            <button
              type="button"
              title="Attach a file or image"
              aria-label="Attach a file or image"
              onClick={() => fileInputRef.current?.click()}
              className="flex-none w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <button
              type="button"
              title={isRecording ? "Stop recording" : "Record voice message"}
              aria-label={isRecording ? "Stop recording" : "Record voice message"}
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                "flex-none w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
                isRecording
                  ? "bg-rose-500 text-white animate-pulse hover:bg-rose-600"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            </button>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={language && language !== "en" ? `Reply in English — delivered in ${languageLabel(language)}...` : "Reply as admin..."}
              className="h-10"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={(!draft.trim() && !voiceFile) || adminReply.isPending || uploadFile.isPending}
              className="flex-none w-10 h-10 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              aria-label="Send reply"
            >
              {adminReply.isPending || uploadFile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CallsMonitor() {
  const { data: calls, isLoading } = useAdminListCalls();

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-3">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : !calls?.length ? (
          <div className="text-center py-20 text-muted-foreground">No calls yet.</div>
        ) : (
          calls.map((call) => {
            const missed = call.status === "missed" || call.status === "rejected";
            return (
              <div key={call.id} className="bg-white/70 dark:bg-card/70 backdrop-blur-xl border border-border p-4 rounded-2xl shadow-sm hover:shadow transition-all flex items-center gap-4">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-black/5", missed ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400")}>
                  {missed ? <PhoneMissed className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{call.caller.name} → {call.callee.name}</div>
                  <div className="text-sm text-muted-foreground capitalize flex items-center gap-2">
                    {call.status}
                    {call.durationSeconds != null && call.durationSeconds > 0 && <span>· {formatDuration(call.durationSeconds)}</span>}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground text-sm">{format(new Date(call.startedAt), "HH:mm")}</div>
                  {format(new Date(call.startedAt), "MMM d")}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
