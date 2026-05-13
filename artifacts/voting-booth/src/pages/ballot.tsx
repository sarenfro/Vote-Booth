import { useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import {
  useGetElection,
  useGetElectionTally,
  useHasVoted,
  useCastVote,
  getGetElectionQueryKey,
  getGetElectionTallyQueryKey,
  getHasVotedQueryKey,
  getListElectionsQueryKey,
  type CastVoteBodyPayload,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function ElectionTally({ electionId, eligibleCount, showProgress }: {
  electionId: number;
  eligibleCount?: number | null;
  showProgress?: boolean;
}) {
  const { data: tally } = useGetElectionTally(electionId, {
    query: { enabled: true, queryKey: getGetElectionTallyQueryKey(electionId) },
  });

  if (!tally) return null;

  const max = Math.max(...(tally.options?.map(o => Number(o.voteCount)) ?? [1]), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground uppercase tracking-widest text-xs">Results</span>
        <span className="text-muted-foreground">{tally.totalBallots} ballot{tally.totalBallots !== 1 ? "s" : ""} cast</span>
      </div>

      {showProgress && eligibleCount && (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Quorum progress</span>
            <span>{tally.totalBallots} / {eligibleCount}</span>
          </div>
          <Progress
            value={Math.min(100, (Number(tally.totalBallots) / eligibleCount) * 100)}
            className="h-2"
          />
        </div>
      )}

      <div className="space-y-2">
        {tally.options?.map((opt, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{opt.optionLabel ?? "—"}</span>
              <span className="text-muted-foreground">{String(opt.voteCount)} vote{Number(opt.voteCount) !== 1 ? "s" : ""}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: max > 0 ? `${(Number(opt.voteCount) / max) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Ballot() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isAdmin = searchParams.get("admin") === "true";
  const queryClient = useQueryClient();

  const { data: election, isLoading } = useGetElection(id, {
    query: { enabled: !!id, queryKey: getGetElectionQueryKey(id) },
  });

  const { data: hasVotedData } = useHasVoted(id, {
    query: {
      enabled: !!id,
      queryKey: getHasVotedQueryKey(id),
    },
  });

  const castVote = useCastVote();

  const [yesNoChoice, setYesNoChoice] = useState<"yes" | "no" | "">("");
  const [pluralityChoice, setPluralityChoice] = useState<string>("");
  const [rankOrder, setRankOrder] = useState<number[]>([]);
  const [multiSelections, setMultiSelections] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const hasVoted = hasVotedData?.hasVoted || submitted;
  const isClosed = election?.status === "closed";
  const showTally = isClosed || hasVoted;

  function toggleMulti(optionId: number) {
    setMultiSelections(prev =>
      prev.includes(optionId) ? prev.filter(x => x !== optionId) : [...prev, optionId]
    );
  }

  function toggleRank(optionId: number) {
    setRankOrder(prev => {
      if (prev.includes(optionId)) return prev.filter(x => x !== optionId);
      return [...prev, optionId];
    });
  }

  function moveRank(optionId: number, dir: -1 | 1) {
    setRankOrder(prev => {
      const idx = prev.indexOf(optionId);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  async function handleSubmit() {
    if (!election) return;

    let payload: unknown;
    if (election.voteType === "yes_no") {
      if (!yesNoChoice) return;
      payload = { choice: yesNoChoice };
    } else if (election.voteType === "plurality") {
      if (!pluralityChoice) return;
      payload = { option_id: parseInt(pluralityChoice, 10) };
    } else if (election.voteType === "ranked_choice") {
      if (rankOrder.length === 0) return;
      payload = { rankings: rankOrder.map((optId, i) => ({ option_id: optId, rank: i + 1 })) };
    } else if (election.voteType === "multi_select") {
      if (multiSelections.length === 0) return;
      payload = { option_ids: multiSelections };
    }

    castVote.mutate(
      { id: election.id, data: { payload: payload as CastVoteBodyPayload } },
      {
        onSuccess: () => {
          setSubmitted(true);
          queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetElectionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetElectionTallyQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getHasVotedQueryKey(id) });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!election) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">Election not found.</p>
        <Link href={isAdmin ? "/?admin=true" : "/"}>
          <Button variant="outline" className="mt-4">Back to elections</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={isAdmin ? "/?admin=true" : "/"}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; All elections
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{election.title}</h2>
            {election.description && (
              <p className="text-muted-foreground mt-1">{election.description}</p>
            )}
          </div>
          <Badge
            className={
              election.status === "open"
                ? "bg-primary/10 text-primary border-primary/20 shrink-0"
                : "bg-muted text-muted-foreground shrink-0"
            }
          >
            {election.status === "open" ? "Open" : election.status === "closed" ? "Closed" : "Draft"}
          </Badge>
        </div>
      </div>

      {election.status === "open" && !hasVoted && (
        <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3 text-sm text-accent-foreground">
          Enter your member ID in the top bar, then cast your vote below.
        </div>
      )}

      {hasVoted && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary font-medium">
          Your ballot has been recorded. Thank you for participating.
        </div>
      )}

      {castVote.isError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
          {(castVote.error as { data?: { error?: string } })?.data?.error ?? "Failed to cast vote. You may have already voted."}
        </div>
      )}

      {election.status === "open" && !hasVoted && (
        <Card className="shadow-sm">
          <div className="h-1 bg-primary w-full rounded-t-lg" />
          <CardHeader>
            <CardTitle className="text-lg">Cast Your Vote</CardTitle>
            {election.voteType === "ranked_choice" && (
              <CardDescription>Select options in order of preference. Use the arrows to rank them.</CardDescription>
            )}
            {election.voteType === "multi_select" && (
              <CardDescription>
                Select up to {election.maxSelections ?? "all"} option{(election.maxSelections ?? 0) !== 1 ? "s" : ""}.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {election.voteType === "yes_no" && (
              <div className="grid grid-cols-2 gap-3">
                {(["yes", "no"] as const).map(choice => (
                  <button
                    key={choice}
                    data-testid={`vote-choice-${choice}`}
                    onClick={() => setYesNoChoice(choice)}
                    className={`rounded-lg border-2 py-6 text-lg font-semibold transition-all ${
                      yesNoChoice === choice
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    }`}
                  >
                    {choice === "yes" ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            )}

            {election.voteType === "plurality" && (
              <RadioGroup value={pluralityChoice} onValueChange={setPluralityChoice} data-testid="vote-plurality">
                <div className="space-y-2">
                  {election.options?.map(opt => (
                    <label
                      key={opt.id}
                      data-testid={`vote-option-${opt.id}`}
                      className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-all ${
                        pluralityChoice === String(opt.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <RadioGroupItem value={String(opt.id)} id={`opt-${opt.id}`} />
                      <span className="font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            )}

            {election.voteType === "ranked_choice" && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Click an option to add it to your ranking, then reorder with the arrows.
                </p>
                {rankOrder.length > 0 && (
                  <div className="space-y-1 mb-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your ranking</p>
                    {rankOrder.map((optId, idx) => {
                      const opt = election.options?.find(o => o.id === optId);
                      if (!opt) return null;
                      return (
                        <div key={optId} className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                          <span className="text-sm font-bold text-primary w-6">{idx + 1}</span>
                          <span className="flex-1 font-medium text-sm">{opt.label}</span>
                          <div className="flex gap-1">
                            <button
                              data-testid={`rank-up-${optId}`}
                              disabled={idx === 0}
                              onClick={() => moveRank(optId, -1)}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1"
                            >&#8593;</button>
                            <button
                              data-testid={`rank-down-${optId}`}
                              disabled={idx === rankOrder.length - 1}
                              onClick={() => moveRank(optId, 1)}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1"
                            >&#8595;</button>
                            <button
                              data-testid={`rank-remove-${optId}`}
                              onClick={() => toggleRank(optId)}
                              className="text-muted-foreground hover:text-destructive p-1"
                            >&#10005;</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Available options</p>
                  {election.options?.filter(o => !rankOrder.includes(o.id)).map(opt => (
                    <button
                      key={opt.id}
                      data-testid={`rank-add-${opt.id}`}
                      onClick={() => toggleRank(opt.id)}
                      className="w-full flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left hover:border-primary/40 transition-colors"
                    >
                      <span className="text-muted-foreground text-sm w-6">+</span>
                      <span className="font-medium text-sm">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {election.voteType === "multi_select" && (
              <div className="space-y-2">
                {election.options?.map(opt => {
                  const checked = multiSelections.includes(opt.id);
                  const maxReached = election.maxSelections != null && multiSelections.length >= election.maxSelections && !checked;
                  return (
                    <label
                      key={opt.id}
                      data-testid={`vote-multi-${opt.id}`}
                      className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-all ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      } ${maxReached ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={maxReached}
                        onCheckedChange={() => !maxReached && toggleMulti(opt.id)}
                        id={`multi-${opt.id}`}
                      />
                      <span className="font-medium">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <Button
              data-testid="button-submit-vote"
              onClick={handleSubmit}
              disabled={
                castVote.isPending ||
                (election.voteType === "yes_no" && !yesNoChoice) ||
                (election.voteType === "plurality" && !pluralityChoice) ||
                (election.voteType === "ranked_choice" && rankOrder.length === 0) ||
                (election.voteType === "multi_select" && multiSelections.length === 0)
              }
              className="w-full font-semibold shadow-sm"
            >
              {castVote.isPending ? "Submitting..." : "Submit Ballot"}
            </Button>
          </CardContent>
        </Card>
      )}

      {showTally && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              {isClosed ? "Final Results" : "Live Tally"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ElectionTally
              electionId={election.id}
              eligibleCount={election.eligibleVoterCount}
              showProgress={isClosed || !!(election.showLiveProgress && hasVoted)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
