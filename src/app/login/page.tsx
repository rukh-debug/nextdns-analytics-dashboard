import { Suspense } from "react";
import { redirect } from "next/navigation";
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthEnabled } from "@/lib/auth";

export default function LoginPage() {
  if (!isAuthEnabled()) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/favicon.png"
            alt="NDNS"
            width={44}
            height={44}
            className="rounded-xl"
          />
          <div className="text-center">
            <h1 className="text-lg font-bold tracking-tight">NDNS Analytics</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Sign in to continue</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
