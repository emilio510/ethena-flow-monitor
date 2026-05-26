import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Ethena Flow Monitor",
  description:
    "Ethena backing composition and recursive-loop exposure across Aave, Morpho, Kamino and Jupiter Lend.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="relative min-h-screen overflow-x-hidden">
        {/* Background glows — fixed so they don't scroll with content */}
        <div
          aria-hidden
          className="pointer-events-none fixed -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-white opacity-[0.04] blur-[100px]"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed -right-40 top-[20vh] h-[420px] w-[420px] rounded-full opacity-[0.18] blur-[100px]"
          style={{ background: "var(--color-risk)" }}
        />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  )
}
