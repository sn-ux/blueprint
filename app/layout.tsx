import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Blueprint",
  description: "See your music as a world",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-black">
        {/* Navbar sits outside the max-width container so it spans the full viewport */}
        <Navbar />
        <div className="w-full flex justify-center bg-black">
          <div className="w-full max-w-[1440px] px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-24">
            <Providers>{children}</Providers>
          </div>
        </div>
      </body>
    </html>
  );
}
