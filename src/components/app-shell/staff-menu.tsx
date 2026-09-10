"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth/actions";

export type StaffMenuProps = {
  staff: {
    fullName: string;
    initials: string;
    email: string;
    roleLabel: string;
    scopeDescription: string;
  };
};

/** The signed-in staff member at the foot of the sidebar, with sign-out. */
export function StaffMenu({ staff }: StaffMenuProps) {
  const { isMobile } = useSidebar();
  const [pending, startTransition] = useTransition();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />}
          >
            <Avatar>
              <AvatarFallback>{staff.initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{staff.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{staff.roleLabel}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-64"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    <AvatarFallback>{staff.initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{staff.fullName}</span>
                    <span className="truncate text-xs text-muted-foreground">{staff.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <div className="px-1.5 py-1 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{staff.roleLabel}</div>
              <div>Scope: {staff.scopeDescription}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onClick={() => startTransition(() => signOut())}>
              <LogOut aria-hidden />
              {pending ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
