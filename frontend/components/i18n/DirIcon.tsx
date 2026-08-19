"use client";

import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";

type IconProps = { className?: string };

/** Back / return — points toward the start of the reading direction. */
export function DirBack({ className }: IconProps) {
  const { locale } = useI18n();
  const Icon = locale === "ar" ? ArrowRight : ArrowLeft;
  return <Icon className={className} />;
}

/** Forward / open — points toward the end of the reading direction. */
export function DirForward({ className }: IconProps) {
  const { locale } = useI18n();
  const Icon = locale === "ar" ? ChevronLeft : ChevronRight;
  return <Icon className={className} />;
}

export function DirChevron({ className }: IconProps) {
  return <DirForward className={className} />;
}

/** Sidebar collapse control — the panel sits on the start edge. */
export function DirCollapse({ collapsed, className }: { collapsed: boolean; className?: string }) {
  const { locale } = useI18n();
  if (locale === "ar") {
    const Icon = collapsed ? PanelRightOpen : PanelRightClose;
    return <Icon className={className} />;
  }
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return <Icon className={className} />;
}
