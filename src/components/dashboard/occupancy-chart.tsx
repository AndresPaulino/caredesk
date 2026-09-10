"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatOccupancy, type OccupancyGroup } from "@/lib/dashboard/occupancy";

/*
 * One horizontal bar per facility (or per unit for a nurse): residents filling beds. Residents
 * are the validated blue slot; the free beds are a lighter step of the same ramp so the bar
 * reads as a meter. The name sits above each bar and the count and percentage at its end,
 * drawn as plain SVG text so nothing wraps, and the bar keeps the width at any screen size.
 */

const config = {
  residents: { label: "Residents", theme: { light: "#2a78d6", dark: "#3987e5" } },
  free: { label: "Free beds", theme: { light: "#86b6ef", dark: "#184f95" } },
} satisfies ChartConfig;

const ROW_HEIGHT = 46;
const BAR_SIZE = 14;
/** Room for the caption at the end of a full bar. */
const CAPTION_WIDTH = 104;

type Row = OccupancyGroup & { free: number; caption: string };

/** What recharts hands a label renderer for one bar. */
type LabelBox = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
};

const box = (props: LabelBox) => ({
  x: Number(props.x ?? 0),
  y: Number(props.y ?? 0),
  width: Number(props.width ?? 0),
  height: Number(props.height ?? 0),
  value: String(props.value ?? ""),
});

/** The group's name, above the bar. */
function NameLabel(props: LabelBox) {
  const { x, y, value } = box(props);
  return (
    <text x={x} y={y - 6} fontSize={12} fill="var(--muted-foreground)">
      {value}
    </text>
  );
}

/** "150 of 160 · 94%", after the end of the bar. */
function CaptionLabel(props: LabelBox) {
  const { x, y, width, height, value } = box(props);
  return (
    <text x={x + width + 8} y={y + height / 2} dy={4} fontSize={12} fill="var(--foreground)">
      {value}
    </text>
  );
}

export function OccupancyChart({ groups }: { groups: OccupancyGroup[] }) {
  const data: Row[] = groups.map((group) => ({
    ...group,
    free: Math.max(0, group.beds - group.residents),
    caption: `${group.residents} of ${group.beds} · ${formatOccupancy(group.occupancy)}`,
  }));

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: data.length * ROW_HEIGHT + 8 }}
    >
      <BarChart
        data={data}
        layout="vertical"
        accessibilityLayer
        barSize={BAR_SIZE}
        margin={{ top: 12, right: CAPTION_WIDTH, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide domain={[0, (max: number) => Math.max(max, 1)]} />
        <YAxis type="category" dataKey="label" hide />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as Row | undefined;
            if (!active || !row) return null;
            return (
              <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                <p className="font-medium">{row.label}</p>
                <p className="text-muted-foreground">
                  {row.residents} residents in {row.beds} beds, {formatOccupancy(row.occupancy)}{" "}
                  occupied
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="residents"
          stackId="beds"
          fill="var(--color-residents)"
          radius={[4, 0, 0, 4]}
          isAnimationActive={false}
        >
          <LabelList dataKey="label" content={NameLabel} />
        </Bar>
        <Bar
          dataKey="free"
          stackId="beds"
          fill="var(--color-free)"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        >
          <LabelList dataKey="caption" content={CaptionLabel} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
