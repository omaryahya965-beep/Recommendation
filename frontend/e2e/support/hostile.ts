/**
 * Rows with hostile text (a 255/300-character unbroken title, a 100,000-character
 * finding, long Arabic, mixed Arabic/Latin) inserted into the E2E database by the
 * guarded `e2e_hostile_rows` command. The API refuses such text now; production
 * already holds rows like these from before the limits.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

export interface HostileRows {
  report: number;
  recommendations: Record<"unbroken" | "huge" | "arabic" | "mixed" | "closed", number>;
}

let cached: HostileRows | null = null;

/** Run a management command against the E2E database (E2E settings only). */
export function manage(...args: string[]): string {
  const backend = path.resolve(__dirname, "../../../backend");
  const python =
    process.env.E2E_PYTHON ??
    (process.platform === "win32" ? path.join(backend, "venv", "Scripts", "python.exe") : "python");
  return execFileSync(python, ["manage.py", ...args], {
    cwd: backend,
    env: { ...process.env, DJANGO_SETTINGS_MODULE: "config.settings.e2e", PYTHONIOENCODING: "utf-8" },
    encoding: "utf-8",
  });
}

export function hostileRows(): HostileRows {
  if (cached) return cached;
  cached = JSON.parse(manage("e2e_hostile_rows").trim().split("\n").pop()!) as HostileRows;
  return cached;
}
