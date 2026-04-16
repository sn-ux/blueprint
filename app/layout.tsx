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
          <div className="w-full max-w-[1280px] px-6 md:px-10 lg:px-16 xl:px-24 2xl:px-32">
            <Providers>{children}</Providers>
          </div>
        </div>
      </body>
    </html>
  );
}
