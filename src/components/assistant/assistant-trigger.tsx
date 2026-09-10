"use client";

import { Sparkles } from "lucide-react";

import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

import { useAssistant } from "./assistant-provider";

/** The sidebar entry that opens the assistant drawer. Present on every signed-in page. */
export function AssistantTrigger() {
  const { open, setOpen } = useAssistant();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={open}
        tooltip="Assistant"
        onClick={() => {
          // On a phone the sidebar is itself a sheet; close it so the drawer is not behind it.
          if (isMobile) setOpenMobile(false);
          setOpen(true);
        }}
      >
        <Sparkles aria-hidden />
        <span>Assistant</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
