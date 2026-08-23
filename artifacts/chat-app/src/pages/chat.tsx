import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2, Paperclip, Send, File as FileIcon, Check, CheckCheck, Clock, Search, Info, MessageSquare, Phone, Plus, X, ChevronDown, ChevronRight, PhoneMissed, PhoneOff, PhoneIncoming, PhoneOutgoing, Bot, ArrowLeft, Headset, PencilLine, ArrowUpRight, Sparkles, Zap, CreditCard, Gamepad2, Mic, Square, CheckCircle2, Globe } from "lucide-react";
import { 
  useListConversations, 
  useListMessages, 
  listMessages, 
  useSendMessage, 
  useListUsers, 
  useCreateConversation,
  useUploadFile,
  useGetMe,
  useAdminListConversations,
  useListCalls,
  useListSupportCategories,
  useSelectConversationCategory,
  useEscalateConversation,
  useEscalateConversationToAdmin,
  useEndConversation,
  useSetConversationLanguage,
  useListMessageTemplates,
  getListMessageTemplatesQueryKey,
  Conversation,
  Message,
  User,
  Call,
  SupportCategory,
  getListConversationsQueryKey,
  getListMessagesQueryKey,
  getAdminListConversationsQueryKey,
  getListCallsQueryKey,
  getListSupportCategoriesQueryKey
} from "@workspace/api-client-react";
import { Transcript } from "@/pages/admin-monitor";
import { GroupAvatar, CreateGroupDialog, GroupInfoDialog } from "@/components/groups";
import { useSearchUsers, getSearchUsersQueryKey } from "@workspace/api-client-react";
import { Users } from "lucide-react";
import { SUPPORTED_LANGUAGES, staffText, languageLabel } from "@/lib/language";
import { cxT, CX_ISSUE_DEFAULTS_I18N } from "@/lib/cx-i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGetSupportPhone, getGetSupportPhoneQueryKey } from "@workspace/api-client-react";
import { useSocket } from "@/contexts/SocketContext";
import { useCall } from "@/contexts/CallContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { Lock, LockOpen } from "lucide-react";
import { e2ee, encryptFile, type E2eePayload } from "@/lib/e2ee";
import { useDecryptedMessage, useDecryptedAttachment } from "@/hooks/use-e2ee";
import { BrandedLoader } from "@/components/BrandedLoader";
import { CustomerHistoryDialog } from "@/components/CustomerHistory";

export default function ChatWorkspace() {
  const { data: conversations, isLoading: isLoadingConvos } = useListConversations();
  const { data: users, isLoading: isLoadingUsers } = useListUsers();
  const { data: me } = useGetMe();
  const { setActiveConversationId, typingUsers, emitTyping } = useSocket();
  const { initiateCall } = useCall();

  // E2EE (staff only): generate/publish keys once per login so encrypted
  // direct & group chats work. Customers never use E2EE.
  useEffect(() => {
    if (me && me.role !== "user") {
      e2ee.init(me.id).catch(() => {});
    }
  }, [me?.id, me?.role]);
  const queryClient = useQueryClient();

  // A plain "user" is bound to a single assigned agent — no directory, no
  // conversation list. They land straight in their one conversation.
  const isPlainUser = me?.role === "user";
  const isAdmin = me?.role === "admin";

  const [activeId, setActiveId] = useState<number | null>(null);
  // Admin-only: a system-wide conversation opened read-only from the sidebar.
  const [monitorId, setMonitorId] = useState<number | null>(null);
  const [expandedCallers, setExpandedCallers] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  // Temporarily hidden: chat/group creation entry points. Flip back to true to restore.
  const ENABLE_CHAT_CREATION = false;
  const [showDirectory, setShowDirectory] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Display name for any conversation kind (group / direct / caller).
  const convoName = (c: Conversation) =>
    c.type === "group" ? (c.title ?? "Group") : (c.otherUser?.name ?? "Chat");

  // Admins also see every other conversation in the system (live monitor).
  const { data: allConvos } = useAdminListConversations({
    query: { enabled: isAdmin, queryKey: getAdminListConversationsQueryKey() },
  });
  const monitoredConvos = isAdmin && me
    ? (allConvos ?? []).filter(
        (c) =>
          c.userA.id !== me.id &&
          c.userB.id !== me.id &&
          (`${c.userA.name} ${c.userB.name}`.toLowerCase().includes(search.toLowerCase())),
      )
    : [];
  const activeMonitorConvo = monitoredConvos.find((c) => c.id === monitorId) ?? null;

  // One merged, recency-sorted list: admin's own chats + monitored chats.
  const lastTs = (d?: string | null) => (d ? new Date(d).getTime() : 0);

  const createConvo = useCreateConversation();

  useEffect(() => {
    setActiveConversationId(activeId);
    return () => setActiveConversationId(null);
  }, [activeId, setActiveConversationId]);

  // Plain users who arrived through the caller link auto-open their assigned
  // support conversation. Users without one land on the normal chat list.
  useEffect(() => {
    if (isPlainUser && activeId === null && conversations && conversations.length > 0) {
      const callerConvo = conversations.find((c) => c.type === "caller");
      if (callerConvo) setActiveId(callerConvo.id);
    }
  }, [isPlainUser, activeId, conversations]);

  const activeConvo = conversations?.find(c => c.id === activeId);

  const handleStartConvo = (userId: number) => {
    const existing = conversations?.find(c => c.type !== "group" && c.otherUser?.id === userId);
    if (existing) {
      setActiveId(existing.id);
      setShowDirectory(false);
      return;
    }
    createConvo.mutate({ data: { userId } }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setActiveId(res.id);
        setShowDirectory(false);
      }
    });
  };

  const filteredConversations = conversations?.filter(c =>
    convoName(c).toLowerCase().includes(search.toLowerCase()) ||
    (c.otherUser?.email ?? "").toLowerCase().includes(search.toLowerCase())
  ) || [];

  // Directory: with 2+ chars we search the whole user base (name, email,
  // mobile, emp code); otherwise show the role-visible directory list.
  const searchQ = search.trim();
  const { data: searchedUsers, isLoading: isSearchingUsers } = useSearchUsers(
    { q: searchQ },
    { query: { enabled: showDirectory && searchQ.length >= 2, queryKey: getSearchUsersQueryKey({ q: searchQ }) } },
  );
  const filteredUsers = searchQ.length >= 2
    ? (searchedUsers ?? [])
    : users?.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      ) || [];

  // Admin's own chats, newest first.
  const ownItems = [...filteredConversations].sort(
    (a, b) => lastTs(b.lastMessage?.createdAt) - lastTs(a.lastMessage?.createdAt),
  );

  // Monitored chats grouped by "caller" (the agent side of each agent↔user
  // conversation). A caller can be assigned many users, so we collapse them
  // under one caller header instead of listing every conversation flat.
  const callerGroups = (() => {
    const map = new Map<
      number,
      { caller: User; items: { conv: (typeof monitoredConvos)[number]; user: User; ts: number }[]; ts: number }
    >();
    for (const c of monitoredConvos) {
      const caller = c.userA.role === "user" ? c.userB : c.userA;
      const user = c.userA.role === "user" ? c.userA : c.userB;
      const ts = lastTs(c.lastMessage?.createdAt);
      const g = map.get(caller.id) ?? { caller, items: [], ts: 0 };
      g.items.push({ conv: c, user, ts });
      g.ts = Math.max(g.ts, ts);
      map.set(caller.id, g);
    }
    return [...map.values()]
      .map((g) => ({ ...g, items: g.items.sort((a, b) => b.ts - a.ts) }))
      .sort((a, b) => b.ts - a.ts);
  })();

  const toggleCaller = (id: number) =>
    setExpandedCallers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex h-full w-full bg-background relative overflow-hidden">
      {/* Sidebar List — hidden entirely for plain users (they only have their
          support conversation); on mobile it hides once a conversation is open. */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 flex flex-col border-r border-border bg-card/95 dark:bg-card/60 backdrop-blur-xl text-foreground shadow-2xl md:shadow-xl z-20 transition-all",
        isPlainUser && "hidden",
        !isPlainUser && (activeId !== null || monitorId !== null) && "hidden md:flex" // hide on mobile if convo is active
      )}>
        <div className="p-4 border-b border-border h-16 flex items-center gap-3 bg-card/95 dark:bg-card/60 backdrop-blur-xl sticky top-0">
          <h2 className="font-bold text-foreground tracking-tight flex-1">{showDirectory ? "New Chat" : "Conversations"}</h2>
          {ENABLE_CHAT_CREATION && !showDirectory && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateGroup(true)}
              className="gap-1.5"
            >
              <Users className="h-4 w-4" /> Group
            </Button>
          )}
          {ENABLE_CHAT_CREATION && (
            <Button
              variant={showDirectory ? "secondary" : "default"}
              size="sm"
              onClick={() => { setShowDirectory(!showDirectory); setSearch(""); }}
              className="gap-1.5"
            >
              {showDirectory ? (
                <>
                  <X className="h-4 w-4" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> New Chat
                </>
              )}
            </Button>
          )}
        </div>

        {showDirectory ? (
          <div className="p-4 border-b border-border bg-muted/30 space-y-2">
            <p className="text-xs text-muted-foreground">Select a person to start chatting with.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                placeholder="Search people..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 bg-background border-border text-foreground shadow-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
              />
            </div>
          </div>
        ) : (
          <div className="p-3 border-b border-border bg-card/95 dark:bg-card/60 backdrop-blur-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 bg-white dark:bg-card border-border/80 dark:border-border shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
              />
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1 pb-20 md:pb-2">
            {showDirectory ? (
              <>
                <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Directory</div>
                {isLoadingUsers ? (
                  <div className="p-4 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">No users found</div>
                ) : (
                  filteredUsers.map(user => (
                    <button
                      key={user.id}
                      onClick={() => handleStartConvo(user.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left"
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10 border border-border shadow-sm">
                          <AvatarFallback className="bg-muted text-foreground text-sm font-bold">{user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        {user.isOnline && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-border shadow-sm" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </button>
                  ))
                )}
              </>
            ) : (
              <>
                {isLoadingConvos ? (
                  <div className="p-4 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                ) : ownItems.length === 0 && callerGroups.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center gap-4 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 opacity-20" />
                    <p className="text-sm">{ENABLE_CHAT_CREATION ? <>No active conversations.<br/>Tap "New Chat" above to find someone.</> : <>No active conversations yet.</>}</p>
                  </div>
                ) : (
                  <>
                    {ownItems.map(convo => {
                      const isActive = convo.id === activeId;
                      const isTyping = typingUsers[convo.id]?.size > 0;
                      const isAiMode = convo.mode === "ai";
                      const isEscalated = convo.mode === "human" && !!convo.escalationReason;
                      return (
                        <button
                          key={`own-${convo.id}`}
                          onClick={() => { setActiveId(convo.id); setMonitorId(null); }}
                          className={cn(
                            "w-full flex items-start gap-3 p-3 rounded-lg mb-1 transition-all text-left group",
                            isActive
                              ? "bg-primary/5 dark:bg-primary/10 border-primary/20 shadow-sm"
                              : "hover:bg-muted/60 border-transparent"
                          )}
                        >
                          <div className="relative flex-shrink-0">
                            {convo.type === "group" ? (
                              <GroupAvatar convo={convo} className="h-10 w-10 border-2 border-white dark:border-border shadow-sm" />
                            ) : (
                              <Avatar className="h-10 w-10 border-2 border-white dark:border-border shadow-sm">
                                <AvatarFallback className={cn("text-sm font-bold", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                                  {convoName(convo).charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            {convo.otherUser?.isOnline && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-border shadow-sm" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1">
                              <div className={cn(
                                "font-medium text-sm truncate",
                                isActive || convo.unreadCount > 0 ? "text-foreground" : "text-foreground/80"
                              )}>{convoName(convo)}</div>
                              <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                {convo.lastMessage ? format(new Date(convo.lastMessage.createdAt), "HH:mm") : ""}
                              </div>
                            </div>
                            <p className={cn(
                              "text-xs mb-2 truncate",
                              convo.unreadCount > 0 ? "text-foreground/80 font-medium" : "text-muted-foreground"
                            )}>
                              {isTyping ? "Typing..." : ((convo.lastMessage as any)?.encrypted ? "🔒 Encrypted message" : (convo.lastMessage ? (isPlainUser ? convo.lastMessage.content : staffText(convo.lastMessage)) : null)) || "Started conversation"}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {isAiMode && (
                                <Badge className="text-xs px-2 py-0 h-5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                  <Bot className="w-3 h-3 mr-1" />
                                  AI
                                </Badge>
                              )}
                              {isEscalated && (
                                <Badge className="text-xs px-2 py-0 h-5 bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20">
                                  <ArrowUpRight className="w-3 h-3 mr-1" />
                                  Escalated
                                </Badge>
                              )}
                              {convo.unreadCount > 0 && (
                                <Badge className="text-xs px-1.5 py-0 h-5 bg-primary text-primary-foreground border-0 hover:bg-primary ml-auto shadow-sm">
                                  {convo.unreadCount}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {/* Admin monitor: conversations grouped by caller (agent). */}
                    {isAdmin && callerGroups.length > 0 && (
                      <>
                        <div className="px-2 pt-4 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Monitor — Callers
                        </div>
                        {callerGroups.map(group => {
                          const expanded = expandedCallers.has(group.caller.id);
                          const hasActive = group.items.some(it => it.conv.id === monitorId);
                          return (
                            <div key={`caller-${group.caller.id}`} className="mb-0.5">
                              <button
                                onClick={() => toggleCaller(group.caller.id)}
                                className={cn(
                                  "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left",
                                  hasActive && !expanded ? "bg-muted/80" : "hover:bg-muted/60"
                                )}
                              >
                                {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground/70 shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/70 shrink-0" />}
                                <div className="relative shrink-0">
                                  <Avatar className="h-10 w-10 border-2 border-white dark:border-border shadow-sm">
                                    <AvatarFallback className="bg-muted text-foreground/80 dark:bg-muted/80 dark:text-muted-foreground/40 text-sm font-medium">{group.caller.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  {group.caller.isOnline && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-border shadow-sm" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate text-foreground">{group.caller.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {group.caller.empCode ? `#${group.caller.empCode} · ` : ""}{group.items.length} {group.items.length === 1 ? "user" : "users"}
                                  </div>
                                </div>
                                <Badge className="text-xs px-1.5 py-0 h-5 bg-muted text-muted-foreground dark:bg-muted/80 dark:text-muted-foreground/50 border-0 hover:bg-muted shrink-0">
                                  {group.items.length}
                                </Badge>
                              </button>

                              {expanded && (
                                <div className="ml-6 pl-3 border-l border-border space-y-0.5 mt-0.5">
                                  {group.items.map(({ conv, user }) => {
                                    const isActive = conv.id === monitorId;
                                    return (
                                      <button
                                        key={`mon-${conv.id}`}
                                        onClick={() => { setMonitorId(conv.id); setActiveId(null); }}
                                        className={cn(
                                          "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left",
                                          isActive
                                            ? "bg-primary/5 dark:bg-primary/10 border-primary/20 shadow-sm"
                                            : "hover:bg-muted/60 border-transparent"
                                        )}
                                      >
                                        <div className="relative shrink-0">
                                          <Avatar className="h-9 w-9 border border-border shadow-sm">
                                            <AvatarFallback className={cn("text-xs font-bold", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{user.name.charAt(0)}</AvatarFallback>
                                          </Avatar>
                                          {user.isOnline && (
                                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-border shadow-sm" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex justify-between items-baseline">
                                            <div className="font-medium text-sm truncate text-foreground">{user.name}</div>
                                            <div className="text-xs whitespace-nowrap ml-2 text-muted-foreground">
                                              {conv.lastMessage ? format(new Date(conv.lastMessage.createdAt), "HH:mm") : ""}
                                            </div>
                                          </div>
                                          <div className="text-xs truncate text-muted-foreground">
                                            {(conv.lastMessage && staffText(conv.lastMessage)) || (conv.lastMessage ? "Attachment" : "No messages")}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <CreateGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        onCreated={(conv) => { setActiveId(conv.id); setMonitorId(null); }}
      />

      {/* Active Thread */}
      <div className={cn(
        "flex-1 flex flex-col bg-white/50 dark:bg-slate-950/30 min-w-0 min-h-0 overflow-hidden transition-transform",
        isPlainUser
          ? "static flex translate-x-0"
          : cn(
              "absolute inset-0 md:static",
              (activeId === null && monitorId === null) ? "translate-x-full md:translate-x-0 hidden md:flex" : "translate-x-0 flex"
            )
      )}>
        {activeId && activeConvo ? (
          <ChatThread 
            convo={activeConvo} 
            onBack={isPlainUser ? undefined : () => setActiveId(null)}
            onCall={() => { if (activeConvo.otherUser) initiateCall(activeConvo.otherUser); }} 
          />
        ) : isPlainUser && isLoadingConvos ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <BrandedLoader message="Getting your chat ready…" />
          </div>
        ) : activeMonitorConvo ? (
          <Transcript
            conversationId={activeMonitorConvo.id}
            userAId={activeMonitorConvo.userA.id}
            userBId={activeMonitorConvo.userB.id}
            customerId={activeMonitorConvo.userA.role === "user" ? activeMonitorConvo.userA.id : activeMonitorConvo.userB.role === "user" ? activeMonitorConvo.userB.id : undefined}
            title={`${activeMonitorConvo.userA.name} ↔ ${activeMonitorConvo.userB.name}`}
            userAName={activeMonitorConvo.userA.name}
            userBName={activeMonitorConvo.userB.name}
            onBack={() => setMonitorId(null)}
            canReply={activeMonitorConvo.adminEscalated}
            language={activeMonitorConvo.language}
            slaConv={activeMonitorConvo}
            selectedCategoryId={activeMonitorConvo.selectedCategoryId}
          />
        ) : isPlainUser ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-6 max-w-sm text-center">
              {isLoadingConvos ? (
                <BrandedLoader message="Connecting you to support…" />
              ) : (
                <>
                  <div className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30">
                    <MessageSquare className="h-10 w-10 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-foreground">Connecting you to your agent</h3>
                    <p className="text-muted-foreground">Hang tight — your conversation will appear here in a moment.</p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex items-center justify-center">
            <div className="flex flex-col items-center gap-6 max-w-sm text-center">
              <div className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30">
                <MessageSquare className="h-10 w-10 text-white" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground">Your Workspace</h3>
                <p className="text-muted-foreground">Select a conversation from the sidebar or start a new one to begin chatting.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MESSAGE BODY (handles both plaintext and end-to-end encrypted messages)
// ----------------------------------------------------------------------------

function AttachmentView({ url, type, name }: { url: string; type?: string | null; name?: string | null }) {
  return (
    <div className="mb-2">
      {type?.startsWith('image/') ? (
        <a href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-black/10 dark:border-white/10">
          <img src={url} alt="attachment" className="max-w-full h-auto max-h-60 object-contain" />
        </a>
      ) : type?.startsWith('audio/') ? (
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 shrink-0 opacity-70" />
          <audio controls preload="metadata" src={url} className="max-w-[240px] h-10" />
        </div>
      ) : (
        <a href={url} download={name || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-black/10 dark:bg-white/10 rounded-lg hover:bg-black/20 transition-colors">
          <FileIcon className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium truncate max-w-[200px]">{name || "File"}</span>
        </a>
      )}
    </div>
  );
}

function MessageBody({ msg, plainText }: { msg: Message; plainText: string | null | undefined }) {
  const dec = useDecryptedMessage(msg);
  const encAttachment = dec.kind === "ready" ? dec.payload.attachment : undefined;
  const decryptedUrl = useDecryptedAttachment(encAttachment);

  if (dec.kind === "plain") {
    return (
      <>
        {msg.attachmentUrl && (
          <AttachmentView url={msg.attachmentUrl} type={msg.attachmentType} name={msg.attachmentName} />
        )}
        {plainText && <p className="whitespace-pre-wrap break-words">{plainText}</p>}
      </>
    );
  }
  if (dec.kind === "pending") {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground italic text-xs">
        <Lock className="h-3 w-3" /> Decrypting…
      </p>
    );
  }
  if (dec.kind === "unavailable") {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground italic text-xs">
        <Lock className="h-3 w-3" /> Encrypted message — not available on this device
      </p>
    );
  }
  return (
    <>
      {encAttachment && (
        decryptedUrl ? (
          <AttachmentView url={decryptedUrl} type={encAttachment.type} name={encAttachment.name} />
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs mb-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Decrypting attachment…
          </p>
        )
      )}
      {dec.payload.text && <p className="whitespace-pre-wrap break-words">{dec.payload.text}</p>}
    </>
  );
}

// ----------------------------------------------------------------------------
// THREAD COMPONENT
// ----------------------------------------------------------------------------

function ChatThread({ convo, onBack, onCall }: { convo: Conversation, onBack?: () => void, onCall: () => void }) {
  const { data: messages, isLoading } = useListMessages(convo.id, undefined, {
    query: { enabled: !!convo.id, queryKey: getListMessagesQueryKey(convo.id) }
  });
  const { data: calls } = useListCalls({
    query: { queryKey: getListCallsQueryKey() }
  });
  const sendMessage = useSendMessage();
  const uploadFile = useUploadFile();
  const escalate = useEscalateConversation();
  const escalateToAdmin = useEscalateConversationToAdmin();
  const endConversation = useEndConversation();
  const setLanguage = useSetConversationLanguage();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const myId = me?.id ?? -1;
  const { typingUsers, emitTyping } = useSocket();
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---- Pagination: the server returns the latest 50 messages; older
  // history is loaded when the user scrolls to the top of the thread. ----
  const PAGE_SIZE = 50;
  const [loadingOlder, setLoadingOlder] = useState(false);
  // No more history when a page comes back short. Keyed per conversation.
  const noMoreOlderRef = useRef<Set<number>>(new Set());
  const loadOlderMessages = async () => {
    const oldest = messages?.[0];
    if (!oldest || loadingOlder || noMoreOlderRef.current.has(convo.id)) return;
    if ((messages?.length ?? 0) < PAGE_SIZE) {
      noMoreOlderRef.current.add(convo.id);
      return;
    }
    setLoadingOlder(true);
    // Preserve the visual position: remember how tall the list was, then
    // offset scrollTop by the added height after older messages render.
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    try {
      const older = await listMessages(convo.id, { before: oldest.id, limit: PAGE_SIZE });
      if (older.length < PAGE_SIZE) noMoreOlderRef.current.add(convo.id);
      if (older.length) {
        queryClient.setQueryData<Message[]>(getListMessagesQueryKey(convo.id), (old) => {
          const existing = new Set((old ?? []).map((m) => m.id));
          return [...older.filter((m) => !existing.has(m.id)), ...(old ?? [])];
        });
        requestAnimationFrame(() => {
          if (el) el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };
  const handleThreadScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop < 80) void loadOlderMessages();
  };

  // Chat kinds: "caller" = support flow (AI, categories, SLA, translation),
  // "direct" = plain 1:1, "group" = staff group chat.
  const isGroup = convo.type === "group";
  const isCaller = convo.type === "caller";
  const other = convo.otherUser ?? null;
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Voice message recording (MediaRecorder → webm blob → normal upload path).
  const [isRecording, setIsRecording] = useState(false);

  // One-time (per thread visit) notice when we fall back to plaintext because
  // a member has never logged in (no published keys). Keyed by convo id so
  // switching threads re-arms the notice.
  const plaintextNoticeShownRef = useRef<number | null>(null);
  const notifyUnencryptedFallback = (missingIds: number[]) => {
    if (plaintextNoticeShownRef.current === convo.id) return;
    plaintextNoticeShownRef.current = convo.id;
    const names = missingIds
      .map((uid) =>
        isGroup
          ? convo.members?.find((m) => m.id === uid)?.name
          : other?.id === uid
            ? other.name
            : undefined,
      )
      .filter((n): n is string => !!n);
    const who = names.length ? names.join(", ") : "a member of this chat";
    toast({
      title: "Sent without end-to-end encryption",
      description: `This message was not end-to-end encrypted because ${who} hasn't opened the app yet. Messages will be encrypted automatically once they log in.`,
    });
  };
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
        // Strip codec parameters ("audio/webm;codecs=opus" → "audio/webm")
        // so the type matches the server's allowed list exactly.
        const baseType = (recorder.mimeType || "audio/webm").split(";")[0]!.trim() || "audio/webm";
        const blob = new Blob(recordChunksRef.current, { type: baseType });
        if (blob.size > 0) {
          const stamp = format(new Date(), "HH-mm-ss");
          setFile(new File([blob], `voice-message-${stamp}.webm`, { type: baseType }));
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
      // Stop any in-progress recording when leaving the thread.
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Calls between me and this conversation's other user, merged into the
  // message timeline so both sides can see answered / missed / declined calls.
  // Calls that happened before the last ticket was closed belong to the
  // archived chat — keep them out of the live thread.
  const archivedCutoff = convo.archivedAt ? new Date(convo.archivedAt).getTime() : 0;
  const threadCalls = other
    ? (calls ?? []).filter(
        (c) =>
          (c.caller.id === other.id || c.callee.id === other.id) &&
          (c.caller.id === myId || c.callee.id === myId) &&
          new Date(c.startedAt).getTime() > archivedCutoff,
      )
    : [];
  const timeline: ({ kind: "msg"; msg: Message; at: number } | { kind: "call"; call: Call; at: number })[] = [
    ...(messages ?? []).map((m) => ({ kind: "msg" as const, msg: m, at: new Date(m.createdAt).getTime() })),
    ...threadCalls.map((c) => ({ kind: "call" as const, call: c, at: new Date(c.startedAt).getTime() })),
  ].sort((a, b) => a.at - b.at);

  // Auto-scroll to the bottom only when something was appended (new message
  // at the end) — not when older history is prepended at the top.
  const lastMsgIdRef = useRef<number | null>(null);
  useEffect(() => {
    const lastId = messages?.length ? messages[messages.length - 1]!.id : null;
    const appended = lastId !== null && lastId !== lastMsgIdRef.current;
    lastMsgIdRef.current = lastId;
    if (scrollRef.current && (appended || lastId === null)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, calls]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setContent(e.target.value);
    
    emitTyping(convo.id, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(convo.id, false);
    }, 2000);
  };

  // ---- E2EE send path (staff direct & group chats) ----------------------
  // Encrypts the message separately for every member (pairwise Signal
  // sessions). Attachments are AES-256-GCM encrypted before upload; the file
  // key travels inside the encrypted envelope. Returns false when encryption
  // is not possible (e.g. a member has never logged in / no published keys),
  // in which case the caller falls back to a normal plaintext send.
  const trySendEncrypted = async (text: string, fileToSend: File | null): Promise<boolean> => {
    if (!(convo.type === "direct" || convo.type === "group")) return false;
    if (isEndUser || !e2ee.isReady()) return false;
    const recipientIds = isGroup
      ? (convo.members ?? []).map((m) => m.id).filter((uid) => uid !== myId)
      : other
        ? [other.id]
        : [];
    if (!recipientIds.length) return false;
    try {
      const missing = await e2ee.ensureSessions(recipientIds);
      if (missing.length) {
        // Someone has no keys yet → plaintext fallback. Tell the user why.
        notifyUnencryptedFallback(missing);
        return false;
      }

      const payload: E2eePayload = {};
      if (text.trim()) payload.text = text.trim();
      if (fileToSend) {
        const encFile = await encryptFile(fileToSend);
        const uploaded = await uploadFile.mutateAsync({
          data: { file: new File([encFile.blob], "encrypted.bin", { type: "application/octet-stream" }) as any },
        });
        payload.attachment = {
          url: uploaded.url,
          name: fileToSend.name,
          type: fileToSend.type || "application/octet-stream",
          size: fileToSend.size,
          key: encFile.key,
          iv: encFile.iv,
        };
      }

      const envelopes = await e2ee.encryptFor(recipientIds, payload);

      // Optimistic bubble: plaintext locally (never sent to the server).
      const msgKey = getListMessagesQueryKey(convo.id);
      const tempId = -Date.now();
      const optimistic = {
        id: tempId,
        conversationId: convo.id,
        senderId: myId,
        isAi: false,
        content: null,
        contentEn: null,
        encrypted: true,
        attachmentUrl: null,
        attachmentType: null,
        attachmentName: null,
        status: "sent",
        createdAt: new Date().toISOString(),
      } as unknown as Message;
      await e2ee.cachePlaintext(tempId, payload);
      queryClient.setQueryData<Message[]>(msgKey, (old) => [...(old ?? []), optimistic]);

      try {
        const saved = await sendMessage.mutateAsync({
          id: convo.id,
          data: { encrypted: true, envelopes } as any,
        });
        // Cache our plaintext under the real id (we can't decrypt our own
        // pairwise ciphertext), then swap the optimistic bubble.
        await e2ee.cachePlaintext(saved.id, payload);
        queryClient.setQueryData<Message[]>(msgKey, (old) =>
          (old ?? []).filter((m) => m.id !== tempId && m.id !== saved.id).concat(saved),
        );
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        return true;
      } catch (err: any) {
        queryClient.setQueryData<Message[]>(msgKey, (old) => (old ?? []).filter((m) => m.id !== tempId));
        // Membership changed between encrypt and send — refresh and let the
        // user retry with the new member list.
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        toast({
          variant: "destructive",
          title: "Could not send",
          description: "Group members changed. Please try sending again.",
        });
        setContent(text);
        setFile(fileToSend);
        return true; // handled (don't double-send as plaintext)
      }
    } catch (err) {
      console.warn("E2EE send failed, falling back to plaintext", err);
      return false;
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() && !file) return;

    const currentContent = content;
    const currentFile = file;
    
    setContent("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    emitTyping(convo.id, false);

    if (await trySendEncrypted(currentContent, currentFile)) return;

    let attachmentPayload: {
      attachmentUrl?: string;
      attachmentType?: string;
      attachmentName?: string;
    } = {};

    if (currentFile) {
      try {
        const res = await uploadFile.mutateAsync({ data: { file: currentFile as any } });
        attachmentPayload = {
          attachmentUrl: res.url,
          attachmentType: res.type,
          attachmentName: res.name
        };
      } catch (err) {
        console.error("Upload failed", err);
        toast({
          variant: "destructive",
          title: "Could not send attachment",
          description: "The file upload failed. Please try again.",
        });
        // Restore what the user was trying to send so nothing is lost.
        setContent(currentContent);
        setFile(currentFile);
        return;
      }
    }

    // Optimistically show the message right away with a temporary id, then
    // reconcile with the server response. Without this the sender's own
    // message would only appear on the next background refetch (feels slow).
    const msgKey = getListMessagesQueryKey(convo.id);
    const tempId = -Date.now();
    const optimistic: Message = {
      id: tempId,
      conversationId: convo.id,
      senderId: myId,
      isAi: false,
      content: currentContent.trim() || null,
      contentEn: null,
      attachmentUrl: attachmentPayload.attachmentUrl ?? null,
      attachmentType: attachmentPayload.attachmentType ?? null,
      attachmentName: attachmentPayload.attachmentName ?? null,
      status: "sent",
      createdAt: new Date().toISOString(),
    };
    queryClient.setQueryData<Message[]>(msgKey, (old) => [...(old ?? []), optimistic]);

    sendMessage.mutate(
      {
        id: convo.id,
        data: { content: currentContent.trim() || undefined, ...attachmentPayload }
      },
      {
        onSuccess: (saved) => {
          // Replace the temp message with the real one from the server (the
          // server copy may differ, e.g. translated into the customer's
          // language), then refetch to guarantee we converge on server truth.
          queryClient.setQueryData<Message[]>(msgKey, (old) =>
            (old ?? [])
              .filter((m) => m.id !== tempId && m.id !== saved.id)
              .concat(saved),
          );
          queryClient.invalidateQueries({ queryKey: msgKey });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: () => {
          // Drop the optimistic bubble if the send failed.
          queryClient.setQueryData<Message[]>(msgKey, (old) =>
            (old ?? []).filter((m) => m.id !== tempId),
          );
        },
      },
    );
  };

  const isOtherTyping = isGroup
    ? [...(typingUsers[convo.id] ?? new Set<number>())].some((id) => id !== myId && id !== -1)
    : other != null && typingUsers[convo.id]?.has(other.id);
  const isAiTyping = typingUsers[convo.id]?.has(-1);

  // Customer call button:
  // - If the customer has a DIRECT caller/agent assigned (empCode other than
  //   the general "001" support pool), they can call that agent in-app directly.
  // - Otherwise the call first goes to the support line (bot), and the agent
  //   calls the customer back.
  const isCustomer = me?.role === "user";
  const hasDirectCaller =
    isCustomer && !!other?.empCode && other.empCode !== "001";
  const { data: supportPhoneData } = useGetSupportPhone({
    query: { queryKey: getGetSupportPhoneQueryKey(), enabled: isCustomer },
  });
  const supportPhone = supportPhoneData?.phone ?? null;
  const [showCallNumber, setShowCallNumber] = useState(false);
  const handleCallClick = () => {
    if (!isCustomer || hasDirectCaller || !supportPhone) {
      onCall();
      return;
    }
    const isMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `tel:${supportPhone.replace(/[^+\d]/g, "")}`;
    } else {
      setShowCallNumber(true);
    }
  };

  // AI-first flow (end users only): pick a support topic before chatting.
  const isEndUser = me?.role === "user";
  const isAgent = me?.role === "agent";
  const inAiMode = convo.mode === "ai";
  // Customers see messages in their language; staff always see English.
  const displayText = (msg: Pick<Message, "content" | "contentEn">) =>
    isEndUser ? msg.content : staffText(msg);
  const showCategoryPicker =
    isCaller && isEndUser && inAiMode && convo.selectedCategoryId == null && (messages ?? []).length === 0;

  return (
    <div className="flex flex-col h-full w-full min-h-0 overflow-hidden">
      {/* Thread Header */}
      <div className={cn(
        "border-b border-border/80 dark:border-border/80 bg-white/90 dark:bg-slate-950/80 backdrop-blur-xl flex items-center px-4 md:px-6 shrink-0 sticky top-0 z-10 shadow-sm",
        isEndUser && isCaller ? "h-12 justify-end" : "h-16 justify-between"
      )}>
        {/* End users already see their agent in the app header, so the thread
            header only shows the action controls — avoids a cramped double row. */}
        <div className={cn("flex items-center gap-3 min-w-0", isEndUser && isCaller && "hidden")}>
          {onBack && (
            <Button variant="ghost" size="icon" className="md:hidden -ml-2 text-muted-foreground" onClick={onBack}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Button>
          )}
          <div className="relative flex-shrink-0">
            {isGroup ? (
              <GroupAvatar convo={convo} className="h-10 w-10 border-2 border-white dark:border-border shadow-sm" />
            ) : (
              <Avatar className="h-10 w-10 border-2 border-white dark:border-border shadow-sm">
                <AvatarFallback className={cn("font-medium", "bg-primary text-primary-foreground")}>{(other?.name ?? "?").charAt(0)}</AvatarFallback>
              </Avatar>
            )}
            {other?.isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-border shadow-sm" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground truncate">{isGroup ? (convo.title ?? "Group") : (other?.name ?? "Chat")}</span>
              {!isGroup && other?.isOnline && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Online</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {isGroup
                ? `${(convo.members ?? []).length} members`
                : other?.isOnline
                  ? (other.email ?? "")
                  : other?.lastSeenAt ? `Last seen ${format(new Date(other.lastSeenAt), "MMM d, HH:mm")}` : "Offline"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Status chips — compact, quiet */}
          {!isEndUser && convo.language && convo.language !== "en" && (
            <span className="hidden sm:inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
              {languageLabel(convo.language)}
            </span>
          )}
          {!isEndUser && convo.adminEscalated && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              With Admin
            </span>
          )}
          {!isEndUser && convo.mode === "human" && convo.escalationReason && !convo.adminEscalated && (
            <span className="hidden md:inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              From AI
            </span>
          )}
          {(isAgent && !convo.adminEscalated) && <span className="hidden sm:block w-px h-5 bg-border mx-1" />}
          {isAgent && !convo.adminEscalated && (
            <button
              className="h-9 px-3 text-[13px] font-medium text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200/80 dark:border-rose-900 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
              title="Escalate to admin"
              disabled={escalateToAdmin.isPending}
              onClick={() =>
                escalateToAdmin.mutate(
                  { id: convo.id, data: { reason: "Support member escalated to admin" } },
                  { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }) },
                )
              }
            >
              {escalateToAdmin.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              <span className="hidden lg:inline">Escalate</span>
            </button>
          )}
          {/* Customer can change their language mid-chat; new messages arrive in the new language. */}
          {isCaller && isEndUser && convo.language && (
            <div
              className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-border bg-card/60 pl-2.5 pr-1"
              title={cxT(convo.language, "changeLanguage")}
            >
              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={convo.language}
                disabled={setLanguage.isPending}
                onChange={(e) =>
                  setLanguage.mutate(
                    { id: convo.id, data: { language: e.target.value } },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
                        toast({ description: cxT(e.target.value, "languageChanged") });
                      },
                    },
                  )
                }
                className="h-full bg-transparent border-0 pr-1 text-[13px] font-medium text-foreground outline-none disabled:opacity-60 cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.native}</option>
                ))}
              </select>
            </div>
          )}
          {isCaller && isEndUser && inAiMode && (
            <button
              className="px-4 py-2 text-sm font-medium text-primary dark:text-primary bg-primary/10 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
              disabled={escalate.isPending}
              onClick={() =>
                escalate.mutate(
                  { id: convo.id, data: { reason: "User requested a human agent" } },
                  {
                    onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
                    onError: (err: unknown) => {
                      const msg =
                        (err as { data?: { error?: string } })?.data?.error ||
                        "A human agent isn't available yet — our assistant will keep helping you first.";
                      toast({ description: msg });
                    },
                  },
                )
              }
            >
              {escalate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Headset className="h-3.5 w-3.5" />}
              Talk to a human
            </button>
          )}
          {isGroup ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
              title="Group info"
              onClick={() => setShowGroupInfo(true)}
            >
              <Info className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-lg text-muted-foreground dark:text-muted-foreground/50 hover:text-foreground dark:hover:text-background hover:bg-muted/50 dark:hover:bg-muted" onClick={handleCallClick}>
              <Phone className="h-4 w-4" />
            </Button>
          )}
          {isCaller && !isEndUser && convo.slaStatus === "open" && (
            <button
              className="h-9 px-3 text-[13px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-900 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
              title="End chat"
              disabled={endConversation.isPending}
              onClick={() =>
                endConversation.mutate(
                  { id: convo.id },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
                      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(convo.id) });
                    },
                  },
                )
              }
            >
              {endConversation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">End chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Desktop: show the support number for customers to dial */}
      <Dialog open={showCallNumber} onOpenChange={setShowCallNumber}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" /> Call Support
            </DialogTitle>
            <DialogDescription>
              Call us on the number below from your phone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-center">
            <a
              href={`tel:${(supportPhone ?? "").replace(/[^+\d]/g, "")}`}
              className="text-2xl font-bold tracking-wide text-primary"
            >
              {supportPhone}
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {isGroup && me && (
        <GroupInfoDialog
          convo={convo}
          meId={me.id}
          meRole={me.role}
          open={showGroupInfo}
          onOpenChange={setShowGroupInfo}
          onLeft={() => onBack?.()}
        />
      )}

      {isCaller && isEndUser && inAiMode && !showCategoryPicker && (
        <div className="px-6 py-3 bg-primary/10 border-b border-primary/20 text-center shrink-0">
          <p className="text-sm text-foreground/80">
            You're chatting with <span className="font-semibold text-primary">Support</span> — ask for a human any time.
          </p>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-6 md:py-8" ref={scrollRef} onScroll={handleThreadScroll}>
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {isLoading ? (
          isEndUser ? (
            <div className="h-full flex items-center justify-center p-8">
              <BrandedLoader message="Loading messages…" />
            </div>
          ) : (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          )
        ) : showCategoryPicker ? (
          <div className="h-full flex flex-col">
            {convo.archivedAt != null && (
              <div className="flex justify-center pt-2 pb-1 px-4 shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/60 border border-border rounded-full pl-3 pr-1 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Your previous chat is saved.</span>
                  <CustomerHistoryDialog label="View" small />
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <CategoryPicker convoId={convo.id} />
            </div>
          </div>
        ) : timeline.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
            <div className="w-16 h-16 bg-white dark:bg-card rounded-2xl flex items-center justify-center shadow-sm border border-border/60 dark:border-border">
              <MessageSquare className="h-8 w-8 opacity-50" />
            </div>
            <p>Send a message to start the conversation.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
          {(convo.type === "direct" || convo.type === "group") && !isEndUser && (
            <div className="flex justify-center my-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5">
                <Lock className="h-3 w-3" />
                Messages are end-to-end encrypted. Only people in this chat can read them.
              </div>
            </div>
          )}
          {timeline.map((item, i) => {
            if (item.kind === "call") {
              const call = item.call;
              const outgoing = call.caller.id === myId;
              const answered = call.status === "answered";
              const missed = call.status === "missed";
              const rejected = call.status === "rejected";
              const fmtDur = (s?: number | null) => {
                if (s == null) return "";
                const m = Math.floor(s / 60);
                return ` · ${m}:${(s % 60).toString().padStart(2, "0")}`;
              };
              return (
                <div key={`call-${call.id}`} className="flex items-center gap-4 my-8">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  <div className={cn(
                    "flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-full border shadow-sm",
                    missed && !outgoing ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-white dark:bg-card text-muted-foreground dark:text-muted-foreground/50 border-border dark:border-border"
                  )}>
                    {answered
                      ? (outgoing ? <PhoneOutgoing className="h-3.5 w-3.5" /> : <PhoneIncoming className="h-3.5 w-3.5" />)
                      : rejected
                        ? <PhoneOff className="h-3.5 w-3.5" />
                        : <PhoneMissed className="h-3.5 w-3.5" />}
                    <span>
                      {answered && `Voice call${fmtDur(call.durationSeconds)}`}
                      {missed && (outgoing ? "No answer" : "Missed voice call")}
                      {rejected && (outgoing ? "Call declined" : "You declined a call")}
                    </span>
                    <span className="opacity-60">{format(new Date(call.startedAt), "HH:mm")}</span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-700 to-transparent" />
                </div>
              );
            }

            const msg = item.msg;
            const isAi = !!msg.isAi;
            // Alignment is by role, the same in every view: the customer's
            // messages go RIGHT; AI + staff (admin/agent/caller) go LEFT.
            // Groups + direct chats align like a normal messenger: my
            // messages RIGHT, everyone else LEFT. Caller chats keep the
            // support convention: customer RIGHT, AI + staff LEFT.
            const isOwn = !isAi && msg.senderId === myId;
            const isCustomerMsg = isCaller
              ? !isAi && (isEndUser
                  ? msg.senderId === myId
                  : other != null && msg.senderId === other.id)
              : isOwn;
            const senderLabel = isAi
              ? "Support"
              : msg.senderName
                ?? (msg.senderId === myId
                  ? (me?.name ?? "Me")
                  : other != null && msg.senderId === other.id
                    ? other.name
                    : isGroup
                      ? (convo.members?.find((m) => m.id === msg.senderId)?.name ?? "Member")
                      : "Support team");
            const next = timeline[i + 1];
            const showAvatar = !isCustomerMsg && (!next || next.kind !== "msg" || next.msg.senderId !== msg.senderId || !!next.msg.isAi !== isAi);
            
            return (
              <div key={msg.id} className={cn("flex gap-3", isCustomerMsg ? "justify-end" : "justify-start")}>
                {!isCustomerMsg && (
                  <div className="w-8 shrink-0 flex items-start pt-0.5">
                    {showAvatar && (
                      isAi ? (
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/30">
                          <div className="w-3 h-3 rounded-sm bg-white/90" />
                        </div>
                      ) : (
                        <Avatar className="h-8 w-8 border-2 border-white dark:border-border shadow-md">
                          <AvatarFallback className={cn("text-xs font-semibold", "bg-primary text-primary-foreground")}>{senderLabel.charAt(0)}</AvatarFallback>
                        </Avatar>
                      )
                    )}
                  </div>
                )}
                
                <div className={cn("flex flex-col gap-1 max-w-[75%]", isCustomerMsg ? "items-end" : "items-start")}>
                  <div className={cn(
                    "rounded-2xl px-4 py-2.5 shadow-sm text-[13px] leading-relaxed font-normal",
                    isCustomerMsg
                      ? "bg-sidebar text-sidebar-foreground rounded-br-sm shadow-sm"
                      : isAi
                        ? "bg-primary/10 text-foreground rounded-bl-sm border border-primary/20"
                        : "bg-muted text-foreground rounded-bl-sm border border-border"
                  )}>
                    {isAi && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-semibold text-primary">Support</span>
                      </div>
                    )}
                    {!isAi && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={cn("text-[11px] font-semibold", isCustomerMsg ? "opacity-80" : "text-foreground")}>{senderLabel}</span>
                      </div>
                    )}
                    <MessageBody msg={msg} plainText={displayText(msg)} />
                  </div>
                  
                  <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground font-medium">
                    {format(new Date(msg.createdAt), "HH:mm")}
                    {(convo.type === "direct" || convo.type === "group") && !isAi && !(msg as any).encrypted && (
                      <span
                        className="flex items-center gap-0.5 text-amber-600 dark:text-amber-500"
                        title="This message was not end-to-end encrypted because a member of this chat hadn't opened the app yet."
                      >
                        <LockOpen className="h-3 w-3" />
                        <span className="text-[10px]">Not encrypted</span>
                      </span>
                    )}
                    {isOwn && (
                      <span className="ml-0.5">
                        {msg.status === 'sent' && <Check className="h-3 w-3 opacity-50" />}
                        {msg.status === 'delivered' && <CheckCheck className="h-3 w-3 opacity-50" />}
                        {msg.status === 'read' && <CheckCheck className="h-3 w-3 text-blue-500" />}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        
        {isAiTyping && (
          <div className="flex gap-3 justify-start opacity-90 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300">
             <div className="flex-none w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/30">
                <div className="w-3 h-3 rounded-sm bg-white/90" />
             </div>
             <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-bl-sm px-5 py-3.5 shadow-sm flex items-center gap-1.5 text-foreground">
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" />
             </div>
          </div>
        )}
        {isOtherTyping && (
          <div className="flex gap-3 justify-start opacity-90 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300">
             <Avatar className="flex-none h-8 w-8 border-2 border-white dark:border-border shadow-md">
                <AvatarFallback className={cn("text-xs font-semibold", "bg-primary text-primary-foreground")}>{(other?.name ?? "·").charAt(0)}</AvatarFallback>
             </Avatar>
             <div className="bg-white dark:bg-card border border-border rounded-2xl rounded-tl-sm px-5 py-3.5 shadow-sm flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
             </div>
          </div>
        )}
          </div>
        )}
      </div>

      {/* Agents lose the composer once the chat is escalated to an admin — the admin owns it from there. */}
      {isAgent && convo.adminEscalated ? (
        <div className="px-4 md:px-6 py-4 bg-white/90 dark:bg-slate-950/80 backdrop-blur-xl border-t border-border/80 shrink-0 z-10 pb-safe">
          <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-900 rounded-lg py-3 px-4">
            <ArrowUpRight className="h-4 w-4 shrink-0" />
            This chat has been escalated to an admin. It's read-only for you now.
          </div>
        </div>
      ) : !isEndUser && inAiMode ? (
        /* While the AI is handling the chat, staff can only watch. */
        <div className="px-4 md:px-6 py-4 bg-white/90 dark:bg-slate-950/80 backdrop-blur-xl border-t border-border/80 shrink-0 z-10 pb-safe">
          <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-lg py-3 px-4">
            <Bot className="h-4 w-4 shrink-0" />
            AI is currently handling this conversation. You'll be able to reply once it's handed over to a human.
          </div>
        </div>
      ) : (
      /* Composer (hidden while the category picker is up) */
      <div className={cn("px-4 md:px-6 py-4 md:py-5 bg-white/90 dark:bg-slate-950/80 backdrop-blur-xl border-t border-border/80 dark:border-border/80 shadow-lg shrink-0 z-10 pb-safe", showCategoryPicker && "hidden")}>
        <div className="max-w-3xl mx-auto">
        {file && (
          <div className="mb-3 flex items-center gap-2 p-2 bg-muted/50 dark:bg-muted rounded-lg text-sm max-w-sm border border-border dark:border-border">
            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 font-medium text-foreground/80 dark:text-muted-foreground/40">{file.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => setFile(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </Button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-end gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={e => e.target.files && setFile(e.target.files[0])} 
            className="hidden" 
          />
          <button 
            type="button" 
            className="flex-none w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground/80 dark:hover:text-muted-foreground/40 hover:bg-muted/50 dark:hover:bg-muted rounded-lg transition-colors"
            onClick={() => fileInputRef.current?.click()}
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
                : "text-muted-foreground hover:text-foreground/80 dark:hover:text-muted-foreground/40 hover:bg-muted/50 dark:hover:bg-muted"
            )}
          >
            {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>

          {!isEndUser && isCaller && (
            <TemplatePicker
              onPick={(text) => setContent(text)}
              selectedCategoryId={convo.selectedCategoryId ?? null}
              customerName={other?.name ?? ""}
              agentName={me?.name ?? ""}
            />
          )}
          
          <div className="flex-1 bg-muted/50 border border-border focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary rounded-xl overflow-hidden transition-all flex items-center">
            {/* Textarea so multi-line templates (Hi <name> / message / Thank You / <agent>) keep their line breaks. Enter sends; Shift+Enter adds a line. */}
            <textarea
              value={content}
              onChange={handleTyping}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Type your message..."
              rows={Math.min(6, Math.max(1, content.split("\n").length))}
              className="w-full resize-none border-0 outline-none focus:ring-0 bg-transparent text-[15px] px-4 py-3 text-foreground placeholder:text-muted-foreground/70 leading-snug"
              autoComplete="off"
            />
          </div>

          <button 
            type="submit" 
            disabled={(!content.trim() && !file) || sendMessage.isPending || uploadFile.isPending}
            className="flex-none w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-primary/40 disabled:opacity-50 disabled:shadow-none"
          >
            {(sendMessage.isPending || uploadFile.isPending) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
        {isEndUser && inAiMode && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Powered by SkyTalk</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span>Ask for a human any time</span>
          </div>
        )}
        </div>
      </div>
      )}
    </div>
  );
}

// Staff-only quick replies: insert a predefined template into the composer
// where it can be edited before sending (translation to the customer's
// language happens on send, like any staff message). Templates linked to the
// conversation's support category (or an ancestor of it) are shown first;
// general templates (no category) are always available. Dynamic variables
// like {{customer_name}} are filled in at insert time.
export function TemplatePicker({
  onPick,
  selectedCategoryId,
  customerName,
  agentName,
}: {
  onPick: (text: string) => void;
  selectedCategoryId: number | null;
  customerName: string;
  agentName: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: templates } = useListMessageTemplates({
    query: { queryKey: getListMessageTemplatesQueryKey() },
  });
  const { data: categories } = useListSupportCategories(undefined, {
    query: { queryKey: getListSupportCategoriesQueryKey() },
  });

  // The selected category plus all its ancestors (templates are often
  // attached to top-level categories while chats select a subcategory).
  const categoryChain = new Set<number>();
  let cursor = selectedCategoryId;
  while (cursor != null && !categoryChain.has(cursor)) {
    categoryChain.add(cursor);
    cursor = categories?.find((c) => c.id === cursor)?.parentId ?? null;
  }
  const categoryTitle =
    (selectedCategoryId != null && categories?.find((c) => c.id === selectedCategoryId)?.title) || "your issue";

  const fillVariables = (text: string) => {
    const now = new Date();
    return text
      .replaceAll("{{customer_name}}", customerName)
      .replaceAll("{{agent_name}}", agentName)
      .replaceAll("{{category}}", categoryTitle)
      .replaceAll("{{date}}", now.toLocaleDateString())
      .replaceAll("{{time}}", now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const all = (templates ?? []).filter((t) => t.kind === "normal");
  const forCategory = all.filter((t) => t.categoryId != null && categoryChain.has(t.categoryId));
  const general = all.filter((t) => t.categoryId == null);

  // Templates insert only their own body. The welcome (opening) note is sent
  // automatically once at AI→human handoff, and the thank-you (closing) note
  // is sent automatically when someone ends the chat — never with templates.
  const compose = (body: string) => fillVariables(body);

  const renderItem = (t: { id: number; title: string; content: string }) => (
    <button
      key={t.id}
      type="button"
      onClick={() => { onPick(compose(t.content)); setOpen(false); }}
      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-muted/50 dark:hover:bg-muted transition-colors"
    >
      <div className="text-sm font-semibold text-foreground/90 dark:text-muted-foreground/40">{t.title}</div>
      <div className="text-xs text-muted-foreground line-clamp-2">{t.content}</div>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Quick replies"
          className="flex-none w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground/80 dark:hover:text-muted-foreground/40 hover:bg-muted/50 dark:hover:bg-muted rounded-lg transition-colors"
        >
          <Zap className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        collisionPadding={12}
        className="w-80 p-2 flex flex-col max-h-[min(24rem,var(--radix-popover-content-available-height))]"
      >
        <div className="text-xs font-semibold text-muted-foreground px-2 pb-2 shrink-0">Quick replies — click to insert, edit, then send</div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1" style={{ WebkitOverflowScrolling: "touch" }}>
          {all.length === 0 && (
            <div className="text-sm text-muted-foreground px-2 py-3">No templates yet. Admin can add them in Admin → Templates.</div>
          )}
          {forCategory.length > 0 && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-primary px-2 pt-1">For this topic</div>
              {forCategory.map(renderItem)}
            </>
          )}
          {general.length > 0 && (
            <>
              {forCategory.length > 0 && <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70 px-2 pt-2">General</div>}
              {general.map(renderItem)}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Transaction-based issue flows for Deposit / Withdrawal / Bet History:
// the customer picks one of THEIR OWN records (fetched from the domain API
// via the backend), then an issue note; the first chat message carries the
// full record details so staff have everything (DP id, mobile, txn id, etc.).
type CxRecord = Record<string, string | number | null>;

const CX_GAME_TYPES = ["Satta Matka", "Casino", "Exchange", "BetConstruct", "AN Exchange", "Sport Exchange", "AAA Excg"];

function fmtMoney(v: unknown) {
  return `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
}
function fmtDate(v: unknown) {
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v ?? "") : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function TxnIssueFlow({
  kind,
  cat,
  issueCategories,
  pending,
  lang,
  onSubmit,
}: {
  kind: "deposit" | "withdrawal" | "bets";
  cat: SupportCategory;
  issueCategories: SupportCategory[];
  pending: boolean;
  lang: string;
  onSubmit: (categoryId: number, text: string) => void;
}) {
  const [selected, setSelected] = useState<CxRecord | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gameType, setGameType] = useState("");
  const [betStatus, setBetStatus] = useState("");
  const [searched, setSearched] = useState(false);

  const url =
    kind === "deposit" ? "/api/cx/deposits"
    : kind === "withdrawal" ? "/api/cx/withdrawals"
    : `/api/cx/bets?${new URLSearchParams({ ...(from && { from }), ...(to && { to }), ...(gameType && { gameType }), ...(betStatus && { status: betStatus }) })}`;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cx-records", kind, url],
    queryFn: () => customFetch<{ data: CxRecord[] }>(url, { responseType: "json" }),
    enabled: kind !== "bets" || searched,
  });
  const records = data?.data ?? [];

  const issueOptions: { id: number; title: string }[] =
    issueCategories.length > 0
      ? [...issueCategories.map((c) => ({ id: c.id, title: c.title })), { id: cat.id, title: cxT(lang, "other") }]
      : ((CX_ISSUE_DEFAULTS_I18N[lang] ?? CX_ISSUE_DEFAULTS_I18N.en)[kind] ?? []).map((t) => ({ id: cat.id, title: t }));

  const detailsFor = (r: CxRecord): string => {
    if (kind === "bets") {
      return [
        `DP ID: ${r.dpId} | Name: ${r.name} | Mobile: ${r.mobileNo}`,
        `Transaction ID: ${r.transactionId} | Round ID: ${r.roundId} | Amount: ${fmtMoney(r.amount)} ${r.currency} | Status: ${r.status}`,
        `Game: ${r.gameName} | Category: ${r.category} | Provider: ${r.provider} | Source: ${r.gameSource} | App: ${r.appName}`,
        `Placed: ${fmtDate(r.placedAt)}`,
      ].join("\n");
    }
    const extra = kind === "withdrawal"
      ? `\nCheck: ${r.check} | Cross Check: ${r.crossCheck} | Lock Status: ${r.lockStatus}`
      : "";
    return [
      `DP ID: ${r.dpId} | Name: ${r.name} | Mobile: ${r.mobileNo}`,
      `Txn ID: ${r.txnId} | Amount: ${fmtMoney(r.amount)} | Status: ${r.status} | Date: ${fmtDate(r.createdAt)}`,
      `State: ${r.state} | City: ${r.city}${extra}`,
    ].join("\n");
  };

  const submitIssue = (issue: { id: number; title: string }) => {
    if (!selected) return;
    const heading = kind === "bets" ? "Bet History issue" : `${cat.title} issue: ${issue.title}`;
    onSubmit(issue.id, `${heading}\n${detailsFor(selected)}`);
  };

  const getStatusColor = (s: string) => {
    const status = s.toLowerCase();
    if (status.includes("success") || status.includes("completed")) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (status.includes("fail") || status.includes("reject") || status.includes("cancel")) return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  };

  const recordButton = (r: CxRecord, i: number) => {
    const status = String(r.status);
    return (
      <button
        key={i}
        type="button"
        onClick={() => setSelected(r)}
        className="w-full text-left p-4 rounded-xl border border-border bg-card/50 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm hover:shadow-md group relative overflow-hidden"
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-primary/0 group-hover:bg-primary/50 transition-colors" />
        {kind === "bets" ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <span className="font-bold text-base text-foreground truncate">{String(r.gameName)}</span>
              <span className="font-bold text-lg text-primary whitespace-nowrap">{fmtMoney(r.amount)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border", getStatusColor(status))}>
                {status}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{String(r.transactionId)}</span>
              <span className="text-xs text-muted-foreground">· {String(r.gameSource)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-2">{fmtDate(r.placedAt)}</div>
          </>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <span className="font-mono text-sm font-semibold text-foreground">{String(r.txnId)}</span>
              <span className="font-bold text-lg text-primary">{fmtMoney(r.amount)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border", getStatusColor(status))}>
                {status}
              </span>
              <span className="text-[11px] text-muted-foreground/70">{fmtDate(r.createdAt)}</span>
            </div>
          </>
        )}
      </button>
    );
  };

  if (selected && kind !== "bets") {
    const status = String(selected.status);
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CreditCard className="h-16 w-16" />
          </div>
          <div className="relative z-10">
            <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-1">{cxT(lang, "selectedTransaction")}</div>
            <div className="flex items-end justify-between gap-4 mb-3">
              <div className="font-mono text-sm font-bold text-foreground">{String(selected.txnId)}</div>
              <div className="font-bold text-xl text-primary">{fmtMoney(selected.amount)}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border", getStatusColor(status))}>
                {status}
              </span>
              <span className="text-xs text-muted-foreground">{fmtDate(selected.createdAt)}</span>
            </div>
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-bold text-foreground mb-3 px-1">{cxT(lang, "whatIssue")}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {issueOptions.map((o) => (
              <button
                key={o.title}
                type="button"
                disabled={pending}
                onClick={() => submitIssue(o)}
                className="w-full text-left p-3.5 rounded-xl border border-border bg-card/50 hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm hover:shadow-md font-medium text-sm text-foreground disabled:opacity-50 group flex items-center justify-between"
              >
                <span className="line-clamp-2">{o.title}</span>
                {pending ? <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0 ml-2" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <Button variant="outline" className="w-full h-11 gap-2 rounded-xl border-border bg-card/50 hover:bg-muted/50 text-muted-foreground shadow-sm" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-4 w-4" /> {cxT(lang, "chooseDifferentTxn")}
          </Button>
        </div>
      </div>
    );
  }

  if (selected && kind === "bets") {
    const status = String(selected.status);
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Gamepad2 className="h-16 w-16" />
          </div>
          <div className="relative z-10">
            <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-1">{cxT(lang, "selectedBet")}</div>
            <div className="flex items-end justify-between gap-4 mb-3">
              <div className="font-bold text-base text-foreground">{String(selected.gameName)}</div>
              <div className="font-bold text-xl text-primary">{fmtMoney(selected.amount)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border", getStatusColor(status))}>
                {status}
              </span>
              <span className="text-xs font-mono text-muted-foreground">{String(selected.transactionId)}</span>
              <span className="text-xs text-muted-foreground">· {String(selected.provider)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground/70">{fmtDate(selected.placedAt)}</div>
          </div>
        </div>
        
        <button
          type="button"
          disabled={pending}
          onClick={() => submitIssue({ id: cat.id, title: "Bet History" })}
          className="w-full h-12 rounded-xl gap-2 flex items-center justify-center bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {cxT(lang, "getHelpWithBet")}
        </button>

        <div className="pt-2">
          <Button variant="outline" className="w-full h-11 gap-2 rounded-xl border-border bg-card/50 hover:bg-muted/50 text-muted-foreground shadow-sm" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-4 w-4" /> {cxT(lang, "chooseDifferentBet")}
          </Button>
        </div>
      </div>
    );
  }

  if (kind === "bets" && !searched) {
    return (
      <form className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300" onSubmit={(e) => { e.preventDefault(); setSearched(true); }}>
        <h4 className="text-sm font-bold text-foreground px-1">{cxT(lang, "searchBetHistory")}</h4>
        <div className="p-4 rounded-xl border border-border bg-card/50 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cxT(lang, "startDate")}</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cxT(lang, "endDate")}</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg bg-background border-border" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cxT(lang, "gameType")}</label>
            <select value={gameType} onChange={(e) => setGameType(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary outline-none">
              <option value="">{cxT(lang, "allGameTypes")}</option>
              {CX_GAME_TYPES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cxT(lang, "status")}</label>
            <select value={betStatus} onChange={(e) => setBetStatus(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary outline-none">
              <option value="">{cxT(lang, "all")}</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>
        <button type="submit" className="w-full h-12 rounded-xl gap-2 flex items-center justify-center bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all">
          <Search className="h-5 w-5" /> {cxT(lang, "findBets")}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 mb-1">
        <h4 className="text-sm font-bold text-foreground">
          {kind === "deposit" ? cxT(lang, "selectDeposit")
            : kind === "withdrawal" ? cxT(lang, "selectWithdrawal")
            : cxT(lang, "selectBet")}
        </h4>
        {kind === "bets" && (
          <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg text-xs" onClick={() => setSearched(false)}>
            <Search className="h-3 w-3" /> {cxT(lang, "filters")}
          </Button>
        )}
      </div>
      
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-3 bg-card/30 rounded-xl border border-dashed border-border">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs font-medium text-muted-foreground">{cxT(lang, "loadingRecords")}</span>
        </div>
      ) : isError ? (
        <div className="text-sm text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full shrink-0">
            <X className="h-4 w-4" />
          </div>
          <div>
            <div className="font-bold">{cxT(lang, "errorLoading")}</div>
            <div className="text-xs opacity-80 mt-0.5">{cxT(lang, "checkConnection")}</div>
          </div>
        </div>
      ) : records.length === 0 ? (
        <div className="text-sm text-muted-foreground p-8 text-center bg-card/30 rounded-xl border border-dashed border-border flex flex-col items-center gap-2">
          <Info className="h-5 w-5 opacity-50" />
          <span>{cxT(lang, "noRecords")}</span>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-2 pb-4 smooth-scroll">
          {records.map(recordButton)}
        </div>
      )}
    </div>
  );
}

// AI-first support flow: shown to end users before the chat starts. Lets them
// pick a (possibly nested) support topic, or "Other" with a free-text issue.
function CategoryPicker({ convoId }: { convoId: number }) {
  // Language is chosen first — the whole picker UI (and every later message)
  // is rendered in this language. Category names are localized server-side.
  const [lang, setLang] = useState<string | null>(null);
  const { data: categories, isLoading } = useListSupportCategories(
    { lang: lang ?? "en" },
    { query: { queryKey: getListSupportCategoriesQueryKey({ lang: lang ?? "en" }) } },
  );
  const selectCategory = useSelectConversationCategory();
  const queryClient = useQueryClient();
  const [parentId, setParentId] = useState<number | null>(null);
  const [trail, setTrail] = useState<SupportCategory[]>([]);
  const [otherMode, setOtherMode] = useState(false);
  const [inputCat, setInputCat] = useState<SupportCategory | null>(null);
  const [customText, setCustomText] = useState("");
  // Transaction-based flows: Deposit / Withdrawal / Bet History top-level
  // picks show the customer's own records to select from instead of subtopics.
  const [txnFlow, setTxnFlow] = useState<{ kind: "deposit" | "withdrawal" | "bets"; cat: SupportCategory } | null>(null);

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const all = categories ?? [];
  const current = all.filter((c) => (c.parentId ?? null) === parentId);
  const childrenOf = (id: number) => all.some((c) => c.parentId === id);
  const currentParent = trail[trail.length - 1] ?? null;

  const submit = (categoryId?: number, text?: string) => {
    selectCategory.mutate(
      { id: convoId, data: { categoryId, customText: text?.trim() || undefined, language: lang ?? "en" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(convoId) });
        },
      },
    );
  };

  const TXN_FLOW_BY_TITLE: Record<string, "deposit" | "withdrawal" | "bets"> = {
    "Deposit": "deposit",
    "Withdrawal": "withdrawal",
    "Bet History": "bets",
  };

  const pick = (cat: SupportCategory) => {
    // Match on the English title — cat.title may be localized.
    const flowKind = trail.length === 0 ? TXN_FLOW_BY_TITLE[cat.titleEn ?? cat.title] : undefined;
    if (flowKind) {
      setTxnFlow({ kind: flowKind, cat });
      return;
    }
    if (childrenOf(cat.id)) {
      setParentId(cat.id);
      setTrail((t) => [...t, cat]);
    } else if (cat.requiresInput) {
      setCustomText("");
      setInputCat(cat);
    } else {
      submit(cat.id);
    }
  };

  const goBack = () => {
    if (txnFlow) { setTxnFlow(null); return; }
    if (inputCat) { setInputCat(null); return; }
    if (otherMode) { setOtherMode(false); return; }
    if (trail.length === 0) { setLang(null); return; }
    const t = [...trail];
    t.pop();
    setTrail(t);
    setParentId(t.length ? t[t.length - 1].id : null);
  };

  // Step 1: language selection.
  if (!lang) {
    return (
      <div className="h-full overflow-y-auto px-4">
        <div className="min-h-full flex flex-col items-center justify-center py-6">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h3 className="font-bold text-xl text-foreground">Choose your language</h3>
            <p className="text-sm text-muted-foreground">अपनी भाषा चुनें · Elige tu idioma · اختر لغتك</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className="text-center p-3.5 rounded-xl border border-border bg-white dark:bg-card hover:border-primary/40 hover:bg-primary/10 transition-colors shadow-sm"
              >
                <div className="font-semibold text-sm text-foreground">{l.native}</div>
                {l.native !== l.name && <div className="text-xs text-muted-foreground mt-0.5">{l.name}</div>}
              </button>
            ))}
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="min-h-full flex flex-col items-center justify-center py-6">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h3 className="font-bold text-xl text-foreground">{cxT(lang, "howCanWeHelp")}</h3>
          <p className="text-sm text-muted-foreground">
            {currentParent
              ? <>{cxT(lang, "selectOptionUnder")} <span className="font-semibold text-primary">{currentParent.title}</span></>
              : cxT(lang, "chooseTopic")}
          </p>
        </div>

        {(trail.length > 0 || otherMode || inputCat || lang || txnFlow) && (
          <Button variant="ghost" size="sm" className="gap-1 -mb-2 text-muted-foreground" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" /> {cxT(lang, "back")}
          </Button>
        )}

        {txnFlow ? (
          <TxnIssueFlow
            kind={txnFlow.kind}
            cat={txnFlow.cat}
            issueCategories={all.filter((c) => c.parentId === txnFlow.cat.id)}
            pending={selectCategory.isPending}
            lang={lang ?? "en"}
            onSubmit={(categoryId, text) => submit(categoryId, text)}
          />
        ) : inputCat ? (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (customText.trim()) submit(inputCat.id, `${inputCat.title}: ${customText}`); }}
          >
            <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5">
              <div className="font-semibold text-sm text-foreground">{inputCat.icon ? `${inputCat.icon} ` : ""}{inputCat.title}</div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground/70 mt-0.5">
                {inputCat.inputPrompt || cxT(lang, "shareDetails")}
              </div>
            </div>
            <Textarea
              autoFocus
              rows={3}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={cxT(lang, "typeDetailsPlaceholder")}
              className="rounded-xl bg-card border-border focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary resize-none"
            />
            <button type="submit" className="w-full h-11 rounded-xl gap-2 flex items-center justify-center bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:shadow-none" disabled={!customText.trim() || selectCategory.isPending}>
              {selectCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {cxT(lang, "submit")}
            </button>
          </form>
        ) : otherMode ? (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (customText.trim()) submit(currentParent?.id, customText); }}
          >
            <Input
              autoFocus
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={cxT(lang, "describeIssuePlaceholder")}
              className="h-12 rounded-xl bg-card border-border focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
            />
            <button type="submit" className="w-full h-11 rounded-xl gap-2 flex items-center justify-center bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:shadow-none" disabled={!customText.trim() || selectCategory.isPending}>
              {selectCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {cxT(lang, "startChat")}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {current.map((cat) => (
              <button
                key={cat.id}
                disabled={selectCategory.isPending}
                onClick={() => pick(cat)}
                className="text-left p-3.5 rounded-xl border border-border bg-white dark:bg-card hover:border-primary/40 hover:bg-primary/10 transition-colors shadow-sm disabled:opacity-60"
              >
                <div className="font-semibold text-sm flex items-center justify-between gap-2 text-foreground">
                  <span>{cat.icon ? `${cat.icon} ` : ""}{cat.title}</span>
                  {childrenOf(cat.id) && <ChevronRight className="h-4 w-4 text-muted-foreground/70 shrink-0" />}
                </div>
                {cat.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cat.description}</div>}
              </button>
            ))}
            <button
              disabled={selectCategory.isPending}
              onClick={() => setOtherMode(true)}
              className="text-left p-3.5 rounded-xl border border-dashed border-border dark:border-border bg-white/60 dark:bg-card/50 hover:border-primary/40 hover:bg-primary/10 transition-colors shadow-sm disabled:opacity-60"
            >
              <div className="font-semibold text-sm flex items-center gap-2 text-foreground">
                <PencilLine className="h-4 w-4 text-muted-foreground/70" /> {cxT(lang, "other")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{cxT(lang, "describeIssueOwnWords")}</div>
            </button>
          </div>
        )}

        {selectCategory.isPending && !otherMode && (
          <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        )}
      </div>
      </div>
    </div>
  );
}
