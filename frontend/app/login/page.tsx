"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { MunicipalLogo } from "@/components/brand/MunicipalLogo";
import { LocaleSwitch } from "@/components/i18n/LocaleSwitch";
import { ThemeSwitch } from "@/components/theme/ThemeSwitch";
import { ErrorBanner } from "@/components/ui/Base";
import { login, ROLE_HOME } from "@/lib/api";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

const DEMO_PASSWORD = "Demo@12345";
const REMEMBER_KEY = "audit_login_username";

const FIELD_CLASS =
  "h-11 min-w-0 w-full rounded-lg border border-line bg-elevated px-3 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20";

const DEMO_ACCOUNTS: Array<{
  username: string;
  role: Role;
  noteKey: "demoAudit" | "demoHead" | "demoEmployee" | "demoCouncil";
}> = [
  { username: "audit1", role: "audit", noteKey: "demoAudit" },
  { username: "head_finance", role: "department_head", noteKey: "demoHead" },
  { username: "emp_finance1", role: "employee", noteKey: "demoEmployee" },
  { username: "council1", role: "council", noteKey: "demoCouncil" },
];

export default function LoginPage() {
  useI18n();
  const router = useRouter();
  const errorId = useId();
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
    if (busy) return;
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

  return (
    <main className="relative min-h-dvh min-w-0 overflow-x-clip bg-sidebar">
      <Image
        src="/images/city-hall.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_30%]"
      />
      <div className="absolute inset-0 bg-sidebar/30" aria-hidden />
      <div className="absolute inset-0 bg-primary/15" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-dvh min-w-0 max-w-7xl flex-col justify-start px-4 pb-16 pt-[16vh] sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:px-12 lg:py-12 lg:pt-12">
        <section
          aria-labelledby="login-heading"
          className="min-w-0 w-full rounded-[6px] border border-line bg-surface p-6 shadow-[0_28px_64px_-8px_rgb(8_28_34_/_0.55)] sm:p-8 lg:max-w-[26.5rem] lg:shrink-0 [border-inline-start-width:4px] [border-inline-start-color:var(--color-primary)]"
        >
          <h1 id="login-heading" className="font-heading text-2xl font-bold leading-none tracking-normal text-navy">
            {T.login.title}
          </h1>

          <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={busy} aria-describedby={error ? errorId : undefined}>
            <div id={errorId}>
              <ErrorBanner message={error} />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {T.login.username}
                <span className="ms-0.5 text-danger" aria-hidden>
                  *
                </span>
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={T.login.usernamePlaceholder}
                autoComplete="username"
                required
                aria-invalid={Boolean(error)}
                className={FIELD_CLASS}
              />
            </label>

            <div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  {T.login.password}
                  <span className="ms-0.5 text-danger" aria-hidden>
                    *
                  </span>
                </span>
                <div className="relative min-w-0">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={T.login.passwordPlaceholder}
                    autoComplete="current-password"
                    required
                    aria-invalid={Boolean(error)}
                    className={`${FIELD_CLASS} pe-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 end-0.5 flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    aria-label={showPassword ? T.login.hidePassword : T.login.showPassword}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>
              <button
                type="button"
                className="mt-2 text-sm font-medium text-primary-dark underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {T.login.forgotPassword}
              </button>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 shrink-0 accent-primary"
              />
              {T.login.rememberMe}
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-primary font-heading text-base font-bold text-white shadow-[inset_0_-2px_0_rgb(0_0_0_/_0.18)] transition-colors duration-150 hover:bg-primary-dark active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {T.login.submit}
            </button>
          </form>

          <div className="mt-6 border-t border-line pt-5">
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              className="w-full rounded-lg border border-line bg-subtle py-2.5 text-sm font-medium text-navy transition-colors hover:bg-primary-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                <ul className="grid gap-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account.username}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => pickDemo(account)}
                        className="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-start text-xs transition-colors hover:border-primary/40 disabled:opacity-50"
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

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <ThemeSwitch />
            <LocaleSwitch />
          </div>
        </section>

        <div className="relative order-first mb-8 min-w-0 text-white lg:order-none lg:mb-0 lg:max-w-xl lg:ps-2">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-5 -inset-y-8 rounded-sm bg-[linear-gradient(to_top,var(--color-sidebar)_12%,color-mix(in_srgb,var(--color-sidebar)_82%,transparent)_48%,transparent_100%)] sm:-inset-x-8 sm:-inset-y-10 lg:-inset-x-12 lg:-inset-y-14 lg:bg-[linear-gradient(to_inline_start,var(--color-sidebar)_8%,color-mix(in_srgb,var(--color-sidebar)_88%,transparent)_42%,transparent_100%)]"
          />
          <div className="relative z-10">
            <MunicipalLogo size="md" withWordmark />
            <h2 className="mt-6 font-heading text-[2rem] font-bold leading-[1.22] tracking-[0] text-balance text-white sm:text-5xl lg:text-[4rem] lg:leading-[1.15]">
              {T.login.logoTitle}
              <span className="mt-1 block">{T.login.platformTitleAccent}</span>
            </h2>
            <p className="mt-5 max-w-md text-[15px] font-normal leading-[1.85] text-pretty text-white/88 sm:text-lg">
              {T.login.heroSlogan}
            </p>
          </div>
        </div>
      </div>

      <p className="pointer-events-none absolute inset-x-4 bottom-4 z-10 text-center text-[11px] text-white/80 sm:inset-x-8 sm:text-start lg:px-12">
        © {new Date().getFullYear()} {T.login.copyright}
      </p>
    </main>
  );
}
