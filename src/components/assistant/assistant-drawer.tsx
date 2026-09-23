"use client";

import {
  ArrowLeft,
  Check,
  CircleAlert,
  FileText,
  History,
  LoaderCircle,
  MessageSquareText,
  SendHorizontal,
  Sparkles,
  Square,
  SquarePen,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { listAssistantThreads } from "@/lib/assistant/actions";
import { MAX_QUESTION_LENGTH, type SourceRef, type ThreadSummary } from "@/lib/assistant/protocol";
import { SUGGESTED_PROMPTS } from "@/lib/assistant/suggested-prompts";
import { formatShortDateTime } from "@/lib/format";
import { RECORD_TABS, residentHref } from "@/lib/residents/record-tabs";
import { cn } from "@/lib/utils";

import { useAssistant } from "./assistant-provider";
import {
  useAssistantThread,
  type AssistantMessage,
  type ThreadMessage,
  type ToolStep,
  type UserMessage,
} from "./use-assistant-thread";

/**
 * The assistant drawer: a sheet from the right, on every signed-in page, holding one thread.
 * The thread and any answer in flight survive closing the drawer and moving between pages;
 * only the sheet's content unmounts. Every turn is saved, so the drawer can also list past
 * threads and resume one. The current resident, when a resident page registered one, goes
 * with every question so pronouns resolve; every answer carries chips linking to the records
 * it relied on.
 */
export function AssistantDrawer() {
  const { open, setOpen, currentResident } = useAssistant();
  const thread = useAssistantThread();
  const [view, setView] = useState<"thread" | "threads">("thread");
  const streaming = thread.status === "streaming";

  const ask = (question: string) => {
    setView("thread");
    void thread.ask(question, currentResident);
  };
  const resume = async (id: string) => {
    if (await thread.resume(id)) setView("thread");
  };
  const startNew = () => {
    thread.reset();
    setView("thread");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b bg-willow-50 pr-28">
          <SheetTitle className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
            >
              <Sparkles className="size-4" />
            </span>
            Assistant
          </SheetTitle>
          <SheetDescription>
            Ask about residents&apos; records. Answers come only from the records you can see.
          </SheetDescription>
          <div className="absolute top-3 right-11 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setView(view === "threads" ? "thread" : "threads")}
              disabled={streaming}
              aria-label={view === "threads" ? "Back to the thread" : "Past threads"}
              aria-pressed={view === "threads"}
              title={view === "threads" ? "Back to the thread" : "Past threads"}
            >
              {view === "threads" ? <ArrowLeft /> : <History />}
            </Button>
            {(thread.messages.length > 0 || thread.thread) && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={startNew}
                aria-label="Start a new thread"
                title="New thread"
              >
                <SquarePen />
              </Button>
            )}
          </div>
        </SheetHeader>

        {view === "threads" ? (
          <ThreadList currentId={thread.thread?.id ?? null} onResume={resume} />
        ) : thread.status === "loading" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-busy>
            <Skeleton className="ml-auto h-10 w-2/3 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          <MessageList
            messages={thread.messages}
            onSuggestion={ask}
            onNavigate={() => setOpen(false)}
            disabled={streaming}
          />
        )}

        <SheetFooter className="gap-3 border-t">
          {currentResident && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRound className="size-3.5" aria-hidden />
              Asking about{" "}
              <span className="font-medium text-foreground">{currentResident.name}</span>
            </p>
          )}
          <Composer streaming={streaming} onAsk={ask} onStop={thread.stop} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MessageList({
  messages,
  onSuggestion,
  onNavigate,
  disabled,
}: {
  messages: ThreadMessage[];
  onSuggestion: (prompt: string) => void;
  /** Called when a source chip is followed, so the drawer can get out of the way. */
  onNavigate: () => void;
  disabled: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  const lastContent = last?.content;
  const lastSteps = last?.role === "assistant" ? last.steps.length : 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastContent, lastSteps]);

  if (messages.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <SuggestedPrompts onPick={onSuggestion} disabled={disabled} />
      </div>
    );
  }

  return (
    <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
      {messages.map((message) =>
        message.role === "user" ? (
          <li key={message.id}>
            <Question message={message} />
          </li>
        ) : (
          <li key={message.id}>
            <Answer message={message} onNavigate={onNavigate} />
          </li>
        ),
      )}
      <div ref={bottomRef} />
    </ol>
  );
}

function Question({ message }: { message: UserMessage }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
        {message.content}
      </p>
      {message.resident && (
        <p className="text-xs text-muted-foreground">About {message.resident.name}</p>
      )}
    </div>
  );
}

function SuggestedPrompts({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ask in plain language about a resident&apos;s assessments, medications, vitals, allergies,
        labs, incidents, notes, appointments, family contacts, or audit trail, or about a whole
        unit. To start:
      </p>
      <ul className="space-y-2">
        {SUGGESTED_PROMPTS.map(({ prompt }) => (
          <li key={prompt}>
            <Button
              variant="outline"
              className="h-auto w-full justify-start bg-card px-3 py-2.5 text-left font-normal whitespace-normal hover:border-primary/40 hover:bg-willow-50"
              disabled={disabled}
              onClick={() => onPick(prompt)}
            >
              {prompt}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CUT_SHORT_NOTES = {
  max_tokens: "The answer was cut short.",
  max_iterations: "The assistant stopped before finishing its lookups. Try a narrower question.",
  stopped: "Stopped.",
  interrupted: "The assistant did not finish this answer.",
} as const;

function Answer({ message, onNavigate }: { message: AssistantMessage; onNavigate: () => void }) {
  const thinking = message.pending && !message.content && !message.steps.length;

  return (
    <div className="space-y-2">
      {message.steps.length > 0 && <StatusLine steps={message.steps} pending={message.pending} />}
      {thinking && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Thinking…
        </p>
      )}
      {message.content && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      )}
      {message.cutShort && (
        <p className="text-xs text-muted-foreground">{CUT_SHORT_NOTES[message.cutShort]}</p>
      )}
      {message.error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{message.error.message}</AlertTitle>
        </Alert>
      )}
      {!message.pending && message.sources.length > 0 && (
        <SourceChips sources={message.sources} onNavigate={onNavigate} />
      )}
    </div>
  );
}

/** One chip per resident and record tab the answer relied on, linking there. */
function SourceChips({ sources, onNavigate }: { sources: SourceRef[]; onNavigate: () => void }) {
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Sources">
      {sources.map((source) => {
        const tab = source.tab
          ? RECORD_TABS.find((candidate) => candidate.key === source.tab)
          : null;
        return (
          <li key={`${source.residentId}:${source.tab ?? ""}`}>
            <Badge
              variant="outline"
              className="h-6 border-willow-100 bg-willow-50 text-willow-900 [a]:hover:bg-willow-100 [a]:hover:text-willow-900"
              render={
                <Link
                  href={residentHref(source.residentId, tab?.key)}
                  onClick={onNavigate}
                  title={
                    tab
                      ? `Open ${tab.label.toLowerCase()} for ${source.residentName}`
                      : `Open ${source.residentName}`
                  }
                />
              }
            >
              <FileText data-icon="inline-start" aria-hidden />
              {source.residentName}
              {tab && <span className="text-muted-foreground">· {tab.label}</span>}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** Each tool as it runs, then as a record of what the answer relied on. */
function StatusLine({ steps, pending }: { steps: ToolStep[]; pending: boolean }) {
  return (
    <ol
      className="space-y-1 text-xs text-muted-foreground"
      aria-label="What the assistant looked up"
    >
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-1.5">
          <StepIcon status={step.status} />
          <span className={cn(step.status === "running" && pending && "text-foreground")}>
            {step.label}
            {step.status === "running" && "…"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ status }: { status: ToolStep["status"] }) {
  const className = "mt-0.5 size-3.5 shrink-0";
  switch (status) {
    case "running":
      return <LoaderCircle className={cn(className, "animate-spin")} aria-hidden />;
    case "done":
      return <Check className={className} aria-hidden />;
    case "failed":
      return <CircleAlert className={cn(className, "text-destructive")} aria-hidden />;
  }
}

/** The caller's saved threads, most recent first; picking one resumes it. */
function ThreadList({
  currentId,
  onResume,
}: {
  currentId: string | null;
  onResume: (id: string) => Promise<void>;
}) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [resuming, setResuming] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    listAssistantThreads()
      .then((loaded) => {
        if (!disposed) setThreads(loaded);
      })
      .catch((error: unknown) => {
        console.error("[assistant] could not list threads", error);
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const pick = async (id: string) => {
    setResuming(id);
    try {
      await onResume(id);
    } finally {
      setResuming(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Past threads</h3>
      {failed ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Your threads could not be loaded. Try again.</AlertTitle>
        </Alert>
      ) : threads === null ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No saved threads yet. Every question you ask starts or continues one.
        </p>
      ) : (
        <ul className="space-y-2">
          {threads.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted disabled:opacity-60",
                  entry.id === currentId && "border-primary/40 bg-muted/60",
                )}
                onClick={() => void pick(entry.id)}
                disabled={resuming !== null}
                aria-current={entry.id === currentId ? "true" : undefined}
              >
                {resuming === entry.id ? (
                  <LoaderCircle
                    className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <MessageSquareText
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{entry.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {entry.questionCount} {entry.questionCount === 1 ? "question" : "questions"}
                    {" · "}
                    {formatShortDateTime(entry.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({
  streaming,
  onAsk,
  onStop,
}: {
  streaming: boolean;
  onAsk: (question: string) => void;
  onStop: () => void;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = () => {
    const question = draft.trim();
    if (!question || streaming) return;
    onAsk(question);
    setDraft("");
  };

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={textareaRef}
        name="question"
        aria-label="Your question"
        placeholder="Ask about a resident…"
        rows={2}
        maxLength={MAX_QUESTION_LENGTH}
        className="min-h-0 flex-1 resize-none"
        value={draft}
        disabled={streaming}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {streaming ? (
        <Button type="button" variant="outline" size="icon" onClick={onStop} aria-label="Stop">
          <Square />
        </Button>
      ) : (
        <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send">
          <SendHorizontal />
        </Button>
      )}
    </form>
  );
}
