import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  role: text("role").notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  restrictedUntil: timestamp("restricted_until"),
  profilePicture: text("profile_picture"),
  projectsCompleted: integer("projects_completed").notNull().default(0),
  totalProjectValue: numeric("total_project_value", { precision: 12, scale: 2 }).notNull().default("0"),
  firstLoginAt: timestamp("first_login_at"),
});

export const projectUpdates = pgTable("project_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull(),
  projectsAdded: integer("projects_added").notNull(),
  valueAdded: numeric("value_added", { precision: 12, scale: 2 }).notNull(),
  projectLink: text("project_link").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull(),
  content: text("content"),
  type: text("type").notNull().default("text"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  replyToId: varchar("reply_to_id"),
  mentions: text("mentions").array(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const reactions = pgTable("reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull(),
  memberId: varchar("member_id").notNull(),
  emoji: text("emoji").notNull(),
});

export const chatSettings = pgTable("chat_settings", {
  id: varchar("id").primaryKey().default(sql`'global'`),
  chatDisabled: boolean("chat_disabled").notNull().default(false),
  disappearAfterHours: integer("disappear_after_hours"),
  memberFileSendDisabled: boolean("member_file_send_disabled").notNull().default(false),
  phoneNumberFilterEnabled: boolean("phone_number_filter_enabled").notNull().default(false),
});

export const blockedKeywords = pgTable("blocked_keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyword: text("keyword").notNull().unique(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const communitySettings = pgTable("community_settings", {
  id: varchar("id").primaryKey().default(sql`'global'`),
  communityName: text("community_name").notNull().default("Community Hub"),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientId: varchar("recipient_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  messageId: varchar("message_id").notNull(),
  type: text("type").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertMemberSchema = createInsertSchema(members).omit({ id: true, restrictedUntil: true, firstLoginAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, isPinned: true, isDeleted: true });
export const insertReactionSchema = createInsertSchema(reactions).omit({ id: true });
export const insertProjectUpdateSchema = createInsertSchema(projectUpdates).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, isRead: true });

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof members.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertReaction = z.infer<typeof insertReactionSchema>;
export type Reaction = typeof reactions.$inferSelect;
export type ChatSettings = typeof chatSettings.$inferSelect;
export type BlockedKeyword = typeof blockedKeywords.$inferSelect;
export type CommunitySettings = typeof communitySettings.$inferSelect;
export type ProjectUpdate = typeof projectUpdates.$inferSelect;
export type InsertProjectUpdate = z.infer<typeof insertProjectUpdateSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export const otpRequestSchema = z.object({
  phone: z.string().min(10).max(15),
});

export const otpVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(4),
});

export const bulkMemberSchema = z.object({
  members: z.array(z.object({
    name: z.string().min(1),
    phone: z.string().min(10).max(15),
  })),
});

export const updateProjectSchema = z.object({
  projectsAdded: z.number().int().min(0, "Cannot be negative"),
  valueAdded: z.number().min(0, "Cannot be negative"),
  projectLink: z.string().url("Must be a valid URL"),
});
