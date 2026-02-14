import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useWebSocket } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Users, Pin, LogOut, Settings, Shield, Wifi, WifiOff, ChevronDown, ChevronUp, User, Trophy, Sun, Moon, CheckSquare, X, Trash2, Timer, Bell } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import ChatMessage from "@/components/chat-message";
import ChatInput from "@/components/chat-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Message, Member, Reaction, ChatSettings, Notification } from "@shared/schema";

function renderLinkedText(content: string | null) {
  if (!content) return null;
  const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;
  const parts = content.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatPage() {
  const { member, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { subscribe, send, isConnected } = useWebSocket();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [, setLocation] = useLocation();
  const [restrictDialog, setRestrictDialog] = useState<string | null>(null);
  const [restrictDuration, setRestrictDuration] = useState("1");
  const [onlineCount, setOnlineCount] = useState(0);
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showDisappearDialog, setShowDisappearDialog] = useState(false);
  const [disappearHours, setDisappearHours] = useState("0");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (isConnected && member) {
      send({ type: "register", memberId: member.id });
    }
  }, [isConnected, member, send]);

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["/api/members"],
  });

  const { data: allReactions = [] } = useQuery<Reaction[]>({
    queryKey: ["/api/reactions"],
  });

  const { data: chatSettings } = useQuery<ChatSettings>({
    queryKey: ["/api/chat-settings"],
  });

  const { data: communitySettings } = useQuery<{ communityName: string }>({
    queryKey: ["/api/community-settings"],
  });
  const communityName = communitySettings?.communityName || "Community Hub";

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count"],
    select: (data: any) => data.count ?? 0,
    refetchInterval: 30000,
  });

  const { data: notificationsList = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: showNotifications,
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  useEffect(() => {
    const unsub = subscribe((data: any) => {
      if (data.type === "new_message" || data.type === "message_deleted" || data.type === "message_pinned") {
        queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      }
      if (data.type === "new_reaction") {
        queryClient.invalidateQueries({ queryKey: ["/api/reactions"] });
      }
      if (data.type === "chat_settings_updated") {
        queryClient.invalidateQueries({ queryKey: ["/api/chat-settings"] });
      }
      if (data.type === "member_updated") {
        queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      }
      if (data.type === "online_count") {
        setOnlineCount(data.count);
      }
      if (data.type === "notification" && data.recipientId === member?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      }
    });
    return unsub;
  }, [subscribe]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, replyToId }: { content: string; replyToId?: string }) => {
      const res = await apiRequest("POST", "/api/messages", { content, type: "text", replyToId: replyToId || null });
      return res;
    },
    onError: (err: any) => {
      let msg = err.message || "Failed to send message";
      try {
        const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        if (parsed.message) msg = parsed.message;
      } catch {}
      toast({ title: "Message blocked", description: msg, variant: "destructive" });
    },
  });

  const sendFileMutation = useMutation({
    mutationFn: async ({ file, replyToId }: { file: File; replyToId?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (replyToId) formData.append("replyToId", replyToId);
      const res = await fetch("/api/messages/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const reactMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      await apiRequest("POST", "/api/reactions", { messageId, emoji });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("POST", `/api/messages/${messageId}/pin`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/messages/${messageId}`);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      const res = await apiRequest("POST", "/api/messages/bulk-delete", { messageIds });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setSelectMode(false);
      setSelectedMessages(new Set());
      const desc = data.skipped > 0 ? `${data.skipped} admin message(s) were protected` : undefined;
      toast({ title: `${data.deleted} message(s) deleted`, description: desc });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const disappearMutation = useMutation({
    mutationFn: async (hours: number | null) => {
      await apiRequest("PATCH", "/api/chat-settings/disappear", { hours });
    },
    onSuccess: () => {
      setShowDisappearDialog(false);
      toast({ title: "Disappearing messages updated" });
    },
  });

  const restrictMutation = useMutation({
    mutationFn: async ({ memberId, hours }: { memberId: string; hours: number }) => {
      await apiRequest("POST", `/api/members/${memberId}/restrict`, { hours });
    },
    onSuccess: () => {
      toast({ title: "Member restricted" });
      setRestrictDialog(null);
    },
  });

  const toggleChatMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/chat-settings/toggle");
    },
  });

  const isRestricted = member?.restrictedUntil && new Date(member.restrictedUntil) > new Date();
  const restrictedMessage = isRestricted
    ? `You are restricted from sending messages until ${new Date(member!.restrictedUntil!).toLocaleTimeString()}`
    : null;

  const chatDisabled = chatSettings?.chatDisabled && !isAdmin;

  const pinnedMessages = messages.filter((m) => m.isPinned);
  const activeMessages = messages.filter((m) => !m.isDeleted);

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (!member) return null;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between gap-1 px-2 sm:px-4 py-2 border-b bg-background sticky top-0 z-50">
        <div className="flex items-center gap-2 min-w-0 flex-shrink">
          <MessageCircle className="w-5 h-5 text-primary flex-shrink-0" />
          <h1 className="font-semibold text-sm sm:text-base truncate" data-testid="text-chat-title">{communityName}</h1>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-emerald-500" />
            ) : (
              <WifiOff className="w-3 h-3 text-destructive" />
            )}
            <span className="text-[11px] text-muted-foreground hidden sm:inline" data-testid="text-online-count">{onlineCount} online</span>
          </div>
        </div>
        <div className="flex items-center gap-0 flex-shrink-0">
          {isAdmin && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setLocation("/admin")}
                title="Admin Panel"
                data-testid="button-admin-panel"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => toggleChatMutation.mutate()}
                title={chatSettings?.chatDisabled ? "Enable chat" : "Disable chat"}
                data-testid="button-toggle-chat"
              >
                <Shield className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setSelectMode(!selectMode); setSelectedMessages(new Set()); }}
                title="Select messages"
                data-testid="button-select-mode"
              >
                <CheckSquare className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setDisappearHours(String(chatSettings?.disappearAfterHours || 0)); setShowDisappearDialog(true); }}
                title="Disappearing messages"
                data-testid="button-disappear-settings"
              >
                <Timer className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setShowMembers(!showMembers)} data-testid="button-toggle-members">
                <Users className="w-4 h-4" />
              </Button>
            </>
          )}
          <Popover open={showNotifications} onOpenChange={(open) => {
            setShowNotifications(open);
            if (open && unreadCount > 0) markReadMutation.mutate();
          }}>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="relative" title="Notifications" data-testid="button-notifications">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-medium" data-testid="text-unread-count">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 max-h-80 overflow-y-auto" align="end">
              <div className="px-3 py-2 border-b">
                <h3 className="text-sm font-semibold">Notifications</h3>
              </div>
              {notificationsList.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet</div>
              ) : (
                <div className="divide-y">
                  {notificationsList.slice(0, 20).map((n) => {
                    const nSender = members.find((m) => m.id === n.senderId);
                    const nMsg = messages.find((m) => m.id === n.messageId);
                    return (
                      <div
                        key={n.id}
                        className={cn("px-3 py-2 text-sm", !n.isRead && "bg-primary/5")}
                        data-testid={`notification-${n.id}`}
                      >
                        <p>
                          <span className="font-medium">{nSender?.name || "Someone"}</span>{" "}
                          {n.type === "reply" ? "replied to your message" : "mentioned you"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {nMsg?.content || (nMsg?.type === "image" ? "Sent a photo" : nMsg?.type === "file" ? "Sent a file" : "")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" onClick={() => setLocation("/leaderboard")} title="Leaderboard" data-testid="button-leaderboard">
            <Trophy className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setLocation("/profile")} title="My Profile" data-testid="button-profile">
            <User className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={toggleTheme} title={theme === "light" ? "Dark mode" : "Light mode"} data-testid="button-theme-toggle">
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={logout} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Select mode bar */}
      {selectMode && (
        <div className="px-3 py-2 bg-primary/10 border-b flex items-center justify-between gap-2 sticky top-[49px] z-50">
          <span className="text-sm font-medium">{selectedMessages.size} selected</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="destructive"
              disabled={selectedMessages.size === 0 || bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedMessages))}
              data-testid="button-bulk-delete"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelectedMessages(new Set()); }} data-testid="button-cancel-select">
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Chat disabled banner */}
      {chatSettings?.chatDisabled && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm text-center">
          Chat is currently disabled by admin
        </div>
      )}

      {/* Disappearing messages indicator */}
      {chatSettings?.disappearAfterHours && (
        <div className="px-4 py-1 bg-muted/50 text-muted-foreground text-xs text-center flex items-center justify-center gap-1">
          <Timer className="w-3 h-3" />
          Messages disappear after {chatSettings.disappearAfterHours >= 24 ? `${Math.round(chatSettings.disappearAfterHours / 24)} day(s)` : `${chatSettings.disappearAfterHours} hour(s)`}
        </div>
      )}

      {/* Sticky pinned messages */}
      {pinnedMessages.length > 0 && (
        <div className="border-b bg-primary/5 sticky top-[49px] z-40" data-testid="pinned-messages-bar">
          <button
            className="w-full px-4 py-2 flex items-center gap-2 text-left"
            onClick={() => setPinnedExpanded(!pinnedExpanded)}
            data-testid="button-toggle-pinned"
          >
            <Pin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="text-xs font-medium text-primary flex-1">
              {pinnedMessages.length} pinned {pinnedMessages.length === 1 ? "message" : "messages"}
            </span>
            {pinnedExpanded ? (
              <ChevronUp className="w-3 h-3 text-primary" />
            ) : (
              <ChevronDown className="w-3 h-3 text-primary" />
            )}
          </button>
          {pinnedExpanded && (
            <div className="px-4 pb-2 space-y-1">
              {pinnedMessages.map((m) => {
                const s = members.find((mb) => mb.id === m.senderId);
                return (
                  <div key={m.id} className="flex items-start gap-1 group" data-testid={`pinned-${m.id}`}>
                    <p className="text-xs text-muted-foreground flex-1 min-w-0">
                      <span className="font-medium text-foreground">{s?.name}</span>:{" "}
                      <span className="break-words">{renderLinkedText(m.content)}</span>
                    </p>
                    {isAdmin && (
                      <button
                        className="flex-shrink-0 p-0.5 rounded hover-elevate text-muted-foreground"
                        onClick={() => pinMutation.mutate(m.id)}
                        data-testid={`button-unpin-${m.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="py-4 space-y-0.5">
              {loadingMessages ? (
                <div className="space-y-4 px-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-4 w-full max-w-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                  <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Be the first to start the conversation!</p>
                </div>
              ) : (
                activeMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start">
                    {selectMode && (
                      <div className="flex items-center pl-2 pt-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary cursor-pointer"
                          checked={selectedMessages.has(msg.id)}
                          onChange={() => {
                            const next = new Set(selectedMessages);
                            if (next.has(msg.id)) next.delete(msg.id);
                            else next.add(msg.id);
                            setSelectedMessages(next);
                          }}
                          data-testid={`checkbox-msg-${msg.id}`}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <ChatMessage
                        message={msg}
                        sender={members.find((m) => m.id === msg.senderId)}
                        currentMemberId={member.id}
                        isAdmin={isAdmin}
                        reactions={allReactions.filter((r) => r.messageId === msg.id)}
                        allMembers={members}
                        allMessages={messages}
                        onReact={(messageId, emoji) => reactMutation.mutate({ messageId, emoji })}
                        onPin={(messageId) => pinMutation.mutate(messageId)}
                        onDelete={(messageId) => deleteMutation.mutate(messageId)}
                        onRestrict={(memberId) => setRestrictDialog(memberId)}
                        onReply={(msg) => setReplyTo(msg)}
                      />
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <ChatInput
            members={members}
            onSendMessage={(content, replyToId) => sendMessageMutation.mutate({ content, replyToId })}
            onSendFile={(file, replyToId) => sendFileMutation.mutate({ file, replyToId })}
            disabled={chatDisabled || !!isRestricted}
            restrictedMessage={restrictedMessage}
            fileSendDisabled={!isAdmin && !!chatSettings?.memberFileSendDisabled}
            replyTo={replyTo}
            replyToSenderName={replyTo ? (members.find((m) => m.id === replyTo.senderId)?.name || "Unknown") : null}
            onCancelReply={() => setReplyTo(null)}
          />
        </div>

        {/* Members sidebar */}
        {showMembers && (
          <div className="w-64 border-l bg-background overflow-y-auto absolute right-0 top-0 bottom-0 z-30 sm:relative sm:z-auto">
            <div className="p-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />
                Members ({members.filter(m => m.isActive).length})
              </h3>
            </div>
            <div className="p-2 space-y-0.5">
              {members.filter(m => m.isActive).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                  data-testid={`member-${m.id}`}
                >
                  <Avatar className="w-7 h-7">
                    {m.profilePicture ? <AvatarImage src={m.profilePicture} alt={m.name} /> : null}
                    <AvatarFallback className="text-[10px]">{getInitials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{m.name}</p>
                  </div>
                  {m.role === "admin" && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">Admin</Badge>
                  )}
                  {m.role === "sub-admin" && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">Sub-Admin</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Restrict member dialog */}
      <Dialog open={!!restrictDialog} onOpenChange={() => setRestrictDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restrict Member</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            How long should this member be restricted from sending messages?
          </p>
          <Select value={restrictDuration} onValueChange={setRestrictDuration}>
            <SelectTrigger data-testid="select-restrict-duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 hour</SelectItem>
              <SelectItem value="2">2 hours</SelectItem>
              <SelectItem value="4">4 hours</SelectItem>
              <SelectItem value="8">8 hours</SelectItem>
              <SelectItem value="24">24 hours</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestrictDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => restrictDialog && restrictMutation.mutate({ memberId: restrictDialog, hours: parseInt(restrictDuration) })}
              data-testid="button-confirm-restrict"
            >
              Restrict
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disappearing messages dialog */}
      <Dialog open={showDisappearDialog} onOpenChange={setShowDisappearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Disappearing Messages
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set a time after which messages will automatically disappear from the chat. Pinned messages are not affected.
          </p>
          <Select value={disappearHours} onValueChange={setDisappearHours}>
            <SelectTrigger data-testid="select-disappear-time">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Off</SelectItem>
              <SelectItem value="1">1 hour</SelectItem>
              <SelectItem value="6">6 hours</SelectItem>
              <SelectItem value="12">12 hours</SelectItem>
              <SelectItem value="24">24 hours</SelectItem>
              <SelectItem value="48">2 days</SelectItem>
              <SelectItem value="168">7 days</SelectItem>
              <SelectItem value="720">30 days</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisappearDialog(false)}>Cancel</Button>
            <Button
              onClick={() => disappearMutation.mutate(disappearHours === "0" ? null : parseInt(disappearHours))}
              disabled={disappearMutation.isPending}
              data-testid="button-save-disappear"
            >
              {disappearMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
