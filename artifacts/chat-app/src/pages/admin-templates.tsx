import { useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Zap } from "lucide-react";
import {
  useListMessageTemplates,
  useCreateMessageTemplate,
  useUpdateMessageTemplate,
  useDeleteMessageTemplate,
  getListMessageTemplatesQueryKey,
  useAdminListSupportCategories,
  getAdminListSupportCategoriesQueryKey,
  type MessageTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// Admin page: create/edit/delete the quick-reply templates that support
// staff can insert into the chat composer.
export default function AdminTemplates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: templates, isLoading } = useListMessageTemplates({
    query: { queryKey: getListMessageTemplatesQueryKey() },
  });
  const { data: categories } = useAdminListSupportCategories({
    query: { queryKey: getAdminListSupportCategoriesQueryKey() },
  });
  const createTpl = useCreateMessageTemplate();
  const updateTpl = useUpdateMessageTemplate();
  const deleteTpl = useDeleteMessageTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const categoryName = (id: number | null) =>
    id == null ? null : categories?.find((c) => c.id === id)?.title ?? `#${id}`;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListMessageTemplatesQueryKey() });

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    // Only the middle message: opening/closing greetings are added
    // automatically when staff insert the template.
    setContent("");
    setCategoryId(null);
    setDialogOpen(true);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditing(t);
    setTitle(t.title);
    setContent(t.content);
    setCategoryId(t.categoryId ?? null);
    setDialogOpen(true);
  };

  const save = () => {
    const data = { title: title.trim(), content: content.trim(), categoryId };
    if (!data.title || !data.content) return;
    const opts = {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        toast({ title: editing ? "Template updated" : "Template created" });
      },
      onError: () => toast({ title: "Failed to save template", variant: "destructive" as const }),
    };
    if (editing) updateTpl.mutate({ id: editing.id, data }, opts);
    else createTpl.mutate({ data }, opts);
  };

  const remove = (t: MessageTemplate) => {
    if (!window.confirm(`Delete template "${t.title}"?`)) return;
    deleteTpl.mutate(
      { id: t.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Template deleted" });
        },
      },
    );
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" />
            Quick Reply Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Predefined messages support staff can insert, edit, and send. Messages are
            auto-translated to the customer's language on send.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          New template
        </Button>
      </div>

      {/* Opening/closing greetings automatically wrap every inserted template. */}
      {!isLoading && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Greetings (added to every template)</h2>
          {(templates ?? []).filter((t) => t.kind !== "normal").map((t) => (
            <div key={t.id} className="border border-primary/20 rounded-xl p-4 bg-primary/5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{t.kind === "opening" ? "Opening greeting" : "Closing greeting"}</div>
                <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{t.content}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Edit greeting">
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (templates ?? []).filter((t) => t.kind === "normal").length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No templates yet. Create your first one.
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Templates (message only — greetings added automatically)</h2>
          {(templates ?? []).filter((t) => t.kind === "normal").map((t) => (
            <div key={t.id} className="border border-border rounded-xl p-4 bg-card flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-2">
                  {t.title}
                  <span className={t.categoryId != null
                    ? "text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary"
                    : "text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}>
                    {categoryName(t.categoryId ?? null) ?? "General"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{t.content}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => remove(t)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Checking issue" maxLength={100} className="mt-1.5" />
            </div>
            {(!editing || editing.kind === "normal") && (
            <div>
              <label className="text-sm font-medium">Category</label>
              <select
                value={categoryId ?? ""}
                onChange={(e) => setCategoryId(e.target.value === "" ? null : Number(e.target.value))}
                className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">General (all conversations)</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId != null ? "— " : ""}{c.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Category templates only appear when the customer started the chat with that topic.
              </p>
            </div>
            )}
            <div>
              <label className="text-sm font-medium">Message (English)</label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Type the message only — opening/closing greetings are added automatically" rows={5} maxLength={2000} className="mt-1.5" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["{{customer_name}}", "{{agent_name}}", "{{category}}", "{{date}}", "{{time}}"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setContent((c) => c + (c && !c.endsWith(" ") ? " " : "") + v)}
                    className="text-xs font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Dynamic variables are filled automatically when staff insert the template (customer name, your name, topic, date, time).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!title.trim() || !content.trim() || createTpl.isPending || updateTpl.isPending}>
              {(createTpl.isPending || updateTpl.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
