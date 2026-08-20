"use client";

import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
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
  "h-11 min-w-0 w-full rounded-(--radius-field) border border-line bg-elevated px-3 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20";

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

function SystemToolbar({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <ThemeSwitch />
      <LocaleSwitch />
    </div>
  );
}

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

  const invalid = Boolean(error);

  return (
    <main className="flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-bg lg:flex-row">
      <aside className="relative hidden min-h-dvh min-w-0 overflow-hidden bg-sidebar lg:flex lg:w-[48%] lg:flex-col lg:justify-end ltr:order-1 rtl:order-2">
        <Image
          src="/images/city-hall.png"
          alt=""
          fill
          priority
          sizes="48vw"
          className="object-cover object-[center_32%]"
        />
        <div className="absolute inset-0 bg-sidebar/60" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/55 to-primary-dark/25" aria-hidden />
        <div className="relative z-10 max-w-lg px-10 pb-12 pt-16 text-sidebar-text xl:px-14">
          <p className="text-sm font-medium text-primary-light">{T.login.heroKicker}</p>
          <p className="mt-4 font-heading text-[1.75rem] font-semibold leading-[1.55] text-balance xl:text-[2rem]">
            {T.login.heroSlogan}
          </p>
          <p className="mt-4 text-[15px] leading-7 text-pretty text-sidebar-muted">{T.login.heroSubtitle}</p>
        </div>
      </aside>

      <div className="relative h-28 min-w-0 overflow-hidden lg:hidden">
        <Image
          src="/images/city-hall.png"
          alt={T.login.cityHallAlt}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-sidebar/55" aria-hidden />
      </div>

      <section className="flex min-w-0 flex-1 flex-col bg-surface ltr:order-2 rtl:order-1 lg:border-s lg:border-line">
        <div className="mx-auto flex w-full min-w-0 max-w-[26rem] flex-1 flex-col px-5 py-7 sm:px-8 lg:justify-center lg:px-10 lg:py-12">
          <div className="mb-8 hidden justify-end lg:flex">
            <SystemToolbar />
          </div>

          <MunicipalLogo inverted withWordmark size="sm" className="min-w-0" />

          <h1 className="mt-8 font-heading text-[1.35rem] font-bold leading-snug text-navy">{T.login.title}</h1>
          <p className="mt-2 text-[15px] leading-6 text-ink">{T.login.welcome}</p>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{T.login.platformSubtitle}</p>

          <form onSubmit={submit} className="mt-8 space-y-4" aria-busy={busy} aria-describedby={error ? errorId : undefined}>
            <div id={errorId}>
              <ErrorBanner message={error} />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{T.login.username}</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={T.login.usernamePlaceholder}
                autoComplete="username"
                required
                aria-invalid={invalid}
                className={FIELD_CLASS}
              />
            </label>

            <div>
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
                    aria-invalid={invalid}
                    className={`${FIELD_CLASS} pe-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 end-1 flex min-h-11 min-w-11 items-center justify-center text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    aria-label={showPassword ? T.login.hidePassword : T.login.showPassword}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>
              <button
                type="button"
                className="mt-2 text-sm text-primary-dark underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              className="flex h-11 w-full items-center justify-center gap-2 rounded-(--radius-btn) bg-primary text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? T.login.signingIn : T.login.submit}
            </button>
          </form>

          <p className="mt-5 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
            {T.login.secure}
          </p>

          <div className="mt-8 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              className="text-sm font-medium text-primary-dark underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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

          <p className="mt-8 text-center text-[11px] text-pretty text-muted lg:mt-10">
            © {new Date().getFullYear()} {T.login.copyright}
          </p>

          <div className="mt-8 lg:hidden">
            <SystemToolbar />
          </div>
        </div>
      </section>
    </main>
  );
}
