"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const SEGMENT_LABELS: Record<string, string> = {
  residents: "Residents",
  health: "System health",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Crumb = { href: string; label: string };

/** Breadcrumb trail from the path: Dashboard / Residents / Resident. */
export function crumbsFor(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ href: "/", label: "Dashboard" }];
  const segments = pathname.split("/").filter(Boolean);
  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const label = UUID.test(segment)
      ? singular(SEGMENT_LABELS[segments[index - 1] ?? ""] ?? "Record")
      : (SEGMENT_LABELS[segment] ?? segment);
    crumbs.push({ href, label });
  });
  return crumbs;
}

function singular(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

/** Sticky top bar of the signed-in frame: sidebar toggle and breadcrumb. */
export function AppHeader() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2">
      <div className="flex items-center gap-2 px-4 md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <Fragment key={crumb.href}>
                  {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                  <BreadcrumbItem className={last ? undefined : "hidden md:block"}>
                    {last ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={crumb.href} />}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
