import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MessageCircle, Phone, Shield, Lock, Sun, Moon } from "lucide-react";

export default function LoginPage() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const { data: communitySettings } = useQuery<{ communityName: string }>({
    queryKey: ["/api/community-settings"],
  });
  const communityName = communitySettings?.communityName || "Community Hub";

  const handleRequestOtp = async () => {
    if (phone.length < 10) {
      toast({ title: "Invalid phone number", description: "Please enter a valid phone number.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/request-otp", { phone });
      setStep("otp");
      toast({ title: "OTP Sent", description: "A 4-digit code has been sent to your WhatsApp." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send OTP.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (value: string) => {
    setOtp(value);
    if (value.length !== 4) return;
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/verify-otp", { phone, otp: value });
      const member = await res.json();
      login(member);
    } catch (err: any) {
      toast({ title: "Verification Failed", description: err.message || "Invalid OTP.", variant: "destructive" });
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4">
        <Button size="icon" variant="ghost" onClick={toggleTheme} title={theme === "light" ? "Dark mode" : "Light mode"} data-testid="button-theme-toggle-login">
          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>
      </div>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-md bg-primary/10 mb-2">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-app-title">{communityName}</h1>
          <p className="text-muted-foreground text-sm">Invite-only discussion community</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {step === "phone" ? "Enter your phone number" : "Enter verification code"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "phone" ? (
              <>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    data-testid="input-phone"
                    type="tel"
                    placeholder="Enter phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10"
                    onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
                  />
                </div>
                <Button
                  data-testid="button-request-otp"
                  className="w-full"
                  onClick={handleRequestOtp}
                  disabled={isLoading || phone.length < 10}
                >
                  {isLoading ? "Sending..." : "Request OTP"}
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-4">
                  <Lock className="w-6 h-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">
                    Enter the 4-digit code sent to your WhatsApp at <span className="font-medium text-foreground">{phone}</span>
                  </p>
                  <InputOTP
                    maxLength={4}
                    value={otp}
                    onChange={handleVerifyOtp}
                    data-testid="input-otp"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                  {isLoading && <p className="text-xs text-muted-foreground">Verifying...</p>}
                </div>
                <Button
                  data-testid="button-back-to-phone"
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setStep("phone"); setOtp(""); }}
                >
                  Use a different number
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              This is an invite-only community. To join, contact our team on WhatsApp at{" "}
              <span className="font-semibold text-foreground">7030809030</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
