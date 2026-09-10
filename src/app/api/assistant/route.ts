import { getAnthropicClient } from "@/lib/anthropic";
import { assistantRequestSchema, encodeEvent, type AssistantEvent } from "@/lib/assistant/protocol";
import { runAssistant } from "@/lib/assistant/run";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { serverEnv } from "@/lib/env/server";
import { getResident } from "@/lib/residents/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The assistant's one endpoint. The drawer posts the thread; the answer streams back as
 * newline-delimited JSON events (see `protocol.ts`). Everything runs as the signed-in staff
 * member: the tools read through their session, and the current resident is resolved through
 * it too, so a resident the caller may not see is simply no current resident.
 */
export async function POST(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return Response.json({ error: "Sign in to use the assistant." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "The question could not be read." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const residentRow = parsed.data.residentId
    ? await getResident(supabase, parsed.data.residentId)
    : null;
  const resident = residentRow ? { id: residentRow.id, name: residentRow.full_name } : null;

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AssistantEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          open = false;
        }
      };

      emit({ type: "context", resident });
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
        messages: parsed.data.messages,
        signal: abort.signal,
        emit,
      });
      open = false;
      controller.close();
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
