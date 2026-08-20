import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Askshree — Console",
  description: "AI-assisted tools for every department at Askshree.com",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
