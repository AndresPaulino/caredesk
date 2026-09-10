/**
 * Normal ranges for a set of vitals, in the units the database stores (Fahrenheit, pounds).
 * A reading outside its range is what the dashboard means by "out of range".
 */

export type VitalReading =
  "systolic" | "diastolic" | "pulse" | "temperature_f" | "respiratory_rate" | "oxygen_saturation";

export const VITAL_RANGES: Readonly<Record<VitalReading, readonly [low: number, high: number]>> = {
  systolic: [90, 140],
  diastolic: [55, 90],
  pulse: [55, 100],
  temperature_f: [96.5, 100.4],
  respiratory_rate: [10, 22],
  oxygen_saturation: [90, 100],
};

export const VITAL_LABELS: Readonly<Record<VitalReading, string>> = {
  systolic: "Systolic",
  diastolic: "Diastolic",
  pulse: "Pulse",
  temperature_f: "Temperature",
  respiratory_rate: "Respiratory rate",
  oxygen_saturation: "Oxygen saturation",
};

export type VitalValues = Readonly<Record<VitalReading, number>>;

/** The readings in a set that fall outside their normal range, in display order. */
export function outOfRangeReadings(vitals: VitalValues): VitalReading[] {
  return (Object.keys(VITAL_RANGES) as VitalReading[]).filter((reading) => {
    const [low, high] = VITAL_RANGES[reading];
    const value = vitals[reading];
    return value < low || value > high;
  });
}
