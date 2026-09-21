/**
 * The one browser test, and the only test that calls the model (spec, Testing Decisions):
 * sign in as the Meadows nurse, open a hero resident, ask the assistant a fixed question, and
 * see an answer with a source chip linking back to the resident. Needs the hosted project and
 * a Claude API key; skipped with a reason otherwise. The thread the question creates, its
 * messages, and their access events are removed with the service role when done.
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { DEMO_ACCOUNTS } from "../src/lib/demo-accounts";
import { heroResidentId } from "../src/lib/seed/heroes";
import { hostedProjectSkipReason, missingHostedVariables } from "../src/test/env";

import type { Database } from "../src/lib/supabase/database.types";

const missing = missingHostedVariables({ anthropic: true });
const nurse = DEMO_ACCOUNTS.find((account) => account.key === "nurse-meadows")!;
const harold = heroResidentId("doe-meadows");
const QUESTION = "When was his last podiatry assessment?";

test.describe("the assistant, end to end", () => {
  test.skip(missing.length > 0, hostedProjectSkipReason(missing));

  const startedAt = new Date().toISOString();

  test.afterAll(async () => {
    await removeThreadsSince(startedAt);
  });

  test("a nurse asks about a hero resident and gets an answer with a source chip", async ({
    page,
  }) => {
    await page.goto("/login");
    await page
      .getByRole("listitem")
      .filter({ hasText: nurse.email })
      .getByRole("button", { name: "Sign in" })
      .click();
    await expect(page.getByRole("heading", { name: `Welcome, ${nurse.firstName}` })).toBeVisible();

    await page.goto(`/residents/${harold}`);
    await expect(page.getByRole("heading", { name: "Harold Doe" })).toBeVisible();

    await page.getByRole("button", { name: "Assistant", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Assistant" })).toBeVisible();

    const composer = drawer.getByRole("textbox", { name: "Your question" });
    await composer.fill(QUESTION);
    await composer.press("Enter");
    await expect(drawer.getByText(QUESTION)).toBeVisible();

    // Chips render once the answer is complete, so one chip is a finished, sourced answer.
    const chips = drawer.getByRole("list", { name: "Sources" }).getByRole("link");
    await expect(chips.first()).toBeVisible({ timeout: 90_000 });
    await expect(chips.filter({ hasText: "Harold Doe" }).first()).toHaveAttribute(
      "href",
      new RegExp(`^/residents/${harold}`),
    );
    await expect(drawer.getByRole("alert")).toHaveCount(0);
  });
});

/** Removes the nurse's threads started since `since`, with their messages and access events. */
async function removeThreadsSince(since: string) {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) return;
  const service = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-caredesk-audit": "skip" } },
  });
  const { data: staff } = await service
    .from("staff")
    .select("id")
    .eq("email", nurse.email)
    .single();
  if (!staff) return;
  const { data: threads } = await service
    .from("assistant_threads")
    .select("id")
    .eq("staff_id", staff.id)
    .gte("created_at", since);
  const threadIds = (threads ?? []).map((thread) => thread.id);
  if (threadIds.length === 0) return;
  const { data: messages } = await service
    .from("assistant_messages")
    .select("id")
    .in("thread_id", threadIds);
  const messageIds = (messages ?? []).map((message) => message.id);
  if (messageIds.length > 0) {
    await service.from("audit_events").delete().in("record_id", messageIds);
    await service.from("assistant_messages").delete().in("id", messageIds);
  }
  await service.from("assistant_threads").delete().in("id", threadIds);
}
