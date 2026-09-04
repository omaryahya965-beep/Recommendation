"use client";

import { cn } from "@/lib/cn";

export function AlBirehSeal({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeMap = {
    sm: "size-9 sm:size-10",
    md: "size-12 sm:size-14",
    lg: "size-16 sm:size-20",
    xl: "size-20 sm:size-24",
  };

  return (
    <svg
      viewBox="0 0 120 120"
      className={cn("shrink-0 select-none", sizeMap[size], className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Outer double circle border */}
      <circle cx="60" cy="60" r="58" fill="#FFFFFF" stroke="#176B63" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="53" fill="none" stroke="#176B63" strokeWidth="1" />
      <circle cx="60" cy="60" r="41" fill="#F4F8F7" stroke="#176B63" strokeWidth="1.5" />

      {/* Outer Ring Text Path setup */}
      <defs>
        <path id="top-arc" d="M 22,60 A 38,38 0 1,1 98,60" fill="none" />
        <path id="bottom-arc" d="M 98,60 A 38,38 0 0,1 22,60" fill="none" />
      </defs>

      {/* Top Arc Text: بلدية البيرة */}
      <text fill="#0F4F49" fontSize="11" fontStyle="normal" fontWeight="bold" textAnchor="middle">
        <textPath href="#top-arc" startOffset="50%">
          بلدية البيرة
        </textPath>
      </text>

      {/* Bottom Arc Text: AL-BIREH MUNICIPALITY */}
      <text fill="#0F4F49" fontSize="7.5" fontStyle="normal" fontWeight="700" letterSpacing="0.8" textAnchor="middle">
        <textPath href="#bottom-arc" startOffset="50%">
          AL-BIREH MUNICIPALITY
        </textPath>
      </text>

      {/* Left/Right accent dots */}
      <circle cx="20" cy="60" r="2" fill="#176B63" />
      <circle cx="100" cy="60" r="2" fill="#176B63" />

      {/* Inner Shield / Seal Artwork */}
      <g transform="translate(60, 60)">
        {/* Background shield circle */}
        <circle cx="0" cy="0" r="38" fill="#EBF3F1" />
        <circle cx="0" cy="0" r="37" fill="none" stroke="#176B63" strokeWidth="1" />

        {/* Olive Wreath left branch */}
        <path
          d="M-28,10 C-32,-2 -26,-18 -12,-26 C-18,-18 -20,-6 -14,6 Z"
          fill="#176B63"
          opacity="0.85"
        />
        <path
          d="M-24,16 C-28,6 -24,-8 -12,-18"
          fill="none"
          stroke="#0F4F49"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* Olive Wreath right branch */}
        <path
          d="M28,10 C32,-2 26,-18 12,-26 C18,-18 20,-6 14,6 Z"
          fill="#176B63"
          opacity="0.85"
        />
        <path
          d="M24,16 C28,6 24,-8 12,-18"
          fill="none"
          stroke="#0F4F49"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* Al-Bireh Castle / Fortress Emblem in Center */}
        {/* Shield base */}
        <path
          d="M-18,-16 L18,-16 C18,-16 18,12 0,26 C-18,12 -18,-16 -18,-16 Z"
          fill="#0F4F49"
          stroke="#176B63"
          strokeWidth="1.5"
        />

        {/* Fortress Tower Battlements */}
        <path
          d="M-12,-12 L-12,-22 L-8,-22 L-8,-18 L-4,-18 L-4,-22 L4,-22 L4,-18 L8,-18 L8,-22 L12,-22 L12,-12 Z"
          fill="#F4F8F7"
          stroke="#0F4F49"
          strokeWidth="1"
        />

        {/* Tower Gate Arch */}
        <path
          d="M-6,14 L-6,2 C-6,-2 6,-2 6,2 L6,14 Z"
          fill="#F4F8F7"
          stroke="#0F4F49"
          strokeWidth="1"
        />
        <path d="M0,-2 L0,14" stroke="#0F4F49" strokeWidth="0.8" />

        {/* Palestinian Flag Crest Ribbon at top of shield */}
        <path d="M-16,-14 L16,-14 L16,-9 L-16,-9 Z" fill="#000000" />
        <path d="M-16,-9 L16,-9 L16,-4 L-16,-4 Z" fill="#FFFFFF" />
        <path d="M-16,-4 L16,-4 L16,1 L-16,1 Z" fill="#007A3D" />
        <path d="M-16,-14 L-6,-6.5 L-16,1 Z" fill="#CE1126" />
      </g>
    </svg>
  );
}
