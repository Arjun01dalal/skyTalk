import {
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "agent", "user"] })
    .notNull()
    .default("user"),
  empCode: text("emp_code"),
  // Optional mobile number for self-registered users (searchable).
  mobile: text("mobile"),
  // Optional profile photo URL (set during OTP signup or profile edit).
  avatarUrl: text("avatar_url"),
  externalId: text("external_id").unique(),
  isActive: boolean("is_active").notNull().default(true),
  isOnline: boolean("is_online").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const refreshTokensTable = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: serial("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RefreshToken = typeof refreshTokensTable.$inferSelect;
