import type { LucideIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** One record tab's content: a heading line, then the table, chart, or list. */
export function RecordPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Shown in place of a table when a resident has no records of a type. */
export function RecordEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Empty className="rounded-xl border bg-card py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Wraps free text in a table cell so it wraps instead of stretching the row. */
export function WrappedText({
  children,
  className = "min-w-64 max-w-prose",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`block whitespace-normal ${className}`}>{children}</span>;
}
