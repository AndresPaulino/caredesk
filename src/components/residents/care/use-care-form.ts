"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { IDLE_FORM_STATE, parseForm, type FieldErrors, type FormState } from "@/lib/care/schemas";

export type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

export type CareForm = {
  state: FormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  /** Messages by field name, empty unless the last submission was invalid. */
  errors: FieldErrors;
  /** A message that belongs to the whole form rather than to one field. */
  formError: string | null;
};

type SuccessState = Extract<FormState, { status: "success" }>;

/**
 * Wires a form to its server action. The submitted fields are checked against the schema in
 * the browser first, so a mistake is explained without a round trip, and the server checks the
 * same schema again before writing. A success is confirmed with a toast and `onSuccess` runs
 * (usually to close the sheet); the resident page itself is refreshed by the action.
 *
 * A form with no fields of its own (a one-click button) can set `toastErrors` so that a
 * failure is still shown somewhere.
 */
export function useCareForm({
  schema,
  action,
  onSuccess,
  toastErrors = false,
}: {
  schema?: z.ZodType;
  action: FormAction;
  onSuccess?: (state: SuccessState) => void;
  toastErrors?: boolean;
}): CareForm {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      if (schema) {
        const parsed = parseForm(schema, formData);
        if (!parsed.success) return { status: "invalid", fieldErrors: parsed.fieldErrors };
      }
      const result = await action(previous, formData);
      if (result.status === "success") {
        toast.success(result.message);
        onSuccess?.(result);
      } else if (toastErrors) {
        toast.error(describe(result));
      }
      return result;
    },
    IDLE_FORM_STATE,
  );

  const errors = state.status === "invalid" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.message : (errors._form?.join(" ") ?? null);
  return { state, formAction, pending, errors, formError };
}

function describe(state: FormState): string {
  if (state.status === "error") return state.message;
  if (state.status === "invalid") {
    return Object.values(state.fieldErrors)[0]?.[0] ?? "Something in the form is not valid.";
  }
  return "Something went wrong.";
}
