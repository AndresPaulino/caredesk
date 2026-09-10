"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useCareForm, type FormAction } from "./use-care-form";

/**
 * A dialog for the one-decision actions: discontinue an order, cancel an appointment, remove a
 * record. The action runs with the hidden fields it needs and closes the dialog on success.
 * Extra fields (a note, say) can be passed as children.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  fields,
  confirmLabel,
  pendingLabel,
  destructive = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  action: FormAction;
  fields: Record<string, string>;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  const form = useCareForm({ action, onSuccess: () => onOpenChange(false) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={form.formAction} noValidate className="grid gap-4">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          {form.formError && (
            <p role="alert" className="text-sm text-destructive">
              {form.formError}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Go back</DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={form.pending}
            >
              {form.pending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
