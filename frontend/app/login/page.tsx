"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Lock, LogIn, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { LoginHero } from "@/components/login/LoginHero";
import { LoginToolbar } from "@/components/login/LoginToolbar";
import { RamallahMark } from "@/components/login/RamallahMark";
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
    "login-field h-12 min-w-0 w-full rounded-xl px-4 text-base outline-none transition-[border-color,box-shadow,background-color] duration-150",
    invalid && "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
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
  const passwordToggleLabel = showPassword ? T.login.hidePassword : T.login.showPassword;

  return (
    <main className="login-shell relative flex h-dvh min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row" dir="ltr">
        {/* Hero Section */}
        <div className="relative min-w-0 lg:h-full lg:w-1/2 lg:shrink-0 lg:min-h-0">
          <LoginHero />
        </div>

        {/* Form Section */}
        <section
          dir={dir}
          className="login-bg relative flex min-h-0 min-w-0 flex-1 flex-col lg:w-1/2"
        >
          {/* Toolbar */}
          <div className="hidden justify-end px-6 pt-3 sm:px-8 lg:flex lg:px-10 lg:pt-3">
            <LoginToolbar />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 sm:px-8 lg:px-12">
            <div
              className={cn(
                "flex min-h-full w-full shrink-0 flex-col items-center py-2",
                showDemo ? "justify-start" : "justify-safe-center"
              )}
            >
              <div className="flex w-full max-w-[28rem] flex-col items-center text-[var(--login-text)]">
                <div className="mb-3">
                  <RamallahMark size="md" layout="stacked" />
                </div>
              <h1
                id="login-heading"
                className="text-[20px] font-bold leading-tight text-navy lg:text-[22px]"
              >
                {T.login.title}
              </h1>
              <p className="login-fit-sm mt-1 text-center text-[13px] font-semibold text-ink-soft">
                {T.login.platformSubtitle}
              </p>
              <p className="login-fit-lg mt-1 max-w-[26rem] text-center text-[12px] font-medium leading-5 text-muted">
                {T.login.welcomeHint}
              </p>

              {/* Login Card */}
              <div className="login-card mt-3 w-full rounded-2xl px-5 py-3.5 sm:px-8 sm:py-4">
                <form
                  onSubmit={submit}
                  aria-labelledby="login-heading"
                  aria-busy={busy}
                  aria-describedby={error ? formErrorId : undefined}
                  noValidate
                >
                  <div id={formErrorId}>
                    <ErrorBanner message={error} />
                  </div>

                  <div className={cn("flex flex-col gap-3", error && "mt-3")}>
                    {/* Username */}
                    <div>
                      <label
                        htmlFor="login-username"
                        className="text-[13px] font-bold text-navy"
                      >
                        {T.login.username}
                      </label>
                      <div className="relative mt-1.5 min-w-0">
                        <UserRound
                          className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted"
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
                          aria-invalid={Boolean(usernameError) || credentialsInvalid}
                          aria-describedby={usernameError ? usernameErrorId : undefined}
                          className={cn("ps-11", fieldClass(Boolean(usernameError) || credentialsInvalid))}
                        />
                      </div>
                      {usernameError ? (
                        <p id={usernameErrorId} className="mt-1.5 text-xs font-bold text-danger" role="alert">
                          {usernameError}
                        </p>
                      ) : null}
                    </div>

                    {/* Password */}
                    <div>
                      <label
                        htmlFor="login-password"
                        className="text-[13px] font-bold text-navy"
                      >
                        {T.login.password}
                      </label>
                      <div className="relative mt-1.5 min-w-0">
                        <Lock
                          className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted"
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
                          aria-invalid={Boolean(passwordError) || credentialsInvalid}
                          aria-describedby={passwordError ? passwordErrorId : undefined}
                          className={cn(
                            "ps-11 pe-12",
                            fieldClass(Boolean(passwordError) || credentialsInvalid)
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          title={passwordToggleLabel}
                          aria-label={passwordToggleLabel}
                          aria-pressed={showPassword}
                          className="absolute inset-y-0 end-0 flex min-h-12 min-w-12 items-center justify-center text-muted transition-colors hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                        >
                          {showPassword ? (
                            <EyeOff className="size-[18px]" strokeWidth={1.8} aria-hidden />
                          ) : (
                            <Eye className="size-[18px]" strokeWidth={1.8} aria-hidden />
                          )}
                        </button>
                      </div>
                      {passwordError ? (
                        <p id={passwordErrorId} className="mt-1.5 text-xs font-bold text-danger" role="alert">
                          {passwordError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Remember & Forgot options */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px] font-semibold text-navy">
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
                      className="inline-flex min-h-10 items-center gap-0.5 text-[13px] font-bold text-[#08B8B0] transition-colors hover:text-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {T.login.forgotPassword}
                      {dir === "rtl" ? (
                        <ChevronLeft className="size-3.5" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <ChevronRight className="size-3.5" strokeWidth={2.5} aria-hidden />
                      )}
                    </button>
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white transition-colors duration-150 hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                  >
                    {T.login.submit}
                    {busy ? (
                      <Loader2 className="size-4.5 animate-spin" aria-hidden />
                    ) : (
                      <LogIn className="size-4.5" strokeWidth={2} aria-hidden />
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="mt-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-[12px] font-bold text-muted">{T.login.orDivider}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                {/* Demo accounts selector */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowDemo((v) => !v)}
                    aria-expanded={showDemo}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13.5px] font-bold text-navy transition-colors hover:bg-subtle/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary shadow-sm"
                  >
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
                            className="flex h-full min-h-16 w-full flex-col items-center justify-center rounded-xl border border-line bg-surface px-2.5 py-3 text-center transition-all hover:border-primary/40 hover:bg-subtle/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 shadow-sm"
                          >
                            <span className="text-[12px] font-bold leading-snug text-navy">
                              {ROLE_LABELS[account.role]}
                            </span>
                            <span className="mt-0.5 font-mono text-[10px] font-medium text-muted" dir="ltr">
                              {busy && activeDemo === account.username ? "…" : account.username}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {/* Secure label */}
                <p className="login-fit-lg mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] font-semibold text-muted">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  {T.login.secure}
                </p>
              </div>
              </div>
            </div>
          </div>

          {/* Footer copyright */}
          <p className="px-4 py-2 text-center text-[11px] font-semibold leading-5 text-muted lg:px-10">
            © 2024 {T.login.footerOwner}
            <span className="mx-1.5 text-muted/30">|</span>
            {T.login.footerPlatform}
            <span className="mx-1.5 text-muted/30">|</span>
            {T.login.versionLabel}
          </p>
        </section>
      </div>
    </main>
  );
}
