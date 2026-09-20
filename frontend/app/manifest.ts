import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "رقيب | RAQEEB",
    short_name: "رقيب",
    description:
      "منصة متابعة توصيات الرقابة الداخلية — بلدية البيرة | Internal Audit Recommendation Follow-up Platform — Al-Bireh Municipality",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // The interface is Arabic-first and right-to-left by default.
    lang: "ar",
    dir: "rtl",
    background_color: "#eef1ee",
    theme_color: "#183b4e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
