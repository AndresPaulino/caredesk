import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ALLERGY_SEVERITY_LABELS } from "@/lib/clinical/labels";
import type { AllergyConflict } from "@/lib/clinical/allergy-conflicts";
import { residentHref } from "@/lib/residents/record-tabs";

/** The flag a nurse must see before harm: an active order names a documented allergen. */
export function AllergyConflictAlert({
  residentId,
  conflicts,
}: {
  residentId: string;
  conflicts: AllergyConflict[];
}) {
  if (conflicts.length === 0) return null;
  const orders = new Set(conflicts.map((conflict) => conflict.orderId)).size;

  return (
    <Alert variant="destructive" className="border-destructive/40">
      <TriangleAlert aria-hidden />
      <AlertTitle>
        Allergy conflict:{" "}
        {orders === 1
          ? "an active medication order names"
          : `${orders} active medication orders name`}{" "}
        a documented allergen
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {conflicts.map((conflict) => (
            <li key={`${conflict.allergyId}:${conflict.orderId}`}>
              <span className="font-medium text-destructive">{conflict.medication}</span> conflicts
              with the {conflict.allergy} allergy
              {conflict.severity && ` (${ALLERGY_SEVERITY_LABELS[conflict.severity].toLowerCase()}`}
              {conflict.severity && conflict.reaction && `, ${conflict.reaction.toLowerCase()}`}
              {conflict.severity && ")"}.
            </li>
          ))}
        </ul>
        <p className="mt-1">
          Review the{" "}
          <Link href={residentHref(residentId, "medications")} scroll={false}>
            medication orders
          </Link>{" "}
          and{" "}
          <Link href={residentHref(residentId, "allergies")} scroll={false}>
            allergies
          </Link>
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}
