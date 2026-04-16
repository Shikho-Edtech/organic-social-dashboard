import "./globals.css";
import Nav from "@/components/Nav";
import { cookies } from "next/headers";
import { verifyAuthToken, AUTH_COOKIE } from "@/lib/auth";

export const metadata = {
  title: "Shikho Organic Social",
  description: "Organic social analytics and content intelligence",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const authed = verifyAuthToken(c.get(AUTH_COOKIE)?.value || "");
  return (
    <html lang="en">
      <body>
        {authed && <Nav />}
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
