import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

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
    <html lang="en">
      <body className="bg-black">
        <div className="w-full flex justify-center">
          <div className="w-full max-w-[1200px] px-8 md:px-12 lg:px-20 xl:px-32 2xl:px-40">
            <Providers>{children}</Providers>
          </div>
        </div>
      </body>
    </html>
  );
}
