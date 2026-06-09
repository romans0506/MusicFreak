import type { NextConfig } from "next";

const securityHeaders = [
  // Don't let browsers MIME-sniff responses away from the declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The app is never meant to be embedded — block clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs (e.g. /auth/callback?code=...) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We don't use these browser features at all.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
