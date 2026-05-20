import { useListElections, useGetElectionTally, useListDocuments } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-primary/10 text-primary border-primary/20">Open</Badge>;
  if (status === "closed") return <Badge variant="secondary">Closed</Badge>;
  return null;
}

type ElectionForResults = {
  id: number;
  title: string;
  status: string;
  voteType: string;
  eligibleVoterCount?: number | null;
  description?: string | null;
  resultsVisible?: boolean;
  thresholdType?: string | null;
  thresholdPercent?: number | null;
};

function thresholdFraction(election: ElectionForResults): number {
  switch (election.thresholdType) {
    case "two_thirds":
      return 2 / 3;
    case "three_quarters":
      return 0.75;
    case "custom":
      return election.thresholdPercent != null ? election.thresholdPercent / 100 : 0.5;
    case "simple_majority":
    default:
      return 0.5;
  }
}

function ElectionResult({ election }: { election: ElectionForResults }) {
  const resultsVisible = !!election.resultsVisible;
  const { data: tally } = useGetElectionTally(election.id, {
    query: { enabled: election.status === "closed" && resultsVisible },
  });
  const { data: docs } = useListDocuments(election.id);

  const totalVotes = tally?.totalBallots ?? 0;
  const eligible = election.eligibleVoterCount ?? null;
  const turnoutPct =
    eligible && eligible > 0 ? Math.round((totalVotes / eligible) * 100) : null;

  // Compute Pass/Fail for yes_no elections without exposing the split.
  let outcome: { label: string; passed: boolean } | null = null;
  if (resultsVisible && tally && election.voteType === "yes_no" && totalVotes > 0) {
    const yesCount = tally.options.find(o => /^yes$/i.test(o.optionLabel))?.voteCount ?? 0;
    const threshold = thresholdFraction(election);
    const quorumOk = tally.quorumMet !== false; // null/true → ok
    const passed = quorumOk && yesCount / totalVotes >= threshold;
    outcome = { label: passed ? "Passed" : "Failed", passed };
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{election.title}</CardTitle>
            {election.description && (
              <p className="text-sm text-muted-foreground mt-1">{election.description}</p>
            )}
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
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {eligible != null ? (
                <>
                  <span className="font-medium text-foreground tabular-nums">{turnoutPct}%</span>{" "}
                  participation
                  <span className="text-muted-foreground">
                    {" "}
                    ({totalVotes} of {eligible} voted)
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground tabular-nums">{totalVotes}</span>{" "}
                  ballot{totalVotes !== 1 ? "s" : ""} cast
                </>
              )}
              {tally.quorumMet === false && (
                <span className="ml-2 text-amber-600 font-medium">Quorum not met</span>
              )}
            </div>

            {outcome ? (
              <div
                data-testid={`outcome-${election.id}`}
                className={
                  "inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold " +
                  (outcome.passed
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200")
                }
              >
                {outcome.label}
              </div>
            ) : election.voteType !== "yes_no" ? (
              <p className="text-sm text-muted-foreground">
                Results recorded. Detailed counts are not published.
              </p>
            ) : totalVotes === 0 ? (
              <p className="text-sm text-muted-foreground">No votes recorded.</p>
            ) : null}
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
