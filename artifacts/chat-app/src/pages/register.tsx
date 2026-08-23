import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useRequestOtp,
  useVerifyOtp,
  useCompleteOtpSignup,
  useUpdateProfile,
  useUploadFile,
} from "@workspace/api-client-react";
import { useAuthStore } from "@/stores/auth";
import { Link, useLocation } from "wouter";
import {
  Loader2,
  Phone,
  ShieldCheck,
  User,
  Camera,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Step = "mobile" | "otp" | "profile";

const MOBILE_RE = /^\+?[0-9\s-]{7,15}$/;

export default function Register() {
  const [, setLocation] = useLocation();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const { toast } = useToast();

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const completeSignup = useCompleteOtpSignup();
  const uploadFile = useUploadFile();
  const updateProfile = useUpdateProfile();

  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy =
    requestOtp.isPending ||
    verifyOtp.isPending ||
    completeSignup.isPending ||
    finishing;

  function fail(description: string) {
    toast({ variant: "destructive", title: "Sign up failed", description });
  }

  function sendCode() {
    if (!MOBILE_RE.test(mobile.trim())) {
      fail("Enter a valid mobile number");
      return;
    }
    requestOtp.mutate(
      { data: { mobile: mobile.trim() } },
      {
        onSuccess: () => {
          setOtp("");
          setStep("otp");
        },
        onError: (err) => fail(err.message || "Could not send the code"),
      },
    );
  }

  function verifyCode() {
    verifyOtp.mutate(
      { data: { mobile: mobile.trim(), otp: otp.trim() } },
      {
        onSuccess: (res) => {
          if (res.status === "existing" && res.accessToken) {
            setAccessToken(res.accessToken);
            setLocation("/");
            return;
          }
          setSignupToken(res.signupToken ?? null);
          setStep("profile");
        },
        onError: (err) => fail(err.message || "Incorrect code"),
      },
    );
  }

  function pickPhoto(file: File | null) {
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function finish() {
    if (!name.trim()) {
      fail("Please enter your name");
      return;
    }
    if (!signupToken) {
      fail("Your verification expired. Please verify your number again.");
      setStep("mobile");
      return;
    }
    setFinishing(true);
    try {
      const res = await completeSignup.mutateAsync({
        data: { signupToken, name: name.trim() },
      });
      // Log in first so the (optional) photo upload is authenticated.
      setAccessToken(res.accessToken);
      if (photo) {
        try {
          const uploaded = await uploadFile.mutateAsync({
            data: { file: photo as unknown as Blob },
          });
          await updateProfile.mutateAsync({ data: { avatarUrl: uploaded.url } });
        } catch {
          toast({
            title: "Photo not saved",
            description:
              "Your account was created, but the profile photo could not be uploaded. You can try again later.",
          });
        }
      }
      setLocation("/");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not create your account");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex w-full bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-noise z-0 pointer-events-none" />

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
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                {step === "mobile" && "Create account"}
                {step === "otp" && "Verify your number"}
                {step === "profile" && "Almost there"}
              </h1>
              <p className="text-muted-foreground text-lg">
                {step === "mobile" && "Sign up with just your mobile number"}
                {step === "otp" && `We sent a code to ${mobile.trim()}`}
                {step === "profile" && "Tell us your name and add a photo"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
            {step === "mobile" && (
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendCode();
                }}
              >
                <div className="space-y-2">
                  <label className="text-foreground font-semibold text-sm">Mobile Number</label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="tel"
                      autoFocus
                      placeholder="+91 98765 43210"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      className="h-12 pl-11 bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary text-base"
                      data-testid="input-signup-mobile"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all"
                  disabled={busy}
                  data-testid="button-send-otp"
                >
                  {requestOtp.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  Send Code
                </Button>
              </form>
            )}

            {step === "otp" && (
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyCode();
                }}
              >
                <div className="space-y-2">
                  <label className="text-foreground font-semibold text-sm">Verification Code</label>
                  <div className="relative">
                    <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      inputMode="numeric"
                      autoFocus
                      maxLength={8}
                      placeholder="Enter the 4-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                      className="h-12 pl-11 bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary text-base tracking-[0.3em]"
                      data-testid="input-signup-otp"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all"
                  disabled={busy || otp.length < 4}
                  data-testid="button-verify-otp"
                >
                  {verifyOtp.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  Verify
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("mobile")}
                  className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="h-4 w-4" /> Change number
                </button>
              </form>
            )}

            {step === "profile" && (
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void finish();
                }}
              >
                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="relative group"
                    data-testid="button-pick-photo"
                  >
                    <Avatar className="h-24 w-24 border-2 border-border shadow-md">
                      {photoPreview ? (
                        <AvatarImage src={photoPreview} alt="Profile preview" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-muted">
                        <Camera className="h-8 w-8 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md group-hover:bg-primary/90">
                      <Camera className="h-4 w-4" />
                    </span>
                  </button>
                  <span className="text-xs text-muted-foreground font-medium">
                    {photo ? photo.name : "Add a profile photo (optional)"}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-foreground font-semibold text-sm">Your Name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      autoFocus
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 pl-11 bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary text-base"
                      data-testid="input-signup-name"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all"
                  disabled={busy || !name.trim()}
                  data-testid="button-finish-signup"
                >
                  {finishing && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  Continue
                </Button>
              </form>
            )}
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-bold text-primary hover:text-primary/80 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Showcase side — chat preview */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden bg-sidebar z-10 border-l border-border">
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md px-12">
          <div className="w-full rounded-2xl border border-sidebar-border bg-card shadow-2xl overflow-hidden">
            <div className="h-16 border-b border-border flex items-center px-5 gap-4 bg-muted/20">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/20">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-[3px] border-card" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground">Support</span>
                <span className="text-xs text-primary font-semibold">AI Assistant</span>
              </div>
            </div>

            <div className="p-6 space-y-5 bg-background h-64 flex flex-col justify-end">
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <p className="text-[14px] leading-relaxed text-foreground font-medium">
                    Hi there! I'm Support. How can I help you today?
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 shadow-md shadow-primary/20">
                  <p className="text-[14px] leading-relaxed font-medium">
                    I'd love to get my team onboarded!
                  </p>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <h2 className="text-3xl font-bold text-sidebar-foreground mb-3 tracking-tight">
              Start collaborating.
            </h2>
            <p className="text-sidebar-foreground/60 font-medium">
              Join teams delivering delightful support with SkyTalk.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
