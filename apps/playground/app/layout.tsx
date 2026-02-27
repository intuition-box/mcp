import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Intuition MCP Server | AI Agent Integration",
  description: "MCP server for querying Intuition's attestation system. Enable AI agents like Claude to access trust scores and reputation data.",
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
  openGraph: {
    title: "Intuition MCP Server",
    description: "Enable AI agents to query trust scores and attestations from Intuition",
    url: "https://intuition-orpin.vercel.app",
    siteName: "Intuition MCP",
    images: [
      {
        url: "https://intuition-orpin.vercel.app/logo.svg",
        width: 512,
        height: 512,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Intuition MCP Server",
    description: "Enable AI agents to query trust scores and attestations from Intuition",
    images: ["https://intuition-orpin.vercel.app/logo.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="border-b bg-white/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <Link href="/" className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Intuition MCP
                </span>
              </Link>
              <div className="flex space-x-8">
                <Link
                  href="/"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
                >
                  Home
                </Link>
                <Link
                  href="/dashboard"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/docs"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
                >
                  Docs
                </Link>
                <Link
                  href="https://github.com/rudazy/Intuition-"
                  target="_blank"
                  className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
                >
                  GitHub
                </Link>
              </div>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}