"use client";

import {
  Award,
  Eye,
  EyeOff,
  Handshake,
  LogIn,
  ShieldCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MunicipalLogo } from "@/components/brand/MunicipalLogo";
import { LocaleSwitch } from "@/components/i18n/LocaleSwitch";
import { ThemeSwitch } from "@/components/theme/ThemeSwitch";
import { ErrorBanner } from "@/components/ui/Base";
import { login, ROLE_HOME } from "@/lib/api";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

const DEMO_PASSWORD = "Demo@12345";
const REMEMBER_KEY = "audit_login_username";

const DEMO_ACCOUNTS: Array<{ username: string; role: Role; noteKey: "demoAudit" | "demoHead" | "demoEmployee" | "demoCouncil" }> = [
  { username: "audit1", role: "audit", noteKey: "demoAudit" },
  { username: "head_finance", role: "department_head", noteKey: "demoHead" },
  { username: "emp_finance1", role: "employee", noteKey: "demoEmployee" },
  { username: "council1", role: "council", noteKey: "demoCouncil" },
];

export default function LoginPage() {
  useI18n();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      // localStorage is unreadable during SSR, so the remembered username has
      // to be synced in after mount. Runs once and cannot cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsername(saved);
      setRemember(true);
    }
  }, []);

  const signIn = async (user: string, pass: string) => {
    setBusy(true);
    setError(null);
    try {
      const auth = await login(user, pass);
      if (remember) localStorage.setItem(REMEMBER_KEY, user);
      else localStorage.removeItem(REMEMBER_KEY);
      router.replace(ROLE_HOME[auth.user.role] ?? "/login");
    } catch {
      setError(T.login.error);
      setBusy(false);
      setActiveDemo(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await signIn(username, password);
  };

  const pickDemo = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setUsername(account.username);
    setPassword(DEMO_PASSWORD);
    setActiveDemo(account.username);
    await signIn(account.username, DEMO_PASSWORD);
  };

  const values = [
    { icon: Award, label: T.login.values.professionalism },
    { icon: ShieldCheck, label: T.login.values.transparency },
    { icon: Users, label: T.login.values.participation },
    { icon: Handshake, label: T.login.values.credibility },
  ] as const;

  return (
    <main className="flex min-h-screen flex-col-reverse bg-surface lg:flex-row">
      <section className="flex w-full flex-col justify-between lg:w-1/2 lg:border-s lg:border-line lg:min-h-screen">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 lg:py-14">
          <div className="mb-10">
            <div className="mb-8 flex items-start justify-between gap-3">
              <MunicipalLogo inverted size="lg" withWordmark />
              <div className="flex items-center gap-2">
                <ThemeSwitch />
                <LocaleSwitch />
              </div>
            </div>
            <h1 className="font-heading text-[1.75rem] font-bold leading-[1.55] text-navy lg:text-[2rem]">
              {T.login.platformTitle}
              <br />
              <span className="relative inline-block text-primary-dark">
                {T.login.platformTitleAccent}
                <span className="absolute -bottom-0.5 start-0 h-[3px] w-full rounded-full bg-primary" />
              </span>
            </h1>
            <p className="mt-4 text-[15px] leading-7 text-ink-soft">{T.login.platformSubtitle}</p>
          </div>

          <form onSubmit={submit} className="space-y-6">
            <ErrorBanner message={error} />

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">{T.login.username}</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={T.login.usernamePlaceholder}
                autoComplete="username"
                required
                className="h-12 w-full rounded-(--radius-field) border border-line bg-subtle px-4 text-[15px] text-ink outline-none transition-all placeholder:text-muted focus:border-primary focus:bg-elevated focus:ring-2 focus:ring-primary/15"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">{T.login.password}</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={T.login.passwordPlaceholder}
                  autoComplete="current-password"
                  required
                  className="h-12 w-full rounded-(--radius-field) border border-line bg-subtle px-4 pe-12 text-[15px] text-ink outline-none transition-all placeholder:text-muted focus:border-primary focus:bg-elevated focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 end-3 flex items-center text-muted hover:text-ink"
                  aria-label={showPassword ? T.login.hidePassword : T.login.showPassword}
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-ink-soft">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 accent-primary"
                />
                {T.login.rememberMe}
              </label>
              <button type="button" className="text-primary-dark transition-colors hover:text-primary">
                {T.login.forgotPassword}
              </button>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-(--radius-field) bg-primary font-heading text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(23,107,99,0.55)] transition-all hover:bg-primary-dark hover:shadow-[0_10px_28px_-8px_rgba(23,107,99,0.65)] disabled:opacity-50"
            >
              {T.login.submit}
              <LogIn className="size-5" strokeWidth={2.25} />
            </button>
          </form>

          <div className="mt-8 rounded-(--radius-card) border border-dashed border-line bg-subtle/30 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              className="text-sm font-medium text-primary-dark hover:underline"
            >
              {T.login.demoToggle}
            </button>
            {showDemo ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-ink-soft">
                  {T.login.demoHelp}{" "}
                  <span className="font-mono" dir="ltr">
                    {DEMO_PASSWORD}
                  </span>
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account.username}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => pickDemo(account)}
                        className="w-full rounded-(--radius-field) border border-line bg-subtle px-3 py-2 text-start text-xs transition-colors hover:border-primary/40 hover:bg-primary-light disabled:opacity-50"
                      >
                        <span className="block font-heading text-[13px] font-semibold text-navy">
                          {ROLE_LABELS[account.role]}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-soft">{T.login[account.noteKey]}</span>
                        <span className="mt-1 block font-mono text-[10px] text-muted" dir="ltr">
                          {busy && activeDemo === account.username ? "…" : account.username}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <p className="px-6 pb-6 text-center text-xs text-muted sm:px-10 lg:px-16">
          © {new Date().getFullYear()} {T.login.copyright}
        </p>
      </section>

      <section className="relative min-h-[280px] overflow-hidden sm:min-h-[360px] lg:min-h-screen lg:w-1/2">
        <Image
          src="/images/city-hall.png"
          alt={T.login.cityHallAlt}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#183B4E]/92 via-[#183B4E]/35 to-[#183B4E]/5" />

        <div className="relative z-10 flex h-full min-h-[280px] flex-col justify-end px-6 py-8 text-white sm:min-h-[360px] sm:px-10 sm:py-10 lg:min-h-screen lg:px-14 lg:py-14">
          <p className="mx-auto max-w-xl text-center font-heading text-lg font-bold leading-[1.8] text-white sm:text-xl lg:mx-0 lg:text-start lg:text-[1.65rem]">
            {T.login.heroSlogan}
          </p>

          <div className="mx-auto mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4 lg:mx-0 lg:max-w-none lg:gap-4">
            {values.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2.5 rounded-2xl border border-white/25 bg-white/12 px-3 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-white/18 ring-1 ring-white/20">
                  <Icon className="size-5 text-white" strokeWidth={1.85} />
                </span>
                <span className="text-[12px] font-semibold leading-snug sm:text-[13px]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
