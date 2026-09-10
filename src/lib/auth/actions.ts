"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { safeNextPath } from "./next-path";

export type SignInState = {
  error?: string;
  /** Echoed back so the form keeps what was typed. */
  email?: string;
} | null;

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/** Signs a staff member in with email and password, then sends them where they were going. */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const typedEmail = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { error: "Enter your email address and password.", email: typedEmail };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return {
      error: "That email and password do not match a staff account.",
      email: parsed.data.email,
    };
  }

  redirect(safeNextPath(parsed.data.next));
}

/** Ends the session so the next person at the workstation starts fresh. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
