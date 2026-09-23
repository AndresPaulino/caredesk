import { Skeleton } from "@/components/ui/skeleton";

/** The shape of the record while it streams in: details, timeline, summary, tabs. */
export function ResidentRecordSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading the clinical record">
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="order-last h-96 rounded-xl lg:order-none" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-full max-w-3xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
