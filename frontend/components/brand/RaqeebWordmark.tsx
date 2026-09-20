"use client";

import Image from "next/image";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

/**
 * The RAQEEB wordmark:
 *
 *            رقيب
 *     ──◆ R A Q E E B ◆──
 *   منصة متابعة توصيات الرقابة الداخلية
 *
 * "رقيب" is the supplied logo artwork (transparent WebP, ~50 KB each), not
 * live text. Two colourways cut from the same file:
 *   - raqeeb-logo.webp        green + gold, for light backgrounds
 *   - raqeeb-logo-light.webp  white + gold, for the dark-green hero and dark theme
 * The Latin line and tagline below inherit `currentColor` from the caller.
 */
export function RaqeebWordmark({
  size = "card",
  showTagline = true,
  className,
}: {
  size?: "hero" | "card";
  showTagline?: boolean;
  className?: string;
}) {
  useI18n();
  const hero = size === "hero";

  return (
    <div className={cn("flex w-full flex-col items-center text-center", className)}>
      {/* Logo artwork. `hero` sits on the dark-green section, so it always uses
          the light colourway; the card uses green-and-gold, switching to the
          light colourway in the dark theme. */}
      {hero ? (
        <Image
          src="/images/brand/raqeeb-logo-light.webp"
          alt="رقيب"
          width={760}
          height={397}
          priority
          sizes="260px"
          draggable={false}
          className="h-[clamp(5rem,12vh,7.85rem)] w-auto select-none"
        />
      ) : (
        <>
          <Image
            src="/images/brand/raqeeb-logo.webp"
            alt="رقيب"
            width={760}
            height={397}
            sizes="140px"
            draggable={false}
            className="h-[4rem] w-auto select-none [[data-theme=dark]_&]:hidden"
          />
          <Image
            src="/images/brand/raqeeb-logo-light.webp"
            alt=""
            aria-hidden
            width={760}
            height={397}
            sizes="140px"
            draggable={false}
            className="hidden h-[4rem] w-auto select-none [[data-theme=dark]_&]:block"
          />
        </>
      )}

      {/* Thin rules with a diamond at each inner end, flanking the Latin name. */}
      <span
        dir="ltr"
        aria-hidden
        className={cn(
          "flex w-full items-center justify-center",
          hero ? "mt-3 max-w-[22rem] gap-3.5" : "mt-1.5 max-w-[14rem] gap-2.5"
        )}
      >
        <span className="h-px flex-1 bg-current opacity-45" />
        <span className={cn("shrink-0 rotate-45 bg-current opacity-80", hero ? "size-1.5" : "size-1")} />
        <span
          className={cn(
            "shrink-0 font-medium uppercase",
            hero ? "text-[0.875rem]" : "text-[0.6875rem]"
          )}
          // Inline on purpose: login.css resets `letter-spacing: 0` on spans
          // (to protect Arabic ligatures) with higher specificity than a
          // utility class. Spacing also trails the last glyph, so pull it
          // back to keep the word optically centred between its rules.
          style={{
            letterSpacing: hero ? "0.6em" : "0.5em",
            marginInlineEnd: hero ? "-0.6em" : "-0.5em",
            fontFamily: "var(--font-plex-mono), monospace",
          }}
        >
          RAQEEB
        </span>
        <span className={cn("shrink-0 rotate-45 bg-current opacity-80", hero ? "size-1.5" : "size-1")} />
        <span className="h-px flex-1 bg-current opacity-45" />
      </span>
      <span className="sr-only">RAQEEB</span>

      {showTagline ? (
        <span
          className={cn(
            "block font-semibold leading-snug",
            hero ? "mt-3 text-[clamp(1rem,1.5vw,1.45rem)]" : "mt-1.5 text-[0.8125rem] opacity-80"
          )}
        >
          {T.appTagline}
        </span>
      ) : null}
    </div>
  );
}
