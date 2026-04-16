// Simple password-gate auth using HTTP-only cookie
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "sh_auth";

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function createAuthToken(): string {
  const secret = process.env.AUTH_SECRET || "insecure-dev-secret";
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = String(expiry);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAuthToken(token: string): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const secret = process.env.AUTH_SECRET || "insecure-dev-secret";
  if (sign(payload, secret) !== sig) return false;
  const expiry = Number(payload);
  return Date.now() < expiry;
}

export async function isAuthenticated(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  return verifyAuthToken(token || "");
}

export const AUTH_COOKIE = COOKIE_NAME;
