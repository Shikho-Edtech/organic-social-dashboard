import "./globals.css";
import Nav from "@/components/Nav";
import DataFooter from "@/components/DataFooter";
import { cookies } from "next/headers";
import { verifyAuthToken, AUTH_COOKIE } from "@/lib/auth";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Shikho Organic Social",
  description: "Facebook page analytics and content intelligence",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const authed = await verifyAuthToken(c.get(AUTH_COOKIE)?.value || "");
  return (
    <html lang="en">
      <head>
        {/* Preconnect the Google Fonts domains — Poppins + Hind Siliguri are
            loaded via globals.css; preconnect shaves ~200ms on first paint. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      {/* bg-brand-canvas = #F4F5FA (Shikho canvas). Body copy inherits ink.700
          from globals.css. */}
      <body className="bg-brand-canvas text-ink-primary antialiased">
        {authed && <Nav />}
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        {authed && <DataFooter />}
        <Analytics />
      </body>
    </html>
  );
}
