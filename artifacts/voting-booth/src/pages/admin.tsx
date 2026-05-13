import { useState } from "react";
import { useSearch } from "wouter";
import {
  useListElections,
  useCreateElection,
  useOpenElection,
  useCloseElection,
  useUpdateElection,
  getListElectionsQueryKey,
  type ElectionVoteType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";

const VOTE_TYPE_LABELS: Record<string, string> = {
  yes_no: "Yes / No",
  plurality: "Plurality (pick one)",
  ranked_choice: "Ranked Choice",
  multi_select: "Multi-Select",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-primary/10 text-primary border-primary/20">Open</Badge>;
  if (status === "closed") return <Badge variant="secondary">Closed</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export function Admin() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isAdmin = searchParams.get("admin") === "true";
  const queryClient = useQueryClient();

  const { data: elections, isLoading } = useListElections();
  const createElection = useCreateElection();
  const openElection = useOpenElection();
  const closeElection = useCloseElection();
  const updateElection = useUpdateElection();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [voteType, setVoteType] = useState<ElectionVoteType>("yes_no");
  const [optionInputs, setOptionInputs] = useState<string[]>(["", ""]);
  const [quorumCount, setQuorumCount] = useState("");
  const [eligibleCount, setEligibleCount] = useState("");
  const [maxSelections, setMaxSelections] = useState("");
  const [formError, setFormError] = useState("");

  function resetForm() {
    setTitle("");
    setDescription("");
    setVoteType("yes_no");
    setOptionInputs(["", ""]);
    setQuorumCount("");
    setEligibleCount("");
    setMaxSelections("");
    setFormError("");
    setShowForm(false);
  }

  function handleAddOption() {
    setOptionInputs(prev => [...prev, ""]);
  }

  function handleOptionChange(idx: number, val: string) {
    setOptionInputs(prev => prev.map((o, i) => (i === idx ? val : o)));
  }

  function handleRemoveOption(idx: number) {
    setOptionInputs(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    const needsOptions = ["plurality", "ranked_choice", "multi_select"].includes(voteType);
    const validOptions = optionInputs.map(o => o.trim()).filter(Boolean);
    if (needsOptions && validOptions.length < 2) {
      setFormError("At least 2 options are required for this vote type.");
      return;
    }

    setFormError("");

    createElection.mutate(
      {
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          voteType,
          options: needsOptions ? validOptions : undefined,
          quorumCount: quorumCount ? parseInt(quorumCount, 10) : undefined,
          eligibleVoterCount: eligibleCount ? parseInt(eligibleCount, 10) : undefined,
          maxSelections: voteType === "multi_select" && maxSelections ? parseInt(maxSelections, 10) : undefined,
          showLiveProgress: true,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() });
          resetForm();
        },
        onError: (err: unknown) => {
          setFormError((err as { data?: { error?: string } })?.data?.error ?? "Failed to create election.");
        },
      }
    );
  }

  function handleOpen(id: number) {
    openElection.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }) }
    );
  }

  function handleClose(id: number) {
    closeElection.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }) }
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Admin Panel</p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Manage Elections</h2>
        </div>
        <div className="flex gap-3">
          <Link href={isAdmin ? "/?admin=true" : "/"}>
            <Button variant="outline" size="sm">Back to Booth</Button>
          </Link>
          <Button
            data-testid="button-new-election"
            size="sm"
            onClick={() => setShowForm(v => !v)}
          >
            {showForm ? "Cancel" : "New Election"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="shadow-sm">
          <div className="h-1 bg-accent w-full rounded-t-lg" />
          <CardHeader>
            <CardTitle className="text-lg">Create Election</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="input-title">Title</Label>
              <Input
                id="input-title"
                data-testid="input-election-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. President 2026-2027"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="input-description">Description (optional)</Label>
              <Textarea
                id="input-description"
                data-testid="input-election-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the vote..."
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <Label>Vote Type</Label>
              <Select value={voteType} onValueChange={v => setVoteType(v as ElectionVoteType)}>
                <SelectTrigger data-testid="select-vote-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VOTE_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val} data-testid={`vote-type-${val}`}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {["plurality", "ranked_choice", "multi_select"].includes(voteType) && (
              <div className="space-y-2">
                <Label>Options</Label>
                {optionInputs.map((opt, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      data-testid={`input-option-${idx}`}
                      value={opt}
                      onChange={e => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                    />
                    {optionInputs.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOption(idx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                  data-testid="button-add-option"
                >
                  Add option
                </Button>
              </div>
            )}

            {voteType === "multi_select" && (
              <div className="space-y-1">
                <Label htmlFor="input-max-selections">Max selections (optional)</Label>
                <Input
                  id="input-max-selections"
                  data-testid="input-max-selections"
                  type="number"
                  min={1}
                  value={maxSelections}
                  onChange={e => setMaxSelections(e.target.value)}
                  placeholder="Leave blank for unlimited"
                  className="w-48"
                />
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="input-quorum">Quorum count (optional)</Label>
                <Input
                  id="input-quorum"
                  data-testid="input-quorum-count"
                  type="number"
                  min={1}
                  value={quorumCount}
                  onChange={e => setQuorumCount(e.target.value)}
                  placeholder="e.g. 30"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="input-eligible">Eligible voters (optional)</Label>
                <Input
                  id="input-eligible"
                  data-testid="input-eligible-count"
                  type="number"
                  min={1}
                  value={eligibleCount}
                  onChange={e => setEligibleCount(e.target.value)}
                  placeholder="e.g. 58"
                />
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </CardContent>
          <CardFooter className="border-t border-border/50 pt-4 gap-3">
            <Button
              data-testid="button-create-election"
              onClick={handleCreate}
              disabled={createElection.isPending}
              className="font-semibold"
            >
              {createElection.isPending ? "Creating..." : "Create as Draft"}
            </Button>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
          </CardFooter>
        </Card>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading elections...</div>
      ) : (
        <div className="space-y-3">
          {(!elections || elections.length === 0) && (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
              No elections yet. Create one above.
            </div>
          )}

          {["draft", "open", "closed"].map(statusGroup => {
            const group = elections?.filter(e => e.status === statusGroup) ?? [];
            if (group.length === 0) return null;

            return (
              <div key={statusGroup}>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  {statusGroup === "draft" ? "Drafts" : statusGroup === "open" ? "Open" : "Closed"}
                </p>
                <div className="space-y-2">
                  {group.map(election => (
                    <Card key={election.id} data-testid={`card-election-${election.id}`} className="shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="text-base font-semibold">{election.title}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {VOTE_TYPE_LABELS[election.voteType] ?? election.voteType}
                              {election.eligibleVoterCount ? ` · ${election.eligibleVoterCount} eligible` : ""}
                            </p>
                          </div>
                          <StatusBadge status={election.status} />
                        </div>
                      </CardHeader>
                      <CardFooter className="pt-2 pb-3 gap-2">
                        <Link href={`/${election.id}${isAdmin ? "?admin=true" : ""}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </Link>
                        {election.status === "draft" && (
                          <Button
                            data-testid={`button-open-election-${election.id}`}
                            size="sm"
                            onClick={() => handleOpen(election.id)}
                            disabled={openElection.isPending}
                          >
                            Open for Voting
                          </Button>
                        )}
                        {election.status === "open" && (
                          <Button
                            data-testid={`button-close-election-${election.id}`}
                            size="sm"
                            variant="destructive"
                            onClick={() => handleClose(election.id)}
                            disabled={closeElection.isPending}
                          >
                            Close Election
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
