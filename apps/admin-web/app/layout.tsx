import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "FrohZeitRakete Admin",
    template: "%s · FrohZeitRakete Admin",
  },
  description:
    "Verwaltung der digitalen Pflegedokumentation der Fröhlich Dienste — User, Sessions und Signaturen.",
  applicationName: "FrohZeitRakete Admin",
  authors: [{ name: "Fröhlich Dienste" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
