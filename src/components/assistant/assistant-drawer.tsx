"use client";

import {
  Check,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Square,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { MAX_QUESTION_LENGTH } from "@/lib/assistant/protocol";
import { SUGGESTED_PROMPTS } from "@/lib/assistant/suggested-prompts";
import { cn } from "@/lib/utils";

import { useAssistant } from "./assistant-provider";
import {
  useAssistantThread,
  type AssistantMessage,
  type ThreadMessage,
  type ToolStep,
} from "./use-assistant-thread";

/**
 * The assistant drawer: a sheet from the right, on every signed-in page, holding one thread.
 * The thread and any answer in flight survive closing the drawer and moving between pages;
 * only the sheet's content unmounts. The current resident, when a resident page registered
 * one, goes with every question so pronouns resolve.
 */
export function AssistantDrawer() {
  const { open, setOpen, currentResident } = useAssistant();
  const thread = useAssistantThread();
  const streaming = thread.status === "streaming";

  const ask = (question: string) => void thread.ask(question, currentResident?.id ?? null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b pr-20">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" aria-hidden />
            Assistant
          </SheetTitle>
          <SheetDescription>
            Ask about residents&apos; records. Answers come only from the records you can see.
          </SheetDescription>
          {thread.messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-11"
              onClick={thread.reset}
              aria-label="Start a new thread"
              title="New thread"
            >
              <RotateCcw />
            </Button>
          )}
        </SheetHeader>

        <MessageList messages={thread.messages} onSuggestion={ask} disabled={streaming} />

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
  disabled,
}: {
  messages: ThreadMessage[];
  onSuggestion: (prompt: string) => void;
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
          <li key={message.id} className="flex justify-end">
            <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
              {message.content}
            </p>
          </li>
        ) : (
          <li key={message.id}>
            <Answer message={message} />
          </li>
        ),
      )}
      <div ref={bottomRef} />
    </ol>
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
        Ask in plain language about a resident&apos;s assessments, medications, vitals, or
        allergies. To start:
      </p>
      <ul className="space-y-2">
        {SUGGESTED_PROMPTS.map(({ prompt }) => (
          <li key={prompt}>
            <Button
              variant="outline"
              className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal"
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
} as const;

function Answer({ message }: { message: AssistantMessage }) {
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
    </div>
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
