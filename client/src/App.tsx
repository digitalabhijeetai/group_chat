import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WebSocketProvider } from "@/lib/websocket";
import { ThemeProvider } from "@/components/theme-provider";
import LoginPage from "@/pages/login";
import ChatPage from "@/pages/chat";
import AdminPage from "@/pages/admin";
import ProfilePage from "@/pages/profile";
import LeaderboardPage from "@/pages/leaderboard";
import NotFound from "@/pages/not-found";
import { Skeleton } from "@/components/ui/skeleton";

function AuthGate() {
  const { member, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 text-center">
          <Skeleton className="w-12 h-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!member) return <LoginPage />;

  return (
    <WebSocketProvider>
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/leaderboard" component={LeaderboardPage} />
        <Route component={NotFound} />
      </Switch>
    </WebSocketProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </ThemeProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
