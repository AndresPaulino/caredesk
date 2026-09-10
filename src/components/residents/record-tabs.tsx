"use client";

import { useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RECORD_TABS,
  RECORD_TAB_PARAM,
  parseRecordTab,
  type RecordTabKey,
} from "@/lib/residents/record-tabs";

/**
 * The record tabs. The URL is the source of truth for the active tab: a click rewrites
 * `?tab=` in place (no navigation, no scroll), and a link to `?tab=labs` from the timeline or
 * an assistant source chip opens that tab.
 */
export function RecordTabs({
  counts,
  panels,
}: {
  counts: Partial<Record<RecordTabKey, number>>;
  panels: Record<RecordTabKey, React.ReactNode>;
}) {
  const searchParams = useSearchParams();
  const active = parseRecordTab(searchParams.get(RECORD_TAB_PARAM) ?? undefined);

  const selectTab = (value: RecordTabKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set(RECORD_TAB_PARAM, value);
    window.history.replaceState(null, "", url);
  };

  return (
    <Tabs value={active} onValueChange={(value) => selectTab(value as RecordTabKey)}>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <TabsList aria-label="Record types" className="md:h-auto md:flex-wrap">
          {RECORD_TABS.map((tab) => {
            const count = counts[tab.key];
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="px-2.5">
                {tab.label}
                {count !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {RECORD_TABS.map((tab) => (
        <TabsContent key={tab.key} value={tab.key} className="pt-2">
          {panels[tab.key]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
