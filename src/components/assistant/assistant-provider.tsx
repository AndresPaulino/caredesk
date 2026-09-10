"use client";

import { createContext, useContext, useMemo, useState } from "react";

import type { CurrentResident } from "@/lib/assistant/protocol";

/**
 * What the shell shares about the assistant: whether the drawer is open, so the sidebar
 * trigger can open it from any page, and the current resident, which a resident page
 * registers while it is shown so the drawer can pass it along with each question.
 */
type AssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  currentResident: CurrentResident | null;
  setCurrentResident: (resident: CurrentResident | null) => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [currentResident, setCurrentResident] = useState<CurrentResident | null>(null);
  const value = useMemo(
    () => ({ open, setOpen, currentResident, setCurrentResident }),
    [open, currentResident],
  );
  return <AssistantContext value={value}>{children}</AssistantContext>;
}

export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useAssistant must be used inside an AssistantProvider");
  return context;
}
