import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { ArrowLeft, Trophy, Briefcase, IndianRupee } from "lucide-react";

interface LeaderboardEntry {
  id: string;
  name: string;
  profilePicture: string | null;
  projectsCompleted: number;
  totalProjectValue: string;
  role: string;
}

export default function LeaderboardPage() {
  const { member } = useAuth();
  const [, setLocation] = useLocation();

  const { data: leaderboard = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard"],
  });

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const filteredLeaderboard = leaderboard;

  if (!member) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-50 bg-background">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/")} data-testid="button-back-to-chat">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <h1 className="text-base font-semibold">Leaderboard</h1>
        </div>
        <Badge variant="secondary" className="ml-auto">Top 50</Badge>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredLeaderboard.length === 0 ? (
          <div className="text-center py-16">
            <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No entries yet</p>
            <p className="text-xs text-muted-foreground mt-1">Members will appear here once they add project stats.</p>
          </div>
        ) : (
          filteredLeaderboard.map((entry, index) => {
            const rank = index + 1;
            const isCurrentUser = entry.id === member.id;
            return (
              <Card key={entry.id} className={isCurrentUser ? "border-primary" : ""}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 text-center flex-shrink-0">
                    {rank <= 3 ? (
                      <span className={`text-lg font-bold ${rank === 1 ? "text-amber-500" : rank === 2 ? "text-gray-400" : "text-amber-700"}`} data-testid={`rank-${rank}`}>
                        {rank}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground font-medium" data-testid={`rank-${rank}`}>{rank}</span>
                    )}
                  </div>
                  <Avatar className="w-9 h-9">
                    {entry.profilePicture ? (
                      <AvatarImage src={entry.profilePicture} alt={entry.name} />
                    ) : null}
                    <AvatarFallback className="text-xs">{getInitials(entry.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate" data-testid={`leaderboard-name-${entry.id}`}>
                        {entry.name}
                      </span>
                      {isCurrentUser && <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {entry.projectsCompleted}
                      </span>
                      <span className="flex items-center gap-1" data-testid={`leaderboard-value-${entry.id}`}>
                        <IndianRupee className="w-3 h-3" />
                        ₹{parseFloat(entry.totalProjectValue).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
