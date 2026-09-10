"use client";

import type { Column, RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DataTableFeatures } from "./data-table";

/** A column header that sorts when the column allows it, otherwise plain text. */
export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-2.5 h-8 data-[sorted=true]:text-foreground", className)}
      data-sorted={Boolean(sorted)}
      onClick={() => column.toggleSorting(sorted === "asc")}
      aria-label={`Sort by ${title}`}
    >
      {title}
      <Icon className={cn("size-3.5", !sorted && "text-muted-foreground")} aria-hidden />
    </Button>
  );
}
