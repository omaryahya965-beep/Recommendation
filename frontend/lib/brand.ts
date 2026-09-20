/**
 * Application identity, in one place.
 *
 * The platform and the institution are deliberately separate values:
 *
 *   RAQEEB / رقيب                  — the application
 *   Internal Audit Recommendation  — what it does
 *     Follow-up Platform
 *   Al-Bireh Municipality / بلدية البيرة — the institution that owns it
 *
 * Conflating the two is the mistake this module exists to prevent: the
 * municipality name must never be replaced by the product name, and the
 * product name must never be replaced by the municipality name.
 */

export const BRAND = {
  /** Application name. Not translated — it is the same mark in both scripts. */
  appNameAr: "رقيب",
  appNameEn: "RAQEEB",
  /** What the application does, under the name. */
  taglineAr: "منصة متابعة توصيات الرقابة الداخلية",
  taglineEn: "Internal Audit Recommendation Follow-up Platform",
  /** The owning institution. Never substitute the app name here. */
  municipalityAr: "بلدية البيرة",
  municipalityEn: "Al-Bireh Municipality",
} as const;

/**
 * Official municipality logo, exactly as supplied (a 1600x1600 JPEG).
 *
 * Referenced by URL rather than imported, so a missing file degrades to the
 * neutral fallback mark instead of breaking the build. The component never
 * scales the artwork non-uniformly, recolors it, or redraws it.
 */
export const MUNICIPALITY_LOGO_SRC = "/images/al-bireh-logo.jpeg";

export function appName(locale: string): string {
  return locale === "en" ? BRAND.appNameEn : BRAND.appNameAr;
}

export function municipalityName(locale: string): string {
  return locale === "en" ? BRAND.municipalityEn : BRAND.municipalityAr;
}

export function tagline(locale: string): string {
  return locale === "en" ? BRAND.taglineEn : BRAND.taglineAr;
}
