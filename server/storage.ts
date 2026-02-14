import { db } from "./db";
import { members, messages, reactions, chatSettings, blockedKeywords, projectUpdates, communitySettings, notifications } from "@shared/schema";
import type { Member, InsertMember, Message, InsertMessage, Reaction, InsertReaction, ChatSettings, BlockedKeyword, ProjectUpdate, InsertProjectUpdate, CommunitySettings, Notification, InsertNotification } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getMember(id: string): Promise<Member | undefined>;
  getMemberByPhone(phone: string): Promise<Member | undefined>;
  getAllMembers(): Promise<Member[]>;
  createMember(data: InsertMember): Promise<Member>;
  updateMember(id: string, data: Partial<Member>): Promise<Member | undefined>;
  deleteMember(id: string): Promise<void>;
  bulkCreateMembers(data: { name: string; phone: string }[]): Promise<Member[]>;
  getLeaderboard(limit: number): Promise<Member[]>;

  getMessages(): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  createMessage(data: InsertMessage): Promise<Message>;
  deleteMessage(id: string): Promise<void>;
  pinMessage(id: string): Promise<void>;

  getReactions(): Promise<Reaction[]>;
  getReactionsByMessage(messageId: string): Promise<Reaction[]>;
  toggleReaction(data: InsertReaction): Promise<void>;

  getChatSettings(): Promise<ChatSettings>;
  toggleChat(): Promise<ChatSettings>;
  setDisappearTime(hours: number | null): Promise<ChatSettings>;
  toggleMemberFileSend(): Promise<ChatSettings>;
  togglePhoneNumberFilter(): Promise<ChatSettings>;

  getBlockedKeywords(): Promise<BlockedKeyword[]>;
  addBlockedKeyword(keyword: string): Promise<BlockedKeyword>;
  removeBlockedKeyword(id: string): Promise<void>;
  updateBlockedKeyword(id: string, keyword: string): Promise<BlockedKeyword | undefined>;

  createProjectUpdate(data: InsertProjectUpdate): Promise<ProjectUpdate>;
  getProjectUpdates(memberId: string): Promise<ProjectUpdate[]>;

  getCommunitySettings(): Promise<CommunitySettings>;
  updateCommunityName(name: string): Promise<CommunitySettings>;

  getNotifications(recipientId: string): Promise<Notification[]>;
  createNotification(data: InsertNotification): Promise<Notification>;
  markNotificationsRead(recipientId: string): Promise<void>;
  getUnreadNotificationCount(recipientId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getMember(id: string): Promise<Member | undefined> {
    const [m] = await db.select().from(members).where(eq(members.id, id));
    return m;
  }

  async getMemberByPhone(phone: string): Promise<Member | undefined> {
    const [m] = await db.select().from(members).where(eq(members.phone, phone));
    return m;
  }

  async getAllMembers(): Promise<Member[]> {
    return db.select().from(members);
  }

  async createMember(data: InsertMember): Promise<Member> {
    const [m] = await db.insert(members).values(data).returning();
    return m;
  }

  async updateMember(id: string, data: Partial<Member>): Promise<Member | undefined> {
    const [m] = await db.update(members).set(data).where(eq(members.id, id)).returning();
    return m;
  }

  async deleteMember(id: string): Promise<void> {
    await db.delete(members).where(eq(members.id, id));
  }

  async bulkCreateMembers(data: { name: string; phone: string }[]): Promise<Member[]> {
    const result: Member[] = [];
    for (const d of data) {
      const existing = await this.getMemberByPhone(d.phone);
      if (!existing) {
        const [m] = await db.insert(members).values({ name: d.name, phone: d.phone, role: "member", isActive: true }).returning();
        result.push(m);
      }
    }
    return result;
  }

  async getLeaderboard(limit: number): Promise<Member[]> {
    return db.select().from(members)
      .where(eq(members.isActive, true))
      .orderBy(desc(sql`CAST(${members.totalProjectValue} AS numeric)`))
      .limit(limit);
  }

  async getMessages(): Promise<Message[]> {
    return db.select().from(messages).orderBy(messages.createdAt);
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    return m;
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [m] = await db.insert(messages).values(data).returning();
    return m;
  }

  async deleteMessage(id: string): Promise<void> {
    await db.update(messages).set({ isDeleted: true, isPinned: false }).where(eq(messages.id, id));
  }

  async pinMessage(id: string): Promise<void> {
    const msg = await this.getMessage(id);
    if (msg) {
      await db.update(messages).set({ isPinned: !msg.isPinned }).where(eq(messages.id, id));
    }
  }

  async getReactions(): Promise<Reaction[]> {
    return db.select().from(reactions);
  }

  async getReactionsByMessage(messageId: string): Promise<Reaction[]> {
    return db.select().from(reactions).where(eq(reactions.messageId, messageId));
  }

  async toggleReaction(data: InsertReaction): Promise<void> {
    const existing = await db.select().from(reactions).where(
      and(eq(reactions.messageId, data.messageId), eq(reactions.memberId, data.memberId))
    );
    if (existing.length > 0) {
      await db.delete(reactions).where(eq(reactions.id, existing[0].id));
      if (existing[0].emoji === data.emoji) {
        return;
      }
    }
    await db.insert(reactions).values(data);
  }

  async getChatSettings(): Promise<ChatSettings> {
    const [s] = await db.select().from(chatSettings).where(eq(chatSettings.id, "global"));
    if (!s) {
      const [created] = await db.insert(chatSettings).values({ id: "global", chatDisabled: false }).returning();
      return created;
    }
    return s;
  }

  async toggleChat(): Promise<ChatSettings> {
    const current = await this.getChatSettings();
    const [updated] = await db.update(chatSettings).set({ chatDisabled: !current.chatDisabled }).where(eq(chatSettings.id, "global")).returning();
    return updated;
  }

  async setDisappearTime(hours: number | null): Promise<ChatSettings> {
    await this.getChatSettings();
    const [updated] = await db.update(chatSettings).set({ disappearAfterHours: hours }).where(eq(chatSettings.id, "global")).returning();
    return updated;
  }

  async toggleMemberFileSend(): Promise<ChatSettings> {
    const current = await this.getChatSettings();
    const [updated] = await db.update(chatSettings).set({ memberFileSendDisabled: !current.memberFileSendDisabled }).where(eq(chatSettings.id, "global")).returning();
    return updated;
  }

  async togglePhoneNumberFilter(): Promise<ChatSettings> {
    const current = await this.getChatSettings();
    const [updated] = await db.update(chatSettings).set({ phoneNumberFilterEnabled: !current.phoneNumberFilterEnabled }).where(eq(chatSettings.id, "global")).returning();
    return updated;
  }

  async getBlockedKeywords(): Promise<BlockedKeyword[]> {
    return db.select().from(blockedKeywords).orderBy(blockedKeywords.createdAt);
  }

  async addBlockedKeyword(keyword: string): Promise<BlockedKeyword> {
    const [k] = await db.insert(blockedKeywords).values({ keyword: keyword.toLowerCase().trim() }).returning();
    return k;
  }

  async removeBlockedKeyword(id: string): Promise<void> {
    await db.delete(blockedKeywords).where(eq(blockedKeywords.id, id));
  }

  async updateBlockedKeyword(id: string, keyword: string): Promise<BlockedKeyword | undefined> {
    const [k] = await db.update(blockedKeywords).set({ keyword: keyword.toLowerCase().trim() }).where(eq(blockedKeywords.id, id)).returning();
    return k;
  }

  async createProjectUpdate(data: InsertProjectUpdate): Promise<ProjectUpdate> {
    const [pu] = await db.insert(projectUpdates).values(data).returning();
    return pu;
  }

  async getProjectUpdates(memberId: string): Promise<ProjectUpdate[]> {
    return db.select().from(projectUpdates)
      .where(eq(projectUpdates.memberId, memberId))
      .orderBy(desc(projectUpdates.createdAt));
  }

  async getCommunitySettings(): Promise<CommunitySettings> {
    const [s] = await db.select().from(communitySettings).where(eq(communitySettings.id, "global"));
    if (!s) {
      const [created] = await db.insert(communitySettings).values({ id: "global", communityName: "Community Hub" }).returning();
      return created;
    }
    return s;
  }

  async updateCommunityName(name: string): Promise<CommunitySettings> {
    await this.getCommunitySettings();
    const [updated] = await db.update(communitySettings).set({ communityName: name }).where(eq(communitySettings.id, "global")).returning();
    return updated;
  }

  async getNotifications(recipientId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.recipientId, recipientId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [n] = await db.insert(notifications).values(data).returning();
    return n;
  }

  async markNotificationsRead(recipientId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.isRead, false)));
  }

  async getUnreadNotificationCount(recipientId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.isRead, false)));
    return result[0]?.count || 0;
  }
}

export const storage = new DatabaseStorage();
