import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FrohZeitRakete Admin",
  description: "Admin UI für Backend Tests",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}