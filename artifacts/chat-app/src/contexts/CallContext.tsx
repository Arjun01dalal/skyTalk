import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { User, useListCalls, getListCallsQueryKey } from '@workspace/api-client-react';
import { useSocket } from './SocketContext';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface CallState {
  isIncoming: boolean;
  isRinging: boolean;
  isInCall: boolean;
  otherUser: User | null;
  callId: number | null;
  duration: number;
}

interface CallContextValue extends CallState {
  initiateCall: (user: User) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  remoteStream: MediaStream | null;
}

const CallContext = createContext<CallContextValue | null>(null);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [callState, setCallState] = useState<CallState>({
    isIncoming: false,
    isRinging: false,
    isInCall: false,
    otherUser: null,
    callId: null,
    duration: 0
  });

  const [isMuted, setIsMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  // Refs so async WebRTC callbacks always read the CURRENT call id / state
  // instead of a stale value captured in a closure.
  const callIdRef = useRef<number | null>(null);
  const hasRemoteDescRef = useRef(false);
  // ICE candidates gathered locally before the server has assigned a callId,
  // and remote candidates that arrive before the remote description is set.
  const outgoingIceQueueRef = useRef<RTCIceCandidate[]>([]);
  const pendingRemoteIceRef = useRef<RTCIceCandidateInit[]>([]);
  const recoveryTimerRef = useRef<number | null>(null);
  const qualityTimerRef = useRef<number | null>(null);
  const restartInFlightRef = useRef(false);
  const ownsIceRecoveryRef = useRef(false);
  const lastStatsRef = useRef<{ at: number; inboundBytes: number; outboundBytes: number } | null>(null);

  const flushOutgoingIce = useCallback(() => {
    if (!socket || callIdRef.current == null) return;
    for (const candidate of outgoingIceQueueRef.current) {
      socket.emit('call:ice', { callId: callIdRef.current, candidate });
    }
    outgoingIceQueueRef.current = [];
  }, [socket]);

  const flushRemoteIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const pending = pendingRemoteIceRef.current;
    pendingRemoteIceRef.current = [];
    // Do NOT touch restartInFlightRef or ownsIceRecoveryRef here.
    // This function only drains buffered candidates; ownership of ICE restarts
    // is set once at call initiation and cleared only in cleanupCall.
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('addIceCandidate (flush) failed', err);
      }
    }
  }, []);

  const cleanupCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (recoveryTimerRef.current) {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    if (qualityTimerRef.current) {
      window.clearInterval(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
    callIdRef.current = null;
    hasRemoteDescRef.current = false;
    restartInFlightRef.current = false;
    ownsIceRecoveryRef.current = false;
    lastStatsRef.current = null;
    outgoingIceQueueRef.current = [];
    pendingRemoteIceRef.current = [];
    setRemoteStream(null);
    setIsMuted(false);
    setCallState({
      isIncoming: false,
      isRinging: false,
      isInCall: false,
      otherUser: null,
      callId: null,
      duration: 0
    });
    queryClient.invalidateQueries({ queryKey: getListCallsQueryKey() });
  }, [queryClient]);

  const getIceServer = useCallback(() => new Promise<RTCIceServer>((resolve, reject) => {
    if (!socket) {
      reject(new Error('Call signaling is unavailable'));
      return;
    }
    const timeout = window.setTimeout(() => {
      reject(new Error('Voice relay credential request timed out'));
    }, 5000);
    socket.emit('call:ice-config', (response: {
      iceServer?: RTCIceServer;
      error?: string;
    }) => {
      window.clearTimeout(timeout);
      if (!response?.iceServer) {
        reject(new Error(response?.error ?? 'Voice relay is unavailable'));
        return;
      }
      resolve(response.iceServer);
    });
  }), [socket]);

  const reportQuality = useCallback(async (pc: RTCPeerConnection, recovery = false) => {
    if (!socket || callIdRef.current == null) return;
    const stats = await pc.getStats();
    let packetsLost = 0;
    let packetsReceived = 0;
    let jitterMs = 0;
    let roundTripTimeMs = 0;
    let inboundBytes = 0;
    let outboundBytes = 0;
    let candidateType: string | undefined;

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        packetsLost += Number(report.packetsLost ?? 0);
        packetsReceived += Number(report.packetsReceived ?? 0);
        jitterMs = Math.max(jitterMs, Number(report.jitter ?? 0) * 1000);
        inboundBytes += Number(report.bytesReceived ?? 0);
      }
      if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
        roundTripTimeMs = Math.max(roundTripTimeMs, Number(report.roundTripTime ?? 0) * 1000);
      }
      if (report.type === 'outbound-rtp' && report.kind === 'audio') {
        outboundBytes += Number(report.bytesSent ?? 0);
      }
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
        const local = stats.get(report.localCandidateId);
        candidateType = local?.candidateType;
      }
    });
    const now = performance.now();
    const previous = lastStatsRef.current;
    const elapsedSeconds = previous ? (now - previous.at) / 1000 : 0;
    const inboundBitrateKbps = previous && elapsedSeconds > 0
      ? Math.max(0, (inboundBytes - previous.inboundBytes) * 8 / 1000 / elapsedSeconds)
      : 0;
    const outboundBitrateKbps = previous && elapsedSeconds > 0
      ? Math.max(0, (outboundBytes - previous.outboundBytes) * 8 / 1000 / elapsedSeconds)
      : 0;
    lastStatsRef.current = { at: now, inboundBytes, outboundBytes };
    socket.emit('call:quality', {
      callId: callIdRef.current,
      report: {
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState,
        candidateType,
        packetsLost,
        packetsReceived,
        jitterMs: Math.round(jitterMs),
        roundTripTimeMs: Math.round(roundTripTimeMs),
        inboundBitrateKbps: Math.round(inboundBitrateKbps),
        outboundBitrateKbps: Math.round(outboundBitrateKbps),
        recovery,
      },
    });
  }, [socket]);

  const initPC = useCallback(async () => {
    const iceServer = await getIceServer();
    const pc = new RTCPeerConnection({
      iceServers: [iceServer],
    });

    pc.onicecandidate = (e) => {
      if (!e.candidate || !socket) return;
      // callId may not be assigned yet (caller side) — queue until it is.
      if (callIdRef.current == null) {
        outgoingIceQueueRef.current.push(e.candidate);
      } else {
        socket.emit('call:ice', { callId: callIdRef.current, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        restartInFlightRef.current = false;
        if (recoveryTimerRef.current) {
          window.clearTimeout(recoveryTimerRef.current);
          recoveryTimerRef.current = null;
        }
        void reportQuality(pc);
        return;
      }
      if (pc.iceConnectionState !== 'disconnected' && pc.iceConnectionState !== 'failed') return;
      void reportQuality(pc);
      // The caller owns ICE restarts. Both peers observe a broken candidate
      // pair, so using one deterministic offerer avoids renegotiation glare.
      if (!ownsIceRecoveryRef.current) return;
      const restart = async () => {
        if (restartInFlightRef.current || !socket || callIdRef.current == null || pc.signalingState === 'closed') return;
        restartInFlightRef.current = true;
        try {
          // Candidates for a restarted ICE generation must wait for the
          // matching answer; applying them to the previous description fails.
          hasRemoteDescRef.current = false;
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          socket.emit('call:renegotiate', { callId: callIdRef.current, offer });
          void reportQuality(pc, true);
        } catch (error) {
          console.error('ICE restart failed', error);
          hasRemoteDescRef.current = true;
          restartInFlightRef.current = false;
        }
      };
      if (pc.iceConnectionState === 'failed') {
        void restart();
      } else {
        recoveryTimerRef.current = window.setTimeout(() => void restart(), 2000);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [getIceServer, reportQuality, socket]);

  useEffect(() => {
    if (!socket) return;

    const onIncoming = async ({ callId, from, offer }: { callId: number, from: User, offer: RTCSessionDescriptionInit }) => {
      if (callState.isInCall || callState.isIncoming || callState.isRinging) {
        socket.emit('call:reject', { callId });
        return;
      }
      callIdRef.current = callId;
      ownsIceRecoveryRef.current = false;
      let pc: RTCPeerConnection;
      try {
        pc = await initPC();
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        hasRemoteDescRef.current = true;
        await flushRemoteIce();
      } catch (err) {
        console.error('setRemoteDescription (offer) failed', err);
        socket.emit('call:reject', { callId });
        cleanupCall();
        return;
      }
      setCallState({
        isIncoming: true,
        isRinging: false,
        isInCall: false,
        otherUser: from,
        callId,
        duration: 0
      });
    };

    const onAccepted = async ({ callId, answer }: { callId: number, answer: RTCSessionDescriptionInit }) => {
      if (callIdRef.current !== callId || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        hasRemoteDescRef.current = true;
        await flushRemoteIce();
        setCallState(s => ({ ...s, isRinging: false, isInCall: true }));
        durationTimerRef.current = window.setInterval(() => {
          setCallState(s => ({ ...s, duration: s.duration + 1 }));
        }, 1000);
      } catch (err) {
        console.error('setRemoteDescription (answer) failed', err);
      }
    };

    const onRejected = ({ callId }: { callId: number }) => {
      if (callIdRef.current !== callId) return;
      if (callState.isRinging) {
        toast({
          title: 'Support team member is busy',
          description: 'Please leave a message in the chat — we will call you back.',
        });
      }
      cleanupCall();
    };

    const onEnded = ({ callId }: { callId: number }) => {
      if (callIdRef.current !== callId) return;
      // If it was still ringing on our side, we missed it — tell the user.
      if (callState.isIncoming && callState.otherUser) {
        toast({
          title: 'Missed call',
          description: `${callState.otherUser.name} tried to call you`,
          variant: 'destructive',
        });
      } else if (callState.isRinging) {
        // Our outgoing call rang out with no answer.
        toast({
          title: 'Support team member is busy',
          description: 'Please leave a message in the chat — we will call you back.',
        });
      }
      cleanupCall();
    };

    const onIce = async ({ callId, candidate }: { callId: number, candidate: RTCIceCandidateInit }) => {
      if (callIdRef.current !== callId) return;
      // Credential retrieval can still be in progress when the first remote
      // candidate arrives, so buffer until both the peer connection and its
      // remote description are ready.
      if (!pcRef.current || !hasRemoteDescRef.current) {
        pendingRemoteIceRef.current.push(candidate);
        return;
      }
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('addIceCandidate failed', err);
      }
    };

    const onRenegotiate = async ({ callId, offer }: { callId: number, offer: RTCSessionDescriptionInit }) => {
      if (callIdRef.current !== callId || !pcRef.current) return;
      try {
        hasRemoteDescRef.current = false;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        hasRemoteDescRef.current = true;
        await flushRemoteIce();
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit('call:renegotiated', { callId, answer });
        void reportQuality(pcRef.current, true);
      } catch (err) {
        console.error('ICE restart answer failed', err);
      }
    };

    const onRenegotiated = async ({ callId, answer }: { callId: number, answer: RTCSessionDescriptionInit }) => {
      if (callIdRef.current !== callId || !pcRef.current) return;
      try {
        hasRemoteDescRef.current = false;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        hasRemoteDescRef.current = true;
        await flushRemoteIce();
        restartInFlightRef.current = false;
        void reportQuality(pcRef.current, true);
      } catch (err) {
        console.error('ICE restart completion failed', err);
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('call:ice', onIce);
    socket.on('call:renegotiate', onRenegotiate);
    socket.on('call:renegotiated', onRenegotiated);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('call:ice', onIce);
      socket.off('call:renegotiate', onRenegotiate);
      socket.off('call:renegotiated', onRenegotiated);
    };
  }, [socket, callState, initPC, cleanupCall, flushRemoteIce, reportQuality]);

  const initiateCall = async (user: User) => {
    if (!socket || callState.isInCall) return;
    try {
      ownsIceRecoveryRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = await initPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setCallState({
        isIncoming: false,
        isRinging: true,
        isInCall: false,
        otherUser: user,
        callId: null, // Will be set by ack
        duration: 0
      });

      socket.emit('call:initiate', { toUserId: user.id, offer }, (resp: { callId?: number; error?: string }) => {
        if (!resp?.callId) {
          toast({
            title: 'Support team member is busy',
            description: 'Please leave a message in the chat — we will call you back.',
          });
          cleanupCall();
          return;
        }
        callIdRef.current = resp.callId;
        setCallState(s => ({ ...s, callId: resp.callId! }));
        // Send any ICE candidates gathered before the id was known.
        flushOutgoingIce();
        qualityTimerRef.current = window.setInterval(() => {
          if (pcRef.current) void reportQuality(pcRef.current);
        }, 10_000);
      });
    } catch (err) {
      console.error('Failed to initiate call:', err);
      toast({ title: 'Voice relay unavailable', description: 'Please leave a message and try calling again later.', variant: 'destructive' });
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!socket || !callState.callId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = pcRef.current;
      if (!pc) return;
      
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      setCallState(s => ({ ...s, isIncoming: false, isInCall: true }));
      durationTimerRef.current = window.setInterval(() => {
        setCallState(s => ({ ...s, duration: s.duration + 1 }));
      }, 1000);
      qualityTimerRef.current = window.setInterval(() => {
        if (pcRef.current) void reportQuality(pcRef.current);
      }, 10_000);

      socket.emit('call:accept', { callId: callState.callId, answer });
    } catch (err) {
      console.error('Failed to accept call:', err);
      toast({ title: 'Could not connect call audio', description: 'Please leave a message and try again later.', variant: 'destructive' });
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (socket && callState.callId) {
      socket.emit('call:reject', { callId: callState.callId });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (socket && callState.callId) {
      socket.emit('call:end', { callId: callState.callId });
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  return (
    <CallContext.Provider value={{
      ...callState,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      isMuted,
      remoteStream
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within a CallProvider');
  return ctx;
};
