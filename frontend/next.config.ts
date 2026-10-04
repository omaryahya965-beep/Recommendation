import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Playwright suite builds into its own directory (NEXT_DIST_DIR=.next-e2e)
  // with the local E2E API baked in, so it never overwrites a developer build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    // Always define these so Next inlines them at build time. An *undefined*
    // NEXT_PUBLIC_* variable is left as a runtime `process.env` lookup, which
    // stops the bundler folding `flag === "true"` to a constant and dropping
    // the demo-login block. Default: OFF.
    NEXT_PUBLIC_ENABLE_DEMO_LOGIN: process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN ?? "false",
    NEXT_PUBLIC_DEMO_PASSWORD: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "",
  },
};

export default nextConfig;
