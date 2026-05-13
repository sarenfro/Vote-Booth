import { useListElections } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useSearch } from "wouter";
import { format } from "date-fns";
import { useMemberIdContext } from "@/hooks/use-member-id";
import { useMe } from "@/hooks/use-me";

export function Home() {
  const { memberId } = useMemberIdContext();
  const { data: me, isError: meError, isFetching: meFetching } = useMe(memberId);
  const { data: elections, isLoading } = useListElections();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isAdmin = searchParams.get("admin") === "true";

  if (!memberId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <p className="text-lg font-medium">Enter your NetID to access the voting booth.</p>
      </div>
    );
  }

  if (meFetching) return null;

  if (meError || !me) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Active Ballots</h2>
          <p className="text-muted-foreground mt-1">Loading elections...</p>
        </div>
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted/50 rounded-t-lg" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const openElections = elections?.filter(e => e.status === "open") || [];
  const closedElections = elections?.filter(e => e.status === "closed") || [];
  const draftElections = elections?.filter(e => e.status === "draft") || [];

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-6">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Open for Voting</h2>
          <p className="text-muted-foreground mt-1">Cast your ballot in active elections.</p>
        </div>
        
        {openElections.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
            No active elections at this time.
          </div>
        ) : (
          <div className="grid gap-4">
            {openElections.map(election => (
              <Card key={election.id} className="overflow-hidden hover:border-primary/50 transition-colors shadow-sm">
                <div className="h-1 bg-primary w-full" />
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{election.title}</CardTitle>
                      <CardDescription className="mt-2 text-base">{election.description}</CardDescription>
                    </div>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">Open</Badge>
                  </div>
                </CardHeader>
                <CardFooter className="bg-muted/30 pt-4 flex justify-between items-center border-t border-border/50">
                  <div className="text-sm text-muted-foreground">
                    Closes: {election.endsAt ? format(new Date(election.endsAt), "MMM d, yyyy h:mm a") : "TBD"}
                  </div>
                  <Link href={`/${election.id}${isAdmin ? '?admin=true' : ''}`}>
                    <Button className="font-medium px-6 shadow-sm">Vote Now</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      {isAdmin && draftElections.length > 0 && (
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Draft Elections</h2>
            <p className="text-muted-foreground mt-1">Visible only to admins.</p>
          </div>
          <div className="grid gap-4">
            {draftElections.map(election => (
              <Card key={election.id} className="opacity-80">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{election.title}</CardTitle>
                    <Badge variant="outline">Draft</Badge>
                  </div>
                </CardHeader>
                <CardFooter className="pt-2">
                  <Link href={`/admin${isAdmin ? '?admin=true' : ''}`}>
                    <Button variant="outline" size="sm">Manage</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}

      {closedElections.length > 0 && (
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Recent Results</h2>
            <p className="text-muted-foreground mt-1">Past election tallies and outcomes.</p>
          </div>
          <div className="grid gap-4">
            {closedElections.map(election => (
              <Card key={election.id} className="bg-muted/20 border-border/60">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg text-foreground/80">{election.title}</CardTitle>
                    <Badge variant="secondary">Closed</Badge>
                  </div>
                </CardHeader>
                <CardFooter className="pt-2">
                  <Link href={`/${election.id}${isAdmin ? '?admin=true' : ''}`}>
                    <Button variant="outline" size="sm" className="bg-background">View Results</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
