"use client";

import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { useAssistant } from "./assistant-provider";

/**
 * The assistant's one entry point on every signed-in page: a bubble fixed to the bottom right,
 * so it stays in reach while a long record scrolls. On a resident's page it names them, since
 * the question will be about them. Just the icon at rest, so it covers as little of the page as
 * possible; the label slides out on hover or keyboard focus. Hidden while the drawer is open.
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
        "group fixed right-4 bottom-4 z-40 flex items-center rounded-full bg-primary p-2 text-primary-foreground shadow-lg ring-1 shadow-willow-900/25 ring-willow-900/10 transition-[translate,opacity,box-shadow] outline-none hover:shadow-xl focus-visible:ring-4 focus-visible:ring-ring/40 sm:right-6 sm:bottom-6",
        open && "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-white/15"
      >
        <Sparkles className="size-5" />
      </span>
      {/* Collapsed to zero width at rest; the grid column animates to the label's own width. */}
      <span
        aria-hidden
        className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr] motion-reduce:transition-none"
      >
        <span className="overflow-hidden">
          <span className="block pr-3 pl-2.5 text-sm font-semibold whitespace-nowrap">{label}</span>
        </span>
      </span>
    </button>
  );
}
