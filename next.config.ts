import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    // Allow Next/Image to proxy and optimize philosopher portrait thumbnails
    // from Wikimedia Commons. Proxying enables automatic WebP conversion and
    // edge caching; the source thumbnails are already small (160 px wide) so
    // the optimisation overhead is minimal after the first cache warm.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "commons.wikimedia.org",
        pathname: "/wiki/Special:FilePath/**",
      },
    ],
  },
};

export default nextConfig;
