import { Building2, HeartPulse, ShieldCheck, Users } from "lucide-react";
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
    <div className="flex min-h-svh flex-col bg-background">
      <SyntheticDataBanner />
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <BrandPanel />
        <div className="flex flex-col items-center justify-center gap-6 p-6 md:p-10">
          <div className="flex w-full max-w-md flex-col gap-6">
            <div className="flex items-center gap-2 self-center font-semibold lg:hidden">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
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
    </div>
  );
}

/** The willow half on a wide screen: what CareDesk is, in the operator's colours. */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-willow-900 p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <HeartPulse className="size-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-lg font-bold text-white">CareDesk</p>
          <p className="text-sm text-sidebar-muted-foreground">Willowbrook Care</p>
        </div>
      </div>

      <div className="max-w-md space-y-6">
        <h1 className="text-4xl leading-tight font-bold tracking-tight text-white xl:text-5xl">
          Every resident&apos;s record, one question away.
        </h1>
        <p className="max-w-sm text-lg leading-relaxed text-sidebar-foreground">
          Care records for six Willowbrook homes, with an assistant that answers from the record and
          shows where each answer came from.
        </p>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3">
            <Users className="mt-0.5 size-4 shrink-0 text-sidebar-primary" aria-hidden />
            <span>Nurses see the residents on their own units.</span>
          </li>
          <li className="flex gap-3">
            <Building2 className="mt-0.5 size-4 shrink-0 text-sidebar-primary" aria-hidden />
            <span>Admins see every facility.</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sidebar-primary" aria-hidden />
            <span>The database enforces both, and every change is kept in the audit trail.</span>
          </li>
        </ul>
      </div>

      <p className="text-xs text-sidebar-muted-foreground">
        A demonstration on synthetic data. Willowbrook Care is fictional.
      </p>
      {/* A willow branch drawn in the brand's lighter step, behind the text. */}
      <svg
        aria-hidden
        viewBox="0 0 200 400"
        className="pointer-events-none absolute -top-6 -right-16 h-[70%] text-sidebar-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M150 0 C 140 120, 120 220, 60 400" />
        {Array.from({ length: 11 }, (_, index) => {
          const t = (index + 1) / 12;
          const y = t * 380;
          const x = 150 - 90 * t * t;
          return (
            <g key={index}>
              <path d={`M${x} ${y} q -22 18 -26 52`} />
              <path d={`M${x} ${y} q 20 16 22 50`} />
            </g>
          );
        })}
      </svg>
    </aside>
  );
}
