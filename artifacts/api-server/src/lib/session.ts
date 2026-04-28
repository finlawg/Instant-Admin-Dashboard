import type { Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, appUsersTable, userSessionsTable, type AppUser } from "@workspace/db";
import { createSessionToken, hashToken } from "./security";

export const sessionCookieName = "iad_session";
const sessionDays = 7;

export function publicUser(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function setSession(res: Response, userId: number) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await db.insert(userSessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    domain: ".instantdashboard.org",
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
  });
}

export async function clearSession(req: Request, res: Response) {
  const token = req.cookies?.[sessionCookieName];
  if (typeof token === "string") {
    await db
      .delete(userSessionsTable)
      .where(eq(userSessionsTable.tokenHash, hashToken(token)));
  }
  res.clearCookie(sessionCookieName, { 
    path: "/", 
    domain: ".instantdashboard.org",
    secure: true,
    sameSite: "none"
  });
}

export async function getUserFromRequest(req: Request) {
  const token = req.cookies?.[sessionCookieName];
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }

  const rows = await db
    .select({ user: appUsersTable })
    .from(userSessionsTable)
    .innerJoin(appUsersTable, eq(userSessionsTable.userId, appUsersTable.id))
    .where(
      and(
        eq(userSessionsTable.tokenHash, hashToken(token)),
        gt(userSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0]?.user ?? null;
}

export async function requireUser(req: Request, res: Response) {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}