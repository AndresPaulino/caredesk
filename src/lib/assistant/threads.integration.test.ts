/**
 * Saved threads and assistant access events on the hosted project: a nurse's thread holds
 * its turns and comes back as the drawer showed them; nobody else, the admin included, can
 * read or continue it; every question and tool call becomes an audit event attributed to the
 * nurse that reads in the resident's trail and in the activity feed within the resident's
 * scope, or, for a lookup about nobody in particular, to the nurse and the admin only.
 *
 * Skipped without `.env.local`. Removes the thread, its messages, and its events with the
 * service role when done.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";

import { describeHosted } from "../../test/hosted-project";
import { getActivityEntries, getAuditTrail } from "../audit/events";
import { toFeedEntry } from "../audit/feed";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import { heroResidentId } from "../seed";

import {
  ThreadNotFoundError,
  finishAnswer,
  listThreads,
  loadThread,
  recordAccess,
  startTurn,
} from "./threads";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

type Client = SupabaseClient<Database>;

async function signIn(account: DemoAccount): Promise<Client> {
  const client = createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`Could not sign in as ${account.email}: ${error.message}`);
  return client;
}

const harold = heroResidentId("doe-meadows");
const walter = heroResidentId("doe-harbor");
const account = (key: DemoAccount["key"]) => DEMO_ACCOUNTS.find((a) => a.key === key)!;

describeHosted("assistant threads and access events", { secretKey: true }, () => {
  let nurse: Client;
  let harborNurse: Client;
  let admin: Client;
  let nurseStaffId: string;
  let threadId: string | null = null;
  let questionId: string;
  let questionEventId: string;
  let lookupEventId: string;
  const answerId = crypto.randomUUID();

  beforeAll(async () => {
    [nurse, harborNurse, admin] = await Promise.all([
      signIn(account("nurse-meadows")),
      signIn(account("nurse-harbor")),
      signIn(account("admin")),
    ]);
    const { data: user } = await nurse.auth.getUser();
    const { data: staff } = await nurse
      .from("staff")
      .select("id")
      .eq("auth_user_id", user.user!.id)
      .single();
    nurseStaffId = staff!.id;
  });

  afterAll(async () => {
    if (threadId) {
      const service = createClient<Database>(url!, secretKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: messages } = await service
        .from("assistant_messages")
        .select("id")
        .eq("thread_id", threadId);
      const messageIds = (messages ?? []).map((row) => row.id);
      if (messageIds.length > 0) {
        await service.from("audit_events").delete().in("record_id", messageIds);
        await service.from("assistant_messages").delete().in("id", messageIds);
      }
      await service.from("assistant_threads").delete().eq("id", threadId);
    }
    await Promise.all([nurse.auth.signOut(), harborNurse.auth.signOut(), admin.auth.signOut()]);
  });

  it("starts a thread with the question, records it, and saves the answer as shown", async () => {
    const question = "When was his last podiatry exam?";
    const turn = await startTurn(nurse, {
      threadId: null,
      staffId: nurseStaffId,
      question,
      residentId: harold,
    });
    threadId = turn.thread.id;
    questionId = turn.questionId;
    expect(turn.thread.title).toBe(question);
    expect(turn.history).toEqual([{ role: "user", content: question }]);
    expect(turn.answerPosition).toBe(1);

    questionEventId = await recordAccess(nurse, {
      questionId,
      residentId: harold,
      details: { kind: "question", threadId, question },
    });
    lookupEventId = await recordAccess(nurse, {
      questionId,
      residentId: null,
      details: {
        kind: "tool_call",
        threadId,
        tool: "find_residents",
        input: { query: "Doe" },
        summary: "searched residents for “Doe”",
        tab: null,
      },
    });

    await finishAnswer(nurse, {
      id: answerId,
      threadId,
      position: turn.answerPosition,
      residentId: harold,
      content: "May 2, 2026 (131 days ago). It is overdue.",
      steps: [
        {
          id: "toolu_1",
          name: "get_assessments",
          label: "Read 2 podiatry assessments for Harold Doe",
          status: "done",
        },
      ],
      sources: [{ residentId: harold, residentName: "Harold Doe", tab: null }],
      ended: "end_turn",
      error: null,
    });

    const threads = await listThreads(nurse);
    expect(threads.find((entry) => entry.id === threadId)).toMatchObject({
      title: question,
      questionCount: 1,
    });

    const loaded = await loadThread(nurse, threadId);
    expect(loaded).toEqual({
      id: threadId,
      title: question,
      messages: [
        {
          id: questionId,
          role: "user",
          content: question,
          resident: { id: harold, name: "Harold Doe" },
        },
        {
          id: answerId,
          role: "assistant",
          content: "May 2, 2026 (131 days ago). It is overdue.",
          steps: [
            {
              id: "toolu_1",
              name: "get_assessments",
              label: "Read 2 podiatry assessments for Harold Doe",
              status: "done",
            },
          ],
          sources: [{ residentId: harold, residentName: "Harold Doe", tab: null }],
          error: null,
          cutShort: null,
          pending: false,
        },
      ],
    });
  });

  it("continues the thread with the turns so far", async () => {
    const next = await startTurn(nurse, {
      threadId,
      staffId: nurseStaffId,
      question: "And his last physician visit?",
      residentId: harold,
    });
    expect(next.thread.id).toBe(threadId);
    expect(next.history.map((turn) => turn.role)).toEqual(["user", "assistant", "user"]);
    expect(next.answerPosition).toBe(3);
  });

  it("is invisible to everyone else, the admin included", async () => {
    expect(await loadThread(harborNurse, threadId!)).toBeNull();
    expect(await loadThread(admin, threadId!)).toBeNull();
    expect((await listThreads(admin)).some((entry) => entry.id === threadId)).toBe(false);
    await expect(
      startTurn(harborNurse, { threadId, staffId: nurseStaffId, question: "Hi", residentId: null }),
    ).rejects.toBeInstanceOf(ThreadNotFoundError);
  });

  it("refuses an access event for someone else's message or for a resident outside scope", async () => {
    await expect(
      recordAccess(harborNurse, {
        questionId,
        residentId: null,
        details: { kind: "question", threadId: threadId!, question: "forged" },
      }),
    ).rejects.toThrow(/not in one of your threads/);
    await expect(
      recordAccess(nurse, {
        questionId,
        residentId: walter,
        details: { kind: "question", threadId: threadId!, question: "about Walter" },
      }),
    ).rejects.toThrow(/not in your scope/);
  });

  it("attributes the question to the nurse in the resident's trail, for the nurse and the admin", async () => {
    for (const reader of [nurse, admin]) {
      const trail = await getAuditTrail(reader, harold, { limit: 50 });
      const event = trail.entries.find((entry) => entry.id === questionEventId);
      expect(event).toMatchObject({
        operation: "access",
        table_name: "assistant_messages",
        record_id: questionId,
        actor: expect.objectContaining({ first_name: "Maria", last_name: "Alvarez" }),
        story: {
          kind: "accessed",
          summary: "asked the assistant about the resident: “When was his last podiatry exam?”",
          recordLabel: "Assistant question",
          tab: null,
        },
      });
      expect(
        toFeedEntry({
          ...event!,
          resident: { id: harold, first_name: "Harold", last_name: "Doe" },
        }),
      ).toMatchObject({
        actor: "Maria Alvarez, RN",
        href: `/residents/${harold}`,
      });
    }
    const harborTrail = await getAuditTrail(harborNurse, harold, { limit: 50 });
    expect(harborTrail.entries).toEqual([]);
  });

  it("shows a lookup about nobody in particular to the nurse and the admin only", async () => {
    const mine = await getActivityEntries(nurse, [lookupEventId]);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      resident_id: null,
      resident: null,
      story: {
        kind: "accessed",
        summary: "searched residents for “Doe” through the assistant",
        recordLabel: "Assistant lookup",
      },
    });
    expect(toFeedEntry(mine[0]).href).toBeNull();
    expect(await getActivityEntries(admin, [lookupEventId])).toHaveLength(1);
    expect(await getActivityEntries(harborNurse, [lookupEventId])).toEqual([]);
  });

  it("keeps access events append-only and out of a signed-in user's hands", async () => {
    const forged = await nurse.from("audit_events").insert({
      actor_id: nurseStaffId,
      resident_id: harold,
      table_name: "assistant_messages",
      record_id: questionId,
      operation: "access",
      new_values: { kind: "question", threadId, question: "forged" },
    });
    expect(forged.error).not.toBeNull();
    const erased = await nurse.from("audit_events").delete().eq("id", questionEventId);
    expect(erased.error ?? erased.count).not.toBe(1);
    expect(await getActivityEntries(nurse, [questionEventId])).toHaveLength(1);
  });
});
