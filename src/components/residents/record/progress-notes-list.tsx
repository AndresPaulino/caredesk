import { NotebookPen } from "lucide-react";

import { formatShortDateTime, formatStaffName } from "@/lib/format";
import type { ClinicalRecord } from "@/lib/residents/clinical-record";

import { WriteProgressNoteButton } from "../care/progress-note-form";
import { RecordEmpty, RecordPanel } from "./record-panel";

/** Free-text notes read better as a list than as table rows. */
export function ProgressNotesList({
  residentId,
  notes,
  canRecord,
}: {
  residentId: string;
  notes: ClinicalRecord["progress_notes"];
  canRecord: boolean;
}) {
  return (
    <RecordPanel
      title="Progress notes"
      description="What each shift wrote, newest first."
      actions={canRecord && <WriteProgressNoteButton residentId={residentId} />}
    >
      {notes.length === 0 ? (
        <RecordEmpty
          icon={NotebookPen}
          title="No progress notes"
          description="No note has been written about this resident."
        />
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {formatStaffName(note.staff) ?? "No staff member recorded"}
                </span>
                <time dateTime={note.written_at}>{formatShortDateTime(note.written_at)}</time>
              </div>
              <p className="mt-2 text-sm whitespace-pre-line">{note.body}</p>
            </li>
          ))}
        </ol>
      )}
    </RecordPanel>
  );
}
