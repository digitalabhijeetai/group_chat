import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import Papa from "papaparse";
import { storage } from "./storage";
import { otpRequestSchema, otpVerifySchema, bulkMemberSchema, updateProjectSchema } from "@shared/schema";

const PRIMARY_ADMIN_PHONE = "7030809030";
const WATI_API_ENDPOINT = process.env.WATI_API_ENDPOINT;
const WATI_API_TOKEN = process.env.WATI_API_TOKEN;
const WATI_TEMPLATE_NAME = "otp_community_login";

function generateOtp(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function containsPhoneNumber(text: string): boolean {
  const cleaned = text.replace(/[\s\-\(\)\.\+]/g, "");
  const phonePatterns = [
    /\b\d{10,13}\b/,
    /\b\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}\b/,
    /\+\d{1,3}[\s\-]?\d{6,12}\b/,
    /\b\d{4}[\s\-]\d{3}[\s\-]\d{3}\b/,
    /\b\d{5}[\s\-]\d{5}\b/,
  ];
  return phonePatterns.some(p => p.test(text)) || /\d{10,}/.test(cleaned);
}

async function sendOtpViaWati(phone: string, otp: string): Promise<boolean> {
  if (!WATI_API_ENDPOINT || !WATI_API_TOKEN) {
    console.error("[OTP] WATI credentials not configured");
    return false;
  }

  const whatsappNumber = phone.startsWith("91") ? phone : `91${phone}`;

  try {
    const url = `${WATI_API_ENDPOINT}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;
    const authHeader = WATI_API_TOKEN.startsWith("Bearer ") ? WATI_API_TOKEN : `Bearer ${WATI_API_TOKEN}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_name: WATI_TEMPLATE_NAME,
        broadcast_name: "otp_login",
        parameters: [{ name: "1", value: otp }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OTP] WATI API HTTP ${response.status}:`, errorText);
      return false;
    }

    const data = await response.json();
    if (data.result === true) {
      console.log(`[OTP] WhatsApp OTP sent to ${whatsappNumber}`);
      return true;
    } else {
      console.error(`[OTP] WATI API error:`, data);
      return false;
    }
  } catch (err) {
    console.error(`[OTP] Failed to send WhatsApp OTP:`, err);
    return false;
  }
}

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `profile-${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "text/csv" || file.originalname.endsWith(".csv"));
  },
});

const otpStore = new Map<string, { otp: string; expires: number }>();
const onlineMembers = new Map<WebSocket, string>();

function broadcast(wss: WebSocketServer, data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function getOnlineCount(): number {
  const uniqueMembers = new Set(onlineMembers.values());
  return uniqueMembers.size;
}

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "sub-admin";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "community-hub-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 6 * 60 * 60 * 1000 },
  });
  app.use(sessionMiddleware);

  app.use("/uploads", (req, res, next) => {
    const filePath = path.join(uploadDir, path.basename(req.path));
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("File not found");
    }
  });

  const requireAuth = (req: Request, res: Response, next: any) => {
    if (!(req.session as any).memberId) return res.status(401).json({ message: "Not authenticated" });
    next();
  };

  const requireAdmin = async (req: Request, res: Response, next: any) => {
    if (!(req.session as any).memberId) return res.status(401).json({ message: "Not authenticated" });
    const member = await storage.getMember((req.session as any).memberId);
    if (!member || !isAdminRole(member.role)) return res.status(403).json({ message: "Admin only" });
    next();
  };

  const requirePrimaryAdmin = async (req: Request, res: Response, next: any) => {
    if (!(req.session as any).memberId) return res.status(401).json({ message: "Not authenticated" });
    const member = await storage.getMember((req.session as any).memberId);
    if (!member || member.role !== "admin") return res.status(403).json({ message: "Primary admin only" });
    next();
  };

  // Auth routes
  app.post("/api/auth/request-otp", async (req, res) => {
    try {
      const { phone } = otpRequestSchema.parse(req.body);
      const member = await storage.getMemberByPhone(phone);
      if (!member) return res.status(404).json({ message: "Phone number not registered. Contact our team on WhatsApp at 7030809030 to join." });
      const otp = generateOtp();
      otpStore.set(phone, { otp, expires: Date.now() + 5 * 60 * 1000 });

      const sent = await sendOtpViaWati(phone, otp);
      if (!sent) {
        return res.status(500).json({ message: "Failed to send OTP via WhatsApp. Please try again." });
      }

      res.json({ message: "OTP sent to your WhatsApp" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { phone, otp } = otpVerifySchema.parse(req.body);
      const stored = otpStore.get(phone);
      if (!stored || stored.otp !== otp || stored.expires < Date.now()) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }
      otpStore.delete(phone);
      const member = await storage.getMemberByPhone(phone);
      if (!member) return res.status(404).json({ message: "Member not found" });
      if (!member.firstLoginAt) {
        await storage.updateMember(member.id, { firstLoginAt: new Date() });
      }
      (req.session as any).memberId = member.id;
      res.json(member);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const memberId = (req.session as any)?.memberId;
    if (!memberId) return res.status(401).json({ message: "Not authenticated" });
    const member = await storage.getMember(memberId);
    if (!member) return res.status(401).json({ message: "Not authenticated" });
    res.json(member);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ message: "Logged out" });
  });

  // Online count
  app.get("/api/online-count", requireAuth, (_req, res) => {
    res.json({ count: getOnlineCount() });
  });

  // Members
  app.get("/api/members", requireAuth, async (req, res) => {
    const all = await storage.getAllMembers();
    const requestingMember = await storage.getMember((req.session as any).memberId);
    if (requestingMember && isAdminRole(requestingMember.role)) {
      res.json(all);
    } else {
      res.json(all.map((m) => ({ id: m.id, name: m.name, role: m.role, isActive: m.isActive, profilePicture: m.profilePicture, projectsCompleted: m.projectsCompleted, totalProjectValue: m.totalProjectValue })));
    }
  });

  app.patch("/api/members/:id", requireAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      const requestingMember = await storage.getMember((req.session as any).memberId);
      const target = await storage.getMember(targetId);
      if (!target) return res.status(404).json({ message: "Member not found" });
      if (target.phone === PRIMARY_ADMIN_PHONE && requestingMember?.role === "sub-admin") {
        return res.status(403).json({ message: "Sub-admins cannot modify the primary admin" });
      }
      const allowedFields: Record<string, any> = {};
      if (req.body.name !== undefined) allowedFields.name = req.body.name;
      if (req.body.phone !== undefined) allowedFields.phone = req.body.phone;
      if (req.body.isActive !== undefined) allowedFields.isActive = req.body.isActive;
      if (Object.keys(allowedFields).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      const updated = await storage.updateMember(targetId, allowedFields);
      if (!updated) return res.status(404).json({ message: "Member not found" });
      broadcast(wss, { type: "member_updated", member: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/members/bulk", requireAdmin, async (req, res) => {
    try {
      const { members: memberList } = bulkMemberSchema.parse(req.body);
      const created = await storage.bulkCreateMembers(memberList);
      broadcast(wss, { type: "member_updated" });
      res.json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/members/csv-import", requireAdmin, csvUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No CSV file uploaded" });
      const csvText = req.file.buffer.toString("utf-8");
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim().toLowerCase(),
      });

      if (result.errors.length > 0) {
        return res.status(400).json({ message: `CSV parse error: ${result.errors[0].message}` });
      }

      const memberList: { name: string; phone: string }[] = [];
      const errors: string[] = [];

      for (let i = 0; i < result.data.length; i++) {
        const row = result.data[i] as any;
        const name = (row.name || "").trim();
        const phone = (row.phone || row["phone number"] || row["phone_number"] || row.mobile || "").trim();

        if (!name || !phone) {
          errors.push(`Row ${i + 1}: Missing name or phone`);
          continue;
        }
        if (phone.length < 10 || phone.length > 15) {
          errors.push(`Row ${i + 1}: Invalid phone number "${phone}"`);
          continue;
        }
        memberList.push({ name, phone });
      }

      if (memberList.length === 0) {
        return res.status(400).json({
          message: "No valid members found in CSV. Ensure columns 'name' and 'phone' exist.",
          errors,
        });
      }

      const created = await storage.bulkCreateMembers(memberList);
      broadcast(wss, { type: "member_updated" });
      res.json({
        added: created.length,
        skipped: memberList.length - created.length,
        errors,
        total: memberList.length,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/members/:id/restrict", requireAdmin, async (req, res) => {
    const targetId = req.params.id as string;
    const requestingMember = await storage.getMember((req.session as any).memberId);
    const target = await storage.getMember(targetId);
    if (target?.phone === PRIMARY_ADMIN_PHONE && requestingMember?.role === "sub-admin") {
      return res.status(403).json({ message: "Sub-admins cannot restrict the primary admin" });
    }
    const hours = req.body.hours || 1;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000);
    const updated = await storage.updateMember(targetId, { restrictedUntil: until });
    broadcast(wss, { type: "member_updated", member: updated });
    res.json(updated);
  });

  app.post("/api/members/:id/unrestrict", requireAdmin, async (req, res) => {
    const updated = await storage.updateMember(req.params.id as string, { restrictedUntil: null });
    broadcast(wss, { type: "member_updated", member: updated });
    res.json(updated);
  });

  // Role management (primary admin only)
  app.post("/api/members/:id/make-sub-admin", requirePrimaryAdmin, async (req, res) => {
    try {
      const target = await storage.getMember(req.params.id as string);
      if (!target) return res.status(404).json({ message: "Member not found" });
      if (target.phone === PRIMARY_ADMIN_PHONE) return res.status(400).json({ message: "Cannot change primary admin role" });
      const updated = await storage.updateMember(req.params.id as string, { role: "sub-admin" });
      broadcast(wss, { type: "member_updated", member: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/members/:id/remove-sub-admin", requirePrimaryAdmin, async (req, res) => {
    try {
      const target = await storage.getMember(req.params.id as string);
      if (!target) return res.status(404).json({ message: "Member not found" });
      if (target.role !== "sub-admin") return res.status(400).json({ message: "Member is not a sub-admin" });
      const updated = await storage.updateMember(req.params.id as string, { role: "member" });
      broadcast(wss, { type: "member_updated", member: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Delete member (admin/sub-admin, cannot delete primary admin)
  app.delete("/api/members/:id", requireAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      const requestingMember = await storage.getMember((req.session as any).memberId);
      const target = await storage.getMember(targetId);
      if (!target) return res.status(404).json({ message: "Member not found" });
      if (target.phone === PRIMARY_ADMIN_PHONE) {
        return res.status(403).json({ message: "Cannot delete the primary admin" });
      }
      if (target.role === "sub-admin" && requestingMember?.role === "sub-admin") {
        return res.status(403).json({ message: "Sub-admins cannot delete other sub-admins" });
      }
      await storage.deleteMember(targetId);
      broadcast(wss, { type: "member_updated" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Profile picture upload (own profile)
  app.post("/api/members/profile-picture", requireAuth, profileUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No image file uploaded" });
      const memberId = (req.session as any).memberId;
      const fileUrl = `/uploads/${req.file.filename}`;
      const updated = await storage.updateMember(memberId, { profilePicture: fileUrl });
      broadcast(wss, { type: "member_updated", member: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Update project stats (own profile, can only increase)
  app.post("/api/members/update-projects", requireAuth, async (req, res) => {
    try {
      const memberId = (req.session as any).memberId;
      const { projectsAdded, valueAdded, projectLink } = updateProjectSchema.parse(req.body);

      if (projectsAdded < 0 || valueAdded < 0) {
        return res.status(400).json({ message: "Values cannot be negative" });
      }
      if (projectsAdded === 0 && valueAdded === 0) {
        return res.status(400).json({ message: "Must add at least one project or some value" });
      }

      const member = await storage.getMember(memberId);
      if (!member) return res.status(404).json({ message: "Member not found" });

      await storage.createProjectUpdate({
        memberId,
        projectsAdded,
        valueAdded: valueAdded.toString(),
        projectLink,
      });

      const newProjectsCompleted = member.projectsCompleted + projectsAdded;
      const newTotalValue = (parseFloat(member.totalProjectValue) + valueAdded).toString();

      const updated = await storage.updateMember(memberId, {
        projectsCompleted: newProjectsCompleted,
        totalProjectValue: newTotalValue,
      });

      broadcast(wss, { type: "member_updated", member: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Get project update history for a member
  app.get("/api/members/:id/project-updates", requireAuth, async (req, res) => {
    const updates = await storage.getProjectUpdates(req.params.id as string);
    res.json(updates);
  });

  // Leaderboard - top 50 by earnings
  app.get("/api/leaderboard", requireAuth, async (_req, res) => {
    const top = await storage.getLeaderboard(50);
    res.json(top.map((m) => ({
      id: m.id,
      name: m.name,
      profilePicture: m.profilePicture,
      projectsCompleted: m.projectsCompleted,
      totalProjectValue: m.totalProjectValue,
      role: m.role,
    })));
  });

  // Messages
  app.get("/api/messages", requireAuth, async (req, res) => {
    const memberId = (req.session as any).memberId;
    const member = await storage.getMember(memberId);
    let msgs = await storage.getMessages();
    msgs = msgs.filter(m => !m.isDeleted);
    const settings = await storage.getChatSettings();
    if (settings.disappearAfterHours) {
      const cutoff = new Date(Date.now() - settings.disappearAfterHours * 60 * 60 * 1000);
      msgs = msgs.filter(m => m.isPinned || new Date(m.createdAt) >= cutoff);
    }
    if (member && member.firstLoginAt && !isAdminRole(member.role)) {
      const filtered = msgs.filter(m => m.isPinned || new Date(m.createdAt) >= new Date(member.firstLoginAt!));
      return res.json(filtered);
    }
    res.json(msgs);
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const senderId = (req.session as any).memberId;
      const sender = await storage.getMember(senderId);
      if (!sender) return res.status(400).json({ message: "Invalid sender" });
      if (sender.restrictedUntil && new Date(sender.restrictedUntil) > new Date()) {
        return res.status(403).json({ message: "You are restricted from sending messages" });
      }
      const settings = await storage.getChatSettings();
      if (settings.chatDisabled && !isAdminRole(sender.role)) {
        return res.status(403).json({ message: "Chat is disabled" });
      }

      if (req.body.content && !isAdminRole(sender.role)) {
        const keywords = await storage.getBlockedKeywords();
        const contentLower = req.body.content.toLowerCase();
        const blocked = keywords.find((k) => contentLower.includes(k.keyword));
        if (blocked) {
          return res.status(403).json({ message: `Your message contains a restricted word and cannot be sent.` });
        }
        if (settings.phoneNumberFilterEnabled && containsPhoneNumber(req.body.content)) {
          return res.status(403).json({ message: "Sharing phone numbers is not allowed in this chat." });
        }
      }

      const mentions = req.body.content?.match(/@(\w+(?:\s\w+)*)/g)?.map((m: string) => m.slice(1)) || [];
      const msg = await storage.createMessage({
        senderId,
        content: req.body.content,
        type: req.body.type || "text",
        fileUrl: req.body.fileUrl || null,
        fileName: req.body.fileName || null,
        replyToId: req.body.replyToId || null,
        mentions: mentions.length > 0 ? mentions : null,
      });
      broadcast(wss, { type: "new_message", message: msg });

      const notifiedIds = new Set<string>();
      if (req.body.replyToId) {
        const repliedMsg = await storage.getMessage(req.body.replyToId);
        if (repliedMsg && repliedMsg.senderId !== senderId) {
          notifiedIds.add(repliedMsg.senderId);
          const notif = await storage.createNotification({ recipientId: repliedMsg.senderId, senderId, messageId: msg.id, type: "reply" });
          broadcast(wss, { type: "notification", recipientId: repliedMsg.senderId, notification: notif });
        }
      }
      if (mentions.length > 0) {
        const allMembers = await storage.getAllMembers();
        for (const mentionName of mentions) {
          const mentioned = allMembers.find((m) => m.name.toLowerCase() === mentionName.toLowerCase());
          if (mentioned && mentioned.id !== senderId && !notifiedIds.has(mentioned.id)) {
            notifiedIds.add(mentioned.id);
            const notif = await storage.createNotification({ recipientId: mentioned.id, senderId, messageId: msg.id, type: "mention" });
            broadcast(wss, { type: "notification", recipientId: mentioned.id, notification: notif });
          }
        }
      }

      res.json(msg);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/messages/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const senderId = (req.session as any).memberId;
      const sender = await storage.getMember(senderId);
      if (!sender) return res.status(400).json({ message: "Invalid sender" });
      if (sender.restrictedUntil && new Date(sender.restrictedUntil) > new Date()) {
        return res.status(403).json({ message: "You are restricted from sending messages" });
      }
      const settings = await storage.getChatSettings();
      if (settings.memberFileSendDisabled && !isAdminRole(sender.role)) {
        return res.status(403).json({ message: "File sharing is currently disabled for members." });
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      const isImage = req.file.mimetype.startsWith("image/");
      const replyToId = req.body.replyToId || null;
      const msg = await storage.createMessage({
        senderId,
        content: null,
        type: isImage ? "image" : "file",
        fileUrl,
        fileName: req.file.originalname,
        replyToId,
        mentions: null,
      });
      broadcast(wss, { type: "new_message", message: msg });

      if (replyToId) {
        const repliedMsg = await storage.getMessage(replyToId);
        if (repliedMsg && repliedMsg.senderId !== senderId) {
          const notif = await storage.createNotification({ recipientId: repliedMsg.senderId, senderId, messageId: msg.id, type: "reply" });
          broadcast(wss, { type: "notification", recipientId: repliedMsg.senderId, notification: notif });
        }
      }

      res.json(msg);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/messages/:id/pin", requireAdmin, async (req, res) => {
    await storage.pinMessage(req.params.id as string);
    broadcast(wss, { type: "message_pinned", messageId: req.params.id });
    res.json({ success: true });
  });

  app.delete("/api/messages/:id", requireAdmin, async (req, res) => {
    const requestingMember = await storage.getMember((req.session as any).memberId);
    const message = await storage.getMessage(req.params.id as string);
    if (message && requestingMember?.role === "sub-admin") {
      const sender = await storage.getMember(message.senderId);
      if (sender?.phone === PRIMARY_ADMIN_PHONE) {
        return res.status(403).json({ message: "Sub-admins cannot delete primary admin messages" });
      }
    }
    await storage.deleteMessage(req.params.id as string);
    broadcast(wss, { type: "message_deleted", messageId: req.params.id });
    res.json({ success: true });
  });

  app.post("/api/messages/bulk-delete", requireAdmin, async (req, res) => {
    const { messageIds } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: "No messages selected" });
    }
    const requestingMember = await storage.getMember((req.session as any).memberId);
    let deletedCount = 0;
    let skippedCount = 0;
    for (const msgId of messageIds) {
      const message = await storage.getMessage(msgId);
      if (message && requestingMember?.role === "sub-admin") {
        const sender = await storage.getMember(message.senderId);
        if (sender?.phone === PRIMARY_ADMIN_PHONE) { skippedCount++; continue; }
      }
      if (message) { await storage.deleteMessage(msgId); deletedCount++; }
    }
    broadcast(wss, { type: "message_deleted" });
    res.json({ success: true, deleted: deletedCount, skipped: skippedCount });
  });

  // Reactions
  app.get("/api/reactions", requireAuth, async (_req, res) => {
    const all = await storage.getReactions();
    res.json(all);
  });

  app.post("/api/reactions", requireAuth, async (req, res) => {
    try {
      const memberId = (req.session as any).memberId;
      await storage.toggleReaction({
        messageId: req.body.messageId,
        memberId,
        emoji: req.body.emoji,
      });
      broadcast(wss, { type: "new_reaction", messageId: req.body.messageId });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Community settings (public GET for login screen)
  app.get("/api/community-settings", async (_req, res) => {
    const settings = await storage.getCommunitySettings();
    res.json(settings);
  });

  app.patch("/api/community-settings", requireAdmin, async (req, res) => {
    const name = req.body.communityName?.trim();
    if (!name || name.length < 1 || name.length > 50) {
      return res.status(400).json({ message: "Community name must be between 1 and 50 characters" });
    }
    const settings = await storage.updateCommunityName(name);
    res.json(settings);
  });

  // Chat settings
  app.get("/api/chat-settings", requireAuth, async (_req, res) => {
    const settings = await storage.getChatSettings();
    res.json(settings);
  });

  app.post("/api/chat-settings/toggle", requireAdmin, async (_req, res) => {
    const settings = await storage.toggleChat();
    broadcast(wss, { type: "chat_settings_updated", settings });
    res.json(settings);
  });

  app.patch("/api/chat-settings/disappear", requireAdmin, async (req, res) => {
    const { hours } = req.body;
    const settings = await storage.setDisappearTime(hours === null || hours === 0 ? null : parseInt(hours));
    broadcast(wss, { type: "chat_settings_updated", settings });
    res.json(settings);
  });

  app.post("/api/chat-settings/toggle-file-send", requireAdmin, async (_req, res) => {
    const settings = await storage.toggleMemberFileSend();
    broadcast(wss, { type: "chat_settings_updated", settings });
    res.json(settings);
  });

  app.post("/api/chat-settings/toggle-phone-filter", requireAdmin, async (_req, res) => {
    const settings = await storage.togglePhoneNumberFilter();
    broadcast(wss, { type: "chat_settings_updated", settings });
    res.json(settings);
  });

  // Blocked keywords
  app.get("/api/blocked-keywords", requireAdmin, async (_req, res) => {
    const keywords = await storage.getBlockedKeywords();
    res.json(keywords);
  });

  app.post("/api/blocked-keywords", requireAdmin, async (req, res) => {
    try {
      const keyword = req.body.keyword?.trim();
      if (!keyword) return res.status(400).json({ message: "Keyword is required" });
      const created = await storage.addBlockedKeyword(keyword);
      res.json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/blocked-keywords/:id", requireAdmin, async (req, res) => {
    try {
      const keyword = req.body.keyword?.trim();
      if (!keyword) return res.status(400).json({ message: "Keyword is required" });
      const updated = await storage.updateBlockedKeyword(req.params.id as string, keyword);
      if (!updated) return res.status(404).json({ message: "Keyword not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/blocked-keywords/:id", requireAdmin, async (req, res) => {
    await storage.removeBlockedKeyword(req.params.id as string);
    res.json({ success: true });
  });

  // Notifications
  app.get("/api/notifications", requireAuth, async (req, res) => {
    const memberId = (req.session as any).memberId;
    const notifs = await storage.getNotifications(memberId);
    res.json(notifs);
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    const memberId = (req.session as any).memberId;
    const count = await storage.getUnreadNotificationCount(memberId);
    res.json({ count });
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req, res) => {
    const memberId = (req.session as any).memberId;
    await storage.markNotificationsRead(memberId);
    res.json({ success: true });
  });

  // WebSocket with online tracking
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "register" && data.memberId) {
          onlineMembers.set(ws, data.memberId);
          broadcast(wss, { type: "online_count", count: getOnlineCount() });
        }
      } catch {}
    });

    ws.on("close", () => {
      onlineMembers.delete(ws);
      broadcast(wss, { type: "online_count", count: getOnlineCount() });
    });

    ws.on("error", () => {
      onlineMembers.delete(ws);
    });
  });

  return httpServer;
}
