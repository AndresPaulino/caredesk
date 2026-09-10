"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { VITAL_RANGES } from "@/lib/clinical/vital-ranges";
import { formatMonthDay, formatShortDateTime } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

/*
 * Two small charts rather than one with two axes: blood pressure and pulse share a scale
 * (mmHg and beats per minute both sit in the 50 to 200 band), oxygen saturation does not.
 * Series colors are the validated categorical slots (blue, orange, aqua), stepped for dark mode.
 */

const pressureConfig = {
  systolic: { label: "Systolic", theme: { light: "#2a78d6", dark: "#3987e5" } },
  diastolic: { label: "Diastolic", theme: { light: "#eb6834", dark: "#d95926" } },
  pulse: { label: "Pulse", theme: { light: "#1baf7a", dark: "#199e70" } },
} satisfies ChartConfig;

const saturationConfig = {
  oxygen_saturation: { label: "Oxygen saturation", theme: { light: "#2a78d6", dark: "#3987e5" } },
} satisfies ChartConfig;

const PRESSURE_SERIES = ["systolic", "diastolic", "pulse"] as const;

/** Legend and tooltip rows in series order (the default sorts them by name). */
const bySeriesOrder = (item: { dataKey?: unknown }) =>
  PRESSURE_SERIES.indexOf(item.dataKey as (typeof PRESSURE_SERIES)[number]);

type Reading = Pick<
  Tables<"vitals">,
  "id" | "taken_at" | "systolic" | "diastolic" | "pulse" | "oxygen_saturation"
>;

export function VitalsCharts({ vitals }: { vitals: Reading[] }) {
  const data = [...vitals]
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
    .map((reading) => ({
      ...reading,
      tick: formatMonthDay(reading.taken_at),
      takenAt: formatShortDateTime(reading.taken_at),
    }));

  return (
    <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
      <figure className="rounded-xl border bg-card p-4">
        <figcaption className="mb-2 text-sm font-medium">Blood pressure and pulse</figcaption>
        <ChartContainer config={pressureConfig} className="aspect-auto h-56 w-full">
          <LineChart
            data={data}
            accessibilityLayer
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="tick"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis width={32} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <ChartTooltip
              itemSorter={bySeriesOrder}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.takenAt}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} itemSorter={bySeriesOrder} />
            {PRESSURE_SERIES.map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </figure>

      <figure className="rounded-xl border bg-card p-4">
        <figcaption className="mb-2 text-sm font-medium">Oxygen saturation</figcaption>
        <ChartContainer config={saturationConfig} className="aspect-auto h-56 w-full">
          <LineChart
            data={data}
            accessibilityLayer
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="tick"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              width={32}
              tickLine={false}
              axisLine={false}
              domain={[80, 100]}
              tickFormatter={(value: number) => `${value}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.takenAt}
                  formatter={(value) => (
                    <span className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">Oxygen saturation</span>
                      <span className="font-mono font-medium tabular-nums">{value}%</span>
                    </span>
                  )}
                />
              }
            />
            <ReferenceLine
              y={VITAL_RANGES.oxygen_saturation[0]}
              stroke="var(--border)"
              label={{
                value: `${VITAL_RANGES.oxygen_saturation[0]}% floor`,
                position: "insideBottomRight",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="oxygen_saturation"
              stroke="var(--color-oxygen_saturation)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </figure>
    </div>
  );
}
