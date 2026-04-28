import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import ConnectionsPage from "@/pages/connections";
import ConnectionPage from "@/pages/connection";
import SettingsPage from "@/pages/settings";
import { Layout } from "@/components/layout";
import { useCurrentUser } from "@/hooks/use-current-user";
import { setBaseUrl } from "@workspace/api-client-react";

// Initialize API client base URL based on environment
const apiUrl = import.meta.env.VITE_API_URL || "";
setBaseUrl(apiUrl);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function Router() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return null;

  if (!user) {
    return (
      <Switch>
        <Route path="/auth" component={AuthPage} />
        <Route path="/" component={LandingPage} />
      </Switch>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={ConnectionsPage} />
        <Route path="/auth" component={ConnectionsPage} />
        <Route path="/connections" component={ConnectionsPage} />
        <Route path="/connections/:id" component={(props: any) => <ConnectionPage {...props} />} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
