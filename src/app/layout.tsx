import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IPC Navigator – AI Legal Assistant on the Indian Penal Code",
  description:
    "Public legal-information assistant for the Indian Penal Code, 1860. LangGraph multi-agent pipeline, Groq BYOK, grounded citations with verification.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
