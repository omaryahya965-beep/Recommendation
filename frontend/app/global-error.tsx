"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches failures in the root layout itself, where
 * providers and the i18n catalogs may not have mounted. It therefore cannot
 * rely on the translation layer and ships both languages inline, and must
 * render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#eef1ee",
          color: "#102F40",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <main role="alert" style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "0.25rem" }}>
            تعذّر تحميل التطبيق. يرجى المحاولة مرة أخرى.
          </p>
          <p
            dir="ltr"
            style={{ fontSize: "0.85rem", lineHeight: 1.7, marginBottom: "1.25rem" }}
          >
            Something went wrong while loading the application. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "44px",
              padding: "0 1.25rem",
              borderRadius: "8px",
              border: "none",
              background: "#183b4e",
              color: "#fff",
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            إعادة المحاولة / Retry
          </button>
          {error.digest ? (
            <p dir="ltr" style={{ marginTop: "1rem", fontSize: "0.7rem", opacity: 0.6 }}>
              {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
