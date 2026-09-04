"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CitySkyline } from "@/components/login/CitySkyline";
import { LoginHero } from "@/components/login/LoginHero";
import { LoginToolbar } from "@/components/login/LoginToolbar";
import { MunicipalityMark } from "@/components/login/MunicipalityMark";
import { MunicipalLogo } from "@/components/brand/MunicipalLogo";
import { ErrorBanner } from "@/components/ui/Base";
import { login, ROLE_HOME } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

import "./login.css";

const DEMO_PASSWORD = "Demo@12345";
const REMEMBER_KEY = "audit_login_username";

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
    "login-field h-11 min-w-0 w-full rounded-xl px-4 text-[14px] outline-none",
    invalid &&
      "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(201,75,75,0.15)]"
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
  const passwordToggleLabel = showPassword
    ? T.login.hidePassword
    : T.login.showPassword;

  return (
    <main className="login-shell relative flex h-dvh min-h-0 min-w-0 flex-col">
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row"
        dir="ltr"
      >
        {/* ════════════════════════════════════════
            LEFT HERO PANEL (50%)
        ════════════════════════════════════════ */}
        <div className="relative min-w-0 lg:h-full lg:w-1/2 lg:min-h-0 lg:shrink-0">
          <LoginHero />
        </div>

        {/* ════════════════════════════════════════
            RIGHT LOGIN PANEL (50%)
        ════════════════════════════════════════ */}
        <section
          dir={dir}
          aria-labelledby="login-heading"
          className="login-bg relative flex min-h-0 min-w-0 flex-1 flex-col lg:w-1/2"
        >
          {/* ── Toolbar: language + theme (desktop) ── */}
          <div className="flex justify-end px-6 pt-4 sm:px-8 lg:px-10">
            <LoginToolbar />
          </div>

          {/* ── Scrollable main area ── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 sm:px-6 lg:px-8">
            <div
              className={cn(
                "flex min-h-full w-full shrink-0 flex-col items-center py-3",
                showDemo ? "justify-start" : "justify-safe-center"
              )}
            >
              {/* ── LOGIN CARD ── */}
              <div className="login-card w-full max-w-[30rem] rounded-[1.15rem] px-6 py-6 sm:px-8 sm:py-7">

                {/* Card header: emblem + bilingual name */}
                <MunicipalityMark size="lg" layout="stacked" showTagline />

                {/* Welcome heading */}
                <div className="mt-5 flex flex-col items-center text-center">
                  <h1
                    id="login-heading"
                    className="text-[1.35rem] font-bold leading-tight text-[var(--login-navy)] lg:text-[1.45rem]"
                  >
                    {T.login.welcome}
                  </h1>
                  <p className="mt-1.5 text-[13px] leading-5 text-[var(--login-muted)]">
                    {T.login.loginHint}
                  </p>
                </div>

                {/* Diamond divider */}
                <div
                  className="mt-5 flex items-center gap-3"
                  aria-hidden
                >
                  <span className="h-px flex-1 bg-[var(--login-border)]" />
                  <span className="login-diamond" />
                  <span className="h-px flex-1 bg-[var(--login-border)]" />
                </div>

                {/* ── FORM ── */}
                <form
                  onSubmit={submit}
                  aria-labelledby="login-heading"
                  aria-busy={busy}
                  aria-describedby={error ? formErrorId : undefined}
                  noValidate
                  className="mt-4"
                >
                  {/* Error banner */}
                  <div id={formErrorId}>
                    <ErrorBanner message={error} />
                  </div>

                  <div
                    className={cn(
                      "flex flex-col gap-3.5",
                      error && "mt-3"
                    )}
                  >
                    {/* Username field */}
                    <div>
                      <label
                        htmlFor="login-username"
                        className="text-[13px] font-bold text-[var(--login-navy)]"
                      >
                        {T.login.username}
                      </label>
                      <div className="relative mt-1.5 min-w-0">
                        <UserRound
                          className="pointer-events-none absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-[var(--login-muted)]"
                          strokeWidth={1.8}
                          aria-hidden
                        />
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
                          aria-invalid={
                            Boolean(usernameError) || credentialsInvalid
                          }
                          aria-describedby={
                            usernameError ? usernameErrorId : undefined
                          }
                          className={cn(
                            "ps-10",
                            fieldClass(
                              Boolean(usernameError) || credentialsInvalid
                            )
                          )}
                        />
                      </div>
                      {usernameError ? (
                        <p
                          id={usernameErrorId}
                          className="mt-1.5 text-xs font-bold text-danger"
                          role="alert"
                        >
                          {usernameError}
                        </p>
                      ) : null}
                    </div>

                    {/* Password field */}
                    <div>
                      <label
                        htmlFor="login-password"
                        className="text-[13px] font-bold text-[var(--login-navy)]"
                      >
                        {T.login.password}
                      </label>
                      <div className="relative mt-1.5 min-w-0">
                        <Lock
                          className="pointer-events-none absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-[var(--login-muted)]"
                          strokeWidth={1.8}
                          aria-hidden
                        />
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
                          aria-invalid={
                            Boolean(passwordError) || credentialsInvalid
                          }
                          aria-describedby={
                            passwordError ? passwordErrorId : undefined
                          }
                          className={cn(
                            "ps-10 pe-11",
                            fieldClass(
                              Boolean(passwordError) || credentialsInvalid
                            )
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          title={passwordToggleLabel}
                          aria-label={passwordToggleLabel}
                          aria-pressed={showPassword}
                          className="absolute inset-y-0 end-0 flex min-h-11 min-w-11 items-center justify-center text-[var(--login-muted)] transition-colors hover:text-[var(--login-navy)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--login-accent)]"
                        >
                          {showPassword ? (
                            <EyeOff
                              className="size-[17px]"
                              strokeWidth={1.8}
                              aria-hidden
                            />
                          ) : (
                            <Eye
                              className="size-[17px]"
                              strokeWidth={1.8}
                              aria-hidden
                            />
                          )}
                        </button>
                      </div>
                      {passwordError ? (
                        <p
                          id={passwordErrorId}
                          className="mt-1.5 text-xs font-bold text-danger"
                          role="alert"
                        >
                          {passwordError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Remember me / Forgot password */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--login-navy)]">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="size-[15px] shrink-0 accent-[var(--login-accent)]"
                      />
                      {T.login.rememberMe}
                    </label>
                    <button
                      type="button"
                      className="inline-flex min-h-8 items-center gap-0.5 text-[13px] font-bold text-[var(--login-accent)] transition-colors hover:text-[var(--login-btn-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--login-accent)]"
                    >
                      {T.login.forgotPassword}
                      {dir === "rtl" ? (
                        <ChevronLeft
                          className="size-3.5"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      ) : (
                        <ChevronRight
                          className="size-3.5"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      )}
                    </button>
                  </div>

                  {/* Primary login button */}
                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--login-btn)] text-[15px] font-bold text-white shadow-sm transition-colors duration-150 hover:bg-[var(--login-btn-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--login-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {T.login.submit}
                    {busy ? (
                      <Loader2
                        className="size-[18px] animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <LogIn className="size-[18px]" strokeWidth={2} aria-hidden />
                    )}
                  </button>
                </form>

                {/* "أو" divider */}
                <div className="mt-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-[var(--login-border)]" />
                  <span className="text-[12px] font-bold text-[var(--login-muted)]">
                    {T.login.orDivider}
                  </span>
                  <span className="h-px flex-1 bg-[var(--login-border)]" />
                </div>

                {/* Demo accounts */}
                <div className="mt-3.5">
                  <button
                    type="button"
                    onClick={() => setShowDemo((v) => !v)}
                    aria-expanded={showDemo}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--login-border)] bg-[var(--login-card)] text-[13.5px] font-bold text-[var(--login-navy)] shadow-sm transition-colors hover:bg-[#f0f4f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--login-accent)]"
                  >
                    <UserRound
                      className="size-[16px] text-[var(--login-muted)]"
                      strokeWidth={1.7}
                      aria-hidden
                    />
                    {T.login.demoToggle}
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform duration-150",
                        showDemo && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>

                  {showDemo ? (
                    <ul className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                      {DEMO_ACCOUNTS.map((account) => (
                        <li key={account.username}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => pickDemo(account)}
                            className="flex h-full min-h-[3.75rem] w-full flex-col items-center justify-center rounded-xl border border-[var(--login-border)] bg-[var(--login-card)] px-2.5 py-3 text-center shadow-sm transition-all hover:border-[var(--login-accent)]/40 hover:bg-[#eef4f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--login-accent)] disabled:opacity-50"
                          >
                            <span className="text-[12px] font-bold leading-snug text-[var(--login-navy)]">
                              {ROLE_LABELS[account.role]}
                            </span>
                            <span
                              className="mt-0.5 font-mono text-[10px] font-medium text-[var(--login-muted)]"
                              dir="ltr"
                            >
                              {busy && activeDemo === account.username
                                ? "…"
                                : account.username}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {/* Secure access note */}
                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] font-semibold text-[var(--login-muted)]">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  {T.login.secure}
                </p>
              </div>
              {/* ── /LOGIN CARD ── */}
            </div>
          </div>

          {/* ── City skyline watermark ── */}
          <div className="login-skyline -mb-0.5">
            <CitySkyline className="w-full" />
          </div>

          {/* ── Footer ── */}
          <footer className="flex flex-wrap items-center justify-between gap-2 px-6 pb-3 pt-1 text-[11px] font-medium text-[var(--login-muted)] lg:px-10">
            <p>© 2024 {T.login.footerOwner}</p>
            <div className="flex items-center gap-2">
              <span>{T.login.mayorLabel}: {T.login.mayorName}</span>
              <span className="opacity-30">•</span>
              <span>{T.login.footerPlatform}</span>
            </div>
            <p>{T.login.versionLabel}</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
