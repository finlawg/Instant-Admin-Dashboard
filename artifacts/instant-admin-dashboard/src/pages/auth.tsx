import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useLogin, useSignup } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Loader2, Eye, EyeOff } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const verificationSchema = z.object({
  code: z.string().length(6, "Verification code must be 6 digits"),
});

const passwordResetSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const resetPasswordSchema = z.object({
  code: z.string().length(6, "Reset code must be 6 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type AuthValues = z.infer<typeof authSchema>;
type VerificationValues = z.infer<typeof verificationSchema>;
type PasswordResetValues = z.infer<typeof passwordResetSchema>;
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const loginMutation = useLogin();
  const signupMutation = useSignup();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const form = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const verificationForm = useForm<VerificationValues>({
    resolver: zodResolver(verificationSchema),
    defaultValues: {
      code: "",
    },
  });

  const passwordResetForm = useForm<PasswordResetValues>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      email: "",
    },
  });

  const resetPasswordForm = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      code: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (values: AuthValues) => {
    if (isLogin) {
      loginMutation.mutate(
        { data: values },
        {
          onSuccess: (user) => {
            queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
            toast({
              title: "Welcome back",
              description: `Signed in as ${user.email}`,
            });
            setLocation("/connections");
          },
          onError: (error: any) => {
            toast({
              variant: "destructive",
              title: "Authentication failed",
              description: error?.message || "Please check your credentials and try again",
            });
          },
        }
      );
    } else {
      // For signup, send verification code first
      signupMutation.mutate(
        { data: values },
        {
          onSuccess: (response) => {
            setPendingEmail(values.email);
            setPendingPassword(values.password);
            setShowVerification(true);
            toast({
              title: "Verification code sent",
              description: "Please check your email for the verification code",
            });
          },
          onError: (error: any) => {
            toast({
              variant: "destructive",
              title: "Signup failed",
              description: error?.message || "Please check your information and try again",
            });
          },
        }
      );
    }
  };

  const onVerify = () => {
    // Call verification endpoint
    fetch("/api/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: pendingEmail,
        code: verificationCode,
        password: pendingPassword,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }
        queryClient.setQueryData(getGetCurrentUserQueryKey(), data);
        toast({
          title: "Account created",
          description: `Signed in as ${data.email}`,
        });
        setLocation("/connections");
      })
      .catch((error: any) => {
        toast({
          variant: "destructive",
          title: "Verification failed",
          description: error?.message || "Invalid verification code",
        });
      });
  };

  const onForgotPassword = (values: PasswordResetValues) => {
    fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }
        setResetEmail(values.email);
        setShowForgotPassword(false);
        setShowResetPassword(true);
        toast({
          title: "Reset code sent",
          description: "Please check your email for the password reset code",
        });
      })
      .catch((error: any) => {
        toast({
          variant: "destructive",
          title: "Failed to send reset code",
          description: error?.message || "Please try again",
        });
      });
  };

  const onResetPassword = (values: { code: string; password: string; confirmPassword: string }) => {
    // Validate passwords match
    if (values.password !== values.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Password reset failed",
        description: "Passwords do not match",
      });
      return;
    }

    fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: resetEmail,
        code: values.code,
        password: values.password,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }
        toast({
          title: "Password reset successful",
          description: "Your password has been updated. Please sign in with your new password.",
        });
        // Reset to login form
        setShowForgotPassword(false);
        setShowResetPassword(false);
        setIsLogin(true);
        setResetCode("");
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((error: any) => {
        toast({
          variant: "destructive",
          title: "Password reset failed",
          description: error?.message || "Invalid reset code",
        });
      });
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-secondary/30 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center shadow-lg">
            <Database className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Instant Admin</h1>
          <p className="text-muted-foreground text-sm max-w-[280px]">
            Direct, secure access to your PostgreSQL databases.
          </p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader>
            <CardTitle>
              {showVerification 
                ? "Verify Your Email" 
                : showForgotPassword
                  ? "Reset Password"
                : showResetPassword
                  ? "Reset Password"
                : isLogin 
                  ? "Sign In" 
                  : "Create Account"
              }
            </CardTitle>
            <CardDescription>
              {showVerification
                ? `Enter the 6-digit code sent to ${pendingEmail}`
                : showForgotPassword
                  ? "Enter your email address and we'll send you a reset code"
                : showResetPassword
                  ? `Enter the reset code sent to ${resetEmail}`
                : isLogin
                  ? "Enter your email and password to access your databases"
                  : "Sign up to start managing your data securely"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showForgotPassword ? (
              <form onSubmit={(e) => { e.preventDefault(); onForgotPassword({ email: resetEmail }); }} className="space-y-4">
                  <div>
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      data-testid="input-reset-email"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isPending || !resetEmail.trim()}
                    data-testid="button-send-reset-code"
                  >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Reset Code
                  </Button>
                </form>
            ) : showResetPassword ? (
              <form onSubmit={(e) => { e.preventDefault(); onResetPassword({ code: resetCode, password: newPassword, confirmPassword: confirmPassword }); }} className="space-y-4">
                  <div>
                    <Label htmlFor="reset-code">Reset Code</Label>
                    <input
                      id="reset-code"
                      type="text"
                      placeholder="123456"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-widest ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        data-testid="input-new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        data-testid="input-confirm-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isPending || resetCode.length !== 6 || !newPassword.trim()}
                    data-testid="button-reset-password"
                  >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reset Password
                  </Button>
                </form>
            ) : showVerification ? (
              <form onSubmit={(e) => { e.preventDefault(); onVerify(); }} className="space-y-4">
                <div>
                  <Label htmlFor="verification-code">Verification Code</Label>
                  <input
                    id="verification-code"
                    type="text"
                    placeholder="123456"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-widest ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-2"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    If you don't see the email, please check your spam folder
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isPending || verificationCode.length !== 6}
                >
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Create Account
                </Button>
              </form>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Email</Label>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="admin@example.com"
                            {...field}
                            data-testid="input-email"
                          />
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
                        <Label>Password</Label>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            data-testid="input-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isPending}
                    data-testid="button-submit-auth"
                  >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isLogin ? "Sign In" : "Create Account"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
          {!showVerification && !showForgotPassword && !showResetPassword && (
            <CardFooter className="flex flex-col gap-2 border-t py-4">
              {isLogin && (
                <Button
                  variant="link"
                  className="text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowForgotPassword(true);
                    form.reset();
                  }}
                  data-testid="button-forgot-password"
                >
                  Forgot Password?
                </Button>
              )}
              <Button
                variant="link"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setIsLogin(!isLogin);
                  form.reset();
                }}
                data-testid="button-toggle-auth-mode"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </Button>
            </CardFooter>
          )}
          {(showForgotPassword || showResetPassword) && (
            <CardFooter className="flex justify-center border-t py-4">
              <Button
                variant="link"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setShowForgotPassword(false);
                  setShowResetPassword(false);
                  setIsLogin(true);
                  setResetEmail("");
                  setResetCode("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                data-testid="button-back-to-login"
              >
                Back to Login
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
