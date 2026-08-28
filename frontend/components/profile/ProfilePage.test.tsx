import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ROLE_LABELS, T } from "@/lib/i18n";
import type { User } from "@/lib/types";

import { ProfilePage } from "./ProfilePage";

const employee: User = {
  id: 4,
  username: "emp_finance1",
  full_name_ar: "موظف مالية ١",
  email: "emp@example.com",
  role: "employee",
  department: 1,
  department_name: "الدائرة المالية",
  municipality: 1,
  municipality_name: "بلدية البيرة",
};

const auditor: User = {
  id: 1,
  username: "audit1",
  full_name_ar: "وحدة التدقيق الداخلي",
  email: "",
  role: "audit",
  department: null,
  municipality: 1,
  municipality_name: "بلدية البيرة",
};

const authState = vi.hoisted(() => ({
  user: {
    id: 4,
    username: "emp_finance1",
    full_name_ar: "موظف مالية ١",
    email: "emp@example.com",
    role: "employee" as const,
    department: 1,
    department_name: "الدائرة المالية",
    municipality: 1,
    municipality_name: "بلدية البيرة",
  } as User,
}));

vi.mock("@/lib/api", () => ({
  api: vi.fn(async (path: string, options?: { method?: string; body?: unknown }) => {
    if (options?.method === "PATCH") {
      const email = (options.body as { email?: string }).email ?? "";
      authState.user = { ...authState.user, email };
      return authState.user;
    }
    if (path.includes("change-password")) return undefined;
    return authState.user;
  }),
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : "error"),
  loadAuth: () => ({ access: "a", refresh: "r", user: authState.user }),
  saveAuth: vi.fn(),
}));

function renderProfile(role: User["role"]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfilePage role={role} />
    </QueryClientProvider>
  );
}

describe("ProfilePage", () => {
  it("shows name, role, department, municipality, and email for an employee", () => {
    authState.user = { ...employee };
    renderProfile("employee");
    expect(screen.getAllByText(employee.full_name_ar).length).toBeGreaterThan(0);
    expect(screen.getByText(employee.username)).toBeInTheDocument();
    expect(screen.getByText(employee.email!)).toBeInTheDocument();
    expect(screen.getAllByText(ROLE_LABELS.employee).length).toBeGreaterThan(0);
    expect(screen.getByText(employee.department_name!)).toBeInTheDocument();
    expect(screen.getByText(employee.municipality_name!)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T.profile.editEmail })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T.profile.changePassword })).toBeInTheDocument();
  });

  it("omits the department row for audit when no department is set", () => {
    authState.user = { ...auditor };
    renderProfile("audit");
    expect(screen.getAllByText(auditor.full_name_ar).length).toBeGreaterThan(0);
    expect(screen.queryByText(T.common.department)).not.toBeInTheDocument();
    expect(screen.getByText(auditor.municipality_name!)).toBeInTheDocument();
  });

  it("rejects an invalid email before saving", async () => {
    const user = userEvent.setup();
    authState.user = { ...employee };
    renderProfile("employee");
    await user.click(screen.getByRole("button", { name: T.profile.editEmail }));
    await user.clear(screen.getByLabelText(T.common.email));
    await user.type(screen.getByLabelText(T.common.email), "not-an-email");
    await user.click(screen.getByRole("button", { name: T.profile.saveEmail }));
    expect(screen.getByText(T.profile.emailInvalid)).toBeInTheDocument();
  });

  it("rejects a password confirmation mismatch", async () => {
    const user = userEvent.setup();
    authState.user = { ...employee };
    renderProfile("employee");
    await user.click(screen.getByRole("button", { name: T.profile.changePassword }));
    await user.type(screen.getByLabelText(T.profile.currentPassword), "Demo@12345");
    await user.type(screen.getByLabelText(T.profile.newPassword), "NewPass@456");
    await user.type(screen.getByLabelText(T.profile.confirmPassword), "OtherPass@456");
    await user.click(screen.getByRole("button", { name: T.profile.changePassword }));
    expect(screen.getByText(T.profile.passwordMismatch)).toBeInTheDocument();
  });
});
