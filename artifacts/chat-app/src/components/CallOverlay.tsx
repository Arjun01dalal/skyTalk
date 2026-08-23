import React from 'react';
import { Phone, Mic, MicOff, PhoneOff, X } from 'lucide-react';
import { useCall } from '../contexts/CallContext';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { cn } from '../lib/utils';

export function CallOverlay() {
  const call = useCall();
  const audioRef = React.useRef<HTMLAudioElement>(null);

  React.useEffect(() => {
    if (audioRef.current && call.remoteStream) {
      audioRef.current.srcObject = call.remoteStream;
    }
  }, [call.remoteStream]);

  if (!call.isIncoming && !call.isRinging && !call.isInCall) return null;

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <audio ref={audioRef} autoPlay />
      
      <div className="bg-card w-[320px] rounded-2xl shadow-2xl p-6 flex flex-col items-center border border-border">
        <div className="relative mb-6">
          <div className={cn(
            "absolute inset-0 rounded-full bg-primary/20",
            (call.isIncoming || call.isRinging) && "animate-ping"
          )} />
          <Avatar className="h-24 w-24 border-4 border-background relative z-10">
            <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
              {call.otherUser?.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        <h3 className="text-xl font-bold text-foreground text-center mb-1">
          {call.otherUser?.name}
        </h3>
        
        <p className="text-sm font-mono text-muted-foreground mb-8 text-center h-5">
          {call.isIncoming && "Incoming call..."}
          {call.isRinging && "Ringing..."}
          {call.isInCall && formatDuration(call.duration)}
        </p>

        <div className="flex gap-6 w-full justify-center">
          {call.isIncoming && (
            <>
              <Button 
                size="icon" 
                variant="outline"
                className="h-14 w-14 rounded-full bg-destructive/10 text-destructive border-transparent hover:bg-destructive hover:text-white"
                onClick={call.rejectCall}
              >
                <X className="h-6 w-6" />
              </Button>
              <Button 
                size="icon" 
                className="h-14 w-14 rounded-full bg-green-500 text-white hover:bg-green-600"
                onClick={call.acceptCall}
              >
                <Phone className="h-6 w-6 fill-current" />
              </Button>
            </>
          )}

          {(call.isRinging || call.isInCall) && (
            <>
              <Button 
                size="icon" 
                variant="outline"
                className={cn(
                  "h-14 w-14 rounded-full border-transparent",
                  call.isMuted 
                    ? "bg-muted text-foreground" 
                    : "bg-secondary text-secondary-foreground"
                )}
                onClick={call.toggleMute}
                disabled={!call.isInCall}
              >
                {call.isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>
              <Button 
                size="icon" 
                className="h-14 w-14 rounded-full bg-destructive text-white hover:bg-destructive/90 shadow-lg shadow-destructive/20"
                onClick={call.endCall}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
