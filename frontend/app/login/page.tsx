"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
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

const FIELD_CLASS =
  "h-12 min-w-0 w-full rounded-(--radius-field) border border-line bg-elevated px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20";

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
    T.login.values.transparency,
    T.login.values.professionalism,
    T.login.values.credibility,
    T.login.values.participation,
  ];

  return (
    <main className="relative min-h-dvh min-w-0 overflow-x-clip bg-sidebar">
      <Image
        src="/images/city-hall.png"
        alt={T.login.cityHallAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_28%]"
      />
      <div className="absolute inset-0 bg-sidebar/55 mix-blend-multiply" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/50 to-primary-dark/35"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-dvh min-w-0 max-w-6xl flex-col justify-end px-4 pb-6 pt-[30vh] sm:px-6 lg:justify-center lg:px-10 lg:py-12 lg:pt-12">
        <div className="grid min-w-0 items-end gap-8 lg:grid-cols-[24.5rem_minmax(0,1fr)] lg:items-center lg:gap-14">
          <section className="min-w-0 rounded-t-(--radius-container) border border-line bg-surface p-5 shadow-(--shadow-float) sm:p-7 lg:rounded-(--radius-container)">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
              <MunicipalLogo inverted withWordmark size="md" className="min-w-0 flex-1 basis-[11rem]" />
              <div className="ms-auto flex shrink-0 items-center gap-2">
                <ThemeSwitch />
                <LocaleSwitch />
              </div>
            </div>

            <p className="mb-1 text-xs font-medium text-primary-dark">{T.login.secure}</p>
            <h1 className="font-heading text-[1.45rem] font-bold leading-[1.5] text-balance text-navy sm:text-[1.65rem]">
              {T.login.platformTitle}{" "}
              <span className="text-primary-dark">{T.login.platformTitleAccent}</span>
            </h1>
            <p className="mt-2 text-sm leading-6 text-pretty text-ink-soft">{T.login.platformSubtitle}</p>

            <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-ink-soft lg:hidden">
              {values.map((label) => (
                <li key={label} className="after:ms-3 after:text-primary after:content-['·'] last:after:content-none">
                  {label}
                </li>
              ))}
            </ul>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <ErrorBanner message={error} />

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{T.login.username}</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={T.login.usernamePlaceholder}
                  autoComplete="username"
                  required
                  className={FIELD_CLASS}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{T.login.password}</span>
                <div className="relative min-w-0">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={T.login.passwordPlaceholder}
                    autoComplete="current-password"
                    required
                    className={`${FIELD_CLASS} pe-12`}
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

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
                <label className="flex min-w-0 cursor-pointer items-center gap-2 text-ink-soft">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  {T.login.rememberMe}
                </label>
                <button type="button" className="shrink-0 text-primary-dark hover:text-primary">
                  {T.login.forgotPassword}
                </button>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-(--radius-btn) bg-primary font-heading text-[15px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                {T.login.submit}
                <LogIn className="size-5" strokeWidth={2.25} />
              </button>
            </form>

            <div className="mt-6 border-t border-dashed border-line pt-4">
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

            <p className="mt-6 text-center text-[11px] text-pretty text-muted">
              © {new Date().getFullYear()} {T.login.copyright}
            </p>
          </section>

          <div className="hidden min-w-0 text-sidebar-text lg:block">
            <p className="text-sm font-medium text-primary-light">{T.login.heroKicker}</p>
            <p className="mt-4 max-w-lg font-display text-[2.15rem] font-semibold leading-[1.45] text-balance">
              {T.login.heroSlogan}
            </p>
            <p className="mt-8 max-w-md text-[15px] leading-7 text-sidebar-muted">
              {values.map((label, index) => (
                <span key={label}>
                  {index > 0 ? (
                    <span className="mx-2.5 text-primary" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  {label}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
