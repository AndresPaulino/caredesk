import type { ResidentFlag, ResidentFlagKey } from "@/lib/clinical/flags";
import { cn } from "@/lib/utils";

/**
 * Wristband-coloured chips: red allergy, yellow fall risk, purple DNR (ADR 0005). The band is
 * the colour a nurse recognises; the word is always there, so colour is never the only signal.
 */
const FLAG_STYLES: Record<ResidentFlagKey, { chip: string; band: string }> = {
  allergy: {
    chip: "bg-flag-allergy-soft text-flag-allergy-ink border-flag-allergy-band/30",
    band: "bg-flag-allergy-band",
  },
  "fall-risk": {
    chip: "bg-flag-fall-soft text-flag-fall-ink border-flag-fall-band/40",
    band: "bg-flag-fall-band",
  },
  dnr: {
    chip: "bg-flag-dnr-soft text-flag-dnr-ink border-flag-dnr-band/30",
    band: "bg-flag-dnr-band",
  },
};

export function ResidentFlagChip({
  flag,
  compact = false,
}: {
  flag: ResidentFlag;
  /** In the list: the short word only ("Allergy", not "Allergy: Penicillin V"). */
  compact?: boolean;
}) {
  const style = FLAG_STYLES[flag.key];
  const label = compact ? COMPACT_LABELS[flag.key](flag) : flag.label;
  return (
    <span
      title={flag.detail}
      data-flag={flag.key}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border pr-2.5 pl-1 text-xs font-medium whitespace-nowrap",
        style.chip,
      )}
    >
      <span aria-hidden className={cn("h-3.5 w-1.5 shrink-0 rounded-full", style.band)} />
      <span className="truncate">{label}</span>
      {compact && <span className="sr-only">. {flag.detail}</span>}
    </span>
  );
}

const COMPACT_LABELS: Record<ResidentFlagKey, (flag: ResidentFlag) => string> = {
  allergy: () => "Allergy",
  "fall-risk": () => "Fall risk",
  dnr: (flag) => flag.label,
};

export function ResidentFlags({
  flags,
  compact = false,
  className,
}: {
  flags: ResidentFlag[];
  compact?: boolean;
  className?: string;
}) {
  if (flags.length === 0) return null;
  return (
    <ul aria-label="Flags" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {flags.map((flag) => (
        <li key={flag.key} className="max-w-full">
          <ResidentFlagChip flag={flag} compact={compact} />
        </li>
      ))}
    </ul>
  );
}
