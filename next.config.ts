import type { NextConfig } from "next";

// With REVIEW_PASSWORD the proxy protects every request, including the optimizer's own internal fetch of the source
// image (it carries no credentials, and on Vercel the image service fetches from the deployment), which would end
// in 401 for every photo. The photos are already web-sized copies (npm run images), so they are served directly.
// Set REVIEW_PASSWORD for the build as well as for the run (Vercel does this for project variables).
const reviewProtected = Boolean(process.env.REVIEW_PASSWORD);

const nextConfig: NextConfig = {
  // 75 is the default; 85 is used by the hero image (see Hero.tsx)
  images: { qualities: [75, 85], unoptimized: reviewProtected },
  // belt and braces: noindex on every response, also for files the proxy does not handle
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" }] }];
  },
};

export default nextConfig;
