import { useRef, useState } from "react";
import {
  Loader2,
  Search,
  Users,
  X,
  Camera,
  UserPlus,
  UserMinus,
  LogOut,
  Pencil,
  Check,
} from "lucide-react";
import {
  useSearchUsers,
  getSearchUsersQueryKey,
  useCreateGroup,
  useUpdateGroup,
  useAddGroupMember,
  useRemoveGroupMember,
  useUploadFile,
  Conversation,
  User,
  getListConversationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

export function GroupAvatar({
  convo,
  className,
}: {
  convo: Pick<Conversation, "title" | "iconUrl">;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {convo.iconUrl ? <AvatarImage src={convo.iconUrl} alt={convo.title ?? "Group"} /> : null}
      <AvatarFallback className="bg-primary/15 text-primary">
        {convo.title?.trim() ? (
          <span className="text-sm font-bold">{convo.title.trim().charAt(0).toUpperCase()}</span>
        ) : (
          <Users className="h-4 w-4" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

/** Search box + result list used for picking staff members. */
function StaffSearch({
  excludeIds,
  onPick,
  placeholder,
}: {
  excludeIds: number[];
  onPick: (u: User) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const enabled = q.trim().length >= 2;
  const { data: results, isLoading } = useSearchUsers(
    { q: q.trim(), staffOnly: true },
    { query: { enabled, queryKey: getSearchUsersQueryKey({ q: q.trim(), staffOnly: true }) } },
  );
  const filtered = (results ?? []).filter((u) => !excludeIds.includes(u.id));
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
        <Input
          placeholder={placeholder ?? "Search staff by name, email or code..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      {enabled && (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {isLoading ? (
            <div className="p-3 text-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">No staff found</div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onPick(u);
                  setQ("");
                }}
                className="w-full flex items-center gap-2.5 p-2.5 hover:bg-muted/60 text-left"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-muted text-foreground text-xs font-bold">
                    {u.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{u.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {u.email}
                    {u.mobile ? ` · ${u.mobile}` : ""}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">{u.role}</Badge>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function useIconUpload() {
  const uploadFile = useUploadFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();
  const upload = async (file: File): Promise<string | null> => {
    try {
      const res = await uploadFile.mutateAsync({ data: { file: file as any } });
      return res.url;
    } catch {
      toast({
        variant: "destructive",
        title: "Icon upload failed",
        description: "Please try a different image.",
      });
      return null;
    }
  };
  return { inputRef, pick, upload, isUploading: uploadFile.isPending };
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (conv: Conversation) => void;
}) {
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<User[]>([]);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const icon = useIconUpload();
  const createGroup = useCreateGroup();
  const queryClient = useQueryClient();

  const reset = () => {
    setTitle("");
    setMembers([]);
    setIconUrl(null);
  };

  const submit = () => {
    createGroup.mutate(
      {
        data: {
          title: title.trim(),
          memberIds: members.map((m) => m.id),
          ...(iconUrl ? { iconUrl } : {}),
        },
      },
      {
        onSuccess: (conv) => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          reset();
          onOpenChange(false);
          onCreated(conv);
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            description:
              (err as { data?: { error?: string } })?.data?.error ??
              "Could not create the group.",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> New group
          </DialogTitle>
          <DialogDescription>
            Name your group, pick an icon, and add staff members.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              ref={icon.inputRef}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const url = await icon.upload(f);
                  if (url) setIconUrl(url);
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={icon.pick}
              className="relative h-14 w-14 rounded-full border border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary transition-colors shrink-0"
              title="Choose group icon"
            >
              {icon.isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : iconUrl ? (
                <img src={iconUrl} alt="Group icon" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
            <Input
              placeholder="Group name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
            />
          </div>

          {members.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                  {m.name}
                  <button
                    type="button"
                    onClick={() => setMembers((prev) => prev.filter((x) => x.id !== m.id))}
                    className="rounded-full hover:bg-muted p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <StaffSearch
            excludeIds={members.map((m) => m.id)}
            onPick={(u) => setMembers((prev) => [...prev, u])}
          />

          <Button
            className="w-full"
            disabled={!title.trim() || members.length === 0 || createGroup.isPending || icon.isUploading}
            onClick={submit}
          >
            {createGroup.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>Create group</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GroupInfoDialog({
  convo,
  meId,
  meRole,
  open,
  onOpenChange,
  onLeft,
}: {
  convo: Conversation;
  meId: number;
  meRole: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLeft: () => void;
}) {
  const canManage = meRole === "admin" || convo.createdById === meId;
  const icon = useIconUpload();
  const updateGroup = useUpdateGroup();
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(convo.title ?? "");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });

  const onError = (err: unknown) =>
    toast({
      variant: "destructive",
      description:
        (err as { data?: { error?: string } })?.data?.error ?? "Something went wrong.",
    });

  const members = convo.members ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Group info
          </DialogTitle>
          <DialogDescription>
            {members.length} {members.length === 1 ? "member" : "members"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              ref={icon.inputRef}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const url = await icon.upload(f);
                  if (url) {
                    updateGroup.mutate(
                      { id: convo.id, data: { iconUrl: url } },
                      { onSuccess: refresh, onError },
                    );
                  }
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={!canManage}
              onClick={icon.pick}
              className="relative h-14 w-14 rounded-full overflow-hidden shrink-0 group disabled:cursor-default"
              title={canManage ? "Change group icon" : undefined}
            >
              <GroupAvatar convo={convo} className="h-14 w-14" />
              {canManage && (
                <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white">
                  {icon.isUploading || updateGroup.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </span>
              )}
            </button>
            {editingTitle ? (
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  maxLength={80}
                  className="h-9"
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={!titleDraft.trim() || updateGroup.isPending}
                  onClick={() =>
                    updateGroup.mutate(
                      { id: convo.id, data: { title: titleDraft.trim() } },
                      {
                        onSuccess: () => {
                          refresh();
                          setEditingTitle(false);
                        },
                        onError,
                      },
                    )
                  }
                >
                  {updateGroup.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-foreground truncate">{convo.title}</span>
                {canManage && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setTitleDraft(convo.title ?? "");
                      setEditingTitle(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border divide-y divide-border max-h-56 overflow-y-auto">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 p-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-muted text-foreground text-xs font-bold">
                    {m.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.name}
                    {m.id === meId ? " (you)" : ""}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                </div>
                {m.id === convo.createdById && (
                  <Badge variant="outline" className="text-[10px]">Creator</Badge>
                )}
                {canManage && m.id !== convo.createdById && m.id !== meId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Remove from group"
                    disabled={removeMember.isPending}
                    onClick={() =>
                      removeMember.mutate(
                        { id: convo.id, userId: m.id },
                        { onSuccess: refresh, onError },
                      )
                    }
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Add member
              </div>
              <StaffSearch
                excludeIds={members.map((m) => m.id)}
                onPick={(u) =>
                  addMember.mutate(
                    { id: convo.id, data: { userId: u.id } },
                    { onSuccess: refresh, onError },
                  )
                }
              />
            </div>
          )}

          {convo.createdById !== meId && (
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={removeMember.isPending}
              onClick={() =>
                removeMember.mutate(
                  { id: convo.id, userId: meId },
                  {
                    onSuccess: () => {
                      refresh();
                      onOpenChange(false);
                      onLeft();
                    },
                    onError,
                  },
                )
              }
            >
              <LogOut className="h-4 w-4 mr-2" /> Leave group
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
