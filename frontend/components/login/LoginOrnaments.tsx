import Image from "next/image";

import { cn } from "@/lib/cn";

/**
 * Decorative watermarks for the desktop login page, cut from the supplied
 * ornament sheet (transparent WebP, ~180 KB in total).
 *
 * Purely visual: `alt=""`, hidden from assistive tech, non-interactive, and
 * rendered only at desktop widths so the mobile layout is untouched. They are
 * kept faint and pushed to the edges so they never compete with the text.
 */
const ART = {
  "leaf-a": { w: 151, h: 308 },
  "leaf-b": { w: 150, h: 326 },
  mandala: { w: 354, h: 362 },
  "mandala-half": { w: 154, h: 333 },
  skyline: { w: 321, h: 346 },
  "branch-a": { w: 361, h: 198 },
  "branch-b": { w: 391, h: 130 },
} as const;

type ArtName = keyof typeof ART;

function Ornament({ name, className }: { name: ArtName; className: string }) {
  const { w, h } = ART[name];
  return (
    <Image
      src={`/images/login/${name}.webp`}
      alt=""
      aria-hidden
      width={w}
      height={h}
      draggable={false}
      loading="lazy"
      className={cn("pointer-events-none absolute h-auto max-w-none select-none", className)}
    />
  );
}

/** Inside the dark-green section (left panel). */
export function HeroOrnaments() {
  return (
    <>
      <Ornament name="mandala" className="-bottom-28 -right-28 w-[26rem] opacity-[0.07]" />
      <Ornament name="leaf-b" className="-right-3 top-3 w-24 opacity-[0.3]" />
      <Ornament name="branch-b" className="-right-4 top-[40%] w-48 opacity-[0.32]" />
      <Ornament name="leaf-a" className="-left-5 top-10 w-24 opacity-[0.3]" />
      <Ornament name="branch-a" className="-left-6 bottom-1 w-56 opacity-[0.28]" />
    </>
  );
}

/** Inside the white sign-in panel (right panel), wide screens only. */
export function PanelOrnaments() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden xl:block [[data-theme=dark]_&]:opacity-20">
      <Ornament name="leaf-b" className="-right-2 top-14 w-24 opacity-70" />
      <Ornament name="mandala-half" className="right-0 top-[38%] w-32 opacity-70" />
      <Ornament name="skyline" className="bottom-14 right-3 w-52 opacity-60" />
    </div>
  );
}
