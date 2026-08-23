import { Search, Phone, MoreVertical, Paperclip, Send, Clock, CheckCheck, Bot, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AgentWorkspace() {
  const conversations = [
    {
      id: 1,
      customer: "Sarah Chen",
      initials: "SC",
      lastMessage: "Thanks! That fixed the issue with my billing.",
      timestamp: "2m ago",
      unread: 0,
      status: "ai-handling",
      online: true,
    },
    {
      id: 2,
      customer: "Marcus Rodriguez",
      initials: "MR",
      lastMessage: "I still can't access the enterprise dashboard...",
      timestamp: "5m ago",
      unread: 2,
      status: "escalated",
      online: true,
    },
    {
      id: 3,
      customer: "Emma Watson",
      initials: "EW",
      lastMessage: "Perfect, you've been really helpful!",
      timestamp: "12m ago",
      unread: 0,
      status: null,
      online: false,
    },
    {
      id: 4,
      customer: "James Kim",
      initials: "JK",
      lastMessage: "Can you help me upgrade my plan?",
      timestamp: "18m ago",
      unread: 1,
      status: "ai-handling",
      online: true,
    },
    {
      id: 5,
      customer: "Olivia Martinez",
      initials: "OM",
      lastMessage: "The integration stopped working this morning",
      timestamp: "24m ago",
      unread: 3,
      status: "escalated",
      online: false,
    },
    {
      id: 6,
      customer: "Liam Foster",
      initials: "LF",
      lastMessage: "Got it, thanks for clarifying!",
      timestamp: "1h ago",
      unread: 0,
      status: null,
      online: false,
    },
  ];

  const messages = [
    {
      id: 1,
      sender: "Marcus Rodriguez",
      role: "customer",
      content: "Hi, I'm trying to access the enterprise dashboard but I keep getting a 403 error.",
      timestamp: "2:34 PM",
      status: "read",
    },
    {
      id: 2,
      sender: "Support AI",
      role: "ai",
      content: "I understand you're experiencing a 403 error. This usually indicates a permissions issue. Let me check your account access level.",
      timestamp: "2:35 PM",
      status: "read",
    },
    {
      id: 3,
      sender: "Support AI",
      role: "ai",
      content: "I can see your account is on the Business plan. Enterprise dashboard access requires an Enterprise subscription. Would you like information about upgrading?",
      timestamp: "2:35 PM",
      status: "read",
    },
    {
      id: 4,
      sender: "Marcus Rodriguez",
      role: "customer",
      content: "No, we purchased Enterprise last week. The billing went through on Friday.",
      timestamp: "2:37 PM",
      status: "read",
    },
    {
      id: 5,
      sender: "Support AI",
      role: "ai",
      content: "I've escalated this to our support team since this involves account provisioning. An agent will assist you shortly.",
      timestamp: "2:38 PM",
      status: "read",
    },
    {
      id: 6,
      sender: "Marcus Rodriguez",
      role: "customer",
      content: "I still can't access the enterprise dashboard...",
      timestamp: "2:42 PM",
      status: "delivered",
    },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/40">
      {/* Sidebar - Conversation List */}
      <div className="w-80 border-r border-slate-200/80 bg-white/70 backdrop-blur-xl flex flex-col shadow-sm">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200/60 bg-gradient-to-b from-white to-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 tracking-tight">Conversations</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search conversations..."
              className="pl-9 h-9 bg-white border-slate-200/80 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {conversations.map((conv, idx) => (
              <button
                key={conv.id}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-all hover:bg-slate-100/80 group ${
                  idx === 1
                    ? "bg-gradient-to-r from-blue-50 via-blue-50/50 to-transparent border border-blue-200/50 shadow-sm"
                    : "hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                      <AvatarFallback className={`text-sm font-medium ${
                        idx === 1 ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-700"
                      }`}>
                        {conv.initials}
                      </AvatarFallback>
                    </Avatar>
                    {conv.online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium text-sm ${
                        idx === 1 ? "text-slate-900" : conv.unread > 0 ? "text-slate-900" : "text-slate-700"
                      }`}>
                        {conv.customer}
                      </span>
                      <span className="text-xs text-slate-500">{conv.timestamp}</span>
                    </div>

                    <p className={`text-xs mb-2 truncate ${
                      conv.unread > 0 ? "text-slate-700 font-medium" : "text-slate-500"
                    }`}>
                      {conv.lastMessage}
                    </p>

                    <div className="flex items-center gap-1.5">
                      {conv.status === "ai-handling" && (
                        <Badge className="text-xs px-2 py-0 h-5 bg-violet-100 text-violet-700 border-violet-200/50 hover:bg-violet-100">
                          <Bot className="w-3 h-3 mr-1" />
                          AI handling
                        </Badge>
                      )}
                      {conv.status === "escalated" && (
                        <Badge className="text-xs px-2 py-0 h-5 bg-amber-100 text-amber-700 border-amber-200/50 hover:bg-amber-100">
                          <ArrowUpRight className="w-3 h-3 mr-1" />
                          Escalated
                        </Badge>
                      )}
                      {conv.unread > 0 && (
                        <Badge className="text-xs px-1.5 py-0 h-5 bg-blue-600 text-white border-0 hover:bg-blue-600 ml-auto">
                          {conv.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white/50">
        {/* Chat Header */}
        <div className="h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl px-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                <AvatarFallback className="bg-blue-500 text-white font-medium">MR</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Marcus Rodriguez</h3>
              <p className="text-xs text-slate-500">Enterprise · marcus@techcorp.io</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200/50 hover:bg-amber-100">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              Escalated from AI
            </Badge>
            <Button size="sm" variant="outline" className="h-9 border-slate-200 hover:bg-slate-50 shadow-sm">
              <Phone className="w-4 h-4 mr-2" />
              Call
            </Button>
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "customer" ? "justify-end" : ""}`}>
                {msg.role !== "customer" && (
                  <Avatar className="w-8 h-8 flex-shrink-0 border border-slate-200 shadow-sm">
                    <AvatarFallback className={`text-xs font-medium ${
                      msg.role === "ai" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"
                    }`}>
                      {msg.role === "ai" ? <Bot className="w-4 h-4" /> : "CS"}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className={`flex flex-col ${msg.role === "customer" ? "items-end" : ""} max-w-xl`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    {msg.role !== "customer" && (
                      <span className={`text-xs font-medium ${
                        msg.role === "ai" ? "text-violet-700" : "text-slate-700"
                      }`}>
                        {msg.sender}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{msg.timestamp}</span>
                  </div>

                  <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                    msg.role === "customer"
                      ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white"
                      : msg.role === "ai"
                      ? "bg-gradient-to-br from-violet-50 to-violet-100/50 text-violet-900 border border-violet-200/50"
                      : "bg-white border border-slate-200 text-slate-900"
                  }`}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>

                  {msg.role === "customer" && (
                    <div className="flex items-center gap-1 mt-1">
                      {msg.status === "read" ? (
                        <CheckCheck className="w-3 h-3 text-blue-600" />
                      ) : (
                        <Clock className="w-3 h-3 text-slate-400" />
                      )}
                      <span className="text-xs text-slate-400 capitalize">{msg.status}</span>
                    </div>
                  )}
                </div>

                {msg.role === "customer" && (
                  <Avatar className="w-8 h-8 flex-shrink-0 border-2 border-white shadow-sm">
                    <AvatarFallback className="bg-blue-500 text-white text-xs font-medium">MR</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Composer */}
        <div className="border-t border-slate-200/80 bg-white/90 backdrop-blur-xl p-4 shadow-lg">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3">
              <Button size="sm" variant="ghost" className="h-10 w-10 p-0 flex-shrink-0">
                <Paperclip className="w-5 h-5 text-slate-500" />
              </Button>

              <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition-all">
                <textarea
                  placeholder="Type your message..."
                  className="w-full px-4 py-3 bg-transparent border-0 focus:outline-none resize-none text-sm text-slate-900 placeholder:text-slate-400"
                  rows={1}
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                />
              </div>

              <Button size="sm" className="h-10 w-10 p-0 flex-shrink-0 bg-gradient-to-br from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-md hover:shadow-lg transition-all">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
