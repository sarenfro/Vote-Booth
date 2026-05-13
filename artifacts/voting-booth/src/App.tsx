import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Home } from "@/pages/home";
import { Layout } from "@/components/layout";
import { Ballot } from "@/pages/ballot";
import { EcDashboard } from "@/pages/ec-dashboard";
import { Results } from "@/pages/results";
import { useMemberId, MemberIdContext } from "@/hooks/use-member-id";

const queryClient = new QueryClient();

function AppWithMemberId({ children }: { children: React.ReactNode }) {
  const [memberId, setMemberId] = useMemberId();
  return (
    <MemberIdContext.Provider value={{ memberId, setMemberId }}>
      {children}
    </MemberIdContext.Provider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/ec" component={EcDashboard} />
      <Route path="/results" component={Results} />
      <Route path="/:id" component={Ballot} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppWithMemberId>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Layout>
              <Router />
            </Layout>
          </WouterRouter>
          <Toaster />
        </AppWithMemberId>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
