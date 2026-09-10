"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatMonthDay, formatShortDateTime } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

/* One test at a time, one series, with its reference range as a wash behind the line. */

const config = {
  value: { label: "Result", theme: { light: "#2a78d6", dark: "#3987e5" } },
  range: { label: "Reference range", theme: { light: "#1baf7a", dark: "#199e70" } },
} satisfies ChartConfig;

type LabResult = Pick<
  Tables<"lab_results">,
  | "id"
  | "code"
  | "description"
  | "value"
  | "units"
  | "reference_low"
  | "reference_high"
  | "resulted_at"
>;

export type LabTrend = {
  code: string;
  description: string;
  units: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  results: LabResult[];
};

/** The tests with at least two results, most results first, so a trend has something to show. */
export function labTrends(results: LabResult[]): LabTrend[] {
  const byCode = new Map<string, LabResult[]>();
  for (const result of results) {
    const list = byCode.get(result.code);
    if (list) list.push(result);
    else byCode.set(result.code, [result]);
  }
  return [...byCode.values()]
    .filter((list) => list.length >= 2)
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.resulted_at.localeCompare(b.resulted_at));
      const latest = sorted[sorted.length - 1];
      return {
        code: latest.code,
        description: latest.description,
        units: latest.units,
        referenceLow: latest.reference_low,
        referenceHigh: latest.reference_high,
        results: sorted,
      };
    })
    .sort(
      (a, b) => b.results.length - a.results.length || a.description.localeCompare(b.description),
    );
}

export function LabTrendChart({ trends }: { trends: LabTrend[] }) {
  const [code, setCode] = useState(trends[0]?.code ?? "");
  const trend = trends.find((candidate) => candidate.code === code) ?? trends[0];
  if (!trend) return null;

  const data = trend.results.map((result) => ({
    id: result.id,
    value: result.value,
    tick: formatMonthDay(result.resulted_at),
    resultedAt: formatShortDateTime(result.resulted_at),
  }));
  const values = data.map((point) => point.value);
  const low = Math.min(...values, trend.referenceLow ?? Infinity);
  const high = Math.max(...values, trend.referenceHigh ?? -Infinity);
  const pad = Math.max((high - low) * 0.15, 0.5);

  return (
    <figure className="rounded-xl border bg-card p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {trend.description} trend
          <span className="ml-2 font-normal text-muted-foreground">
            {trend.results.length} results, {trend.units}
            {describeRange(trend) && `, reference ${describeRange(trend)}`}
          </span>
        </span>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Test
          <NativeSelect
            size="sm"
            value={trend.code}
            onChange={(event) => setCode(event.target.value)}
          >
            {trends.map((option) => (
              <NativeSelectOption key={option.code} value={option.code}>
                {option.description}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </figcaption>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart data={data} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            domain={[Math.floor(low - pad), Math.ceil(high + pad)]}
          />
          {trend.referenceLow !== null && trend.referenceHigh !== null ? (
            <ReferenceArea
              y1={trend.referenceLow}
              y2={trend.referenceHigh}
              fill="var(--color-range)"
              fillOpacity={0.1}
              stroke="none"
            />
          ) : (
            <ReferenceLine
              y={trend.referenceLow ?? trend.referenceHigh ?? 0}
              stroke="var(--color-range)"
              strokeOpacity={0.6}
            />
          )}
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => payload?.[0]?.payload?.resultedAt}
                formatter={(value) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{trend.description}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {value} {trend.units}
                    </span>
                  </span>
                )}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
            activeDot={{ r: 5, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </figure>
  );
}

/** "70–99", "≤ 200", "≥ 40", or null without a range. */
export function describeRange(range: {
  referenceLow: number | null;
  referenceHigh: number | null;
}) {
  if (range.referenceLow !== null && range.referenceHigh !== null) {
    return `${range.referenceLow}–${range.referenceHigh}`;
  }
  if (range.referenceHigh !== null) return `≤ ${range.referenceHigh}`;
  if (range.referenceLow !== null) return `≥ ${range.referenceLow}`;
  return null;
}
