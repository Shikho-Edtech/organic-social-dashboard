import "./globals.css";
import Nav from "@/components/Nav";
import DataFooter from "@/components/DataFooter";
import { cookies } from "next/headers";
import { verifyAuthToken, AUTH_COOKIE } from "@/lib/auth";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Shikho Organic Social",
  description: "Facebook page analytics and content intelligence",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const authed = await verifyAuthToken(c.get(AUTH_COOKIE)?.value || "");
  return (
    <html lang="en">
      <body className="bg-slate-50">
        {authed && <Nav />}
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        {authed && <DataFooter />}
        <Analytics />
      </body>
    </html>
  );
}
