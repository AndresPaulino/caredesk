import { Info } from "lucide-react";

/** Persistent notice that CareDesk is a demonstration and every record is synthetic. */
export function SyntheticDataBanner() {
  return (
    <div role="note" className="border-b border-willow-100 bg-willow-50 text-willow-900">
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs sm:px-6">
        <Info className="size-3.5 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Demonstration only.</span> Every resident, staff member,
          and record in CareDesk is synthetic. Willowbrook Care is fictional, and this is not a
          medical product.
        </p>
      </div>
    </div>
  );
}
