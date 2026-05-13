import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListElections,
  useCreateElection,
  useOpenElection,
  useCloseElection,
  getListElectionsQueryKey,
  useListDocuments,
  useCreateDocument,
  useDeleteDocument,
  useRequestUploadUrl,
  getListDocumentsQueryKey,
  type ElectionVoteType,
} from "@workspace/api-client-react";
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

export function EcDashboard() {
  const queryClient = useQueryClient();
  const { data: elections, isLoading } = useListElections();
  const createElection = useCreateElection();
  const openElection = useOpenElection();
  const closeElection = useCloseElection();

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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Executive Council</p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">EC Dashboard</h2>
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
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
              <Label htmlFor="ec-input-title">Title</Label>
              <Input id="ec-input-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. President 2026-2027" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-input-description">Description (optional)</Label>
              <Textarea id="ec-input-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the ballot initiative..." rows={2} />
            </div>
            <div className="space-y-1">
              <Label>Vote Type</Label>
              <Select value={voteType} onValueChange={v => setVoteType(v as ElectionVoteType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VOTE_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {["plurality", "ranked_choice", "multi_select"].includes(voteType) && (
              <div className="space-y-2">
                <Label>Options</Label>
                {optionInputs.map((opt, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input value={opt} onChange={e => setOptionInputs(prev => prev.map((o, i) => i === idx ? e.target.value : o))} placeholder={`Option ${idx + 1}`} />
                    {optionInputs.length > 2 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setOptionInputs(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">Remove</Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setOptionInputs(prev => [...prev, ""])}>Add option</Button>
              </div>
            )}
            {voteType === "multi_select" && (
              <div className="space-y-1">
                <Label>Max selections (optional)</Label>
                <Input type="number" min={1} value={maxSelections} onChange={e => setMaxSelections(e.target.value)} placeholder="Leave blank for unlimited" className="w-48" />
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Quorum count (optional)</Label>
                <Input type="number" min={1} value={quorumCount} onChange={e => setQuorumCount(e.target.value)} placeholder="e.g. 30" />
              </div>
              <div className="space-y-1">
                <Label>Eligible voters (optional)</Label>
                <Input type="number" min={1} value={eligibleCount} onChange={e => setEligibleCount(e.target.value)} placeholder="e.g. 58" />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </CardContent>
          <CardFooter className="border-t border-border/50 pt-4 gap-3">
            <Button onClick={handleCreate} disabled={createElection.isPending} className="font-semibold">
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
                      onOpen={(id) => openElection.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }) })}
                      onClose={(id) => closeElection.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListElectionsQueryKey() }) })}
                      openPending={openElection.isPending}
                      closePending={closeElection.isPending}
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
    description?: string | null;
  };
  onOpen: (id: number) => void;
  onClose: (id: number) => void;
  openPending: boolean;
  closePending: boolean;
}

function ElectionCard({ election, onOpen, onClose, openPending, closePending }: ElectionCardProps) {
  const [showDocs, setShowDocs] = useState(false);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{election.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {VOTE_TYPE_LABELS[election.voteType] ?? election.voteType}
              {election.eligibleVoterCount ? ` · ${election.eligibleVoterCount} eligible` : ""}
            </p>
            {election.description && (
              <p className="text-sm text-muted-foreground mt-1">{election.description}</p>
            )}
          </div>
          <StatusBadge status={election.status} />
        </div>
      </CardHeader>

      <CardContent className="pb-2 pt-0">
        <button
          onClick={() => setShowDocs(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          {showDocs ? "Hide documents" : "Manage documents"}
        </button>
        {showDocs && (
          <div className="mt-3">
            <DocumentUploader electionId={election.id} />
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 pb-3 gap-2">
        <Link href={`/${election.id}`}>
          <Button variant="outline" size="sm">View ballot</Button>
        </Link>
        {election.status === "draft" && (
          <Button size="sm" onClick={() => onOpen(election.id)} disabled={openPending}>
            Open for Voting
          </Button>
        )}
        {election.status === "open" && (
          <Button size="sm" variant="destructive" onClick={() => onClose(election.id)} disabled={closePending}>
            Close Election
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
