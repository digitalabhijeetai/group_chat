import { storage } from "./storage";
import { db } from "./db";
import { members } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "./index";

async function ensureAdminAndTestMember() {
  const adminByOldPhone = await storage.getMemberByPhone("9890098900");
  if (adminByOldPhone) {
    await db.update(members).set({ phone: "7030809030" }).where(eq(members.id, adminByOldPhone.id));
    log("Updated admin phone to 7030809030", "seed");
  }

  const admin = await storage.getMemberByPhone("7030809030");
  if (!admin) {
    await storage.createMember({
      name: "Admin",
      phone: "7030809030",
      role: "admin",
      isActive: true,
    });
    log("Created admin member with phone 7030809030", "seed");
  }

  const testMember = await storage.getMemberByPhone("9890012345");
  if (!testMember) {
    await storage.createMember({
      name: "Test Member",
      phone: "9890012345",
      role: "member",
      isActive: true,
    });
    log("Created test member with phone 9890012345", "seed");
  }
}

export async function seedDatabase() {
  try {
    await ensureAdminAndTestMember();

    const existing = await storage.getAllMembers();
    if (existing.length > 2) {
      log("Database already seeded", "seed");
      return;
    }

    log("Seeding database...", "seed");

    const admin = await storage.getMemberByPhone("7030809030");
    if (!admin) return;

    const ravi = await storage.createMember({
      name: "Ravi Sharma",
      phone: "9876543210",
      role: "member",
      isActive: true,
    });

    const priya = await storage.createMember({
      name: "Priya Patel",
      phone: "9876543211",
      role: "member",
      isActive: true,
    });

    const amit = await storage.createMember({
      name: "Amit Kumar",
      phone: "9876543212",
      role: "member",
      isActive: true,
    });

    const sneha = await storage.createMember({
      name: "Sneha Reddy",
      phone: "9876543213",
      role: "member",
      isActive: true,
    });

    await storage.createMessage({
      senderId: admin.id,
      content: "Welcome to Community Hub! This is our invite-only discussion space. Feel free to share ideas, ask questions, and connect with fellow members.",
      type: "text",
      fileUrl: null,
      fileName: null,
      replyToId: null,
      mentions: null,
    });

    await storage.createMessage({
      senderId: ravi.id,
      content: "Thanks for the invite! Excited to be here. Looking forward to great discussions.",
      type: "text",
      fileUrl: null,
      fileName: null,
      replyToId: null,
      mentions: null,
    });

    await storage.createMessage({
      senderId: priya.id,
      content: "Hey everyone! @Ravi Sharma glad to see you here too!",
      type: "text",
      fileUrl: null,
      fileName: null,
      replyToId: null,
      mentions: ["Ravi Sharma"],
    });

    await storage.createMessage({
      senderId: amit.id,
      content: "This is a great community. Can we discuss the upcoming project timelines here?",
      type: "text",
      fileUrl: null,
      fileName: null,
      replyToId: null,
      mentions: null,
    });

    await storage.createMessage({
      senderId: sneha.id,
      content: "Absolutely @Amit Kumar! I think this is the perfect place for those discussions.",
      type: "text",
      fileUrl: null,
      fileName: null,
      replyToId: null,
      mentions: ["Amit Kumar"],
    });

    log("Seed complete", "seed");
  } catch (err) {
    log(`Seed error: ${err}`, "seed");
  }
}
