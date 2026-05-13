import { Link, useRoute } from "wouter";
import { useMemberId } from "@/hooks/use-member-id";
import { useMe } from "@/hooks/use-me";
import { useMembers } from "@/hooks/use-members";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [memberId, setMemberId] = useMemberId();
  const { data: me } = useMe(memberId);
  const { data: memberList = [] } = useMembers();
  const isAdmin = me?.isAdmin ?? false;
  const isEc = me?.isEc ?? false;

  const [onAdmin] = useRoute("/admin");
  const [onEc] = useRoute("/ec");
  const [onResults] = useRoute("/results");

  const activeLabel = onAdmin ? "Admin Panel" : onEc ? "EC Dashboard" : onResults ? "Results" : "Voting Booth";

  function roleLabel(m: { isAdmin: boolean; isEc: boolean }) {
    if (m.isAdmin) return "Admin";
    if (m.isEc) return "EC";
    return "Member";
  }

  function emailPrefix(email: string) {
    return email.split("@")[0];
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="bg-primary text-primary-foreground shadow-sm border-b border-primary-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between w-full">
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="bg-white text-primary font-bold rounded-sm w-8 h-8 flex items-center justify-center text-sm">W</div>
            <div>
              <h1 className="font-semibold text-lg leading-none tracking-tight">Foster MBAA</h1>
              <p className="text-xs text-primary-foreground/80 font-medium">Student Association Portal</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link href="/admin">
                <Button variant="secondary" size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 border-transparent font-medium shadow-sm">
                  Admin Panel
                </Button>
              </Link>
            )}

            <Select
              value={memberId || "__none__"}
              onValueChange={(v) => setMemberId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="h-8 w-48 bg-primary-foreground/10 border-primary-foreground/20 text-white [&>span]:truncate focus:ring-accent">
                <SelectValue placeholder="Sign in…" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="__none__" className="text-muted-foreground italic">
                  — Sign out —
                </SelectItem>
                {memberList.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{emailPrefix(m.email)}</span>
                      <RoleBadge role={roleLabel(m)} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <nav className="max-w-5xl mx-auto px-6 flex items-center gap-1 pb-0" aria-label="Portal navigation">
          <NavTab label="Voting Booth" href="/" active={activeLabel === "Voting Booth"} enabled />
          {(isEc || isAdmin) && <NavTab label="EC Dashboard" href="/ec" active={activeLabel === "EC Dashboard"} enabled />}
          <NavTab label="Results" href="/results" active={activeLabel === "Results"} enabled />
        </nav>
      </header>

      <main className="flex-1 bg-background pb-12 pt-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    "Admin + EC": "bg-purple-100 text-purple-700",
    "Admin": "bg-red-100 text-red-700",
    "EC": "bg-blue-100 text-blue-700",
    "Member": "bg-gray-100 text-gray-600",
  };
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none", colors[role] ?? colors["Member"])}>
      {role}
    </span>
  );
}

function NavTab({ label, href, active, enabled }: { label: string; href: string; active: boolean; enabled: boolean }) {
  return (
    <Link
      href={href}
      aria-disabled={!enabled}
      onClick={enabled ? undefined : (e) => e.preventDefault()}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors select-none
        ${active
          ? "text-white border-b-2 border-accent"
          : enabled
          ? "text-primary-foreground/70 hover:text-white border-b-2 border-transparent"
          : "text-primary-foreground/40 border-b-2 border-transparent cursor-not-allowed"
        }`}
    >
      {label}
    </Link>
  );
}
