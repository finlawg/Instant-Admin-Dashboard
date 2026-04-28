import crypto from "crypto";

export function generateVerificationCode(): string {
  // Generate a random 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function hashVerificationCode(code: string): string {
  // Hash the code for secure storage
  return crypto.createHash("sha256").update(code).digest("hex");
}
