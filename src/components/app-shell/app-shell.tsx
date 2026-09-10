import { HeartPulse } from "lucide-react";
import Link from "next/link";

import { MainNav } from "./main-nav";
import { SyntheticDataBanner } from "./synthetic-data-banner";

/** The frame every page renders inside: synthetic-data banner, header with navigation, content. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SyntheticDataBanner />
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <HeartPulse className="size-5 text-primary" aria-hidden />
            <span>CareDesk</span>
            <span className="hidden font-normal text-muted-foreground sm:inline">
              Willowbrook Care
            </span>
          </Link>
          <MainNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
