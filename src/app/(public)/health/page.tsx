import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkAnthropicConfiguration } from "@/lib/anthropic";
import { serverEnv } from "@/lib/env/server";
import { formatDateTime } from "@/lib/format";
import { checkDatabase } from "@/lib/health";

export const metadata: Metadata = { title: "Health" };

// Every visit runs the checks again; nothing on this page may be cached.
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const checkedAt = new Date();
  const database = await checkDatabase();
  const anthropic = checkAnthropicConfiguration();
  const supabaseHost = new URL(serverEnv.NEXT_PUBLIC_SUPABASE_URL).host;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System health</h1>
        <p className="text-muted-foreground">
          Checked {formatDateTime(checkedAt)}. Reload to run the checks again.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StatusCard
          title="Database"
          ok={database.ok}
          description={`Hosted Supabase project ${supabaseHost}`}
        >
          {database.ok ? (
            <Facts
              rows={[
                ["Database time", formatDateTime(database.databaseTime)],
                ["Reported as", <code key="iso">{database.databaseTime}</code>],
                ["Round trip", `${database.latencyMs} ms`],
              ]}
            />
          ) : (
            <p className="text-sm text-destructive">{database.error}</p>
          )}
        </StatusCard>

        <StatusCard title="Assistant" ok={anthropic.ok} description="Anthropic SDK configuration">
          <Facts
            rows={[
              ["Model", <code key="model">{anthropic.model}</code>],
              [
                "API key",
                anthropic.ok
                  ? "Present and well-formed. Not sent to the API, so no request is billed."
                  : anthropic.reason,
              ],
            ]}
          />
        </StatusCard>
      </div>

      <p className="text-xs text-muted-foreground">
        The same checks are available as JSON at <code>/api/health</code>.
      </p>
    </div>
  );
}

function StatusCard({
  title,
  description,
  ok,
  children,
}: {
  title: string;
  description: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {title}
          <Badge variant={ok ? "secondary" : "destructive"}>{ok ? "Healthy" : "Failing"}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Facts({ rows }: { rows: Array<[label: string, value: React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
