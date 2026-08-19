import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const root = path.resolve(__dirname, "..");
let count = 0;
for (const file of walk(root)) {
  const before = fs.readFileSync(file, "utf8");
  const after = before
    .replaceAll('from "@/lib/i18n/ar"', 'from "@/lib/i18n"')
    .replaceAll("from '@/lib/i18n/ar'", "from '@/lib/i18n'")
    .replaceAll('from "./i18n/ar"', 'from "./i18n"')
    .replaceAll("from './i18n/ar'", "from './i18n'");
  if (after !== before) {
    fs.writeFileSync(file, after);
    count += 1;
  }
}
console.log(`updated ${count} files`);
