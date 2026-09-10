import { cookies } from "next/headers";

import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { SyntheticDataBanner } from "@/components/app-shell/synthetic-data-banner";
import { AssistantDrawer } from "@/components/assistant/assistant-drawer";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireStaff } from "@/lib/auth/current-staff";

const ROLE_LABELS = { nurse: "Nurse", admin: "Admin", physician: "Physician" } as const;

/**
 * The signed-in frame: sidebar, banner, header, content, and the assistant drawer. Redirects to
 * login without a session.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider>
      <AssistantProvider>
        <SidebarProvider defaultOpen={sidebarOpen}>
          <AppSidebar
            staff={{
              fullName: staff.fullName,
              initials: staff.initials,
              email: staff.email,
              roleLabel: staff.credentials
                ? `${ROLE_LABELS[staff.role]}, ${staff.credentials}`
                : ROLE_LABELS[staff.role],
              scopeDescription: staff.scopeDescription,
            }}
          />
          <SidebarInset className="min-w-0">
            <SyntheticDataBanner />
            <AppHeader />
            <div className="flex flex-1 flex-col gap-6 p-4 pt-2 md:p-6 md:pt-2">{children}</div>
          </SidebarInset>
          {/* Opened from the sidebar on any page (ticket 10). */}
          <AssistantDrawer />
          {/* Confirms each recorded change (ticket 05). */}
          <Toaster position="bottom-right" />
        </SidebarProvider>
      </AssistantProvider>
    </TooltipProvider>
  );
}
