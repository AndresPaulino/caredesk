"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth/actions";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";

/** Email and password sign-in, with the demo accounts one click away. */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Staff sign-in</CardTitle>
          <CardDescription>What you can see depends on who you are.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <input type="hidden" name="next" value={next} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@willowbrook.example"
                  defaultValue={state?.email ?? ""}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              {state?.error && <FieldError>{state.error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Demo accounts</CardTitle>
          <CardDescription>
            Pick one to sign in as. The password for every account is{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{DEMO_PASSWORD}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {DEMO_ACCOUNTS.map((account) => (
              <li
                key={account.key}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{account.scopeLabel}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {account.email}
                  </div>
                </div>
                <form action={formAction}>
                  <input type="hidden" name="next" value={next} />
                  <input type="hidden" name="email" value={account.email} />
                  <input type="hidden" name="password" value={account.password} />
                  <Button type="submit" variant="outline" size="sm" disabled={pending}>
                    <LogIn data-icon="inline-start" aria-hidden />
                    Sign in
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <FieldDescription className="px-6 text-center">
        A nurse sees only residents on their units. An admin sees the whole operator. The database
        enforces it, not the screens.
      </FieldDescription>
    </div>
  );
}
