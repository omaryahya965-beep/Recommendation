"use client";

import { ChevronDown, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { MunicipalLogo } from "@/components/brand/MunicipalLogo";
import { LocaleSwitch } from "@/components/i18n/LocaleSwitch";
import { ThemeSwitch } from "@/components/theme/ThemeSwitch";
import { ErrorBanner } from "@/components/ui/Base";
import { login, ROLE_HOME } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

const DEMO_PASSWORD = "Demo@12345";
const REMEMBER_KEY = "audit_login_username";

const FIELD_CLASS =
  "h-12 min-w-0 w-full rounded-(--radius-field) border border-line bg-elevated px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25";

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

function fieldClass(invalid: boolean) {
  return cn(
    FIELD_CLASS,
    invalid && "border-danger focus:border-danger focus:ring-danger/20"
  );
}

function LoginIdentity({ inverted = false }: { inverted?: boolean }) {
  useI18n();
  return (
    <div className="flex flex-col items-center text-center">
      <MunicipalLogo size="md" inverted={inverted} />
      <p
        className={cn(
          "mt-4 text-sm font-medium tracking-normal",
          inverted ? "text-ink-soft" : "text-white/90"
        )}
      >
        {T.login.logoTitle}
      </p>
      <p
        className={cn(
          "mt-1.5 text-lg font-semibold leading-snug",
          inverted ? "text-navy" : "text-white"
        )}
      >
        {T.login.productName}
      </p>
    </div>
  );
}

export default function LoginPage() {
  const { dir } = useI18n();
  const router = useRouter();
  const formErrorId = useId();
  const usernameErrorId = useId();
  const passwordErrorId = useId();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
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
    setUsernameError(null);
    setPasswordError(null);
    try {
      const auth = await login(user, pass);
      if (remember) localStorage.setItem(REMEMBER_KEY, user);
      else localStorage.removeItem(REMEMBER_KEY);
      router.replace(ROLE_HOME[auth.user.role] ?? "/login");
    } catch {
      setError(T.login.error);
      setBusy(false);
      setActiveDemo(null);
      usernameRef.current?.focus();
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextUserError = username.trim() ? null : T.login.errorUsername;
    const nextPassError = password ? null : T.login.errorPassword;
    setUsernameError(nextUserError);
    setPasswordError(nextPassError);
    setError(null);
    if (nextUserError || nextPassError) {
      (nextUserError ? usernameRef : passwordRef).current?.focus();
      return;
    }
    await signIn(username, password);
  };

  const pickDemo = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setUsername(account.username);
    setPassword(DEMO_PASSWORD);
    setActiveDemo(account.username);
    await signIn(account.username, DEMO_PASSWORD);
  };

  const credentialsInvalid = Boolean(error);
  const passwordToggleLabel = showPassword ? T.login.hidePassword : T.login.showPassword;

  return (
    <main className="min-h-dvh min-w-0 overflow-x-clip bg-subtle">
      <div
        className="flex min-h-dvh min-w-0 flex-col lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(30rem,42rem)]"
        dir="ltr"
      >
        <aside className="relative isolate h-40 shrink-0 overflow-hidden sm:h-48 lg:h-auto lg:min-h-dvh">
          <Image
            src="/images/city-hall.png"
            alt={T.login.cityHallAlt}
            fill
            priority
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="object-cover object-[center_28%]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgb(22_53_68/0.28)_0%,rgb(22_53_68/0.42)_40%,rgb(22_53_68/0.58)_100%)]"
          />
          <div aria-hidden className="absolute inset-0 bg-primary/10" />

          <div dir={dir} className="relative z-10 hidden h-full items-center p-12 lg:flex xl:p-16">
            <div className="relative max-w-md">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-x-10 -inset-y-12 bg-[linear-gradient(to_top,rgb(22_53_68/0.88)_8%,rgb(22_53_68/0.62)_52%,transparent_100%)]"
              />
              <div className="relative" aria-label={T.login.heroStatement}>
                <p className="text-[2.15rem] font-bold leading-[1.55] text-white lg:text-[2.5rem] xl:text-[2.65rem]">
                  <span className="block">{T.login.heroLine1}</span>
                  <span className="mt-1 block">{T.login.heroLine2}</span>
                </p>
                <p className="mt-8 max-w-sm text-[1.05rem] font-normal leading-9 text-pretty text-white/90">
                  {T.login.heroSupporting}
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section
          dir={dir}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-subtle lg:min-h-dvh"
        >
          <div className="flex justify-end px-5 pt-5 sm:px-8 lg:px-14 lg:pt-8">
            <div
              className="flex items-center justify-end gap-1 rounded-[10px] border border-line bg-surface p-1"
              role="toolbar"
              aria-label={T.nav.appearance}
            >
              <LocaleSwitch className="border-0 p-0 [&_button]:min-h-10 [&_button]:px-2.5" />
              <ThemeSwitch className="border-0 p-0 [&_button]:min-h-10 [&_button]:min-w-10" />
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-start px-5 py-8 sm:px-8 lg:justify-center lg:px-14 lg:py-10 xl:px-16">
            <div className="w-full max-w-[26.5rem]">
              <LoginIdentity inverted />

              <div className="mt-6 space-y-3 text-center lg:hidden">
                <p className="text-[1.35rem] font-bold leading-[1.5] text-navy">
                  <span className="block">{T.login.heroLine1}</span>
                  <span className="block">{T.login.heroLine2}</span>
                </p>
                <p className="text-sm leading-7 text-ink-soft">{T.login.heroSupporting}</p>
              </div>

              <div className="relative mt-8 overflow-hidden rounded-2xl border border-line bg-surface px-6 py-8 shadow-(--shadow-panel) sm:px-8 sm:py-9">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" aria-hidden />

                <header>
                  <h1
                    id="login-heading"
                    className="font-body text-[1.375rem] font-semibold leading-tight tracking-normal text-navy"
                  >
                    {T.login.title}
                  </h1>
                  <p className="mt-2 text-sm font-normal leading-6 text-ink-soft">{T.login.welcomeHint}</p>
                </header>

                <form
                  onSubmit={submit}
                  className="mt-8"
                  aria-labelledby="login-heading"
                  aria-busy={busy}
                  aria-describedby={error ? formErrorId : undefined}
                  noValidate
                >
                  <div id={formErrorId}>
                    <ErrorBanner message={error} />
                  </div>

                  <div className={cn("flex flex-col gap-6", error && "mt-6")}>
                    <div>
                      <label htmlFor="login-username" className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-ink">{T.login.username}</span>
                        <span className="text-[11px] font-medium text-muted" aria-hidden>
                          {T.login.requiredHint}
                        </span>
                      </label>
                      <input
                        id="login-username"
                        ref={usernameRef}
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (usernameError) setUsernameError(null);
                          if (error) setError(null);
                        }}
                        placeholder={T.login.usernamePlaceholder}
                        autoComplete="username"
                        aria-required={true}
                        aria-invalid={Boolean(usernameError) || credentialsInvalid}
                        aria-describedby={usernameError ? usernameErrorId : undefined}
                        className={cn("mt-2", fieldClass(Boolean(usernameError) || credentialsInvalid))}
                      />
                      {usernameError ? (
                        <p id={usernameErrorId} className="mt-2 text-sm text-danger-dark" role="alert">
                          {usernameError}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label htmlFor="login-password" className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-ink">{T.login.password}</span>
                        <span className="text-[11px] font-medium text-muted" aria-hidden>
                          {T.login.requiredHint}
                        </span>
                      </label>
                      <div className="relative mt-2 min-w-0">
                        <input
                          id="login-password"
                          ref={passwordRef}
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (passwordError) setPasswordError(null);
                            if (error) setError(null);
                          }}
                          placeholder={T.login.passwordPlaceholder}
                          autoComplete="current-password"
                          aria-required={true}
                          aria-invalid={Boolean(passwordError) || credentialsInvalid}
                          aria-describedby={passwordError ? passwordErrorId : undefined}
                          className={cn("pe-12", fieldClass(Boolean(passwordError) || credentialsInvalid))}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          title={passwordToggleLabel}
                          aria-label={passwordToggleLabel}
                          aria-pressed={showPassword}
                          className="absolute inset-y-0 end-0 flex min-h-12 min-w-12 items-center justify-center text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" aria-hidden />
                          ) : (
                            <Eye className="size-4" aria-hidden />
                          )}
                        </button>
                      </div>
                      {passwordError ? (
                        <p id={passwordErrorId} className="mt-2 text-sm text-danger-dark" role="alert">
                          {passwordError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      {T.login.rememberMe}
                    </label>
                    <button
                      type="button"
                      className="min-h-12 self-start text-sm font-medium text-ink-soft underline-offset-2 hover:text-primary-dark hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:self-auto"
                    >
                      {T.login.forgotPassword}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-(--radius-btn) bg-primary text-base font-semibold text-white transition-colors duration-150 hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    ) : null}
                    {T.login.submit}
                  </button>
                </form>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowDemo((v) => !v)}
                    aria-expanded={showDemo}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-soft transition-colors hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {showDemo ? T.login.demoHide : T.login.demoToggle}
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform duration-150 motion-reduce:transition-none",
                        showDemo && "rotate-180"
                      )}
                      aria-hidden
                    />
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
                              className="w-full rounded-(--radius-field) border border-line bg-elevated px-3 py-2.5 text-start text-xs transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                            >
                              <span className="block text-[13px] font-semibold text-navy">
                                {ROLE_LABELS[account.role]}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-ink-soft">
                                {T.login[account.noteKey]}
                              </span>
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

                <p className="mt-8 flex items-center gap-2 text-[12px] leading-5 text-muted">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  {T.login.secure}
                </p>
              </div>
            </div>
          </div>

          <p className="px-5 pb-6 text-center text-[11px] text-muted lg:px-14">
            © {new Date().getFullYear()} {T.login.copyright}
          </p>
        </section>
      </div>
    </main>
  );
}
