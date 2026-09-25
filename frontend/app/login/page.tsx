"use client";

import {
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  UserRound,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CitySkyline } from "@/components/login/CitySkyline";
import { LoginHero } from "@/components/login/LoginHero";
import { LoginToolbar } from "@/components/login/LoginToolbar";
import { PanelOrnaments } from "@/components/login/LoginOrnaments";
import { RaqeebWordmark } from "@/components/brand/RaqeebWordmark";
import { MunicipalityMark } from "@/components/login/MunicipalityMark";
import { ErrorBanner } from "@/components/ui/Base";
import { login, ROLE_HOME } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

import "./login.css";

// Demo quick-login is a local-development convenience. The password is NOT in
// source: it comes from build-time env vars that exist only in a developer's
// .env.local, so a production build (flag unset) ships neither the password nor
// the demo accounts, and the section below is not rendered.
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";
const DEMO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";
const REMEMBER_KEY = "audit_login_username";

const DEMO_ACCOUNTS: Array<{
  username: string;
  role: Role;
  noteKey: "demoAudit" | "demoHead" | "demoEmployee" | "demoCouncil";
}> = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true"
  ? [
    { username: "audit1", role: "audit", noteKey: "demoAudit" },
    { username: "head_finance", role: "department_head", noteKey: "demoHead" },
    { username: "emp_finance1", role: "employee", noteKey: "demoEmployee" },
    { username: "council1", role: "council", noteKey: "demoCouncil" },
  ]
  : [];

function fieldClass(invalid: boolean) {
  return cn(
    "login-field h-9.5 min-w-0 w-full rounded-xl px-3.5 text-[13px] outline-none transition-all",
    invalid &&
      "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(201,75,75,0.15)]"
  );
}

export default function LoginPage() {
  const { dir } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
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
      // Query keys are not per-user. The login page can be reached by a
      // client-side redirect (e.g. signed out in another tab), so drop any
      // previous session's cached data before showing the new user's pages.
      queryClient.clear();
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
    <main className="login-shell relative flex min-h-[100dvh] w-full lg:h-screen lg:w-screen lg:flex-row lg:overflow-hidden">
      <div
        className="flex h-auto w-full flex-col lg:h-full lg:flex-row bg-transparent"
        dir="ltr"
      >
        {/* ════════════════════════════════════════
            LEFT HERO PANEL (50%)
        ════════════════════════════════════════ */}
        <div className="relative w-full lg:h-full lg:w-1/2 lg:flex-none lg:overflow-hidden login-hero-panel">
          <LoginHero />
        </div>

        {/* ════════════════════════════════════════
            RIGHT LOGIN PANEL (50%)
        ════════════════════════════════════════ */}
        <section
          dir={dir}
          aria-labelledby="login-heading"
          className="login-bg login-split relative isolate flex w-full flex-1 flex-col justify-between py-2 lg:py-0 lg:h-full lg:w-1/2 lg:flex-none lg:overflow-hidden login-form-panel"
        >
          <PanelOrnaments />

          {/* ── Toolbar: language + theme ── */}
          <div className="flex shrink-0 justify-end px-5 pt-1 sm:px-8 lg:px-10 lg:pt-3">
            <LoginToolbar />
          </div>

          {/* ── Center Area: Login Card ── */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-1 sm:px-6 lg:px-8 overflow-y-auto lg:overflow-hidden">
            <div className="login-card w-full max-w-[27.5rem] rounded-[1.2rem] px-5 py-5 sm:px-7 sm:py-6">

              {/* Card header: emblem + bilingual name */}
              <MunicipalityMark size="md" layout="stacked" showTagline />

              {/* Welcome heading */}
              <div className="mt-3 flex flex-col items-center text-center">
                <h1
                  id="login-heading"
                  className="w-full text-[var(--login-btn)]"
                >
                  <RaqeebWordmark size="card" showTagline={false} />
                </h1>
                <p className="mt-1 text-[0.75rem] leading-snug text-[var(--login-muted)]">
                  {T.login.loginHint}
                </p>
              </div>

              {/* Diamond divider */}
              <div
                className="mt-4 mb-2 flex items-center gap-3"
                aria-hidden
              >
                <span className="h-px flex-1 bg-[var(--login-divider)]" />
                <span className="login-diamond" />
                <span className="h-px flex-1 bg-[var(--login-divider)]" />
              </div>

              {/* ── FORM ── */}
              <form
                onSubmit={submit}
                aria-labelledby="login-heading"
                aria-busy={busy}
                aria-describedby={error ? formErrorId : undefined}
                noValidate
                className="mt-3"
              >
                {/* Error banner */}
                <div id={formErrorId}>
                  <ErrorBanner message={error} />
                </div>

                <div
                  className={cn(
                    "flex flex-col gap-2.5",
                    error && "mt-2"
                  )}
                >
                  {/* Username field */}
                  <div>
                    <label
                      htmlFor="login-username"
                      className="text-[0.75rem] font-bold text-[var(--login-navy)]"
                    >
                      {T.login.username}
                    </label>
                    <div className="relative mt-1 min-w-0">
                      <UserRound
                        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--login-muted)]"
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
                          "ps-9.5",
                          fieldClass(
                            Boolean(usernameError) || credentialsInvalid
                          )
                        )}
                      />
                    </div>
                    {usernameError ? (
                      <p
                        id={usernameErrorId}
                        className="mt-1 text-[0.6875rem] font-bold text-danger"
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
                      className="text-[0.75rem] font-bold text-[var(--login-navy)]"
                    >
                      {T.login.password}
                    </label>
                    <div className="relative mt-1 min-w-0">
                      <Lock
                        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--login-muted)]"
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
                          "pe-9 ps-9.5",
                          fieldClass(
                            Boolean(passwordError) || credentialsInvalid
                          )
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        title={passwordToggleLabel}
                        aria-label={passwordToggleLabel}
                        className="absolute end-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--login-muted)] transition-colors hover:text-[var(--login-navy)] focus-visible:outline-2 focus-visible:outline-[var(--login-accent)]"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                      </button>
                    </div>
                    {passwordError ? (
                      <p
                        id={passwordErrorId}
                        className="mt-1 text-[0.6875rem] font-bold text-danger"
                        role="alert"
                      >
                        {passwordError}
                      </p>
                    ) : null}
                  </div>

                  {/* Options row: remember me + forgot password */}
                  <div className="mt-3 flex items-center justify-between text-[0.75rem] px-1">
                    <a
                      href="#forgot"
                      onClick={(e) => {
                        e.preventDefault();
                        setError(T.login.forgotPassword);
                      }}
                      className="font-medium text-[var(--login-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--login-accent)]"
                    >
                      {T.login.forgotPassword}
                    </a>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium text-[var(--login-navy)]">
                      <span>{T.login.rememberMe}</span>
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="size-3.5 rounded border-[var(--login-border)] bg-[var(--login-field)] text-[var(--login-accent)] focus:ring-[var(--login-accent)]"
                      />
                    </label>
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={busy}
                    className="login-btn mt-5 mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[clamp(0.8125rem,2vw,0.84375rem)] font-bold shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2
                        className="size-4 animate-spin text-white"
                        aria-hidden
                      />
                    ) : (
                      <>
                        <LogIn className="size-4" aria-hidden />
                        <span>{T.login.submit}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {DEMO_ENABLED ? (
              <>
              {/* Demo roles toggle section */}
              <div className="mt-2.5 pt-2 border-t border-[var(--login-border)]">
                <button
                  type="button"
                  onClick={() => setShowDemo((v) => !v)}
                  className="login-demo-btn flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5 text-[var(--login-accent)]" />
                    <span>{T.login.demoTitle}</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-[var(--login-muted)] transition-transform duration-200",
                      showDemo && "rotate-180"
                    )}
                  />
                </button>

                {showDemo ? (
                  <ul className="mt-2 grid grid-cols-2 gap-1.5">
                    {DEMO_ACCOUNTS.map((account) => (
                      <li key={account.username}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => pickDemo(account)}
                          className="login-demo-btn flex h-full min-h-[2.75rem] w-full flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center shadow-xs transition-all disabled:opacity-50"
                        >
                          <span className="text-[0.6875rem] font-bold leading-tight text-[var(--login-label)]">
                            {ROLE_LABELS[account.role]}
                          </span>
                          <span
                            className="text-[0.59375rem] font-mono font-medium text-[var(--login-muted)]"
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
              </>
              ) : null}

              {/* Secure access note */}
              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[0.6875rem] font-semibold text-[var(--login-muted)]">
                <Lock className="size-3 shrink-0" aria-hidden />
                {T.login.secure}
              </p>
            </div>
          </div>


          {/* ── Bottom Section: City skyline & Footer ── */}
          <div className="flex shrink-0 flex-col justify-end">
            <div className="login-skyline -mb-1 opacity-20 pointer-events-none">
              <CitySkyline className="w-full h-10 sm:h-12" />
            </div>

            <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-[var(--login-border)] px-6 pb-3 pt-3 text-center text-[0.6875rem] font-medium text-[var(--login-footer)] lg:justify-between lg:gap-2 lg:px-10 lg:pb-2.5 lg:pt-1 lg:text-start lg:text-[0.65625rem]">
              {/* Phones stack: platform, then mayor, then "© owner • version" on
                  one line. From lg up the original three-column row is kept. */}
              <p className="order-2 lg:order-none">© 2026 {T.login.footerOwner}</p>
              <div className="order-1 flex w-full flex-col-reverse items-center gap-1 lg:order-none lg:w-auto lg:flex-row lg:gap-2">
                <span>{T.login.mayorLabel}: {T.login.mayorName}</span>
                <span className="hidden opacity-30 lg:inline">•</span>
                <span className="font-semibold lg:font-medium">{T.login.footerPlatform}</span>
              </div>
              <p className="order-3 before:me-3 before:opacity-30 before:content-['•'] lg:order-none lg:before:hidden">
                {T.login.versionLabel}
              </p>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
