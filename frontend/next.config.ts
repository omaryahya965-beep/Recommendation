import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
