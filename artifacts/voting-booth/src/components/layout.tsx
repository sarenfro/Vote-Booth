import { Link, useRoute } from "wouter";
import { useMemberId } from "@/hooks/use-member-id";
import { useMe } from "@/hooks/use-me";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [memberId, setMemberId] = useMemberId();
  const { data: me } = useMe(memberId);
  const isAdmin = me?.isAdmin ?? false;
  const isEc = me?.isEc ?? false;

  const [onAdmin] = useRoute("/admin");
  const [onEc] = useRoute("/ec");
  const [onResults] = useRoute("/results");

  const activeLabel = onAdmin ? "Admin Panel" : onEc ? "EC Dashboard" : onResults ? "Results" : "Voting Booth";

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

          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link href="/admin">
                <Button variant="secondary" size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 border-transparent font-medium shadow-sm">
                  Admin Panel
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-primary-foreground/80 hidden sm:inline-block">Member ID:</span>
              <Input
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder="Enter ID..."
                className="w-24 h-8 bg-primary-foreground/10 border-primary-foreground/20 text-white placeholder:text-primary-foreground/50 focus-visible:ring-accent"
              />
            </div>
          </div>
        </div>

        <nav className="max-w-5xl mx-auto px-6 flex items-center gap-1 pb-0" aria-label="Portal navigation">
          <NavTab label="Voting Booth" href="/" active={activeLabel === "Voting Booth"} enabled />
          {isEc && <NavTab label="EC Dashboard" href="/ec" active={activeLabel === "EC Dashboard"} enabled />}
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
