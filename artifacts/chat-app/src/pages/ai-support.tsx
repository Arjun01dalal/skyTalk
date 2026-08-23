import { useEffect, useState } from "react";
import { Bot, ChevronDown, Copy, FolderTree, Loader2, Pencil, PencilLine, Plus, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAdminListSupportCategories,
  useCreateSupportCategory,
  useUpdateSupportCategory,
  useDeleteSupportCategory,
  useGetAiSettings,
  useUpdateAiSettings,
  SupportCategory,
  getAdminListSupportCategoriesQueryKey,
  getGetAiSettingsQueryKey,
  getListSupportCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function AiSupportPage() {
  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-20 border-b border-border bg-card/50 backdrop-blur-xl flex items-center px-6 md:px-8 shrink-0 sticky top-0 z-10 justify-between">
        <h1 className="font-bold text-xl flex items-center gap-2">
          <Bot className="text-primary" /> AI Support
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <AiSettingsCard />
          <CategoriesCard />
        </div>
      </div>
    </div>
  );
}

function AiSettingsCard() {
  const { data: settings, isLoading } = useGetAiSettings({
    query: { queryKey: getGetAiSettingsQueryKey() },
  });
  const update = useUpdateAiSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    aiEnabled: true,
    systemPrompt: "",
    greetingMessage: "",
    confidenceThreshold: 60,
    maxAiResponses: 6,
    autoEscalation: true,
    supportPhone: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        aiEnabled: settings.aiEnabled,
        systemPrompt: settings.systemPrompt ?? "",
        greetingMessage: settings.greetingMessage ?? "",
        confidenceThreshold: settings.confidenceThreshold,
        maxAiResponses: settings.maxAiResponses,
        autoEscalation: settings.autoEscalation,
        supportPhone: settings.supportPhone ?? "",
      });
    }
  }, [settings]);

  const save = () => {
    update.mutate(
      {
        data: {
          aiEnabled: form.aiEnabled,
          systemPrompt: form.systemPrompt.trim() || null,
          greetingMessage: form.greetingMessage.trim() || null,
          confidenceThreshold: Number(form.confidenceThreshold),
          maxAiResponses: Number(form.maxAiResponses),
          autoEscalation: form.autoEscalation,
          supportPhone: form.supportPhone.trim() || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAiSettingsQueryKey() });
          toast({ title: "AI settings saved" });
        },
        onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card className="shadow-lg border-border rounded-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" /> AI Assistant Settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The AI assistant answers new user chats first and escalates to your team when needed.
          It runs on Replit AI — no API key required.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex items-center gap-3">
            <Switch checked={form.aiEnabled} onCheckedChange={(v) => setForm(f => ({ ...f, aiEnabled: v }))} />
            <div>
              <Label className="font-semibold">Enable AI assistant</Label>
              <p className="text-xs text-muted-foreground">New user chats start with the AI bot</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.autoEscalation} onCheckedChange={(v) => setForm(f => ({ ...f, autoEscalation: v }))} />
            <div>
              <Label className="font-semibold">Auto escalation</Label>
              <p className="text-xs text-muted-foreground">Hand off automatically on low confidence or reply limit</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Confidence threshold (%)</Label>
            <Input
              type="number" min={0} max={100}
              value={form.confidenceThreshold}
              onChange={(e) => setForm(f => ({ ...f, confidenceThreshold: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">Below this confidence, the AI hands off to a human</p>
          </div>
          <div className="space-y-1.5">
            <Label>Maximum AI responses</Label>
            <Input
              type="number" min={1}
              value={form.maxAiResponses}
              onChange={(e) => setForm(f => ({ ...f, maxAiResponses: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">After this many replies, the chat escalates</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Support phone number</Label>
          <Input
            value={form.supportPhone}
            placeholder="+91 98765 43210"
            onChange={(e) => setForm(f => ({ ...f, supportPhone: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            When a customer taps the call button, this number is dialed (mobile) or shown to them (desktop). Leave blank to keep in-app calling.
          </p>
        </div>

        {settings?.telegramBotUsername && (
          <div className="space-y-1.5">
            <Label>Telegram bot</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={`t.me/${settings.telegramBotUsername}`} className="font-mono text-sm" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(`https://t.me/${settings.telegramBotUsername}`);
                  toast({ title: "Bot link copied" });
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with your team. Anyone who opens it and sends "hi" to the bot is registered automatically for escalation alerts.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Greeting message</Label>
          <Input
            value={form.greetingMessage}
            placeholder="Hi! I'm your support assistant — let's get this sorted."
            onChange={(e) => setForm(f => ({ ...f, greetingMessage: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>AI system prompt</Label>
          <Textarea
            rows={4}
            value={form.systemPrompt}
            placeholder="You are a friendly, concise customer-support assistant..."
            onChange={(e) => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">Leave blank to use the built-in default prompt</p>
        </div>

        <Button onClick={save} disabled={update.isPending} className="gap-2">
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}

const emptyDraft = {
  title: "",
  description: "",
  icon: "",
  sortOrder: 0,
  isActive: true,
  aiPrompt: "",
  requiresInput: false,
  inputPrompt: "",
  language: "en",
  parentId: null as number | null,
};

function CategoriesCard() {
  const { data: categories, isLoading } = useAdminListSupportCategories({
    query: { queryKey: getAdminListSupportCategoriesQueryKey() },
  });
  const createCat = useCreateSupportCategory();
  const updateCat = useUpdateSupportCategory();
  const deleteCat = useDeleteSupportCategory();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupportCategory | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  // Collapsed by default; each root topic expands like a dropdown.
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const all = categories ?? [];
  const roots = all.filter((c) => c.parentId == null);
  const childrenOf = (id: number) => all.filter((c) => c.parentId === id);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getAdminListSupportCategoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSupportCategoriesQueryKey() });
  };

  const openCreate = (parentId: number | null = null) => {
    setEditing(null);
    setDraft({ ...emptyDraft, parentId });
    setDialogOpen(true);
    // Keep the group open so the new sub-topic is visible once saved.
    if (parentId != null) setExpandedIds((prev) => new Set(prev).add(parentId));
  };

  const openEdit = (cat: SupportCategory) => {
    setEditing(cat);
    setDraft({
      title: cat.title,
      description: cat.description ?? "",
      icon: cat.icon ?? "",
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      aiPrompt: cat.aiPrompt ?? "",
      requiresInput: cat.requiresInput,
      inputPrompt: cat.inputPrompt ?? "",
      language: cat.language,
      parentId: cat.parentId,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    const data = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      icon: draft.icon.trim() || null,
      sortOrder: Number(draft.sortOrder) || 0,
      isActive: draft.isActive,
      aiPrompt: draft.aiPrompt.trim() || null,
      requiresInput: draft.requiresInput,
      inputPrompt: draft.inputPrompt.trim() || null,
      language: draft.language.trim() || "en",
      parentId: draft.parentId,
    };
    const opts = {
      onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: editing ? "Category updated" : "Category created" }); },
      onError: () => toast({ title: "Failed to save category", variant: "destructive" as const }),
    };
    if (editing) updateCat.mutate({ id: editing.id, data }, opts);
    else createCat.mutate({ data }, opts);
  };

  const remove = (cat: SupportCategory) => {
    if (!window.confirm(`Delete "${cat.title}" and all its sub-categories?`)) return;
    deleteCat.mutate({ id: cat.id }, {
      onSuccess: () => { invalidate(); toast({ title: "Category deleted" }); },
      onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
    });
  };

  const RowBadges = ({ cat }: { cat: SupportCategory }) => (
    <div className="flex items-center gap-1.5 shrink-0">
      {!cat.isActive && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
      {cat.requiresInput && (
        <Badge className="text-[10px] gap-1 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
          <PencilLine className="h-3 w-3" /> Asks details
        </Badge>
      )}
      {cat.aiPrompt && (
        <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
          <Bot className="h-3 w-3" /> AI prompt
        </Badge>
      )}
    </div>
  );

  const RowActions = ({ cat, withSub }: { cat: SupportCategory; withSub?: boolean }) => (
    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
      {withSub && (
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Add sub-category" title="Add sub-category" onClick={() => openCreate(cat.id)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" title="Edit" onClick={() => openEdit(cat)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" aria-label="Delete" title="Delete" onClick={() => remove(cat)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const CategoryGroup = ({ cat }: { cat: SupportCategory }) => {
    const children = childrenOf(cat.id);
    const expanded = expandedIds.has(cat.id);
    const toggle = () =>
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(cat.id)) next.delete(cat.id);
        else next.add(cat.id);
        return next;
      });
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Root row — click to expand/collapse the sub-topics */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={toggle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
          className="flex items-center gap-3 py-3 px-4 bg-muted/40 group cursor-pointer select-none hover:bg-muted/70 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/20 dark:bg-blue-950 border border-primary/20 border-primary/20 flex items-center justify-center text-base shrink-0">
            {cat.icon || <FolderTree className="h-4 w-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{cat.title}</span>
              <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                {children.length} {children.length === 1 ? "sub-topic" : "sub-topics"}
              </span>
            </div>
            {cat.description && <div className="text-xs text-muted-foreground truncate">{cat.description}</div>}
          </div>
          <RowBadges cat={cat} />
          <div onClick={(e) => e.stopPropagation()}>
            <RowActions cat={cat} withSub />
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </div>
        {/* Children */}
        {expanded && children.length > 0 && (
          <div className="py-1.5 px-2">
            {children.map((child) => (
              <div key={child.id} className="flex items-center gap-2.5 py-2 pl-4 pr-2 rounded-lg hover:bg-accent/60 group transition-colors">
                <span className="w-4 border-t border-dashed border-slate-300 dark:border-slate-700 shrink-0" />
                <span className="text-sm flex-1 min-w-0 truncate">
                  {child.icon ? `${child.icon} ` : ""}{child.title}
                  {child.description && <span className="text-muted-foreground text-xs"> — {child.description}</span>}
                </span>
                <RowBadges cat={child} />
                <RowActions cat={child} />
              </div>
            ))}
            <button
              onClick={() => openCreate(cat.id)}
              className="flex items-center gap-2 py-1.5 pl-4 pr-2 ml-6 text-xs text-muted-foreground hover:text-primary dark:hover:text-blue-400 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add sub-topic
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="shadow-lg border-border rounded-2xl">
      <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg font-bold">Support Categories</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Options users pick when opening a chat. An "Other" free-text option is always shown automatically.
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => openCreate(null)}>
          <Plus className="h-4 w-4" /> Add Category
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : roots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No categories yet. Add your first one.</p>
        ) : (
          <div className="space-y-3">
            {roots.map((cat) => <CategoryGroup key={cat.id} cat={cat} />)}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={draft.title} onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Deposit" />
              </div>
              <div className="space-y-1.5">
                <Label>Icon (optional)</Label>
                <Input value={draft.icon} onChange={(e) => setDraft(d => ({ ...d, icon: e.target.value }))} placeholder="icon" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={draft.description} onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Problems with deposits" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Parent category</Label>
                <Select
                  value={draft.parentId == null ? "none" : String(draft.parentId)}
                  onValueChange={(v) => setDraft(d => ({ ...d, parentId: v === "none" ? null : Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top level)</SelectItem>
                    {all.filter((c) => c.id !== editing?.id).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input type="number" value={draft.sortOrder} onChange={(e) => setDraft(d => ({ ...d, sortOrder: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Input value={draft.language} onChange={(e) => setDraft(d => ({ ...d, language: e.target.value }))} placeholder="en" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>AI prompt (extra instructions for this topic)</Label>
              <Textarea rows={3} value={draft.aiPrompt} onChange={(e) => setDraft(d => ({ ...d, aiPrompt: e.target.value }))} placeholder="For deposit issues, first ask for the transaction ID..." />
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={draft.requiresInput} onCheckedChange={(v) => setDraft(d => ({ ...d, requiresInput: v }))} />
                <div>
                  <Label className="font-semibold">Ask user for details</Label>
                  <p className="text-xs text-muted-foreground">When picked, the user must type details (e.g. KYC info, transaction ID) before the chat starts</p>
                </div>
              </div>
              {draft.requiresInput && (
                <div className="space-y-1.5">
                  <Label>Question shown to the user</Label>
                  <Textarea
                    rows={2}
                    value={draft.inputPrompt}
                    onChange={(e) => setDraft(d => ({ ...d, inputPrompt: e.target.value }))}
                    placeholder="Please enter your registered mobile number and PAN so we can check your KYC status."
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={draft.isActive} onCheckedChange={(v) => setDraft(d => ({ ...d, isActive: v }))} />
              <Label>Active (visible to users)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={!draft.title.trim() || createCat.isPending || updateCat.isPending}
              className="gap-2"
            >
              {(createCat.isPending || updateCat.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
