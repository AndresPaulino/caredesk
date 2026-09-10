import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Previous/next controls for a list the server pages. Links keep the state in the URL. */
export function DataTablePagination({
  page,
  pageCount,
  pageSize,
  total,
  hrefForPage,
  noun,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
  /** Plural noun for the summary line, for example "residents". */
  noun: string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        {total === 0
          ? `No ${noun}`
          : `Showing ${first}–${last} of ${total.toLocaleString("en-US")} ${noun}`}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <span>
            Page {page} of {pageCount}
          </span>
          <PageButton href={page > 1 ? hrefForPage(page - 1) : null} label="Previous page">
            <ChevronLeft aria-hidden />
          </PageButton>
          <PageButton href={page < pageCount ? hrefForPage(page + 1) : null} label="Next page">
            <ChevronRight aria-hidden />
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <Button variant="outline" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="icon-sm"
      nativeButton={false}
      render={<Link href={href} />}
      aria-label={label}
    >
      {children}
    </Button>
  );
}
