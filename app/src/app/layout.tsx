import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { DashboardProvider } from "@/contexts/DashboardContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Feefo Review Intelligence Dashboard",
  description: "Review analytics for Uniworld and Luxury Gold",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full flex flex-col font-sans" style={{ backgroundColor: 'var(--background)' }}>
        <ThemeProvider>
          <DashboardProvider>
            <div className="sticky top-0 z-40">
              <Header />
              <Navigation />
            </div>
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </DashboardProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
