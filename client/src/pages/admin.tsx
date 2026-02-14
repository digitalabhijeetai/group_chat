import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, UserPlus, Pencil, Shield, Plus, Clock, X, Ban, Trash2, Upload, ShieldCheck, ShieldOff, Type } from "lucide-react";
import type { Member, BlockedKeyword, ChatSettings } from "@shared/schema";

export default function AdminPage() {
  const { isAdmin, isPrimaryAdmin } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [deleteMemberId, setDeleteMemberId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMembers, setNewMembers] = useState([{ name: "", phone: "" }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [editKeyword, setEditKeyword] = useState<BlockedKeyword | null>(null);
  const [editKeywordText, setEditKeywordText] = useState("");
  const [csvResult, setCsvResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [communityNameInput, setCommunityNameInput] = useState("");

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["/api/members"],
  });

  const { data: blockedKeywords = [] } = useQuery<BlockedKeyword[]>({
    queryKey: ["/api/blocked-keywords"],
  });

  const { data: communitySettings } = useQuery<{ communityName: string }>({
    queryKey: ["/api/community-settings"],
  });

  const { data: chatSettings } = useQuery<ChatSettings>({
    queryKey: ["/api/chat-settings"],
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Member> }) => {
      await apiRequest("PATCH", `/api/members/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setEditMember(null);
      toast({ title: "Member updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (memberList: { name: string; phone: string }[]) => {
      await apiRequest("POST", "/api/members/bulk", { members: memberList });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setShowAddDialog(false);
      setNewMembers([{ name: "", phone: "" }]);
      toast({ title: "Members added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const csvImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/members/csv-import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "CSV import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setCsvResult(data);
      toast({ title: `CSV imported: ${data.added} added, ${data.skipped} skipped` });
    },
    onError: (err: any) => toast({ title: "CSV Import Error", description: err.message, variant: "destructive" }),
  });

  const liftRestrictionMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("POST", `/api/members/${memberId}/unrestrict`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Restriction lifted" });
    },
  });

  const makeSubAdminMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("POST", `/api/members/${memberId}/make-sub-admin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member promoted to Sub-Admin" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeSubAdminMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("POST", `/api/members/${memberId}/remove-sub-admin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Sub-Admin role removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("DELETE", `/api/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setDeleteMemberId(null);
      toast({ title: "Member deleted" });
    },
    onError: (err: any) => {
      setDeleteMemberId(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addKeywordMutation = useMutation({
    mutationFn: async (keyword: string) => {
      await apiRequest("POST", "/api/blocked-keywords", { keyword });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-keywords"] });
      setNewKeyword("");
      toast({ title: "Keyword added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateKeywordMutation = useMutation({
    mutationFn: async ({ id, keyword }: { id: string; keyword: string }) => {
      await apiRequest("PATCH", `/api/blocked-keywords/${id}`, { keyword });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-keywords"] });
      setEditKeyword(null);
      toast({ title: "Keyword updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteKeywordMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/blocked-keywords/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-keywords"] });
      toast({ title: "Keyword removed" });
    },
  });

  const updateCommunityNameMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("PATCH", "/api/community-settings", { communityName: name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community-settings"] });
      toast({ title: "Community name updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleFileSendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/chat-settings/toggle-file-send");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-settings"] });
      toast({ title: chatSettings?.memberFileSendDisabled ? "File sharing enabled for members" : "File sharing disabled for members" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const togglePhoneFilterMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/chat-settings/toggle-phone-filter");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-settings"] });
      toast({ title: chatSettings?.phoneNumberFilterEnabled ? "Phone number filter disabled" : "Phone number filter enabled" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  const openEdit = (m: Member) => {
    setEditMember(m);
    setEditName(m.name);
    setEditPhone(m.phone || "");
    setEditActive(m.isActive);
  };

  const handleSaveEdit = () => {
    if (!editMember) return;
    updateMemberMutation.mutate({
      id: editMember.id,
      data: { name: editName, phone: editPhone, isActive: editActive },
    });
  };

  const addRow = () => setNewMembers([...newMembers, { name: "", phone: "" }]);
  const removeRow = (i: number) => setNewMembers(newMembers.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: string, value: string) => {
    const updated = [...newMembers];
    (updated[i] as any)[field] = value;
    setNewMembers(updated);
  };

  const handleBulkAdd = () => {
    const valid = newMembers.filter((m) => m.name.trim() && m.phone.trim());
    if (valid.length === 0) {
      toast({ title: "Add at least one member", variant: "destructive" });
      return;
    }
    bulkAddMutation.mutate(valid);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvResult(null);
    csvImportMutation.mutate(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.phone?.includes(searchQuery)
  );

  const PRIMARY_ADMIN_PHONE = "7030809030";

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-50 bg-background">
        <Button size="icon" variant="ghost" onClick={() => setLocation("/")} data-testid="button-back-to-chat">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Admin Panel
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4">
        <Tabs defaultValue="members">
          <TabsList className="mb-4">
            <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>
            <TabsTrigger value="keywords" data-testid="tab-keywords">Blocked Keywords</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
                data-testid="input-search-members"
              />
              <Badge variant="secondary">{members.length} total</Badge>
              <Badge variant="secondary">{members.filter(m => m.isActive).length} active</Badge>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={csvImportMutation.isPending}
                  data-testid="button-csv-import"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {csvImportMutation.isPending ? "Importing..." : "Import CSV"}
                </Button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCsvUpload}
                  data-testid="input-csv-file"
                />
                <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-members">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Members
                </Button>
              </div>
            </div>

            {csvResult && (
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="secondary" data-testid="csv-result-added">{csvResult.added} added</Badge>
                    <Badge variant="outline" data-testid="csv-result-skipped">{csvResult.skipped} skipped (duplicates)</Badge>
                    {csvResult.errors.length > 0 && (
                      <Badge variant="destructive">{csvResult.errors.length} errors</Badge>
                    )}
                  </div>
                  {csvResult.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {csvResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-destructive">{err}</p>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" className="mt-2" onClick={() => setCsvResult(null)}>
                    <X className="w-3 h-3 mr-1" /> Dismiss
                  </Button>
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">
              CSV file should have columns: <strong>name</strong> and <strong>phone</strong>. One member per row.
            </p>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((m) => {
                  const isRestricted = m.restrictedUntil && new Date(m.restrictedUntil) > new Date();
                  const isPrimary = m.phone === PRIMARY_ADMIN_PHONE;
                  return (
                    <Card key={m.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          {m.profilePicture ? <AvatarImage src={m.profilePicture} alt={m.name} /> : null}
                          <AvatarFallback className="text-xs">{getInitials(m.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm" data-testid={`admin-member-name-${m.id}`}>{m.name}</span>
                            {m.role === "admin" && <Badge variant="secondary" className="text-[10px] px-1 py-0">Admin</Badge>}
                            {m.role === "sub-admin" && <Badge variant="outline" className="text-[10px] px-1 py-0">Sub-Admin</Badge>}
                            {!m.isActive && <Badge variant="destructive" className="text-[10px] px-1 py-0">Inactive</Badge>}
                            {isRestricted && <Badge variant="outline" className="text-[10px] px-1 py-0">Restricted</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{m.phone}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isRestricted && (
                            <Button size="icon" variant="ghost" onClick={() => liftRestrictionMutation.mutate(m.id)} title="Lift restriction" data-testid={`button-unrestrict-${m.id}`}>
                              <Clock className="w-4 h-4 text-amber-500" />
                            </Button>
                          )}
                          {isPrimaryAdmin && !isPrimary && m.role === "member" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => makeSubAdminMutation.mutate(m.id)}
                              title="Make Sub-Admin"
                              data-testid={`button-make-sub-admin-${m.id}`}
                            >
                              <ShieldCheck className="w-4 h-4 text-primary" />
                            </Button>
                          )}
                          {isPrimaryAdmin && m.role === "sub-admin" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeSubAdminMutation.mutate(m.id)}
                              title="Remove Sub-Admin"
                              data-testid={`button-remove-sub-admin-${m.id}`}
                            >
                              <ShieldOff className="w-4 h-4 text-amber-500" />
                            </Button>
                          )}
                          {!isPrimary && (
                            <Button size="icon" variant="ghost" onClick={() => openEdit(m)} data-testid={`button-edit-member-${m.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {!isPrimary && (
                            <Button size="icon" variant="ghost" onClick={() => setDeleteMemberId(m.id)} data-testid={`button-delete-member-${m.id}`}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="keywords" className="space-y-4">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Add a blocked keyword..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newKeyword.trim()) addKeywordMutation.mutate(newKeyword);
                }}
                className="max-w-sm"
                data-testid="input-new-keyword"
              />
              <Button
                onClick={() => newKeyword.trim() && addKeywordMutation.mutate(newKeyword)}
                disabled={!newKeyword.trim() || addKeywordMutation.isPending}
                data-testid="button-add-keyword"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Messages containing any of these keywords will be automatically blocked. Members will see an error when trying to send.
            </p>

            {blockedKeywords.length === 0 ? (
              <div className="text-center py-8">
                <Ban className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No blocked keywords yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedKeywords.map((k) => (
                  <Card key={k.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Ban className="w-4 h-4 text-destructive flex-shrink-0" />
                      <span className="flex-1 text-sm font-medium" data-testid={`keyword-${k.id}`}>{k.keyword}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditKeyword(k); setEditKeywordText(k.keyword); }}
                          data-testid={`button-edit-keyword-${k.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteKeywordMutation.mutate(k.id)}
                          data-testid={`button-delete-keyword-${k.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Type className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Community Display Name</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This name appears on the login screen and chat header for all members.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    data-testid="input-community-name"
                    placeholder={communitySettings?.communityName || "Community Hub"}
                    value={communityNameInput}
                    onChange={(e) => setCommunityNameInput(e.target.value)}
                    maxLength={50}
                    className="flex-1 min-w-[200px]"
                    onFocus={() => {
                      if (!communityNameInput && communitySettings?.communityName) {
                        setCommunityNameInput(communitySettings.communityName);
                      }
                    }}
                  />
                  <Button
                    data-testid="button-save-community-name"
                    onClick={() => {
                      if (communityNameInput.trim()) {
                        updateCommunityNameMutation.mutate(communityNameInput.trim());
                      }
                    }}
                    disabled={!communityNameInput.trim() || updateCommunityNameMutation.isPending}
                  >
                    {updateCommunityNameMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
                {communitySettings?.communityName && (
                  <p className="text-xs text-muted-foreground">
                    Current name: <span className="font-medium text-foreground" data-testid="text-current-community-name">{communitySettings.communityName}</span>
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Member File Sharing</span>
                    <p className="text-xs text-muted-foreground">
                      When disabled, regular members cannot send images or files. Admins and sub-admins can always share files.
                    </p>
                  </div>
                  <Switch
                    checked={!chatSettings?.memberFileSendDisabled}
                    onCheckedChange={() => toggleFileSendMutation.mutate()}
                    disabled={toggleFileSendMutation.isPending}
                    data-testid="switch-file-send"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Phone Number Filter</span>
                    <p className="text-xs text-muted-foreground">
                      When enabled, messages containing phone numbers from regular members will be automatically blocked. Admins and sub-admins are not affected.
                    </p>
                  </div>
                  <Switch
                    checked={!!chatSettings?.phoneNumberFilterEnabled}
                    onCheckedChange={() => togglePhoneFilterMutation.mutate()}
                    disabled={togglePhoneFilterMutation.isPending}
                    data-testid="switch-phone-filter"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit member dialog */}
      <Dialog open={!!editMember} onOpenChange={() => setEditMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-name" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} data-testid="input-edit-phone" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} data-testid="switch-edit-active" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMemberMutation.isPending} data-testid="button-save-edit">
              {updateMemberMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add members dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg w-[calc(100%-2rem)] mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Add New Members
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-72">
            <div className="space-y-3 pr-4">
              {newMembers.map((m, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      placeholder="Name"
                      value={m.name}
                      onChange={(e) => updateRow(i, "name", e.target.value)}
                      data-testid={`input-new-member-name-${i}`}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      placeholder="Phone"
                      value={m.phone}
                      onChange={(e) => updateRow(i, "phone", e.target.value)}
                      data-testid={`input-new-member-phone-${i}`}
                    />
                  </div>
                  {newMembers.length > 1 && (
                    <Button size="icon" variant="ghost" onClick={() => removeRow(i)} className="self-end" data-testid={`button-remove-row-${i}`}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
          <Button variant="ghost" onClick={addRow} className="w-full" data-testid="button-add-row">
            <Plus className="w-4 h-4 mr-2" />
            Add another member
          </Button>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkAdd} disabled={bulkAddMutation.isPending} data-testid="button-submit-members">
              {bulkAddMutation.isPending ? "Adding..." : `Add ${newMembers.filter(m => m.name && m.phone).length} member(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit keyword dialog */}
      <Dialog open={!!editKeyword} onOpenChange={() => setEditKeyword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Blocked Keyword</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Keyword</Label>
            <Input
              value={editKeywordText}
              onChange={(e) => setEditKeywordText(e.target.value)}
              data-testid="input-edit-keyword"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditKeyword(null)}>Cancel</Button>
            <Button
              onClick={() => editKeyword && updateKeywordMutation.mutate({ id: editKeyword.id, keyword: editKeywordText })}
              disabled={updateKeywordMutation.isPending}
              data-testid="button-save-keyword"
            >
              {updateKeywordMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete member confirmation */}
      <AlertDialog open={!!deleteMemberId} onOpenChange={() => setDeleteMemberId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this member? This action cannot be undone. All their messages will remain but they will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMemberId && deleteMemberMutation.mutate(deleteMemberId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-member"
            >
              {deleteMemberMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
