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
    "login-field h-12 min-w-0 w-full rounded-[10px] px-3.5 text-base outline-none transition-[border-color,box-shadow] duration-150",
    invalid && "border-[#C94B4B] focus:border-[#C94B4B] focus:shadow-[0_0_0_3px_rgb(201_75_75/0.18)]"
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
    <main className="login-shell min-h-dvh min-w-0 overflow-x-clip bg-[#F7F9FA]">
      <div className="flex min-h-dvh min-w-0 flex-col lg:flex-row" dir="ltr">
        <div className="relative min-w-0 lg:w-1/2 lg:shrink-0 lg:min-h-dvh">
          <LoginHero />
        </div>

        <section
          dir={dir}
          className="login-bg relative z-10 flex min-h-0 min-w-0 flex-1 flex-col lg:min-h-dvh lg:w-1/2"
        >
          <div className="hidden justify-start px-6 pt-2 sm:px-8 lg:flex lg:px-10 lg:pt-2">
            <LoginToolbar />
          </div>

          <div className="flex flex-1 flex-col items-center justify-start px-4 pb-5 pt-5 sm:px-8 lg:px-12 lg:pt-0">
            <div className="flex w-full max-w-[28rem] flex-col items-center text-[var(--login-text)]">
              <RamallahMark size="md" layout="stacked" className="hidden lg:flex" />
              <h1
                id="login-heading"
                className="text-[1.5rem] font-bold leading-tight text-[var(--login-text)] lg:mt-2 lg:text-[1.75rem]"
              >
                {T.login.title}
              </h1>
              <p className="mt-2 text-center text-[0.95rem] font-medium text-[var(--login-text)]">
                {T.login.platformSubtitle}
              </p>
              <p className="mt-1.5 max-w-[26rem] text-center text-[13px] leading-6 text-[var(--login-muted)]">
                {T.login.welcomeHint}
              </p>

              <div className="login-card mt-4 w-full rounded-[16px] px-4 py-6 sm:px-8 sm:py-8 lg:mt-3">
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

                  <div className={cn("flex flex-col gap-5", error && "mt-5")}>
                    <div>
                      <label
                        htmlFor="login-username"
                        className="text-[13px] font-semibold text-[var(--login-text)]"
                      >
                        {T.login.username}
                      </label>
                      <div className="relative mt-2 min-w-0">
                        <UserRound
                          className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[#8A9AA3]"
                          strokeWidth={1.6}
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
                        <p id={usernameErrorId} className="mt-2 text-sm text-[#9A3535]" role="alert">
                          {usernameError}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label
                        htmlFor="login-password"
                        className="text-[13px] font-semibold text-[var(--login-text)]"
                      >
                        {T.login.password}
                      </label>
                      <div className="relative mt-2 min-w-0">
                        <Lock
                          className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[#8A9AA3]"
                          strokeWidth={1.6}
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
                          className="absolute inset-y-0 end-0 flex min-h-12 min-w-12 items-center justify-center text-[#8A9AA3] transition-colors hover:text-[var(--login-text)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#08B8B0]"
                        >
                          {showPassword ? (
                            <EyeOff className="size-[18px]" strokeWidth={1.6} aria-hidden />
                          ) : (
                            <Eye className="size-[18px]" strokeWidth={1.6} aria-hidden />
                          )}
                        </button>
                      </div>
                      {passwordError ? (
                        <p id={passwordErrorId} className="mt-2 text-sm text-[#9A3535]" role="alert">
                          {passwordError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13px] text-[var(--login-text)]">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="size-4 shrink-0 accent-[#087F78]"
                      />
                      {T.login.rememberMe}
                    </label>
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center gap-1 text-[13px] font-medium text-[#08B8B0] transition-colors hover:text-[#087F78] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08B8B0]"
                    >
                      {T.login.forgotPassword}
                      {dir === "rtl" ? (
                        <ChevronLeft className="size-3.5" strokeWidth={2} aria-hidden />
                      ) : (
                        <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden />
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#0D7377] text-base font-semibold text-white transition-colors duration-150 hover:bg-[#08666a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08B8B0] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {T.login.submit}
                    {busy ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    ) : (
                      <LogIn className="size-4" strokeWidth={1.8} aria-hidden />
                    )}
                  </button>
                </form>

                <div className="mt-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-[var(--login-border)]" />
                  <span className="text-[13px] text-[var(--login-muted)]">{T.login.orDivider}</span>
                  <span className="h-px flex-1 bg-[var(--login-border)]" />
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowDemo((v) => !v)}
                    aria-expanded={showDemo}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--login-border)] bg-[var(--login-card)] text-[14px] font-medium text-[var(--login-text)] transition-colors hover:bg-[var(--login-field)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08B8B0]"
                  >
                    {T.login.demoToggle}
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform duration-150 motion-reduce:transition-none",
                        showDemo && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>
                  {showDemo ? (
                    <ul className="mt-3 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-stretch lg:justify-center">
                      {DEMO_ACCOUNTS.map((account) => (
                        <li key={account.username} className="min-w-0 lg:flex-1 lg:basis-[6.5rem]">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => pickDemo(account)}
                            className="flex h-full min-h-16 w-full flex-col items-center justify-center rounded-[10px] border border-[var(--login-border)] bg-[var(--login-card)] px-2 py-2.5 text-center transition-colors hover:border-[#08B8B0]/50 hover:bg-[var(--login-field)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08B8B0] disabled:opacity-50"
                          >
                            <span className="text-[12px] font-semibold leading-5 text-[var(--login-text)]">
                              {ROLE_LABELS[account.role]}
                            </span>
                            <span className="mt-0.5 font-mono text-[10px] text-[var(--login-muted)]" dir="ltr">
                              {busy && activeDemo === account.username ? "…" : account.username}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <p className="mt-6 flex items-center justify-center gap-2 text-center text-[12px] leading-5 text-[var(--login-muted)]">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  {T.login.secure}
                </p>
              </div>
            </div>
          </div>

          <p className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-[11px] leading-5 text-[var(--login-muted)] lg:px-10 lg:pb-5">
            © 2024 {T.login.footerOwner}
            <span className="mx-1.5">|</span>
            {T.login.footerPlatform}
            <span className="mx-1.5">|</span>
            {T.login.versionLabel}
          </p>
        </section>
      </div>
    </main>
  );
}
