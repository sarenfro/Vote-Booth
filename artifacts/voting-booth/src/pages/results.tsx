import { useListElections, useGetElectionTally, useListDocuments } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-primary/10 text-primary border-primary/20">Open</Badge>;
  if (status === "closed") return <Badge variant="secondary">Closed</Badge>;
  return null;
}

function ElectionResult({ election }: { election: { id: number; title: string; status: string; voteType: string; eligibleVoterCount?: number | null; description?: string | null; resultsVisible?: boolean } }) {
  const resultsVisible = !!election.resultsVisible;
  const { data: tally } = useGetElectionTally(election.id, {
    query: { enabled: election.status === "closed" && resultsVisible },
  });
  const { data: docs } = useListDocuments(election.id);

  const totalVotes = tally?.totalBallots ?? 0;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{election.title}</CardTitle>
            {election.description && (
              <p className="text-sm text-muted-foreground mt-1">{election.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{totalVotes} vote{totalVotes !== 1 ? "s" : ""} cast</span>
              {tally?.quorumMet !== null && tally?.quorumMet !== undefined && (
                <span className={tally.quorumMet ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                  Quorum {tally.quorumMet ? "met" : "not met"}
                </span>
              )}
              {election.eligibleVoterCount && (
                <span>{Math.round((totalVotes / election.eligibleVoterCount) * 100)}% participation</span>
              )}
            </div>
          </div>
          <StatusBadge status={election.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {!resultsVisible ? (
          <p className="text-sm text-muted-foreground">
            Results are not yet released by the EC.
          </p>
        ) : !tally ? (
          <p className="text-sm text-muted-foreground">
            {election.status === "open" ? "Results visible after closing." : "No tally available yet."}
          </p>
        ) : tally.options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No votes recorded.</p>
        ) : (
          <div className="space-y-3">
            {tally.options.map((option, idx) => {
              const pct = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;
              return (
                <div key={option.optionId ?? idx} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{option.optionLabel}</span>
                    <span className="text-muted-foreground tabular-nums">{option.voteCount} ({pct}%)</span>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                </div>
              );
            })}
          </div>
        )}

        {docs && docs.length > 0 && (
          <div className="border-t border-border/50 pt-3 mt-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Supporting Documents</p>
            <ul className="space-y-1">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={`/api/storage${doc.objectPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    {doc.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Results() {
  const { data: elections, isLoading } = useListElections();

  const visible = (elections ?? []).filter(e => e.status === "open" || e.status === "closed");

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Foster MBAA</p>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Election Results</h2>
        <p className="text-sm text-muted-foreground mt-1">Aggregate vote counts — no individual votes are recorded or displayed.</p>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm">Loading results...</div>
      )}

      {!isLoading && visible.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
          No elections are open or closed yet.
        </div>
      )}

      {!isLoading && visible.length > 0 && (
        <div className="space-y-4">
          {visible.map(election => (
            <ElectionResult key={election.id} election={election} />
          ))}
        </div>
      )}
    </div>
  );
}
