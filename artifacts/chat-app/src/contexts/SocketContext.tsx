import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Message, 
  User, 
  getListMessagesQueryKey, 
  getListTicketsQueryKey,
  getListConversationsQueryKey,
  getListUsersQueryKey,
  getGetStatsSummaryQueryKey,
  getAdminListConversationsQueryKey,
  getAdminListCallsQueryKey,
  getAdminListMessagesQueryKey,
  useMarkConversationRead
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { e2ee } from '@/lib/e2ee';

interface SocketContextValue {
  socket: Socket | null;
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
  typingUsers: Record<number, Set<number>>; // conversationId -> Set of typing userIds
  emitTyping: (conversationId: number, isTyping: boolean) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const accessToken = useAuthStore((state: any) => state.accessToken);
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<number, Set<number>>>({});
  
  const markRead = useMarkConversationRead();
  const { toast } = useToast();

  useEffect(() => {
    if (!accessToken) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const newSocket = io({
      path: import.meta.env.BASE_URL.replace(/\/$/, '') + '/api/socket.io',
      auth: { token: accessToken }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [accessToken]);

  useEffect(() => {
    if (!socket) return;

    socket.on('message:new', (message: Message) => {
      // Encrypted direct/group messages: decrypt eagerly (even for inactive
      // conversations) so the Signal ratchet advances in arrival order and
      // the plaintext lands in the local cache before the UI needs it.
      const enc = message as Message & { encrypted?: boolean; envelope?: { type: number; body: string } | null };
      if (enc.encrypted && enc.envelope && enc.senderId != null && e2ee.isReady()) {
        void e2ee.decryptEnvelope(enc.id, enc.senderId, enc.envelope).catch(() => {});
      }
      // Add message to thread
      const msgQueryKey = getListMessagesQueryKey(message.conversationId);
      queryClient.setQueryData<Message[]>(msgQueryKey, (old) => {
        if (!old) return [message];
        // avoid duplicates
        if (old.find(m => m.id === message.id)) return old;
        // drop any optimistic placeholder (negative id) this real message replaces
        return [...old.filter(m => !(m.id < 0 && m.senderId === message.senderId && m.conversationId === message.conversationId)), message];
      });

      // Update conversations list
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });

      // Mark as read if it's the active conversation and window is focused
      if (activeConversationId === message.conversationId && document.hasFocus()) {
        markRead.mutate({ id: message.conversationId });
      }
    });

    socket.on('message:status', ({ conversationId, messageIds, status }) => {
      const msgQueryKey = getListMessagesQueryKey(conversationId);
      queryClient.setQueryData<Message[]>(msgQueryKey, (old) => {
        if (!old) return old;
        return old.map(m => messageIds.includes(m.id) ? { ...m, status } : m);
      });
    });

    socket.on('typing', ({ conversationId, userId, isTyping }) => {
      setTypingUsers(prev => {
        const next = { ...prev };
        const set = next[conversationId] ? new Set(next[conversationId]) : new Set<number>();
        if (isTyping) set.add(userId);
        else set.delete(userId);
        next[conversationId] = set;
        return next;
      });
    });

    socket.on('conversation:updated', ({ conversationId }: { conversationId: number }) => {
      // Chat ended/archived or flow reset — refresh the list AND the thread
      // so archived messages disappear immediately on both sides.
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
      }
      queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
    });

    socket.on('conversation:escalated', () => {
      // Conversation switched from AI to human mode — refresh so the UI
      // (composer state, badges) reflects it immediately. The internal
      // escalation reason (e.g. "Low AI confidence") is not shown to users.
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      toast({
        title: 'Transferred to support team',
        description: 'A human agent will continue this conversation.',
      });
    });

    socket.on('users:changed', () => {
      // A user was created/updated/removed (including SSO auto-provision) —
      // refresh the admin directory, stats, and conversation list live.
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
    });

    // Admin-only system-wide monitoring feed (message + call activity).
    socket.on('monitor:activity', (evt: any) => {
      queryClient.invalidateQueries({ queryKey: getAdminListConversationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getAdminListCallsQueryKey() });
      if (evt?.kind === 'call') {
        toast({
          title: 'New call',
          description: `${evt?.from?.name ?? 'Someone'} → ${evt?.to?.name ?? 'someone'}`,
        });
      } else if (evt?.kind === 'message') {
        if (evt?.conversationId) {
          // Keep an open admin transcript live too.
          queryClient.invalidateQueries({ queryKey: getAdminListMessagesQueryKey(evt.conversationId) });
        }
        // Admin-only feed: prefer the English rendition for staff.
        const text = evt?.message?.contentEn ?? evt?.message?.content;
        const preview = text ? String(text).slice(0, 60) : 'Sent an attachment';
        toast({ title: 'New message', description: preview });
      }
    });

    socket.on('presence', ({ userId, isOnline, lastSeenAt }) => {
      queryClient.setQueryData<User[]>(getListUsersQueryKey(), (old) => {
        if (!old) return old;
        return old.map(u => u.id === userId ? { ...u, isOnline, lastSeenAt } : u);
      });
      // also update in conversations list
      queryClient.setQueryData<any[]>(getListConversationsQueryKey(), (old) => {
        if (!old) return old;
        return old.map(c => c.otherUser?.id === userId ? { ...c, otherUser: { ...c.otherUser, isOnline, lastSeenAt } } : c);
      });
    });

    return () => {
      socket.off('message:new');
      socket.off('message:status');
      socket.off('typing');
      socket.off('presence');
      socket.off('users:changed');
      socket.off('conversation:escalated');
      socket.off('monitor:activity');
    };
  }, [socket, queryClient, activeConversationId, markRead]);

  // Window focus listener for active conversation
  useEffect(() => {
    const handleFocus = () => {
      if (activeConversationId) {
        markRead.mutate({ id: activeConversationId });
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activeConversationId, markRead]);

  const emitTyping = (conversationId: number, isTyping: boolean) => {
    if (socket) {
      socket.emit('typing', { conversationId, isTyping });
    }
  };

  return (
    <SocketContext.Provider value={{ socket, activeConversationId, setActiveConversationId, typingUsers, emitTyping }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
};
