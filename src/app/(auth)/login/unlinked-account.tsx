import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";

/** Shown when an auth user exists but no staff record points at it, so sign-in cannot proceed. */
export function UnlinkedAccount({ email }: { email: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No staff record for {email}</CardTitle>
        <CardDescription>
          You are signed in, but this account is not linked to a staff member, so there is nothing
          it may see. Sign out and use one of the demo accounts, or run the seed to relink it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
