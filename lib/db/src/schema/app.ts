import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const appUsersTable = pgTable(
  "app_users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("app_users_email_unique").on(table.email)],
);

export const userSessionsTable = pgTable(
  "user_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_sessions_token_hash_unique").on(table.tokenHash)],
);

export const emailVerificationCodesTable = pgTable(
  "email_verification_codes",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    code: text("code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("email_verification_codes_email_unique").on(table.email)],
);

export const databaseConnectionsTable = pgTable("database_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => appUsersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  host: text("host").notNull(),
  databaseName: text("database_name").notNull(),
  encryptedConnectionString: text("encrypted_connection_string").notNull(),
  readOnly: boolean("read_only").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedQueriesTable = pgTable("saved_queries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => appUsersTable.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => databaseConnectionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sql: text("sql").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const queryHistoryTable = pgTable("query_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => appUsersTable.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => databaseConnectionsTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  sql: text("sql").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rowChangeHistoryTable = pgTable("row_change_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => appUsersTable.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => databaseConnectionsTable.id, { onDelete: "cascade" }),
  tableName: text("table_name").notNull(),
  action: text("action").notNull(),
  primaryKey: jsonb("primary_key"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appUsersRelations = relations(appUsersTable, ({ many }) => ({
  sessions: many(userSessionsTable),
  connections: many(databaseConnectionsTable),
  savedQueries: many(savedQueriesTable),
  queryHistory: many(queryHistoryTable),
  rowChangeHistory: many(rowChangeHistoryTable),
}));

export const userSessionsRelations = relations(userSessionsTable, ({ one }) => ({
  user: one(appUsersTable, {
    fields: [userSessionsTable.userId],
    references: [appUsersTable.id],
  }),
}));

export const databaseConnectionsRelations = relations(
  databaseConnectionsTable,
  ({ one, many }) => ({
    user: one(appUsersTable, {
      fields: [databaseConnectionsTable.userId],
      references: [appUsersTable.id],
    }),
    savedQueries: many(savedQueriesTable),
    queryHistory: many(queryHistoryTable),
    rowChangeHistory: many(rowChangeHistoryTable),
  }),
);

export const savedQueriesRelations = relations(savedQueriesTable, ({ one }) => ({
  user: one(appUsersTable, {
    fields: [savedQueriesTable.userId],
    references: [appUsersTable.id],
  }),
  connection: one(databaseConnectionsTable, {
    fields: [savedQueriesTable.connectionId],
    references: [databaseConnectionsTable.id],
  }),
}));

export const queryHistoryRelations = relations(queryHistoryTable, ({ one }) => ({
  user: one(appUsersTable, {
    fields: [queryHistoryTable.userId],
    references: [appUsersTable.id],
  }),
  connection: one(databaseConnectionsTable, {
    fields: [queryHistoryTable.connectionId],
    references: [databaseConnectionsTable.id],
  }),
}));

export const rowChangeHistoryRelations = relations(rowChangeHistoryTable, ({ one }) => ({
  user: one(appUsersTable, {
    fields: [rowChangeHistoryTable.userId],
    references: [appUsersTable.id],
  }),
  connection: one(databaseConnectionsTable, {
    fields: [rowChangeHistoryTable.connectionId],
    references: [databaseConnectionsTable.id],
  }),
}));

export type AppUser = typeof appUsersTable.$inferSelect;
export type DatabaseConnection = typeof databaseConnectionsTable.$inferSelect;
export type SavedQuery = typeof savedQueriesTable.$inferSelect;
export type QueryHistory = typeof queryHistoryTable.$inferSelect;
export type RowChangeHistory = typeof rowChangeHistoryTable.$inferSelect;
