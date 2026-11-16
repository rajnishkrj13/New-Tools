import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Everyone who has an account. Visitors without one are "public" users. */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['superadmin', 'admin', 'user'] }).notNull().default('user'),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

/** One row per signed-in browser. Only a hash of the cookie's token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** What the admin decided for each tool. Tools without a row use their defaults. */
export const toolSettings = pgTable('tool_settings', {
  slug: text('slug').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  access: text('access', { enum: ['public', 'members'] }).notNull().default('public'),
  features: jsonb('features').$type<Record<string, boolean>>().notNull().default({}),
  publicMaxMb: integer('public_max_mb'),
  memberMaxMb: integer('member_max_mb'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Things a signed-in user keeps across devices: saved signatures, details, recent tools. */
export const userData = pgTable(
  'user_data',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Site-wide settings the admin can change (announcement bar, sign-ups open or closed). */
export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export type User = typeof users.$inferSelect;
export type ToolSettingsRow = typeof toolSettings.$inferSelect;
