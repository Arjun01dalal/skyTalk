import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useChangePassword, useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";

const formSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const setAccessToken = useAuthStore((s: any) => s.setAccessToken);
  const [done, setDone] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const forced = !!me?.mustChangePassword;

  function onSubmit(values: z.infer<typeof formSchema>) {
    changePassword.mutate(
      { data: { currentPassword: values.currentPassword, newPassword: values.newPassword } },
      {
        onSuccess: () => {
          setDone(true);
          toast({ title: "Password changed", description: "Please sign in again with your new password." });
          // Force a clean re-login with the new password. Clear the whole
          // query cache so the stale mustChangePassword=true profile can't
          // bounce the next login back to this screen.
          logout.mutate(undefined, {
            onSettled: () => {
              setAccessToken(null);
              queryClient.clear();
              setLocation("/login");
            },
          });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Could not change password",
            description: err?.message || "Please check your current password and try again.",
          });
        },
      },
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 ring-1 ring-black/5">
            <img src="/skytalk-logo.svg" alt="SkyTalk logo" className="w-8 h-8" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">SkyTalk</span>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Change your password
            </h1>
            <p className="text-sm text-muted-foreground">
              {forced
                ? "For security, you must set a new password before using your account. After saving, you'll sign in again with the new password."
                : "Set a new password for your account. You'll sign in again afterwards."}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={changePassword.isPending || done}>
                {changePassword.isPending || done ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" /> Save new password
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
