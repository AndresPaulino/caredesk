import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SyntheticDataBanner } from "@/components/app-shell/synthetic-data-banner";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { safeNextPath } from "@/lib/auth/next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";
import { UnlinkedAccount } from "./unlinked-account";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  const staff = await getCurrentStaff();
  if (staff) redirect(nextPath);

  // Signed in, but no staff record is linked to this auth user: say so instead of looping.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const unlinkedEmail = data?.claims ? String(data.claims.email ?? "this account") : null;

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <SyntheticDataBanner />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex items-center gap-2 self-center font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <HeartPulse className="size-4" aria-hidden />
            </div>
            CareDesk
            <span className="font-normal text-muted-foreground">for Willowbrook Care</span>
          </div>
          {unlinkedEmail ? (
            <UnlinkedAccount email={unlinkedEmail} />
          ) : (
            <LoginForm next={nextPath} />
          )}
        </div>
      </div>
    </div>
  );
}
