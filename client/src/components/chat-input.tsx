import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Send, Smile, Paperclip, FileText, X, Reply } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { useTheme } from "@/components/theme-provider";
import type { Member, Message } from "@shared/schema";

interface ChatInputProps {
  members: Member[];
  onSendMessage: (content: string, replyToId?: string) => void;
  onSendFile: (file: File, replyToId?: string) => void;
  disabled: boolean;
  restrictedMessage?: string | null;
  fileSendDisabled?: boolean;
  replyTo: Message | null;
  replyToSenderName: string | null;
  onCancelReply: () => void;
}

export default function ChatInput({ members, onSendMessage, onSendFile, disabled, restrictedMessage, fileSendDisabled, replyTo, replyToSenderName, onCancelReply }: ChatInputProps) {
  const { theme } = useTheme();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleTextChange = (value: string) => {
    setText(value);
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ") || afterAt.split(" ").length <= 2) {
        setShowMentions(true);
        setMentionFilter(afterAt);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (member: Member) => {
    const lastAtIndex = text.lastIndexOf("@");
    const before = text.slice(0, lastAtIndex);
    setText(`${before}@${member.name} `);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (selectedFile) {
      onSendFile(selectedFile, replyTo?.id);
      setSelectedFile(null);
      setPreviewUrl(null);
      setText("");
      onCancelReply();
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, replyTo?.id);
    setText("");
    onCancelReply();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (disabled) {
    return (
      <div className="px-4 py-3 border-t bg-muted/50">
        <p className="text-sm text-muted-foreground text-center">
          {restrictedMessage || "Chat is currently disabled by admin."}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t bg-background">
      {replyTo && (
        <div className="px-4 pt-2 flex items-center gap-2" data-testid="reply-preview">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/5 border-l-2 border-primary/40">
            <Reply className="w-3.5 h-3.5 text-primary flex-shrink-0 rotate-180" />
            <span className="text-xs font-medium text-primary">{replyToSenderName || "Unknown"}</span>
            <span className="text-xs text-muted-foreground truncate">
              {replyTo.content || (replyTo.type === "image" ? "Photo" : "File")}
            </span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={onCancelReply} data-testid="button-cancel-reply">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {selectedFile && (
        <div className="px-4 pt-3 flex items-center gap-2">
          {previewUrl ? (
            <img src={previewUrl} alt="Preview" className="w-16 h-16 rounded-md object-cover" />
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm truncate max-w-[200px]">{selectedFile.name}</span>
            </div>
          )}
          <Button size="icon" variant="ghost" onClick={clearFile} data-testid="button-clear-file">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {showMentions && filteredMembers.length > 0 && (
        <div className="mx-4 mt-2 border rounded-md bg-popover max-h-32 overflow-y-auto">
          {filteredMembers.slice(0, 5).map((m) => (
            <button
              key={m.id}
              className="w-full text-left px-3 py-2 text-sm hover-elevate flex items-center gap-2"
              onClick={() => insertMention(m)}
              data-testid={`mention-${m.id}`}
            >
              <span className="font-medium">@{m.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <div className="flex gap-0.5">
          <Popover open={showEmoji} onOpenChange={setShowEmoji}>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-emoji-picker">
                <Smile className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" side="top">
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  setText((prev) => prev + emojiData.emoji);
                  textareaRef.current?.focus();
                }}
                theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                width={300}
                height={380}
                searchPlaceholder="Search emoji..."
                previewConfig={{ showPreview: false }}
                lazyLoadEmojis
              />
            </PopoverContent>
          </Popover>

          {!fileSendDisabled && (
            <>
              <Button size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()} data-testid="button-attach-file">
                <Paperclip className="w-5 h-5" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-file"
              />
            </>
          )}
        </div>

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... Use @ to mention"
          className="flex-1 resize-none min-h-[40px] max-h-[120px] text-sm border-0 focus-visible:ring-0 bg-muted rounded-md"
          rows={1}
          data-testid="input-message"
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() && !selectedFile}
          data-testid="button-send"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
