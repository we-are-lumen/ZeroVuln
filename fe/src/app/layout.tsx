import MainProvider from "@/shared/components/providers/main-provider";
import { cn } from "@/shared/lib/utils";
import type { Metadata } from "next";
import { Figtree, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZeroVuln",
  description: "Zero Vulnerability",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        figtree.variable,
      )}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <MainProvider>
          <Toaster theme="dark" position="top-right" />
          {children}
        </MainProvider>
      </body>
    </html>
  );
}
