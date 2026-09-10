"use client";

import { CircleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button, type buttonVariants } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import type { CareForm as CareFormState } from "./use-care-form";

import type { VariantProps } from "class-variance-authority";

/**
 * Create and edit flows open in a sheet beside the resident page, so the page stays in place
 * and the change shows behind the sheet the moment it lands (ADR 0004).
 */
export function CareSheet({
  open,
  onOpenChange,
  title,
  description,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** For forms with two columns of fields. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          "w-full data-[side=right]:sm:max-w-md",
          wide && "data-[side=right]:sm:max-w-xl",
        )}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** A button that opens a sheet holding one form. The form is given a way to close it. */
export function RecordSheetButton({
  label,
  icon: Icon,
  title,
  description,
  variant = "outline",
  size = "sm",
  wide,
  className,
  children,
}: {
  label: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  wide?: boolean;
  className?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Icon data-icon="inline-start" aria-hidden />
        {label}
      </Button>
      <CareSheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        wide={wide}
      >
        {children(() => setOpen(false))}
      </CareSheet>
    </>
  );
}

/**
 * The body of a form inside a sheet: hidden fields, the visible fields in a scrolling area,
 * and a footer with the buttons that stays put. Browser validation is off so that every
 * message comes from the shared schema, next to its field.
 */
export function CareForm({
  form,
  hidden,
  submitLabel,
  pendingLabel,
  children,
}: {
  form: CareFormState;
  hidden: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  return (
    <form action={form.formAction} noValidate className="flex min-h-0 flex-1 flex-col">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <FieldGroup>{children}</FieldGroup>
      </div>
      <SheetFooter className="border-t">
        {form.formError && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>{form.formError}</AlertTitle>
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SheetClose render={<Button type="button" variant="outline" />}>Cancel</SheetClose>
          <Button type="submit" disabled={form.pending}>
            {form.pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}
