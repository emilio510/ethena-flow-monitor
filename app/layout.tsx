import type { Metadata } from "next"
import { JetBrains_Mono } from "next/font/google"
import "./globals.css"

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Ethena Flow Monitor",
  description: "Recursive-loop exposure on Aave V3, per Ethena wallet.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  )
}
