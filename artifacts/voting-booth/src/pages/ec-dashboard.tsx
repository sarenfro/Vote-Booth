import { useState } from "react";
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
  useSetResultsVisibility,
  useGetElectionTally,
  type ElectionVoteType,
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
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

function VoterLogSection({ electionId }: { electionId: number }) {
  const { data: log, isLoading } = useGetVoterLog(electionId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading voter log…</p>;
  }
  if (!log || log.length === 0) {
    return <p className="text-xs text-muted-foreground">No ballots cast yet.</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-2">
        {log.length} ballot{log.length !== 1 ? "s" : ""} cast (identities visible to EC/admins only — vote contents remain anonymous).
      </p>
      <div className="max-h-64 overflow-y-auto border border-border/60 rounded-md divide-y divide-border/40">
        {log.map((entry) => (
          <div
            key={`${entry.memberId}-${entry.votedAt}`}
            className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
          >
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
              {format(new Date(entry.votedAt), "MMM d, yyyy h:mm:ss a")}
            </div>
          </div>
        ))}
      </div>
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

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [voteType, setVoteType] = useState<ElectionVoteType>("yes_no");
  const [optionInputs, setOptionInputs] = useState<string[]>(["", ""]);
  const [quorumCount, setQuorumCount] = useState("");
  const [eligibleCount, setEligibleCount] = useState("");
  const [maxSelections, setMaxSelections] = useState("");
  const [formError, setFormError] = useState("");

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editQuorum, setEditQuorum] = useState("");
  const [editEligible, setEditEligible] = useState("");
  const [editError, setEditError] = useState("");

  function resetForm() {
    setTitle(""); setDescription(""); setVoteType("yes_no");
    setOptionInputs(["", ""]); setQuorumCount(""); setEligibleCount("");
    setMaxSelections(""); setFormError(""); setShowForm(false);
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

  function startEdit(election: { id: number; title: string; description?: string | null; quorumCount?: number | null; eligibleVoterCount?: number | null }) {
    setEditingId(election.id);
    setEditTitle(election.title);
    setEditDescription(election.description ?? "");
    setEditQuorum(election.quorumCount != null ? String(election.quorumCount) : "");
    setEditEligible(election.eligibleVoterCount != null ? String(election.eligibleVoterCount) : "");
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
        <Button
          data-testid="button-new-election"
          size="sm"
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? "Cancel" : "New Initiative"}
        </Button>
      </div>

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
                      editError={editError}
                      onEditTitle={setEditTitle}
                      onEditDescription={setEditDescription}
                      onEditQuorum={setEditQuorum}
                      onEditEligible={setEditEligible}
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
  };
  editingId: number | null;
  editTitle: string;
  editDescription: string;
  editQuorum: string;
  editEligible: string;
  editError: string;
  onEditTitle: (v: string) => void;
  onEditDescription: (v: string) => void;
  onEditQuorum: (v: string) => void;
  onEditEligible: (v: string) => void;
  onStartEdit: (e: { id: number; title: string; description?: string | null; quorumCount?: number | null; eligibleVoterCount?: number | null }) => void;
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
  election, editingId, editTitle, editDescription, editQuorum, editEligible, editError,
  onEditTitle, onEditDescription, onEditQuorum, onEditEligible,
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
