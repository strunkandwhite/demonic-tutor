import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demonic Tutor",
  description: "Personal MTG draft analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
