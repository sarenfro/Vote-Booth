import { Link, useSearch } from "wouter";
import { useMemberId } from "@/hooks/use-member-id";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [memberId, setMemberId] = useMemberId();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isAdmin = searchParams.get("admin") === "true";

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="bg-primary text-primary-foreground py-4 px-6 shadow-sm border-b border-primary-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between w-full">
          <Link href={isAdmin ? "/?admin=true" : "/"} className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="bg-white text-primary font-bold rounded-sm w-8 h-8 flex items-center justify-center">W</div>
            <div>
              <h1 className="font-semibold text-lg leading-none tracking-tight">Foster MBAA</h1>
              <p className="text-xs text-primary-foreground/80 font-medium">Voting Booth</p>
            </div>
          </Link>
          
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link href="/admin?admin=true">
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
      </header>
      <main className="flex-1 bg-background pb-12 pt-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
