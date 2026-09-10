import { UserX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Out-of-scope and nonexistent residents look the same: not found. */
export default function ResidentNotFound() {
  return (
    <Empty className="min-h-[50vh] rounded-xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UserX aria-hidden />
        </EmptyMedia>
        <EmptyTitle>Resident not found</EmptyTitle>
        <EmptyDescription>
          No resident with this link is visible to you. It may not exist, or it may be outside your
          scope.
        </EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" nativeButton={false} render={<Link href="/residents" />}>
        Back to residents
      </Button>
    </Empty>
  );
}
