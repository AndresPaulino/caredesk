"use client";

import { Activity, HeartPulse, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AssistantTrigger } from "@/components/assistant/assistant-trigger";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { ShiftCard } from "./shift-card";
import { StaffMenu, type StaffMenuProps } from "./staff-menu";

const navigation = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Residents", href: "/residents", icon: Users },
] as const;

const secondary = [{ title: "System health", href: "/health", icon: Activity }] as const;

/**
 * The left rail in willow: brand, the current shift, navigation, the assistant, and the
 * signed-in staff member. Collapses to icons.
 */
export function AppSidebar({
  staff,
  serverNow,
}: {
  staff: StaffMenuProps["staff"];
  /** The request's instant, so the shift card's first render matches the server's. */
  serverNow: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />} tooltip="CareDesk">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <HeartPulse className="size-4" aria-hidden />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-base font-bold tracking-tight">CareDesk</span>
                <span className="truncate text-xs text-sidebar-muted-foreground">
                  Willowbrook Care
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <ShiftCard serverNow={serverNow} scope={staff.scopeDescription} />
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted-foreground">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <item.icon aria-hidden />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <AssistantTrigger />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondary.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    size="sm"
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <item.icon aria-hidden />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <StaffMenu staff={staff} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
