import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RAG Document Q&A System",
  description: "Upload PDFs/DOCX/TXT, ask questions, and get cited, grounded answers. Built with Next.js, LangChain, and switchable LLM providers (Z.ai GLM-4 / Google Gemini).",
  keywords: ["RAG", "Retrieval Augmented Generation", "LangChain", "Gemini", "Next.js", "Vector Search", "AI Engineering"],
  authors: [{ name: "AI Engineering Portfolio" }],
  openGraph: {
    title: "RAG Document Q&A System",
    description: "Upload docs, ask questions, get cited answers. Built with Next.js + LangChain.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RAG Document Q&A System",
    description: "Upload docs, ask questions, get cited answers. Built with Next.js + LangChain.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
