import { TriangleAlert } from "lucide-react";

/** Persistent notice that CareDesk is a demonstration and every record is synthetic. */
export function SyntheticDataBanner() {
  return (
    <div
      role="note"
      className="border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-xs sm:px-6">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Demonstration only.</span> Every resident, staff member,
          and record in CareDesk is synthetic. Willowbrook Care is fictional, and this is not a
          medical product.
        </p>
      </div>
    </div>
  );
}
