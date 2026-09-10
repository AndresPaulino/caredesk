import { HeartPulse } from "lucide-react";
import Link from "next/link";

import { SyntheticDataBanner } from "@/components/app-shell/synthetic-data-banner";
import { Button } from "@/components/ui/button";

/** Frame for pages that need no sign-in, such as the health page. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SyntheticDataBanner />
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <HeartPulse className="size-5 text-primary" aria-hidden />
            <span>CareDesk</span>
            <span className="hidden font-normal text-muted-foreground sm:inline">
              Willowbrook Care
            </span>
          </Link>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/" />}>
            Open CareDesk
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
