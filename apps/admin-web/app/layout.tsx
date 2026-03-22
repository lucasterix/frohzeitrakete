import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FrohZeitRakete Admin",
  description: "Admin UI für Backend Tests",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}