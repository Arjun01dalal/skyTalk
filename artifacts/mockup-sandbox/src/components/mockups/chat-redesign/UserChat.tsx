import React from "react";
import { Phone, Paperclip, Send, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function UserChat() {
  // Hardcoded sample messages
  const messages = [
    {
      id: 1,
      type: "bot",
      content: "Hi there! 👋 I'm Support, your AI assistant. How can I help you today?",
      timestamp: "2:34 PM",
    },
    {
      id: 2,
      type: "user",
      content: "I'm having trouble accessing my team's workspace. It keeps saying my account is locked.",
      timestamp: "2:35 PM",
    },
    {
      id: 3,
      type: "bot",
      content: "I understand you're having trouble accessing your workspace. Let me check your account status for you. Can you confirm your workspace name?",
      timestamp: "2:35 PM",
    },
    {
      id: 4,
      type: "user",
      content: "It's acme-design-team",
      timestamp: "2:36 PM",
    },
    {
      id: 5,
      type: "bot",
      content: "Thanks! I see your account is active, but there was a billing issue that temporarily restricted access. This requires our billing team to review. Let me connect you with a human agent who can help resolve this right away.",
      timestamp: "2:37 PM",
    },
    {
      id: 6,
      type: "system",
      content: "Transferred to Support Team",
      timestamp: "2:37 PM",
    },
    {
      id: 7,
      type: "agent",
      content: "Hi! I'm Sarah from the billing team. I've reviewed your account and I can see the issue. Your payment method expired last week. I'm unlocking your workspace right now.",
      timestamp: "2:38 PM",
      agentName: "Sarah Chen",
      agentAvatar: null,
    },
    {
      id: 8,
      type: "user",
      content: "Oh! I didn't realize it expired. Thank you so much!",
      timestamp: "2:39 PM",
    },
    {
      id: 9,
      type: "agent",
      content: "No problem at all! Your workspace is now unlocked. I've sent you an email with a link to update your payment details. Is there anything else I can help with?",
      timestamp: "2:40 PM",
      agentName: "Sarah Chen",
      agentAvatar: null,
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/40">
      {/* Header */}
      <div className="flex-none border-b border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-10 w-10 border-2 border-violet-100">
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white font-semibold">
                  SC
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">Sarah Chen</span>
                <span className="text-xs text-emerald-600 font-medium">Online</span>
              </div>
              <span className="text-sm text-slate-500">Billing Team</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">
              Talk to a human
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              <Phone className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* AI Banner */}
      <div className="flex-none px-6 py-3 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-blue-500/10 border-b border-violet-200/50">
        <p className="text-sm text-slate-700 text-center">
          You're chatting with <span className="font-semibold text-violet-700">Support</span> — ask
          for a human any time.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message) => {
            if (message.type === "system") {
              return (
                <div key={message.id} className="flex items-center gap-4 my-8">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                      {message.content}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                </div>
              );
            }

            if (message.type === "user") {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-lg">
                    <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg shadow-blue-600/20">
                      <p className="text-[15px] leading-relaxed">{message.content}</p>
                    </div>
                    <div className="mt-1.5 text-xs text-slate-500 text-right px-1">
                      {message.timestamp}
                    </div>
                  </div>
                </div>
              );
            }

            if (message.type === "bot") {
              return (
                <div key={message.id} className="flex justify-start">
                  <div className="max-w-lg">
                    <div className="flex items-start gap-2.5">
                      <div className="flex-none w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/30">
                        <div className="w-3 h-3 rounded-sm bg-white/90" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-gradient-to-br from-violet-50 to-purple-50/80 border border-violet-200/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-semibold text-violet-700">Support</span>
                            <div className="w-1 h-1 rounded-full bg-violet-400" />
                            <span className="text-xs text-violet-600/80">AI Assistant</span>
                          </div>
                          <p className="text-[15px] leading-relaxed text-slate-700">
                            {message.content}
                          </p>
                        </div>
                        <div className="mt-1.5 text-xs text-slate-500 px-1">{message.timestamp}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            if (message.type === "agent") {
              return (
                <div key={message.id} className="flex justify-start">
                  <div className="max-w-lg">
                    <div className="flex items-start gap-2.5">
                      <Avatar className="flex-none h-8 w-8 border-2 border-white shadow-md">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-semibold">
                          SC
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-semibold text-slate-900">
                              {message.agentName}
                            </span>
                            <div className="w-1 h-1 rounded-full bg-slate-300" />
                            <span className="text-xs text-slate-500">Support Team</span>
                          </div>
                          <p className="text-[15px] leading-relaxed text-slate-700">
                            {message.content}
                          </p>
                        </div>
                        <div className="mt-1.5 text-xs text-slate-500 px-1">{message.timestamp}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Typing Indicator */}
          <div className="flex justify-start">
            <div className="flex items-start gap-2.5">
              <Avatar className="flex-none h-8 w-8 border-2 border-white shadow-md">
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-semibold">
                  SC
                </AvatarFallback>
              </Avatar>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-3.5 shadow-sm">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="flex-none border-t border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-2xl">
        <div className="px-6 py-5">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3">
              <button className="flex-none w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <Paperclip className="h-5 w-5" />
              </button>

              <div className="flex-1 relative">
                <textarea
                  placeholder="Type your message..."
                  rows={1}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none transition-all"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                />
              </div>

              <button className="flex-none w-10 h-10 flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/30 transition-all hover:shadow-xl hover:shadow-blue-600/40">
                <Send className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
              <span>Powered by ChatSpace</span>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <button className="hover:text-slate-700 transition-colors">Privacy</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
