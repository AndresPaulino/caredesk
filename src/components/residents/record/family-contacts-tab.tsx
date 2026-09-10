import { Mail, Phone, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FAMILY_RELATIONSHIP_LABELS } from "@/lib/clinical/labels";
import type { Tables } from "@/lib/supabase/database.types";

import { AddFamilyContactButton, FamilyContactActions } from "../care/family-contact-form";
import { RecordEmpty, RecordPanel } from "./record-panel";

/** Who to call, primary contact first. */
export function FamilyContactsTab({
  residentId,
  contacts,
}: {
  residentId: string;
  contacts: Tables<"family_contacts">[];
}) {
  return (
    <RecordPanel
      title="Family contacts"
      description="Relatives and guardians on record."
      actions={<AddFamilyContactButton residentId={residentId} />}
    >
      {contacts.length === 0 ? (
        <RecordEmpty
          icon={Users}
          title="No family contacts"
          description="No relative or guardian has been recorded for this resident."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((contact) => (
            <Card key={contact.id} size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {contact.first_name} {contact.last_name}
                  {contact.is_primary && <Badge variant="secondary">Primary</Badge>}
                </CardTitle>
                <CardDescription>
                  {FAMILY_RELATIONSHIP_LABELS[contact.relationship]}
                </CardDescription>
                <CardAction>
                  <FamilyContactActions residentId={residentId} contact={contact} />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="flex items-center gap-2">
                  <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                  <a
                    href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                    className="hover:underline"
                  >
                    {contact.phone}
                  </a>
                </p>
                {contact.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                    <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                      {contact.email}
                    </a>
                  </p>
                )}
                {contact.notes && <p className="text-muted-foreground">{contact.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RecordPanel>
  );
}
