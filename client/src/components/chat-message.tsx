import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Pin, Trash2, MoreVertical, SmilePlus, FileText, Download, Clock, Reply } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { useTheme } from "@/components/theme-provider";
import type { Message, Member, Reaction } from "@shared/schema";
import { cn } from "@/lib/utils";

function EmojiReactionPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const { theme } = useTheme();
  return (
    <EmojiPicker
      onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
      theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
      width={300}
      height={350}
      searchPlaceholder="Search emoji..."
      previewConfig={{ showPreview: false }}
      lazyLoadEmojis
    />
  );
}

interface ChatMessageProps {
  message: Message;
  sender: Member | undefined;
  currentMemberId: string;
  isAdmin: boolean;
  reactions: Reaction[];
  allMembers: Member[];
  allMessages: Message[];
  onReact: (messageId: string, emoji: string) => void;
  onPin: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onRestrict: (memberId: string) => void;
  onReply: (message: Message) => void;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

function renderContent(content: string | null, allMembers: Member[]) {
  if (!content) return null;

  const mentionRegex = /(@\w+(?:\s\w+)*)/g;
  const combinedRegex = new RegExp(`(${URL_REGEX.source})|(${mentionRegex.source})`, "g");

  const elements: (string | JSX.Element)[] = [];
  let lastIndex = 0;

  content.replace(combinedRegex, (match, url, _urlCapture, mention, offset) => {
    if (offset > lastIndex) {
      elements.push(content.slice(lastIndex, offset));
    }
    if (url) {
      elements.push(
        <a
          key={`link-${offset}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline break-all"
          data-testid={`link-${offset}`}
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      );
    } else if (mention) {
      const mentionName = mention.slice(1);
      const found = allMembers.find((m) => m.name.toLowerCase() === mentionName.toLowerCase());
      if (found) {
        elements.push(
          <span key={`mention-${offset}`} className="text-primary font-medium">
            {mention}
          </span>
        );
      } else {
        elements.push(mention);
      }
    }
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  return elements.length > 0 ? elements : content;
}

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function getRoleBadge(role: string) {
  if (role === "admin") return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Admin</Badge>;
  if (role === "sub-admin") return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Sub-Admin</Badge>;
  return null;
}

export default function ChatMessage({
  message, sender, currentMemberId, isAdmin, reactions, allMembers, allMessages,
  onReact, onPin, onDelete, onRestrict, onReply,
}: ChatMessageProps) {
  const [showReactions, setShowReactions] = useState(false);
  const isOwn = message.senderId === currentMemberId;
  const senderName = sender?.name || "Unknown";
  const colorClass = getAvatarColor(senderName);

  const replyToMessage = message.replyToId ? allMessages.find((m) => m.id === message.replyToId) : null;
  const replyToSender = replyToMessage ? allMembers.find((m) => m.id === replyToMessage.senderId) : null;

  const groupedReactions = reactions.reduce<Record<string, { count: number; members: string[] }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, members: [] };
    acc[r.emoji].count++;
    const rMember = allMembers.find((m) => m.id === r.memberId);
    if (rMember) acc[r.emoji].members.push(rMember.name);
    return acc;
  }, {});

  return (
    <div
      className={cn("group flex gap-3 px-4 py-1.5 transition-colors", message.isPinned && "bg-primary/5")}
      data-testid={`message-${message.id}`}
    >
      <Avatar className="w-8 h-8 mt-0.5 flex-shrink-0">
        {sender?.profilePicture ? <AvatarImage src={sender.profilePicture} alt={senderName} /> : null}
        <AvatarFallback className={cn("text-xs font-medium", colorClass)}>
          {getInitials(senderName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 space-y-0.5">
        {replyToMessage && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5 pl-1 border-l-2 border-primary/30" data-testid={`reply-context-${message.id}`}>
            <Reply className="w-3 h-3 flex-shrink-0 rotate-180" />
            <span className="font-medium text-foreground/70">{replyToSender?.name || "Unknown"}</span>
            <span className="truncate max-w-[200px]">
              {replyToMessage.isDeleted ? "Message deleted" : (replyToMessage.content || (replyToMessage.type === "image" ? "Photo" : "File"))}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" data-testid={`text-sender-${message.id}`}>{senderName}</span>
          {sender && getRoleBadge(sender.role)}
          {message.isPinned && (
            <Pin className="w-3 h-3 text-primary" />
          )}
          <span className="text-[11px] text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>

        {message.type === "text" && message.content && (
          <p className="text-sm leading-relaxed break-words" data-testid={`text-content-${message.id}`}>
            {renderContent(message.content, allMembers)}
          </p>
        )}

        {message.type === "image" && message.fileUrl && (
          <div className="mt-1">
            <img
              src={message.fileUrl}
              alt={message.fileName || "Image"}
              className="max-w-xs max-h-64 rounded-md object-cover cursor-pointer"
              data-testid={`img-message-${message.id}`}
              onClick={() => window.open(message.fileUrl!, "_blank")}
            />
          </div>
        )}

        {message.type === "file" && message.fileUrl && (
          <a
            href={message.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm hover-elevate"
            data-testid={`file-message-${message.id}`}
          >
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="truncate max-w-[200px]">{message.fileName || "File"}</span>
            <Download className="w-3 h-3 text-muted-foreground" />
          </a>
        )}

        {Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(groupedReactions).map(([emoji, { count, members }]) => (
              <button
                key={emoji}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs border border-transparent",
                  "bg-muted hover-elevate",
                  reactions.some((r) => r.emoji === emoji && r.memberId === currentMemberId) && "border-primary/30 bg-primary/10"
                )}
                onClick={() => onReact(message.id, emoji)}
                title={members.join(", ")}
                data-testid={`reaction-${emoji}-${message.id}`}
              >
                <span>{emoji}</span>
                <span className="text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onReply(message)} data-testid={`button-reply-${message.id}`}>
          <Reply className="w-3.5 h-3.5" />
        </Button>

        <Popover open={showReactions} onOpenChange={setShowReactions}>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-react-${message.id}`}>
              <SmilePlus className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" side="top">
            <EmojiReactionPicker
              onSelect={(emoji) => { onReact(message.id, emoji); setShowReactions(false); }}
            />
          </PopoverContent>
        </Popover>

        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-admin-menu-${message.id}`}>
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPin(message.id)} data-testid={`button-pin-${message.id}`}>
                <Pin className="w-4 h-4 mr-2" />
                {message.isPinned ? "Unpin" : "Pin message"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(message.id)} className="text-destructive" data-testid={`button-delete-${message.id}`}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete message
              </DropdownMenuItem>
              {!isOwn && sender && (
                <DropdownMenuItem onClick={() => onRestrict(sender.id)} data-testid={`button-restrict-${message.id}`}>
                  <Clock className="w-4 h-4 mr-2" />
                  Restrict member
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
