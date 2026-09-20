"use client";

import Image from "next/image";
import { useState } from "react";

import { MUNICIPALITY_LOGO_SRC } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

/**
 * The official Al-Bireh Municipality seal.
 *
 * The supplied artwork is a JPEG: the seal sits on a flat #f7f7f7 square, and
 * JPEG cannot carry transparency. Shown as-is, that square reads as a grey box
 * on white pages and a light patch on the dark sidebar. So the seal is framed
 * by a circle matching its own outer ring:
 *
 *  - the image is scaled UNIFORMLY (one width, height follows), so the aspect
 *    ratio is never touched;
 *  - nothing is recoloured, filtered or redrawn;
 *  - the frame only hides the empty backdrop outside the seal's black outline.
 *
 * The constants below were measured from the file: the ring's outer edge is
 * ~1240px across on a 1600px canvas, centred at (798, 802). RING_SCALE is
 * 1600 / 1260 — the ring plus a few px of margin so the outline is never
 * clipped.
 */
const RING_SCALE = 1600 / 1260;

const SIZES = {
  /** Sidebar rail and mobile header. */
  sm: "size-9",
  /** Cards and secondary placements. */
  md: "size-11 sm:size-12",
  lg: "size-16 sm:size-[4.5rem]",
  /** Login page. */
  xl: "size-24 sm:size-28",
} as const;

/** Requested raster width per size, so Next serves a small file, not 1600px. */
const IMAGE_SIZES = {
  sm: "40px",
  md: "56px",
  lg: "80px",
  xl: "120px",
} as const;

export type LogoSize = keyof typeof SIZES;

export function MunicipalityLogo({
  size = "md",
  className,
  priority = false,
}: {
  size?: LogoSize;
  className?: string;
  priority?: boolean;
}) {
  const { T } = useI18n();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-label={T.login.municipalityName}
        role="img"
        className={cn(
          SIZES[size],
          "grid shrink-0 select-none place-items-center rounded-full",
          "border border-current/20 bg-current/5 font-heading text-[0.7em] font-bold leading-none",
          className
        )}
      >
        {/* Neutral placeholder only — deliberately not a drawing of the seal. */}
        <span aria-hidden>AB</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-full select-none",
        SIZES[size],
        className
      )}
    >
      <Image
        src={MUNICIPALITY_LOGO_SRC}
        alt={T.login.municipalityName}
        width={1600}
        height={1600}
        sizes={IMAGE_SIZES[size]}
        priority={priority}
        onError={() => setFailed(true)}
        draggable={false}
        style={{ width: `${RING_SCALE * 100}%` }}
        // Physical left/top (not start/end) on purpose: centring is
        // direction-independent, and a logical property here would need a
        // per-direction translate. `h-auto` keeps the image square.
        className="absolute left-1/2 top-1/2 h-auto max-w-none -translate-x-1/2 -translate-y-1/2"
      />
    </span>
  );
}
