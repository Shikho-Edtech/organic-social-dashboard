// Simple password-gate auth using HTTP-only cookie
// Uses Web Crypto API (works in both Edge runtime for middleware AND Node runtime)
import { cookies } from "next/headers";

const COOKIE_NAME = "sh_auth";
const encoder = new TextEncoder();

async function hmacSha256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAuthToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET || "insecure-dev-secret";
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = String(expiry);
  const sig = await hmacSha256(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyAuthToken(token: string): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const secret = process.env.AUTH_SECRET || "insecure-dev-secret";
  const expected = await hmacSha256(payload, secret);
  if (expected !== sig) return false;
  const expiry = Number(payload);
  return Date.now() < expiry;
}

export async function isAuthenticated(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  return await verifyAuthToken(token || "");
}

export const AUTH_COOKIE = COOKIE_NAME;
