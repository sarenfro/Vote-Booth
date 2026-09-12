import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListElections,
  useCreateElection,
  useOpenElection,
  useCloseElection,
  useUpdateElection,
  useDeleteElection,
  getListElectionsQueryKey,
  useListDocuments,
  useCreateDocument,
  useDeleteDocument,
  useRequestUploadUrl,
  getListDocumentsQueryKey,
  useGetVoterLog,
  useGetNonVoters,
  useSetResultsVisibility,
  useGetElectionTally,
  useListMembers,
  useUpdateMember,
  getListMembersQueryKey,
  type ElectionVoteType,
  type MemberEntry,
} from "@workspace/api-client-react";
import { format } from "date-fns";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const VOTE_TYPE_LABELS: Record<string, string> = {
  yes_no: "Yes / No",
  plurality: "Plurality (pick one)",
  ranked_choice: "Ranked Choice",
  multi_select: "Multi-Select",
};

const COHORT_OPTIONS = [
  { value: "ft_2028", label: "FT Class of 2028" },
  { value: "ft_2027", label: "FT Class of 2027" },
  { value: "evening_2027", label: "Evening Class of 2027" },
];

function cohortLabel(cohort: string): string {
  return COHORT_OPTIONS.find(o => o.value === cohort)?.label ?? cohort;
}

function CohortCheckboxGroup({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(cohort: string) {
    onChange(
      value.includes(cohort) ? value.filter(c => c !== cohort) : [...value, cohort]
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {COHORT_OPTIONS.map(opt => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none text-sm">
          <Checkbox
            checked={value.includes(opt.value)}
            onCheckedChange={() => toggle(opt.value)}
          />
          {opt.label}
        </label>
      ))}
      <p className="text-xs text-muted-foreground">
        Leave all unchecked to allow any member to vote.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-primary/10 text-primary border-primary/20">Open</Badge>;
  if (status === "closed") return <Badge variant="secondary">Closed</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function DocumentUploader({ electionId }: { electionId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const requestUploadUrl = useRequestUploadUrl();
  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();
  const { data: docs } = useListDocuments(electionId);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const urlRes = await requestUploadUrl.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      await fetch(urlRes.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      await createDocument.mutateAsync({
        data: { electionId, name: file.name, objectPath: urlRes.objectPath },
      });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(electionId) });
      toast({ title: "Document uploaded", description: file.name });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: number) {
    await deleteDocument.mutateAsync({ id: docId });
    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(electionId) });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Label
          htmlFor={`file-upload-${electionId}`}
          className={`cursor-pointer inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent/10 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Uploading..." : "Attach document"}
          <input
            id={`file-upload-${electionId}`}
            type="file"
            className="sr-only"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </Label>
      </div>
      {docs && docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <a
                href={`/api/storage${doc.objectPath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {doc.name}
              </a>
              <button
                onClick={() => handleDelete(doc.id)}
                className="text-destructive/60 hover:text-destructive transition-colors ml-1"
                aria-label="Remove document"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const VOTER_LOG_PW_KEY = "voter-log-password";

function VoterLogSection({ electionId }: { electionId: number }) {
  const [password, setPassword] = useState<string>(
    () => sessionStorage.getItem(VOTER_LOG_PW_KEY) ?? "",
  );
  const [pendingPassword, setPendingPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const { data: log, isLoading, error } = useGetVoterLog(electionId, {
    query: { enabled: !!password, retry: false },
    request: { headers: password ? { "X-Voter-Log-Password": password } : undefined },
  });

  const { data: nonVoters, isLoading: nonVotersLoading } = useGetNonVoters(electionId, {
    query: { enabled: !!password, retry: false },
    request: { headers: password ? { "X-Voter-Log-Password": password } : undefined },
  });

  const status = (error as { status?: number } | null)?.status;

  useEffect(() => {
    if (status === 401) {
      setAuthError("Incorrect password.");
      setPassword("");
      sessionStorage.removeItem(VOTER_LOG_PW_KEY);
    }
  }, [status]);

  function handleUnlock() {
    const pw = pendingPassword.trim();
    if (!pw) {
      setAuthError("Enter the voter log password.");
      return;
    }
    setAuthError("");
    sessionStorage.setItem(VOTER_LOG_PW_KEY, pw);
    setPassword(pw);
    setPendingPassword("");
  }

  function handleLock() {
    sessionStorage.removeItem(VOTER_LOG_PW_KEY);
    setPassword("");
    setAuthError("");
  }

  if (!password) {
    return (
      <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 px-3 py-3">
        <p className="text-xs font-medium text-foreground">Voter log is password protected</p>
        <p className="text-xs text-muted-foreground">
          Enter the EC voter-log password to view per-voter ballots.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            value={pendingPassword}
            onChange={e => setPendingPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleUnlock(); }}
            placeholder="Voter log password"
            className="h-8 text-xs"
            data-testid={`input-voter-log-password-${electionId}`}
          />
          <Button size="sm" onClick={handleUnlock} data-testid={`button-unlock-voter-log-${electionId}`}>
            Unlock
          </Button>
        </div>
        {authError && <p className="text-xs text-destructive">{authError}</p>}
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading voter log…</p>;
  }
  if (!log || log.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">No ballots cast yet.</p>
        <button onClick={handleLock} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
          Lock voter log
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs text-muted-foreground">
          {log.length} ballot{log.length !== 1 ? "s" : ""} cast — identities and choices visible to EC/admins only.
        </p>
        <button
          onClick={handleLock}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
          data-testid={`button-lock-voter-log-${electionId}`}
        >
          Lock
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto border border-border/60 rounded-md divide-y divide-border/40">
        {log.map((entry) => (
          <div
            key={`${entry.memberId}-${entry.votedAt}`}
            className="px-3 py-2 text-xs space-y-1"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">
                  {entry.name ?? entry.memberId}
                </div>
                <div className="text-muted-foreground truncate">
                  {entry.memberId}
                  {entry.email ? ` · ${entry.email}` : ""}
                </div>
              </div>
              <div className="text-muted-foreground whitespace-nowrap shrink-0">
                {format(new Date(entry.votedAt), "MMM d, yyyy h:mm a")}
              </div>
            </div>
            <div className="flex items-start gap-2 pt-1">
              <span className="text-muted-foreground shrink-0">Voted:</span>
              <span className="text-foreground font-medium break-words">
                {entry.choice ?? "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <NonVotersList nonVoters={nonVoters} isLoading={nonVotersLoading} />
    </div>
  );
}

function NonVotersList({
  nonVoters,
  isLoading,
}: {
  nonVoters: Array<{ memberId: string; name?: string | null; email?: string | null }> | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-xs text-muted-foreground mt-3">Loading non-voters…</p>;
  }
  if (!nonVoters) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium text-foreground">
        Haven't voted yet ({nonVoters.length})
      </p>
      {nonVoters.length === 0 ? (
        <p className="text-xs text-muted-foreground">Everyone has voted.</p>
      ) : (
        <div className="max-h-60 overflow-y-auto border border-border/60 rounded-md divide-y divide-border/40">
          {nonVoters.map(m => (
            <div key={m.memberId} className="px-3 py-2 text-xs">
              <div className="font-medium text-foreground truncate">
                {m.name ?? m.memberId}
              </div>
              <div className="text-muted-foreground truncate">
                {m.memberId}
                {m.email ? ` · ${m.email}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberDirectorySection() {
  const queryClient = useQueryClient();
  const { data: members, isLoading } = useListMembers();
  const updateMember = useUpdateMember();
  const [filterCohort, setFilterCohort] = useState<string>("all");

  function handleToggleDisqualified(member: MemberEntry) {
    updateMember.mutate(
      { id: member.id, data: { disqualified: !member.disqualified } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }) }
    );
  }

  const filtered = members
    ? filterCohort === "all"
      ? members
      : members.filter(m => m.cohort === filterCohort)
    : [];

  const grouped: Record<string, MemberEntry[]> = {};
  for (const m of filtered) {
    const key = m.cohort ?? "uncategorized";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  const groupOrder = [
    ...COHORT_OPTIONS.map(o => o.value),
    "uncategorized",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Member Directory</p>
          <p className="text-sm text-muted-foreground">
            Check "Disqualified" to prevent a member from casting ballots in cohort-restricted elections.
          </p>
        </div>
        <Select value={filterCohort} onValueChange={setFilterCohort}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cohorts</SelectItem>
            {COHORT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
            <SelectItem value="uncategorized">No cohort</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading members…</p>}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No members found.</p>
      )}

      {groupOrder.map(cohortKey => {
        const group = grouped[cohortKey];
        if (!group || group.length === 0) return null;
        return (
          <div key={cohortKey}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {cohortKey === "uncategorized" ? "No cohort" : cohortLabel(cohortKey)}
              <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/70">
                ({group.length})
              </span>
            </p>
            <div className="border border-border/60 rounded-md divide-y divide-border/40">
              {group.map(member => (
                <div key={member.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${member.disqualified ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {member.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {member.id}{member.email ? ` · ${member.email}` : ""}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0 text-xs text-muted-foreground select-none">
                    <Checkbox
                      checked={member.disqualified}
                      onCheckedChange={() => handleToggleDisqualified(member)}
                      disabled={updateMember.isPending}
                    />
                    Disqualified
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EcDashboard() {
  const queryClient = useQueryClient();
  const { data: elections, isLoading } = useListElections();
  const createElection = useCreateElection();
  const openElection = useOpenElection();
  const closeElection = useCloseElection();
  const updateElection = useUpdateElection();
  const deleteElection = useDeleteElection();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [voteType, setVoteType] = useState<ElectionVoteType>("yes_no");
  const [optionInputs, setOptionInputs] = useState<string[]>(["", ""]);
  const [quorumCount, setQuorumCount] = useState("");
  const [eligibleCount, setEligibleCount] = useState("");
  const [maxSelections, setMaxSelections] = useState("");
  const [cohorts, setCohorts] = useState<string[]>([]);
  const [formError, setFormError] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editQuorum, setEditQuorum] = useState("");
  const [editEligible, setEditEligible] = useState("");
  const [editCohorts, setEditCohorts] = useState<string[]>([]);
  const [editError, setEditError] = useState("");

  const [activeTab, setActiveTab] = useState<"elections" | "members">("elections");

  function resetForm() {
    setTitle(""); setDescription(""); setVoteType("yes_no");
    setOptionInputs(["", ""]); setQuorumCount(""); setEligibleCount("");
    setMaxSelections(""); setCohorts([]); setFormError(""); setShowForm(false);
  }

  async function handleCreate() {
    if (!title.trim()) { setFormError("Title is required."); return; }
    const needsOptions = ["plurality", "ranked_choice", "multi_select"].includes(voteType);
    const validOptions = optionInputs.map(o => o.trim()).filter(Boolean);
    if (needsOptions && validOptions.length < 2) {
      setFormError("At least 2 options are required for this vote type."); return;
    }
    setFormError("");
    createElection.mutate(
      {
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          voteType,
          options: needsOptions ? validOptions : [],
          quorumCount: quorumCount ? parseInt(quorumCount, 10) : undefined,
          eligibleVoterCount: eligibleCount ? parseInt(eligibleCount, 10) : undefined,
          maxSelections: voteType === "multi_select" && maxSelections ? parseInt(maxSelections, 10) : undefined,
          showLiveProgress: true,
          cohorts: cohorts.length > 0 ? cohorts : null,
        },
      },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }); resetForm(); },
        onError: (err: unknown) => {
          setFormError((err as { data?: { error?: string } })?.data?.error ?? "Failed to create election.");
        },
      }
    );
  }

  function handleOpen(id: number) {
    openElection.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }) });
  }

  function handleClose(id: number) {
    closeElection.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }) });
  }

  function startEdit(election: { id: number; title: string; description?: string | null; quorumCount?: number | null; eligibleVoterCount?: number | null; cohorts?: string[] | null }) {
    setEditingId(election.id);
    setEditTitle(election.title);
    setEditDescription(election.description ?? "");
    setEditQuorum(election.quorumCount != null ? String(election.quorumCount) : "");
    setEditEligible(election.eligibleVoterCount != null ? String(election.eligibleVoterCount) : "");
    setEditCohorts(election.cohorts ?? []);
    setEditError("");
  }

  function cancelEdit() { setEditingId(null); setEditError(""); }

  function handleDelete(id: number) {
    deleteElection.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }) },
    );
  }

  function handleUpdate(id: number) {
    if (!editTitle.trim()) { setEditError("Title is required."); return; }
    updateElection.mutate(
      {
        id,
        data: {
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          quorumCount: editQuorum ? parseInt(editQuorum, 10) : null,
          eligibleVoterCount: editEligible ? parseInt(editEligible, 10) : null,
          cohorts: editCohorts.length > 0 ? editCohorts : null,
        },
      },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }); setEditingId(null); },
        onError: (err: unknown) => {
          setEditError((err as { data?: { error?: string } })?.data?.error ?? "Failed to save changes.");
        },
      }
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Executive Council</p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">EC Dashboard</h2>
        </div>
        {activeTab === "elections" && (
          <Button
            data-testid="button-new-election"
            size="sm"
            onClick={() => setShowForm(v => !v)}
          >
            {showForm ? "Cancel" : "New Initiative"}
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border/60">
        <button
          onClick={() => setActiveTab("elections")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "elections" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
        >
          Elections & Initiatives
        </button>
        <button
          onClick={() => setActiveTab("members")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "members" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
        >
          Member Directory
        </button>
      </div>

      {activeTab === "members" && <MemberDirectorySection />}

      {activeTab === "elections" && (
        <>
          {showForm && (
            <Card className="shadow-sm">
              <div className="h-1 bg-accent w-full rounded-t-lg" />
              <CardHeader>
                <CardTitle className="text-lg">Create Ballot Initiative</CardTitle>
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
                    placeholder="Describe the ballot initiative..."
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Vote Type</Label>
                  <Select value={voteType} onValueChange={v => setVoteType(v as ElectionVoteType)}>
                    <SelectTrigger data-testid="select-vote-type"><SelectValue /></SelectTrigger>
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
                          onChange={e => setOptionInputs(prev => prev.map((o, i) => i === idx ? e.target.value : o))}
                          placeholder={`Option ${idx + 1}`}
                        />
                        {optionInputs.length > 2 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setOptionInputs(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">Remove</Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setOptionInputs(prev => [...prev, ""])} data-testid="button-add-option">Add option</Button>
                  </div>
                )}
                {voteType === "multi_select" && (
                  <div className="space-y-1">
                    <Label>Max selections (optional)</Label>
                    <Input
                      data-testid="input-max-selections"
                      type="number" min={1}
                      value={maxSelections}
                      onChange={e => setMaxSelections(e.target.value)}
                      placeholder="Leave blank for unlimited"
                      className="w-48"
                    />
                  </div>
                )}
                <Separator />
                <div className="space-y-1">
                  <Label>Eligible cohorts (optional)</Label>
                  <CohortCheckboxGroup value={cohorts} onChange={setCohorts} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Quorum count (optional)</Label>
                    <Input
                      data-testid="input-quorum-count"
                      type="number" min={1}
                      value={quorumCount}
                      onChange={e => setQuorumCount(e.target.value)}
                      placeholder="e.g. 30"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Eligible voters (optional)</Label>
                    <Input
                      data-testid="input-eligible-count"
                      type="number" min={1}
                      value={eligibleCount}
                      onChange={e => setEligibleCount(e.target.value)}
                      placeholder="e.g. 58"
                    />
                  </div>
                </div>
                {formError && <p className="text-sm text-destructive">{formError}</p>}
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
            <div className="text-muted-foreground text-sm">Loading...</div>
          ) : (
            <div className="space-y-6">
              {(!elections || elections.length === 0) && (
                <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
                  No ballot initiatives yet. Create one above.
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
                    <div className="space-y-3">
                      {group.map(election => (
                        <ElectionCard
                          key={election.id}
                          election={election}
                          editingId={editingId}
                          editTitle={editTitle}
                          editDescription={editDescription}
                          editQuorum={editQuorum}
                          editEligible={editEligible}
                          editCohorts={editCohorts}
                          editError={editError}
                          onEditTitle={setEditTitle}
                          onEditDescription={setEditDescription}
                          onEditQuorum={setEditQuorum}
                          onEditEligible={setEditEligible}
                          onEditCohorts={setEditCohorts}
                          onStartEdit={startEdit}
                          onCancelEdit={cancelEdit}
                          onSaveEdit={handleUpdate}
                          savePending={updateElection.isPending}
                          onOpen={handleOpen}
                          onClose={handleClose}
                          openPending={openElection.isPending}
                          closePending={closeElection.isPending}
                          onDelete={handleDelete}
                          deletePending={deleteElection.isPending}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ElectionCardProps {
  election: {
    id: number;
    title: string;
    status: string;
    voteType: string;
    eligibleVoterCount?: number | null;
    quorumCount?: number | null;
    description?: string | null;
    resultsVisible?: boolean;
    cohorts?: string[] | null;
  };
  editingId: number | null;
  editTitle: string;
  editDescription: string;
  editQuorum: string;
  editEligible: string;
  editCohorts: string[];
  editError: string;
  onEditTitle: (v: string) => void;
  onEditDescription: (v: string) => void;
  onEditQuorum: (v: string) => void;
  onEditEligible: (v: string) => void;
  onEditCohorts: (v: string[]) => void;
  onStartEdit: (e: { id: number; title: string; description?: string | null; quorumCount?: number | null; eligibleVoterCount?: number | null; cohorts?: string[] | null }) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: number) => void;
  savePending: boolean;
  onOpen: (id: number) => void;
  onClose: (id: number) => void;
  openPending: boolean;
  closePending: boolean;
  onDelete: (id: number) => void;
  deletePending: boolean;
}

function ElectionCard({
  election, editingId, editTitle, editDescription, editQuorum, editEligible, editCohorts, editError,
  onEditTitle, onEditDescription, onEditQuorum, onEditEligible, onEditCohorts,
  onStartEdit, onCancelEdit, onSaveEdit, savePending,
  onOpen, onClose, openPending, closePending,
  onDelete, deletePending,
}: ElectionCardProps) {
  const [showDocs, setShowDocs] = useState(false);
  const [showVoterLog, setShowVoterLog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEditing = editingId === election.id;
  const queryClient = useQueryClient();
  const setVisibility = useSetResultsVisibility({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() });
      },
    },
  });
  const resultsVisible = !!election.resultsVisible;

  return (
    <Card data-testid={`card-election-${election.id}`} className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{election.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {VOTE_TYPE_LABELS[election.voteType] ?? election.voteType}
              {election.cohorts?.length ? ` · ${election.cohorts.map(cohortLabel).join(", ")}` : ""}
              {election.eligibleVoterCount ? ` · ${election.eligibleVoterCount} eligible` : ""}
            </p>
            {election.description && !isEditing && (
              <p className="text-sm text-muted-foreground mt-1">{election.description}</p>
            )}
          </div>
          <StatusBadge status={election.status} />
        </div>
      </CardHeader>

      {isEditing && (
        <CardContent className="pt-0 pb-3 space-y-3 border-t border-border/50">
          <div className="space-y-1 pt-3">
            <Label>Title</Label>
            <Input value={editTitle} onChange={e => onEditTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Textarea value={editDescription} onChange={e => onEditDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Eligible cohorts</Label>
            <CohortCheckboxGroup value={editCohorts} onChange={onEditCohorts} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Quorum count</Label>
              <Input type="number" min={1} value={editQuorum} onChange={e => onEditQuorum(e.target.value)} placeholder="e.g. 30" />
            </div>
            <div className="space-y-1">
              <Label>Eligible voters</Label>
              <Input type="number" min={1} value={editEligible} onChange={e => onEditEligible(e.target.value)} placeholder="e.g. 58" />
            </div>
          </div>
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSaveEdit(election.id)} disabled={savePending}>
              {savePending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
          </div>
        </CardContent>
      )}

      {!isEditing && (
        <CardContent className="pb-2 pt-0 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <button
              onClick={() => setShowDocs(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              {showDocs ? "Hide documents" : "Manage documents"}
            </button>
            {election.status !== "draft" && (
              <button
                onClick={() => setShowVoterLog(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {showVoterLog ? "Hide voter log" : "View voter log"}
              </button>
            )}
            {election.status !== "draft" && (
              <button
                onClick={() => setShowPreview(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {showPreview ? "Hide results preview" : "Preview results"}
              </button>
            )}
          </div>
          {election.status !== "draft" && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-xs">
                <p className="font-medium text-foreground">
                  Results are {resultsVisible ? "visible to voters" : "hidden from voters"}
                </p>
                <p className="text-muted-foreground">
                  {resultsVisible
                    ? "Anyone can see the tally on the ballot and results pages."
                    : "Only EC sees the tally. Release when you're ready to publish."}
                </p>
              </div>
              <Button
                size="sm"
                variant={resultsVisible ? "outline" : "default"}
                onClick={() => setVisibility.mutate({ id: election.id, data: { visible: !resultsVisible } })}
                disabled={setVisibility.isPending}
                data-testid={`button-toggle-results-${election.id}`}
              >
                {setVisibility.isPending
                  ? "Saving…"
                  : resultsVisible
                    ? "Hide results"
                    : "Release results"}
              </Button>
            </div>
          )}
          {showPreview && election.status !== "draft" && (
            <ResultsPreview electionId={election.id} />
          )}
          {showDocs && (
            <div>
              <DocumentUploader electionId={election.id} />
            </div>
          )}
          {showVoterLog && election.status !== "draft" && (
            <div>
              <VoterLogSection electionId={election.id} />
            </div>
          )}
        </CardContent>
      )}

      <CardFooter className="pt-2 pb-3 gap-2 flex-wrap">
        <Link href={`/${election.id}`}>
          <Button variant="outline" size="sm">View ballot</Button>
        </Link>
        {election.status !== "closed" && !isEditing && (
          <Button variant="outline" size="sm" onClick={() => onStartEdit(election)}>
            Edit
          </Button>
        )}
        {election.status === "draft" && !isEditing && (
          <Button
            data-testid={`button-open-election-${election.id}`}
            size="sm"
            onClick={() => onOpen(election.id)}
            disabled={openPending}
          >
            Open for Voting
          </Button>
        )}
        {election.status === "open" && !isEditing && (
          <Button
            data-testid={`button-close-election-${election.id}`}
            size="sm"
            variant="destructive"
            onClick={() => onClose(election.id)}
            disabled={closePending}
          >
            Close Election
          </Button>
        )}
        {(election.status === "draft" || election.status === "closed") && !isEditing && (
          confirmDelete ? (
            <span className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-muted-foreground">Delete this initiative?</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { onDelete(election.id); setConfirmDelete(false); }}
                disabled={deletePending}
              >
                {deletePending ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )
        )}
      </CardFooter>
    </Card>
  );
}

function ResultsPreview({ electionId }: { electionId: number }) {
  const { data: tally, isLoading, isError } = useGetElectionTally(electionId);
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading preview…</p>;
  }
  if (isError || !tally) {
    return <p className="text-xs text-muted-foreground">No tally available yet.</p>;
  }
  if (tally.options.length === 0) {
    return <p className="text-xs text-muted-foreground">No votes recorded.</p>;
  }
  const total = tally.totalBallots ?? 0;
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2 space-y-2">
      <p className="text-xs font-medium text-foreground">
        EC preview — {total} {total === 1 ? "ballot" : "ballots"} cast
      </p>
      <div className="space-y-1.5">
        {tally.options.map(option => {
          const count = option.voteCount ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={option.optionId ?? option.optionLabel} className="text-xs">
              <div className="flex justify-between">
                <span>{option.optionLabel}</span>
                <span className="text-muted-foreground">{count} ({pct}%)</span>
              </div>
              <div className="h-1.5 bg-muted rounded overflow-hidden mt-0.5">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
