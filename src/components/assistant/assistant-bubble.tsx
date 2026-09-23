"use client";

import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { useAssistant } from "./assistant-provider";

/**
 * The assistant's one entry point on every signed-in page: a bubble fixed to the bottom right,
 * so it stays in reach while a long record scrolls. On a resident's page it names them, since
 * the question will be about them. Hidden while the drawer is open.
 */
export function AssistantBubble() {
  const { open, setOpen, currentResident } = useAssistant();
  const firstName = currentResident?.name.split(" ")[0];
  const label = firstName ? `Ask about ${firstName}` : "Ask the assistant";

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={label}
      aria-hidden={open}
      tabIndex={open ? -1 : 0}
      className={cn(
        "fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full bg-primary p-2 text-primary-foreground shadow-lg ring-1 shadow-willow-900/25 ring-willow-900/10 transition-[translate,opacity,box-shadow] outline-none hover:shadow-xl focus-visible:ring-4 focus-visible:ring-ring/40 sm:right-6 sm:bottom-6 sm:pr-5",
        open && "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-white/15"
      >
        <Sparkles className="size-5" />
      </span>
      <span className="hidden text-sm font-semibold sm:inline">{label}</span>
    </button>
  );
}
