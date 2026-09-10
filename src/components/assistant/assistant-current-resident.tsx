"use client";

import { useEffect } from "react";

import { useAssistant } from "./assistant-provider";

/**
 * Rendered by a resident's page: registers that resident as the assistant's current resident
 * for as long as the page is shown, so "his last exam" resolves without naming him.
 */
export function AssistantCurrentResident({ id, name }: { id: string; name: string }) {
  const { setCurrentResident } = useAssistant();

  useEffect(() => {
    setCurrentResident({ id, name });
    return () => setCurrentResident(null);
  }, [id, name, setCurrentResident]);

  return null;
}
