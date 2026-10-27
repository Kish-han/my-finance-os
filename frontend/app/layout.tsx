import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AURA Wealth — Private Financial Operating System",
  description: "Private personal finance, card debt, and loan payoff intelligence",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${geistMono.variable} dark h-full antialiased selection:bg-emerald-500/20 selection:text-emerald-300`}
    >
      <body className="min-h-full flex flex-col bg-[#10141a] text-[#dfe2eb]">
        {children}
      </body>
    </html>
  );
}
