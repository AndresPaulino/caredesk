import { getAnthropicClient } from "@/lib/anthropic";
import {
  assistantRequestSchema,
  encodeEvent,
  mergeSources,
  type AssistantEvent,
  type SourceRef,
  type ThreadError,
  type ToolStep,
} from "@/lib/assistant/protocol";
import { runAssistant } from "@/lib/assistant/run";
import {
  ThreadNotFoundError,
  finishAnswer,
  recordAccess,
  startTurn,
  type FinishedAnswer,
} from "@/lib/assistant/threads";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { serverEnv } from "@/lib/env/server";
import { getResident } from "@/lib/residents/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The assistant's one endpoint. The drawer posts a question with the thread it continues; the
 * answer streams back as newline-delimited JSON events (see `protocol.ts`). Everything runs as
 * the signed-in staff member: the tools read through their session, the thread is theirs, and
 * the current resident is resolved through it too, so a resident the caller may not see is
 * simply no current resident.
 *
 * Before the model runs, the question is saved in the thread and written to the audit trail
 * as an assistant access event; each tool call is written the same way before its result
 * reaches the model; and when the turn ends, however it ends, the answer is saved as the
 * drawer showed it, so the thread can be resumed.
 */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return Response.json({ error: "Sign in to use the assistant." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "The question could not be read." }, { status: 400 });
  }
  const { question } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const residentRow = parsed.data.residentId
    ? await getResident(supabase, parsed.data.residentId)
    : null;
  const resident = residentRow ? { id: residentRow.id, name: residentRow.full_name } : null;

  let turn;
  try {
    turn = await startTurn(supabase, {
      threadId: parsed.data.threadId ?? null,
      staffId: staff.id,
      question,
      residentId: resident?.id ?? null,
    });
  } catch (error) {
    if (error instanceof ThreadNotFoundError) {
      return Response.json({ error: "That thread could not be found." }, { status: 404 });
    }
    console.error("[assistant] could not save the question", error);
    return Response.json({ error: "The question could not be saved." }, { status: 500 });
  }

  try {
    await recordAccess(supabase, {
      questionId: turn.questionId,
      residentId: resident?.id ?? null,
      details: { kind: "question", threadId: turn.thread.id, question },
    });
  } catch (error) {
    console.error("[assistant] could not record the question", error);
    return Response.json(
      { error: "The question could not be recorded in the audit trail." },
      { status: 500 },
    );
  }

  const answerId = crypto.randomUUID();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();

  // The answer as the drawer sees it, kept here too so it can be saved whatever happens to
  // the connection.
  const answer: Omit<FinishedAnswer, "ended"> & { ended: FinishedAnswer["ended"] | null } = {
    id: answerId,
    threadId: turn.thread.id,
    position: turn.answerPosition,
    residentId: resident?.id ?? null,
    content: "",
    steps: [],
    sources: [],
    ended: null,
    error: null,
  };
  const record = (event: AssistantEvent) => {
    switch (event.type) {
      case "text":
        answer.content += event.text;
        break;
      case "tool":
        answer.steps = upsertStep(answer.steps, event);
        if (event.sources) answer.sources = mergeSources(answer.sources, event.sources);
        break;
      case "done":
        answer.ended = event.stopReason;
        break;
      case "error":
        answer.ended = "error";
        answer.error = { kind: event.kind, message: event.message } satisfies ThreadError;
        break;
      case "context":
        break;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AssistantEvent) => {
        record(event);
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          open = false;
        }
      };

      emit({
        type: "context",
        thread: turn.thread,
        questionId: turn.questionId,
        answerId,
        resident,
      });
      await runAssistant({
        client: getAnthropicClient(),
        model: serverEnv.ANTHROPIC_MODEL,
        supabase,
        now: new Date(),
        staff: {
          fullName: staff.fullName,
          role: staff.role,
          scopeDescription: staff.scopeDescription,
        },
        resident,
        messages: turn.history,
        signal: abort.signal,
        emit,
        onAccess: async (access) => {
          await recordAccess(supabase, {
            questionId: turn.questionId,
            residentId: access.residentId,
            details: {
              kind: "tool_call",
              threadId: turn.thread.id,
              tool: access.tool,
              input: access.input,
              summary: access.summary,
              tab: access.tab,
            },
          });
        },
      });
      open = false;
      controller.close();

      // A turn stopped from the drawer, or by a dropped connection, is still an answer.
      const ended = answer.ended ?? (abort.signal.aborted ? "stopped" : "error");
      const steps = answer.steps.map((step) =>
        step.status === "running" ? { ...step, status: "failed" as const } : step,
      );
      try {
        await finishAnswer(supabase, { ...answer, steps, ended });
      } catch (error) {
        console.error("[assistant] could not save the answer", error);
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Tells a proxy in front of the app not to buffer the stream.
      "X-Accel-Buffering": "no",
    },
  });
}

function upsertStep(steps: ToolStep[], event: Extract<AssistantEvent, { type: "tool" }>) {
  const step: ToolStep = {
    id: event.id,
    name: event.name,
    label: event.label,
    status: event.status,
  };
  return steps.some((existing) => existing.id === event.id)
    ? steps.map((existing) => (existing.id === event.id ? step : existing))
    : [...steps, step];
}

// Referenced so an unused-import lint never hides a shape change in the protocol.
export type { SourceRef };
