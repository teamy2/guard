import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { authClient } from '@/lib/auth/client';
import { NeonAuthUIProvider } from '@neondatabase/auth/react';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guard",
  description: "Edge load balancer with AI-powered bot detection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NeonAuthUIProvider authClient={authClient} redirectTo="/internal/dashboard" social={{ providers: ['github'] }}>
          {children}
        </NeonAuthUIProvider>
      </body>
    </html>
  );
}
