import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Camera, Briefcase, IndianRupee, Link as LinkIcon, ExternalLink } from "lucide-react";
import type { Member, ProjectUpdate } from "@shared/schema";

export default function ProfilePage() {
  const { member, refetchMember } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectsAdded, setProjectsAdded] = useState("");
  const [valueAdded, setValueAdded] = useState("");
  const [projectLink, setProjectLink] = useState("");

  const { data: projectUpdates = [] } = useQuery<ProjectUpdate[]>({
    queryKey: ["/api/members", member?.id, "project-updates"],
    queryFn: async () => {
      if (!member) return [];
      const res = await fetch(`/api/members/${member.id}/project-updates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!member,
  });

  const uploadPictureMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/members/profile-picture", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchMember();
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Profile picture updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateProjectsMutation = useMutation({
    mutationFn: async (data: { projectsAdded: number; valueAdded: number; projectLink: string }) => {
      const res = await apiRequest("POST", "/api/members/update-projects", data);
      return res;
    },
    onSuccess: () => {
      refetchMember();
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members", member?.id, "project-updates"] });
      setProjectsAdded("");
      setValueAdded("");
      setProjectLink("");
      toast({ title: "Project stats updated" });
    },
    onError: (err: any) => {
      let msg = err.message;
      try {
        const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        if (parsed.message) msg = parsed.message;
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadPictureMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpdateProjects = () => {
    const projects = parseInt(projectsAdded) || 0;
    const value = parseFloat(valueAdded) || 0;

    if (projects === 0 && value === 0) {
      toast({ title: "Error", description: "Add at least one project or some value", variant: "destructive" });
      return;
    }
    if (!projectLink.trim()) {
      toast({ title: "Error", description: "Project link is required", variant: "destructive" });
      return;
    }

    updateProjectsMutation.mutate({
      projectsAdded: projects,
      valueAdded: value,
      projectLink: projectLink.trim(),
    });
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (!member) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-50 bg-background">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/")} data-testid="button-back-to-chat">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-base font-semibold">My Profile</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-4">
            <div className="relative">
              <Avatar className="w-24 h-24">
                {member.profilePicture ? (
                  <AvatarImage src={member.profilePicture} alt={member.name} />
                ) : null}
                <AvatarFallback className="text-2xl">{getInitials(member.name)}</AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="secondary"
                className="absolute bottom-0 right-0 rounded-full w-8 h-8"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadPictureMutation.isPending}
                data-testid="button-upload-picture"
              >
                <Camera className="w-4 h-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePictureUpload}
                data-testid="input-profile-picture"
              />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold" data-testid="text-profile-name">{member.name}</h2>
              <p className="text-sm text-muted-foreground">{member.phone}</p>
              <Badge variant="secondary" className="mt-1">
                {member.role === "admin" ? "Admin" : member.role === "sub-admin" ? "Sub-Admin" : "Member"}
              </Badge>
            </div>
            <div className="flex items-center gap-6 pt-2">
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-xs">Projects</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-projects-count">{member.projectsCompleted}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <IndianRupee className="w-4 h-4" />
                  <span className="text-xs">Total Value</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-total-value">
                  ₹{parseFloat(member.totalProjectValue || "0").toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="font-semibold text-sm">Update Project Stats</h3>
            <p className="text-xs text-muted-foreground">
              Add your completed projects and their value. You must provide the published project link for verification.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">New Projects</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={projectsAdded}
                  onChange={(e) => setProjectsAdded(e.target.value)}
                  data-testid="input-projects-added"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value Added (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={valueAdded}
                  onChange={(e) => setValueAdded(e.target.value)}
                  data-testid="input-value-added"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <LinkIcon className="w-3 h-3" />
                Project Link (required)
              </Label>
              <Input
                type="url"
                placeholder="https://example.com/my-project"
                value={projectLink}
                onChange={(e) => setProjectLink(e.target.value)}
                data-testid="input-project-link"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleUpdateProjects}
              disabled={updateProjectsMutation.isPending}
              data-testid="button-update-projects"
            >
              {updateProjectsMutation.isPending ? "Updating..." : "Update Project Stats"}
            </Button>
          </CardContent>
        </Card>

        {projectUpdates.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Update History</h3>
              <div className="space-y-2">
                {projectUpdates.map((pu) => (
                  <div key={pu.id} className="flex items-center gap-3 text-sm border-b pb-2 last:border-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {parseInt(String(pu.projectsAdded)) > 0 && (
                          <Badge variant="secondary" className="text-[10px]">+{pu.projectsAdded} projects</Badge>
                        )}
                        {parseFloat(String(pu.valueAdded)) > 0 && (
                          <Badge variant="outline" className="text-[10px]">+₹{parseFloat(String(pu.valueAdded)).toLocaleString("en-IN")}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(pu.createdAt).toLocaleDateString()} {new Date(pu.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <a
                      href={pu.projectLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0"
                      data-testid={`link-project-${pu.id}`}
                    >
                      <Button size="icon" variant="ghost">
                        <ExternalLink className="w-4 h-4 text-primary" />
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
