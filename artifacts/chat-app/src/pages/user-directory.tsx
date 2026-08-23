import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, getListUsersQueryKey, getGetStatsSummaryQueryKey } from "@workspace/api-client-react";
import { Users, Plus, Edit2, Trash2, Shield, UserCheck, User as UserIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const userSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal("")),
  role: z.enum(["admin", "agent", "user"]),
  empCode: z.string().optional().or(z.literal("")),
  isActive: z.boolean(),
});

const TABS = [
  { value: "all", label: "All", icon: Users },
  { value: "admin", label: "Admins", icon: Shield },
  { value: "agent", label: "Agents", icon: UserCheck },
  { value: "user", label: "Users", icon: UserIcon },
] as const;

export default function UserDirectory() {
  const { data: users, isLoading } = useListUsers();
  const [tab, setTab] = useState<string>("all");
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", password: "", role: "user", isActive: true },
  });

  const openCreate = () => {
    setEditingUser(null);
    // Preselect the role matching the active tab.
    const role = tab === "all" ? "user" : (tab as "admin" | "agent" | "user");
    form.reset({ name: "", email: "", password: "", role, isActive: true, empCode: "" });
    setIsUserModalOpen(true);
  };

  const openEdit = (user: any) => {
    setEditingUser(user);
    form.reset({ name: user.name, email: user.email, password: "", role: user.role, isActive: user.isActive, empCode: user.empCode ?? "" });
    setIsUserModalOpen(true);
  };

  const onSubmit = (values: z.infer<typeof userSchema>) => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
    };
    if (editingUser) {
      updateUser.mutate(
        { id: editingUser.id, data: { name: values.name, role: values.role, isActive: values.isActive, empCode: values.empCode ?? "", ...(values.password ? { password: values.password } : {}) } },
        {
          onSuccess: () => {
            invalidate();
            setIsUserModalOpen(false);
            toast({ title: "User updated" });
          },
        },
      );
    } else {
      // Blank password → server assigns the default starter password
      // (12345678); staff must change it at first login.
      createUser.mutate(
        { data: { name: values.name, email: values.email, ...(values.password ? { password: values.password } : {}), role: values.role as any, empCode: values.empCode ?? "" } },
        {
          onSuccess: () => {
            invalidate();
            setIsUserModalOpen(false);
            toast({ title: "User created" });
          },
        },
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure? This cannot be undone.")) {
      deleteUser.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
            toast({ title: "User deleted" });
          },
        },
      );
    }
  };

  const filtered = (role: string) => (role === "all" ? users : users?.filter((u) => u.role === role)) ?? [];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-20 border-b border-border bg-card/50 backdrop-blur-xl flex items-center px-6 md:px-8 shrink-0 sticky top-0 z-10 justify-between">
        <h1 className="font-bold text-xl flex items-center gap-2">
          <Users className="text-primary" /> User Directory
        </h1>
        <Button onClick={openCreate} className="shadow-sm">
          <Plus className="h-4 w-4 mr-2" /> Add User
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <t.icon className="h-4 w-4" />
                  {t.label}
                  <Badge variant="secondary" className="ml-1 px-1.5 text-[11px]">
                    {filtered(t.value).length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {TABS.map((t) => (
              <TabsContent key={t.value} value={t.value}>
                <Card className="shadow-lg border-border overflow-hidden rounded-2xl">
                  <div className="p-4 border-b border-border bg-card">
                    <CardTitle className="text-base font-bold">{t.label === "All" ? "All Accounts" : t.label}</CardTitle>
                  </div>
                  <div className="overflow-x-auto bg-card">
                    {isLoading ? (
                      <div className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
                    ) : filtered(t.value).length === 0 ? (
                      <div className="p-10 text-center text-muted-foreground text-sm">No {t.label.toLowerCase()} yet.</div>
                    ) : (
                      <Table>
                        <TableHeader className="bg-muted/30 text-muted-foreground">
                          <TableRow>
                            <TableHead className="w-[250px]">User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Emp Code</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered(t.value).map((user) => (
                            <TableRow key={user.id} className="hover:bg-muted/30 transition-colors">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <Avatar className="h-9 w-9 border border-border">
                                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">{user.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    {user.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-card rounded-full" />}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-semibold">{user.name}</span>
                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={user.role === "admin" ? "default" : user.role === "agent" ? "secondary" : "outline"} className="capitalize font-semibold tracking-wide">
                                  {user.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground font-mono text-sm">{user.empCode || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={user.isActive ? "outline" : "destructive"} className={user.isActive ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-900" : ""}>
                                  {user.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(user)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>

      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl><Input {...field} disabled={!!editingUser} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{editingUser ? "New Password (optional)" : "Password (optional)"}</FormLabel>
                    <FormControl><Input type="password" placeholder={editingUser ? "" : "Default: 12345678"} {...field} /></FormControl>
                    {!editingUser && (
                      <p className="text-xs text-muted-foreground">
                        Leave blank to use the default password 12345678. Agents/admins will be asked to change it at first login.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="agent">Support Agent</SelectItem>
                          <SelectItem value="admin">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm mt-8">
                      <FormLabel className="font-semibold cursor-pointer">Active Status</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="empCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee Code {form.watch("role") === "agent" ? "(links assigned users to this agent)" : "(optional)"}</FormLabel>
                    <FormControl><Input placeholder="e.g. EMP1024" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={createUser.isPending || updateUser.isPending} className="w-full sm:w-auto">
                  {editingUser ? "Save Changes" : "Create User"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
