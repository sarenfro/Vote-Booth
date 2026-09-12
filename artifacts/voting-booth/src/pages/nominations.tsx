import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNominationPositions,
  useListMembers,
  useSubmitNomination,
  getListNominationPositionsQueryKey,
  type NominationPosition,
  type MemberEntry,
} from "@workspace/api-client-react";
import { useMemberIdContext } from "@/hooks/use-member-id";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

const MAX_WORDS = 300;

export function Nominations() {
  const { memberId } = useMemberIdContext();
  const { data: me, isError: meError, isFetching: meFetching } = useMe(memberId);
  const { data: positions, isLoading: positionsLoading } = useListNominationPositions();
  const { data: members, isLoading: membersLoading } = useListMembers();
  const submitNomination = useSubmitNomination();
  const queryClient = useQueryClient();

  const [positionId, setPositionId] = useState<string>("");
  const [nomineeId, setNomineeId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [revealNominator, setRevealNominator] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  if (!memberId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <p className="text-lg font-medium">Enter your NetID to access nominations.</p>
      </div>
    );
  }

  if (meFetching || positionsLoading) return null;

  if (meError || !me) return null;

  // Positions the user is eligible to nominate for
  const eligiblePositions = (positions ?? []).filter(pos => {
    if (pos.status !== "open") return false;
    if (pos.closesAt && new Date() > new Date(pos.closesAt)) return false;
    if (!pos.cohorts?.length) return true;
    return me.cohort ? pos.cohorts.includes(me.cohort) : false;
  });

  if (eligiblePositions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-semibold text-foreground">No Open Nominations</p>
          <p className="text-sm text-muted-foreground">
            There are no nomination positions currently open for your cohort. Check back when the EC opens nominations.
          </p>
        </div>
      </div>
    );
  }

  const selectedPosition = eligiblePositions.find(p => p.id === parseInt(positionId, 10));

  // Eligible nominees: same cohort as the selected position's cohorts, excluding current member (if we wanted to block self, but self is allowed)
  const eligibleNominees: MemberEntry[] = selectedPosition
    ? (members ?? []).filter(m => {
        if (!selectedPosition.cohorts?.length) return true;
        return m.cohort ? selectedPosition.cohorts!.includes(m.cohort) : false;
      })
    : [];

  const words = wordCount(reason);
  const wordsOver = words > MAX_WORDS;

  function resetForm() {
    setPositionId("");
    setNomineeId("");
    setReason("");
    setRevealNominator(false);
    setFormError("");
    setSubmitted(false);
  }

  function handleSubmit() {
    if (!positionId) { setFormError("Please select a position."); return; }
    if (!nomineeId) { setFormError("Please select a nominee."); return; }
    if (!reason.trim()) { setFormError("Please provide a reason."); return; }
    if (wordsOver) { setFormError(`Reason must be ${MAX_WORDS} words or fewer (currently ${words}).`); return; }
    setFormError("");

    submitNomination.mutate(
      {
        data: {
          positionId: parseInt(positionId, 10),
          nomineeId,
          reason: reason.trim(),
          revealNominator,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNominationPositionsQueryKey() });
          setSubmitted(true);
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error;
          setFormError(msg ?? "Failed to submit nomination. Please try again.");
        },
      }
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="rounded-full bg-primary/10 p-4">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-xl font-semibold text-foreground">Nomination Submitted</p>
          <p className="text-sm text-muted-foreground mt-1">
            Thank you for nominating a classmate. The EC will review all nominations.
          </p>
        </div>
        <Button variant="outline" onClick={resetForm}>Submit Another Nomination</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Student Government</p>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Nominations</h2>
        <p className="text-muted-foreground mt-1">
          Nominate a classmate for an open position. You may submit multiple nominations.
        </p>
      </div>

      <div className="space-y-3">
        {eligiblePositions.map(pos => (
          <PositionCard key={pos.id} position={pos} />
        ))}
      </div>

      <Card className="shadow-sm">
        <div className="h-1 bg-accent w-full rounded-t-lg" />
        <CardHeader>
          <CardTitle className="text-lg">Submit a Nomination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <Label>Position</Label>
            <Select value={positionId} onValueChange={v => { setPositionId(v); setNomineeId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a position…" />
              </SelectTrigger>
              <SelectContent>
                {eligiblePositions.map(pos => (
                  <SelectItem key={pos.id} value={String(pos.id)}>{pos.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Nominee</Label>
            <Select
              value={nomineeId}
              onValueChange={setNomineeId}
              disabled={!positionId || membersLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={positionId ? "Select a classmate…" : "Select a position first"} />
              </SelectTrigger>
              <SelectContent>
                {eligibleNominees
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{m.email ? ` — ${m.email}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="reason-input">Why is this person a good fit?</Label>
              <span className={`text-xs ${wordsOver ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {words} / {MAX_WORDS} words
              </span>
            </div>
            <Textarea
              id="reason-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="In 300 words or less, describe why you think this person would excel in this role…"
              rows={5}
              className={wordsOver ? "border-destructive focus-visible:ring-destructive" : ""}
            />
          </div>

          <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 px-4 py-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                className="mt-0.5"
                checked={revealNominator}
                onCheckedChange={v => setRevealNominator(!!v)}
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Let the nominee know I nominated them
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  If checked, the EC may share your name with the nominee. If unchecked, your nomination will remain anonymous to the nominee.
                </p>
              </div>
            </label>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </CardContent>
        <CardFooter className="border-t border-border/50 pt-4">
          <Button
            onClick={handleSubmit}
            disabled={submitNomination.isPending || wordsOver}
            className="font-semibold"
          >
            {submitNomination.isPending ? "Submitting…" : "Submit Nomination"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function PositionCard({ position }: { position: NominationPosition }) {
  const isOpen = position.status === "open" && (!position.closesAt || new Date() < new Date(position.closesAt));
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{position.title}</CardTitle>
            {position.description && (
              <p className="text-sm text-muted-foreground mt-1">{position.description}</p>
            )}
          </div>
          <Badge className={isOpen ? "bg-primary/10 text-primary border-primary/20" : ""} variant={isOpen ? undefined : "secondary"}>
            {isOpen ? "Open" : "Closed"}
          </Badge>
        </div>
      </CardHeader>
      {position.closesAt && (
        <CardContent className="pt-0 pb-3">
          <p className="text-xs text-muted-foreground">
            Nominations close: {format(new Date(position.closesAt), "MMM d, yyyy h:mm a")}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
