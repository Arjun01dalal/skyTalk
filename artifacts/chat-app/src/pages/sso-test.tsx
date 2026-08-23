import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Development-only launcher to test the SSO auto-login flow without the host app.
 * Builds the SSO URL and navigates to it. In development the backend uses a
 * synthetic user (with the empCode below) since the host getUser API blocks
 * this server's IP.
 */
export default function SsoTest() {
  const [userId, setUserId] = useState("67b8ed1d994442dca3e23244");
  const [empCode, setEmpCode] = useState("020");
  const [token, setToken] = useState("testtoken");

  const base = import.meta.env.BASE_URL; // e.g. /chat-app/
  const launch = () => {
    const params = new URLSearchParams({ userId, token });
    if (empCode.trim()) params.set("empCode", empCode.trim());
    window.location.href = `${base}?${params.toString()}`;
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-foreground">SSO Test Launcher</h1>
          <p className="text-sm text-muted-foreground">
            Development-only. Simulates your app launching the chat with a user.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID (host _id)</Label>
            <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="empCode">Employee Code (routes to matching agent)</Label>
            <Input id="empCode" value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="e.g. 020 or 001" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">Token</Label>
            <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Any value works in development. In production this must be your app's real token.
            </p>
          </div>
          <Button className="w-full" onClick={launch} disabled={!userId.trim()}>
            Launch Chat as this User
          </Button>
        </div>

        <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Available test agents:</p>
          <p>empCode <span className="font-mono">001</span> → Support Agent</p>
          <p>empCode <span className="font-mono">020</span> → Caller Agent 020</p>
        </div>
      </div>
    </div>
  );
}
