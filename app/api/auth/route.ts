import { NextRequest, NextResponse } from "next/server";
import { createAuthToken, AUTH_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = String(body?.password || "");
  const expected = process.env.DASHBOARD_PASSWORD || "";

  if (!expected) {
    return NextResponse.json({ ok: false, error: "DASHBOARD_PASSWORD not set" }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, createAuthToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
