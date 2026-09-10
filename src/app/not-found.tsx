import Link from "next/link";

import { SyntheticDataBanner } from "@/components/app-shell/synthetic-data-banner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <SyntheticDataBanner />
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>There is nothing at this address.</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
          Back to CareDesk
        </Button>
      </Empty>
    </div>
  );
}
