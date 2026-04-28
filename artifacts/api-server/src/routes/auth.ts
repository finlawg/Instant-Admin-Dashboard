import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import {
  GetCurrentUserResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  SignupBody,
  SignupResponse,
} from "@workspace/api-zod";
import { db, appUsersTable, emailVerificationCodesTable } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/security";
import { clearSession, getUserFromRequest, publicUser, setSession } from "../lib/session";
import { sendVerificationEmail } from "../lib/email";
import { generateVerificationCode, hashVerificationCode } from "../lib/verification";

const router: IRouter = Router();

router.post("/auth/signup", async (req, res, next) => {
  try {
    const body = SignupBody.parse(req.body);
    const email = body.email.trim().toLowerCase();
    
    // Check if user already exists
    const existing = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.email, email))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with that email already exists" });
      return;
    }

    // Generate verification code
    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing verification codes for this email
    await db
      .delete(emailVerificationCodesTable)
      .where(eq(emailVerificationCodesTable.email, email));

    // Store verification code
    await db
      .insert(emailVerificationCodesTable)
      .values({ email, code: codeHash, expiresAt });

    // Send verification email
    await sendVerificationEmail(email, code);

    res.json({ message: "Verification code sent to your email" });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const body = LoginBody.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const users = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.email, email))
      .limit(1);
    const user = users[0];
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    await setSession(res, user.id);
    res.json(LoginResponse.parse(publicUser(user)));
  } catch (error) {
    next(error);
  }
});

router.post("/auth/verify", async (req, res, next) => {
  try {
    const { email, code, password } = req.body;
    
    if (!email || !code || !password) {
      res.status(400).json({ error: "Email, code, and password are required" });
      return;
    }

    const emailNormalized = email.trim().toLowerCase();

    // Find verification code
    const verificationCodes = await db
      .select()
      .from(emailVerificationCodesTable)
      .where(
        and(
          eq(emailVerificationCodesTable.email, emailNormalized),
          gt(emailVerificationCodesTable.expiresAt, new Date())
        )
      )
      .limit(1);

    const verificationRecord = verificationCodes[0];
    if (!verificationRecord) {
      res.status(400).json({ error: "Invalid or expired verification code" });
      return;
    }

    // Verify the code
    const codeHash = hashVerificationCode(code);
    if (codeHash !== verificationRecord.code) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    // Check if user already exists (double-check)
    const existing = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.email, emailNormalized))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with that email already exists" });
      return;
    }

    // Create the user
    const passwordHash = await hashPassword(password);
    const inserted = await db
      .insert(appUsersTable)
      .values({ email: emailNormalized, passwordHash })
      .returning();

    const user = inserted[0];
    if (!user) {
      throw new Error("Failed to create user");
    }

    // Delete the verification code
    await db
      .delete(emailVerificationCodesTable)
      .where(eq(emailVerificationCodesTable.email, emailNormalized));

    // Set session and return user
    await setSession(res, user.id);
    res.json(SignupResponse.parse(publicUser(user)));
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    await clearSession(req, res);
    res.json(LogoutResponse.parse({ success: true }));
  } catch (error) {
    next(error);
  }
});

router.post("/auth/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const emailNormalized = email.trim().toLowerCase();
    
    // Check if user exists
    const users = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.email, emailNormalized))
      .limit(1);
    const user = users[0];
    
    if (!user) {
      res.status(404).json({ error: "No account found with that email address" });
      return;
    }

    // Generate reset code
    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing reset codes for this email
    await db
      .delete(emailVerificationCodesTable)
      .where(eq(emailVerificationCodesTable.email, emailNormalized));

    // Store reset code
    await db
      .insert(emailVerificationCodesTable)
      .values({ email: emailNormalized, code: codeHash, expiresAt });

    // Send reset email
    await sendVerificationEmail(emailNormalized, code, "password_reset");

    res.json({ message: "Password reset code sent to your email" });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/reset-password", async (req, res, next) => {
  try {
    const { email, code, password } = req.body;
    
    if (!email || !code || !password) {
      res.status(400).json({ error: "Email, code, and password are required" });
      return;
    }

    const emailNormalized = email.trim().toLowerCase();

    // Find reset code
    const verificationCodes = await db
      .select()
      .from(emailVerificationCodesTable)
      .where(
        and(
          eq(emailVerificationCodesTable.email, emailNormalized),
          gt(emailVerificationCodesTable.expiresAt, new Date())
        )
      )
      .limit(1);

    const verificationRecord = verificationCodes[0];
    if (!verificationRecord) {
      res.status(400).json({ error: "Invalid or expired reset code" });
      return;
    }

    // Verify the code
    const codeHash = hashVerificationCode(code);
    if (codeHash !== verificationRecord.code) {
      res.status(400).json({ error: "Invalid reset code" });
      return;
    }

    // Update user password
    const passwordHash = await hashPassword(password);
    await db
      .update(appUsersTable)
      .set({ passwordHash })
      .where(eq(appUsersTable.email, emailNormalized));

    // Delete the reset code
    await db
      .delete(emailVerificationCodesTable)
      .where(eq(emailVerificationCodesTable.email, emailNormalized));

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.json(GetCurrentUserResponse.parse(publicUser(user)));
  } catch (error) {
    next(error);
  }
});

export default router;