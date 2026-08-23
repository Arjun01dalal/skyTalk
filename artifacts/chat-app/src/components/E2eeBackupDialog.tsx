// "Chat History Backup" dialog — lets a staff user carry encrypted-chat
// history to a new browser. Export encrypts the local decrypted-message
// cache with a passphrase (client-side); import decrypts a backup file and
// merges it into this browser's cache. The server never sees any of it.
import { useRef, useState } from "react";
import { KeyRound, Download, Upload, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { createHistoryBackup, restoreHistoryBackup } from "../lib/e2ee/backup";

export function E2eeBackupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Chat History Backup
          </DialogTitle>
          <DialogDescription>
            Encrypted messages can normally only be read on the device where
            they were first received. Export a passphrase-protected backup
            here, then import it on your new browser to keep your history
            readable. The backup is encrypted on your device — the server
            never sees it.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="export">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
          <TabsContent value="export">
            <ExportPanel />
          </TabsContent>
          <TabsContent value="import">
            <ImportPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ExportPanel() {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doExport = async () => {
    setMsg(null);
    if (pass.length < 8) {
      setMsg({ ok: false, text: "Use a passphrase of at least 8 characters." });
      return;
    }
    if (pass !== confirm) {
      setMsg({ ok: false, text: "Passphrases don't match." });
      return;
    }
    setBusy(true);
    try {
      const { blob, count, filename } = await createHistoryBackup(pass);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({
        ok: true,
        text: `Backup downloaded (${count} message${count === 1 ? "" : "s"}). Keep the file and passphrase safe — anyone with both can read your history.`,
      });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Export failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="bk-pass">Passphrase</Label>
        <Input
          id="bk-pass"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bk-pass2">Confirm passphrase</Label>
        <Input
          id="bk-pass2"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {msg && (
        <p className={`text-xs ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {msg.ok && <ShieldCheck className="inline h-3.5 w-3.5 mr-1 align-[-2px]" />}
          {msg.text}
        </p>
      )}
      <Button onClick={doExport} disabled={busy || !pass || !confirm} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download encrypted backup
      </Button>
    </div>
  );
}

function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doImport = async () => {
    setMsg(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ ok: false, text: "Choose a backup file first." });
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const { imported, total } = await restoreHistoryBackup(text, pass);
      setMsg({
        ok: true,
        text: `Restored ${imported} of ${total} messages. Reloading to show your history…`,
      });
      // Cached "unavailable" decrypt states are held in mounted components;
      // a reload is the simplest way to re-render everything from the cache.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Import failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="bk-file">Backup file</Label>
        <Input
          id="bk-file"
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        {fileName && <p className="text-xs text-muted-foreground truncate">{fileName}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bk-import-pass">Passphrase</Label>
        <Input
          id="bk-import-pass"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="off"
        />
      </div>
      {msg && (
        <p className={`text-xs ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {msg.ok && <ShieldCheck className="inline h-3.5 w-3.5 mr-1 align-[-2px]" />}
          {msg.text}
        </p>
      )}
      <Button onClick={doImport} disabled={busy || !pass} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Restore history on this device
      </Button>
    </div>
  );
}
