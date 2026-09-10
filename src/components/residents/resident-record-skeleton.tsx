import { Skeleton } from "@/components/ui/skeleton";

/** The shape of the record while it streams in: cards, timeline, summary, tabs. */
export function ResidentRecordSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading the clinical record">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="order-last h-96 rounded-xl lg:order-none" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-full max-w-3xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
