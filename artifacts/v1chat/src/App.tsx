import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Chat from "@/pages/Chat";
import NotFound from "@/pages/not-found";
import VipPage from "@/pages/VipPage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import VisitorsPage from "@/pages/VisitorsPage";
import ReferralPage from "@/pages/ReferralPage";
import MatchHistoryPage from "@/pages/MatchHistoryPage";

const queryClient = new QueryClient();

function ChatRoute() {
  return <Chat />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatRoute} />
      <Route path="/vip" component={VipPage} />
      <Route path="/leaderboard" component={LeaderboardPage} />
      <Route path="/visitors" component={VisitorsPage} />
      <Route path="/referral" component={ReferralPage} />
      <Route path="/history" component={MatchHistoryPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
