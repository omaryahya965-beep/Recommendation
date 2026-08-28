"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { Button, ErrorBanner, Field as FormField, SuccessBanner, TextInput } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { api, errorMessage, loadAuth, saveAuth } from "@/lib/api";
import { ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { Role, User } from "@/lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function displayName(user: User) {
  return user.full_name_ar?.trim() || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim();
  return (
    <div className="flex flex-col gap-1 border-b border-line py-4 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-[12px] font-semibold tracking-wide text-muted">{label}</dt>
      <dd className="text-[14px] font-medium text-ink sm:text-end">{text || T.common.none}</dd>
    </div>
  );
}

function persistUser(user: User) {
  const auth = loadAuth();
  if (auth) saveAuth({ ...auth, user });
}

export function ProfilePage({ role }: { role: Role }) {
  useI18n();
  const queryClient = useQueryClient();
  const cached = loadAuth()?.user ?? null;

  const { data, isError, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/api/auth/me/"),
    initialData: cached ?? undefined,
  });

  useEffect(() => {
    if (!data) return;
    persistUser(data);
  }, [data]);

  const user = data ?? cached;

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const emailMutation = useMutation({
    mutationFn: (email: string) => api<User>("/api/auth/me/", { method: "PATCH", body: { email } }),
    onSuccess: (updated) => {
      persistUser(updated);
      queryClient.setQueryData(["me"], updated);
      setEditingEmail(false);
      setEmailError(null);
      setFormError(null);
      setSuccess(T.profile.emailSaved);
    },
    onError: (err) => {
      setSuccess(null);
      setFormError(errorMessage(err));
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      api("/api/auth/change-password/", {
        method: "POST",
        body: {
          current_password: currentPassword,
          new_password: newPassword,
          new_password_confirm: confirmPassword,
        },
      }),
    onSuccess: () => {
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      setFormError(null);
      setSuccess(T.profile.passwordChanged);
    },
    onError: (err) => {
      setSuccess(null);
      setFormError(errorMessage(err));
    },
  });

  function startEmailEdit() {
    setEmailDraft(user?.email ?? "");
    setEmailError(null);
    setFormError(null);
    setSuccess(null);
    setEditingEmail(true);
  }

  function saveEmail(event: FormEvent) {
    event.preventDefault();
    const next = emailDraft.trim();
    if (next && !EMAIL_PATTERN.test(next)) {
      setEmailError(T.profile.emailInvalid);
      return;
    }
    setEmailError(null);
    emailMutation.mutate(next);
  }

  function savePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(T.profile.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(T.profile.passwordMismatch);
      return;
    }
    setPasswordError(null);
    passwordMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={T.nav.profile} description={T.nav.profileHint} />

      {isError && !user ? <ErrorBanner message={T.common.error} onRetry={() => refetch()} /> : null}
      <ErrorBanner message={formError} />
      <SuccessBanner message={success} />

      {user ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Section
            title={displayName(user)}
            hint={ROLE_LABELS[user.role] || ROLE_LABELS[role]}
            padded
            className="rounded-2xl border border-line bg-surface shadow-sm"
          >
            <div className="flex items-center gap-4 pb-5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-navy font-heading text-[1.25rem] font-bold text-white shadow-sm">
                {displayName(user).slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="font-heading text-[16px] font-bold text-navy">{displayName(user)}</p>
                <p className="mt-0.5 text-[13px] text-ink-soft">{ROLE_LABELS[user.role] || ROLE_LABELS[role]}</p>
              </div>
            </div>
            <dl>
              <ProfileRow label={T.common.fullName} value={displayName(user)} />
              <ProfileRow label={T.common.username} value={user.username} />
              <div className="border-b border-line py-4">
                {editingEmail ? (
                  <form onSubmit={saveEmail} className="space-y-3" noValidate>
                    <FormField label={T.common.email} error={emailError ?? undefined}>
                      <TextInput
                        type="text"
                        inputMode="email"
                        value={emailDraft}
                        onChange={(event) => setEmailDraft(event.target.value)}
                        autoComplete="email"
                        dir="ltr"
                      />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={emailMutation.isPending}>
                        {T.profile.saveEmail}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditingEmail(false);
                          setEmailError(null);
                        }}
                      >
                        {T.common.cancel}
                      </Button>
                    </div>
                  </form>
                ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <dt className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold tracking-wide text-muted">{T.common.email}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-8 px-2 py-1 text-[12px]"
                        aria-label={T.profile.editEmail}
                        onClick={startEmailEdit}
                      >
                        {T.common.edit}
                      </Button>
                    </dt>
                    <dd className="text-[14px] font-medium text-ink sm:text-end">
                      {user.email?.trim() || T.common.none}
                    </dd>
                  </div>
                )}
              </div>
              <ProfileRow label={T.common.role} value={ROLE_LABELS[user.role] || ROLE_LABELS[role]} />
            </dl>

            <div className="mt-5 border-t border-line pt-5">
              {changingPassword ? (
                <form onSubmit={savePassword} className="space-y-4" noValidate>
                  <p className="text-[13px] text-ink-soft">{T.profile.passwordHint}</p>
                  <FormField label={T.profile.currentPassword}>
                    <TextInput
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </FormField>
                  <FormField label={T.profile.newPassword} error={passwordError ?? undefined}>
                    <TextInput
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                    />
                  </FormField>
                  <FormField label={T.profile.confirmPassword}>
                    <TextInput
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                    />
                  </FormField>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={passwordMutation.isPending}>
                      {T.profile.changePassword}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setChangingPassword(false);
                        setPasswordError(null);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      }}
                    >
                      {T.common.cancel}
                    </Button>
                  </div>
                </form>
              ) : (
                <Button type="button" variant="secondary" onClick={() => { setChangingPassword(true); setSuccess(null); setFormError(null); }}>
                  {T.profile.changePassword}
                </Button>
              )}
            </div>
          </Section>

          <Section
            title={T.common.details}
            hint={T.nav.profileHint}
            padded
            className="rounded-2xl border border-line bg-surface shadow-sm"
          >
            <dl>
              <ProfileRow label={T.common.municipality} value={user.municipality_name} />
              {user.role === "department_head" || user.role === "employee" || user.department_name ? (
                <ProfileRow label={T.common.department} value={user.department_name} />
              ) : null}
            </dl>
          </Section>
        </div>
      ) : isLoading ? (
        <p className="text-[14px] text-ink-soft">{T.common.loading}</p>
      ) : null}
    </div>
  );
}
