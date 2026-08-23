import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useLogin } from "@workspace/api-client-react";
import { useAuthStore } from "@/stores/auth";
import { Link, useLocation } from "wouter";
import { Loader2, Mail, Lock, MessageSquare, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const login = useLogin();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    login.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          setAccessToken(res.accessToken);
          // Staff on a default/starter password must change it first.
          if (res.user.mustChangePassword && res.user.role !== "user") {
            setLocation("/change-password");
          } else {
            setLocation("/");
          }
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Login Failed",
            description: err.message || "Invalid credentials",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] flex w-full bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-noise z-0 pointer-events-none" />

      {/* Form side */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative z-10">
        <div className="w-full max-w-md">
          <div className="mb-10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 ring-1 ring-black/5">
                <img src="/skytalk-logo.svg" alt="SkyTalk logo" className="w-8 h-8" />
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground">SkyTalk</span>
            </div>
            <div className="space-y-2 pt-4">
              <h1 className="text-4xl font-bold tracking-tight text-foreground">Welcome back</h1>
              <p className="text-muted-foreground text-lg">Sign in to your workspace</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            placeholder="name@example.com"
                            {...field}
                            className="h-12 pl-11 bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary text-base"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            className="h-12 pl-11 bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary text-base"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all"
                  disabled={login.isPending}
                >
                  {login.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link
              href="/register"
              className="font-bold text-primary hover:text-primary/80 hover:underline"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>

      {/* Showcase side */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden bg-sidebar z-10 border-l border-border">
        {/* Glows */}
        <div className="absolute top-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-lg px-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sidebar-accent/50 border border-sidebar-border mb-8 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-sidebar-foreground uppercase tracking-wider">
              AI-powered support
            </span>
          </div>
          <h2 className="text-5xl font-bold text-sidebar-foreground leading-[1.1] mb-6 tracking-tight">
            Communication that feels effortless.
          </h2>
          <p className="text-sidebar-foreground/70 text-lg leading-relaxed mb-12 font-medium">
            Connect instantly with your team and customers in a distraction-free, professional environment.
          </p>

          <div className="space-y-6">
            <Feature
              icon={<Zap className="w-5 h-5 text-primary" />}
              title="Instant, real-time messaging"
              desc="Live conversations that keep everyone in sync."
            />
            <Feature
              icon={<Sparkles className="w-5 h-5 text-primary" />}
              title="Smart AI assistance"
              desc="Get help fast, then talk to a human any time."
            />
            <Feature
              icon={<ShieldCheck className="w-5 h-5 text-primary" />}
              title="Secure by design"
              desc="Your conversations stay private and protected."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-none w-12 h-12 rounded-xl bg-sidebar-accent border border-sidebar-border flex items-center justify-center shadow-sm">
        {icon}
      </div>
      <div className="pt-1">
        <div className="text-base font-bold text-sidebar-foreground mb-0.5">{title}</div>
        <div className="text-sm text-sidebar-foreground/60 font-medium">{desc}</div>
      </div>
    </div>
  );
}
