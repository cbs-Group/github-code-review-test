# Copilot Code Review Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo repository with a small TypeScript library, one-click demo branches containing planted issues for Copilot code review, custom review instructions, CI, and a GitHub Pages site that documents the process.

**Architecture:** A dependency-free TypeScript library in `src/` is the review target. Scenario overlays in `demo/scenarios/<name>/files` are copied over the repo by `scripts/create-demo-branch.mjs`, which a `workflow_dispatch` workflow uses to push a `demo/*` branch and render a prefilled "open PR" link. A static site in `site/` is deployed by an Actions-based Pages workflow.

**Tech Stack:** Node.js 24, TypeScript 7.0.2, Vitest 5.1.0, GitHub Actions (checkout@v7, setup-node@v7, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5), plain HTML/CSS.

Spec: `docs/superpowers/specs/2026-11-12-copilot-code-review-demo-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | toolchain |
| `src/pricing.ts` (+ test) | cart subtotal, discount, tax, total in integer cents |
| `src/users.ts` (+ test) | email validation, in-memory user store, public projection |
| `src/config.ts` (+ test) | env config loading, fail fast |
| `scripts/create-demo-branch.mjs` (+ test) | list/load/apply scenarios, compare URL, job summary, CLI |
| `scripts/check-scenarios.mjs` | validate every scenario in a temp copy (metadata, tsc, vitest) |
| `demo/scenarios/{logic-bug,security,conventions,clean}/` | scenario metadata + overlay files |
| `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` | custom review instructions |
| `.github/workflows/{ci,create-demo-branch,pages}.yml` | CI, demo branch creation, Pages deploy |
| `site/*.html`, `site/style.css` | documentation site |
| `README.md` | entry point |

---

### Task 1: Toolchain scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "copilot-code-review-demo",
  "version": "1.0.0",
  "private": true,
  "description": "Demo project for GitHub Copilot code review",
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check:scenarios": "node scripts/check-scenarios.mjs",
    "demo": "node scripts/create-demo-branch.mjs"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "7.0.2",
    "vitest": "5.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`** (overlay files under `demo/` must never be collected as tests)

```ts
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "demo/**"],
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
coverage/
.DS_Store
```

- [ ] **Step 5: Install and verify toolchain**

Run: `npm install && npx tsc --version && npx vitest --version`
Expected: `Version 7.0.2` and `vitest/5.1.0 ...`; `package-lock.json` created.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold TypeScript + Vitest toolchain"
```

---

### Task 2: Pricing module

Tests intentionally cover `calculateTotal` only without discount and `calculateTax` only on values that are exact in floating point. The `logic-bug` scenario relies on these gaps so that only the review catches the planted bugs.

**Files:**
- Create: `src/pricing.test.ts`, `src/pricing.ts`

- [ ] **Step 1: Write the failing test `src/pricing.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { applyDiscount, calculateSubtotal, calculateTax, calculateTotal, type LineItem } from "./pricing";

const cart: LineItem[] = [
  { sku: "BOOK", unitPriceCents: 250, quantity: 2 },
  { sku: "MUG", unitPriceCents: 1_000, quantity: 1 },
];

describe("calculateSubtotal", () => {
  it("sums unit price times quantity", () => {
    expect(calculateSubtotal(cart)).toBe(1_500);
  });

  it("returns 0 for an empty cart", () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it.each([
    { sku: "FRACTION", unitPriceCents: 1.5, quantity: 1 },
    { sku: "NEGATIVE", unitPriceCents: -100, quantity: 1 },
    { sku: "ZERO_QTY", unitPriceCents: 100, quantity: 0 },
  ])("rejects invalid line item $sku", (item) => {
    expect(() => calculateSubtotal([item])).toThrow(RangeError);
  });
});

describe("applyDiscount", () => {
  it.each([
    [10_000, 0, 10_000],
    [10_000, 25, 7_500],
    [999, 10, 899],
    [10_000, 100, 0],
  ])("applyDiscount(%i, %i) returns %i", (amount, percent, expected) => {
    expect(applyDiscount(amount, percent)).toBe(expected);
  });

  it.each([-1, 101, Number.NaN])("rejects percent %d", (percent) => {
    expect(() => applyDiscount(10_000, percent)).toThrow(RangeError);
  });
});

describe("calculateTax", () => {
  it.each([
    [10_000, 1_900, 1_900],
    [2_000, 1_900, 380],
    [0, 1_900, 0],
  ])("calculateTax(%i, %i) returns %i", (amount, rate, expected) => {
    expect(calculateTax(amount, rate)).toBe(expected);
  });

  it("rejects a negative rate", () => {
    expect(() => calculateTax(1_000, -1)).toThrow(RangeError);
  });
});

describe("calculateTotal", () => {
  it("adds tax to the subtotal when there is no discount", () => {
    expect(calculateTotal(cart, { taxRateBasisPoints: 1_900 })).toEqual({
      subtotalCents: 1_500,
      discountCents: 0,
      taxCents: 285,
      totalCents: 1_785,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pricing.test.ts`
Expected: FAIL – `Failed to resolve import "./pricing"`.

- [ ] **Step 3: Implement `src/pricing.ts`**

```ts
export interface LineItem {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export interface TotalOptions {
  discountPercent?: number;
  taxRateBasisPoints: number;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer amount of cents`);
  }
}

export function calculateSubtotal(items: readonly LineItem[]): number {
  return items.reduce((sum, item) => {
    assertCents(item.unitPriceCents, `unitPriceCents of ${item.sku}`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new RangeError(`quantity of ${item.sku} must be a positive integer`);
    }
    return sum + item.unitPriceCents * item.quantity;
  }, 0);
}

export function applyDiscount(amountCents: number, percent: number): number {
  assertCents(amountCents, "amountCents");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("percent must be between 0 and 100");
  }
  return amountCents - Math.round((amountCents * percent) / 100);
}

export function calculateTax(amountCents: number, rateBasisPoints: number): number {
  assertCents(amountCents, "amountCents");
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new RangeError("rateBasisPoints must be a non-negative integer");
  }
  return Math.round((amountCents * rateBasisPoints) / 10_000);
}

export function calculateTotal(items: readonly LineItem[], options: TotalOptions): Totals {
  const subtotalCents = calculateSubtotal(items);
  const discountedCents = applyDiscount(subtotalCents, options.discountPercent ?? 0);
  const taxCents = calculateTax(discountedCents, options.taxRateBasisPoints);
  return {
    subtotalCents,
    discountCents: subtotalCents - discountedCents,
    taxCents,
    totalCents: discountedCents + taxCents,
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/pricing.test.ts && npm run typecheck`
Expected: all pricing tests PASS, `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/pricing.ts src/pricing.test.ts
git commit -m "feat: add pricing module"
```

---

### Task 3: Users module

Tests intentionally do not cover `findByEmail` with an invalid email; the `security` scenario removes that validation.

**Files:**
- Create: `src/users.test.ts`, `src/users.ts`

- [ ] **Step 1: Write the failing test `src/users.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { UserStore, isValidEmail, toPublicUser, type User } from "./users";

const ada: User = { id: "u1", email: "Ada@Example.com", name: "Ada", passwordHash: "hash-ada" };

describe("isValidEmail", () => {
  it.each([
    ["ada@example.com", true],
    ["first.last@sub.example.org", true],
    ["no-at-sign.example.com", false],
    ["ada@localhost", false],
    ["ada @example.com", false],
    [`${"a".repeat(250)}@example.com`, false],
  ])("isValidEmail(%j) returns %s", (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe("UserStore", () => {
  it("finds users by email case-insensitively", () => {
    const store = new UserStore();
    store.add(ada);
    expect(store.findByEmail("ada@example.com")).toBe(ada);
  });

  it("returns undefined for an unknown email", () => {
    expect(new UserStore().findByEmail("nobody@example.com")).toBeUndefined();
  });

  it("rejects users with an invalid email", () => {
    expect(() => new UserStore().add({ ...ada, email: "invalid" })).toThrow(TypeError);
  });
});

describe("toPublicUser", () => {
  it("removes the password hash", () => {
    expect(toPublicUser(ada)).toEqual({ id: "u1", email: "Ada@Example.com", name: "Ada" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/users.test.ts`
Expected: FAIL – `Failed to resolve import "./users"`.

- [ ] **Step 3: Implement `src/users.ts`**

```ts
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

export type PublicUser = Omit<User, "passwordHash">;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export class UserStore {
  readonly #users = new Map<string, User>();

  add(user: User): void {
    if (!isValidEmail(user.email)) {
      throw new TypeError("user.email is not a valid email address");
    }
    this.#users.set(user.email.toLowerCase(), user);
  }

  findByEmail(email: string): User | undefined {
    if (!isValidEmail(email)) {
      throw new TypeError("email is not a valid email address");
    }
    return this.#users.get(email.toLowerCase());
  }
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _omitted, ...publicFields } = user;
  return publicFields;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/users.test.ts && npm run typecheck`
Expected: PASS, `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/users.ts src/users.test.ts
git commit -m "feat: add users module"
```

---

### Task 4: Config module

Tests intentionally do not cover a missing `API_KEY`; the `security` scenario adds a hardcoded fallback.

**Files:**
- Create: `src/config.test.ts`, `src/config.ts`

- [ ] **Step 1: Write the failing test `src/config.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

const validEnv = {
  API_BASE_URL: "https://api.example.com",
  API_KEY: "test-key",
  REQUEST_TIMEOUT_MS: "2500",
};

describe("loadConfig", () => {
  it("reads all values from the environment", () => {
    expect(loadConfig(validEnv)).toEqual({
      apiBaseUrl: "https://api.example.com/",
      apiKey: "test-key",
      requestTimeoutMs: 2_500,
    });
  });

  it("defaults the request timeout to 5000 ms", () => {
    expect(loadConfig({ ...validEnv, REQUEST_TIMEOUT_MS: undefined }).requestTimeoutMs).toBe(5_000);
  });

  it("fails when API_BASE_URL is missing", () => {
    expect(() => loadConfig({ ...validEnv, API_BASE_URL: undefined })).toThrow(ConfigError);
  });

  it.each(["0", "-1", "abc", "1.5"])("rejects REQUEST_TIMEOUT_MS=%j", (value) => {
    expect(() => loadConfig({ ...validEnv, REQUEST_TIMEOUT_MS: value })).toThrow(ConfigError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL – `Failed to resolve import "./config"`.

- [ ] **Step 3: Implement `src/config.ts`**

```ts
export interface AppConfig {
  apiBaseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export type Env = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const requestTimeoutMs = Number(env.REQUEST_TIMEOUT_MS ?? "5000");
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new ConfigError("REQUEST_TIMEOUT_MS must be a positive integer");
  }
  return {
    apiBaseUrl: new URL(required(env, "API_BASE_URL")).href,
    apiKey: required(env, "API_KEY"),
    requestTimeoutMs,
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add config module"
```

---

### Task 5: Scenario script (`create-demo-branch.mjs`)

**Files:**
- Create: `scripts/create-demo-branch.test.mjs`, `scripts/create-demo-branch.mjs`

- [ ] **Step 1: Write the failing test `scripts/create-demo-branch.test.mjs`**

```js
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyScenario, buildCompareUrl, formatSummary, listScenarios, loadScenario } from "./create-demo-branch.mjs";

let tmp;
let scenariosDir;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "demo-test-"));
  scenariosDir = path.join(tmp, "scenarios");
  const overlay = path.join(scenariosDir, "sample", "files", "src");
  await mkdir(overlay, { recursive: true });
  await writeFile(
    path.join(scenariosDir, "sample", "scenario.json"),
    JSON.stringify({ title: "Sample change", body: "Body text", expected: ["finding A"] }),
  );
  await writeFile(path.join(overlay, "new.ts"), "export const x = 1;\n");
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("scenarios", () => {
  it("lists scenario directories", async () => {
    expect(await listScenarios(scenariosDir)).toEqual(["sample"]);
  });

  it.each(["missing", "../sample", ""])("rejects unknown scenario %j", async (name) => {
    await expect(loadScenario(name, scenariosDir)).rejects.toThrow(/Unknown scenario/);
  });

  it("copies overlay files into the target directory", async () => {
    const target = path.join(tmp, "repo");
    const scenario = await applyScenario("sample", target, scenariosDir);
    expect(scenario.title).toBe("Sample change");
    expect(await readFile(path.join(target, "src", "new.ts"), "utf8")).toBe("export const x = 1;\n");
  });
});

describe("buildCompareUrl", () => {
  it("builds a quick-pull compare URL with encoded title and body", () => {
    const url = new URL(
      buildCompareUrl({
        serverUrl: "https://github.com",
        repository: "octo/demo",
        base: "main",
        branch: "demo/sample-1",
        title: "Fix & test",
        body: "Line 1\nLine 2",
      }),
    );
    expect(url.pathname).toBe("/octo/demo/compare/main...demo/sample-1");
    expect(url.searchParams.get("quick_pull")).toBe("1");
    expect(url.searchParams.get("title")).toBe("Fix & test");
    expect(url.searchParams.get("body")).toBe("Line 1\nLine 2");
  });
});

describe("formatSummary", () => {
  it("contains the branch, the PR link and the expected findings", () => {
    const summary = formatSummary({
      scenario: { name: "sample", title: "Sample change", body: "", expected: ["finding A"] },
      branch: "demo/sample-1",
      compareUrl: "https://github.com/octo/demo/compare/main...demo/sample-1",
    });
    expect(summary).toContain("`demo/sample-1`");
    expect(summary).toContain("(https://github.com/octo/demo/compare/main...demo/sample-1)");
    expect(summary).toContain("- finding A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/create-demo-branch.test.mjs`
Expected: FAIL – cannot resolve `./create-demo-branch.mjs`.

- [ ] **Step 3: Implement `scripts/create-demo-branch.mjs`**

```js
#!/usr/bin/env node
// Applies a demo scenario overlay and renders the GitHub job summary.
// Usage:
//   node scripts/create-demo-branch.mjs list
//   node scripts/create-demo-branch.mjs apply <scenario> [targetDir]
//   node scripts/create-demo-branch.mjs summary <scenario> <branch>
import { cp, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCENARIOS_DIR = fileURLToPath(new URL("../demo/scenarios/", import.meta.url));

export async function listScenarios(scenariosDir = SCENARIOS_DIR) {
  const entries = await readdir(scenariosDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function loadScenario(name, scenariosDir = SCENARIOS_DIR) {
  const available = await listScenarios(scenariosDir);
  if (!available.includes(name)) {
    throw new Error(`Unknown scenario "${name}". Available: ${available.join(", ")}`);
  }
  const meta = JSON.parse(await readFile(path.join(scenariosDir, name, "scenario.json"), "utf8"));
  return { name, ...meta };
}

export async function applyScenario(name, targetDir, scenariosDir = SCENARIOS_DIR) {
  const scenario = await loadScenario(name, scenariosDir);
  await cp(path.join(scenariosDir, name, "files"), targetDir, { recursive: true });
  return scenario;
}

export function buildCompareUrl({ serverUrl, repository, base, branch, title, body }) {
  const query = new URLSearchParams({ quick_pull: "1", title, body });
  return `${serverUrl}/${repository}/compare/${base}...${branch}?${query}`;
}

export function formatSummary({ scenario, branch, compareUrl }) {
  return [
    `## Demo branch \`${branch}\` created`,
    "",
    `**Scenario:** \`${scenario.name}\` – ${scenario.title}`,
    "",
    "### Next step",
    "",
    `👉 [**Open the pull request**](${compareUrl})`,
    "",
    "If the repository ruleset is active, Copilot is requested as a reviewer automatically.",
    "Otherwise open **Reviewers** on the pull request and select **Copilot**.",
    "",
    "### What Copilot should find",
    "",
    ...scenario.expected.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

async function main([command, ...args]) {
  switch (command) {
    case "list":
      console.log((await listScenarios()).join("\n"));
      return;
    case "apply": {
      const [name, targetDir = process.cwd()] = args;
      const scenario = await applyScenario(name, targetDir);
      console.log(`Applied scenario "${scenario.name}" to ${targetDir}`);
      return;
    }
    case "summary": {
      const [name, branch] = args;
      const repository = process.env.GITHUB_REPOSITORY;
      if (!branch || !repository) {
        throw new Error("summary needs <scenario> <branch> and GITHUB_REPOSITORY");
      }
      const scenario = await loadScenario(name);
      const compareUrl = buildCompareUrl({
        serverUrl: process.env.GITHUB_SERVER_URL ?? "https://github.com",
        repository,
        base: process.env.BASE_BRANCH ?? "main",
        branch,
        title: scenario.title,
        body: scenario.body,
      });
      console.log(formatSummary({ scenario, branch, compareUrl }));
      return;
    }
    default:
      throw new Error("Usage: create-demo-branch.mjs list | apply <scenario> [targetDir] | summary <scenario> <branch>");
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all tests PASS (pricing, users, config, create-demo-branch).

- [ ] **Step 5: Commit**

```bash
git add scripts/create-demo-branch.mjs scripts/create-demo-branch.test.mjs
git commit -m "feat: add demo scenario script"
```

---

### Task 6: Demo scenarios

**Files:**
- Create: `demo/scenarios/logic-bug/scenario.json`, `demo/scenarios/logic-bug/files/src/pricing.ts`
- Create: `demo/scenarios/security/scenario.json`, `demo/scenarios/security/files/src/config.ts`, `demo/scenarios/security/files/src/users.ts`
- Create: `demo/scenarios/conventions/scenario.json`, `demo/scenarios/conventions/files/src/format.ts`
- Create: `demo/scenarios/clean/scenario.json`, `demo/scenarios/clean/files/src/format.ts`, `demo/scenarios/clean/files/src/format.test.ts`

PR bodies read like real PRs and do not reveal the planted issues; `expected` is only shown in the job summary.

- [ ] **Step 1: `demo/scenarios/logic-bug/scenario.json`**

```json
{
  "title": "Simplify tax calculation and apply loyalty discount to the final total",
  "body": "## Summary\n\n- Simplifies `calculateTax` by working with a decimal rate.\n- Applies the loyalty discount to the final total as requested by the shop team.\n\nAll existing tests pass.\n\n_Generated by the **Create demo branch** workflow (scenario: `logic-bug`)._",
  "expected": [
    "The discount is applied twice: once to the subtotal and again to the final total.",
    "calculateTax now returns fractional cents (floating-point money math, no rounding).",
    "Missing tests for calculateTotal with a discount and for non-round tax amounts."
  ]
}
```

- [ ] **Step 2: `demo/scenarios/logic-bug/files/src/pricing.ts`** (full file; differs from `main` in `calculateTax` and `calculateTotal`)

```ts
export interface LineItem {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export interface TotalOptions {
  discountPercent?: number;
  taxRateBasisPoints: number;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer amount of cents`);
  }
}

export function calculateSubtotal(items: readonly LineItem[]): number {
  return items.reduce((sum, item) => {
    assertCents(item.unitPriceCents, `unitPriceCents of ${item.sku}`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new RangeError(`quantity of ${item.sku} must be a positive integer`);
    }
    return sum + item.unitPriceCents * item.quantity;
  }, 0);
}

export function applyDiscount(amountCents: number, percent: number): number {
  assertCents(amountCents, "amountCents");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("percent must be between 0 and 100");
  }
  return amountCents - Math.round((amountCents * percent) / 100);
}

export function calculateTax(amountCents: number, rateBasisPoints: number): number {
  assertCents(amountCents, "amountCents");
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new RangeError("rateBasisPoints must be a non-negative integer");
  }
  const rate = rateBasisPoints / 10_000;
  return amountCents * rate;
}

export function calculateTotal(items: readonly LineItem[], options: TotalOptions): Totals {
  const discountPercent = options.discountPercent ?? 0;
  const subtotalCents = calculateSubtotal(items);
  const discountedCents = applyDiscount(subtotalCents, discountPercent);
  const taxCents = calculateTax(discountedCents, options.taxRateBasisPoints);
  return {
    subtotalCents,
    discountCents: subtotalCents - discountedCents,
    taxCents,
    totalCents: applyDiscount(discountedCents, discountPercent) + taxCents,
  };
}
```

- [ ] **Step 3: `demo/scenarios/security/scenario.json`**

```json
{
  "title": "Make local setup easier and add lookup logging",
  "body": "## Summary\n\n- `loadConfig` no longer fails when `API_KEY` is missing, so the app starts locally without extra setup.\n- `UserStore.findByEmail` logs lookups to help debug support tickets and skips the extra validation step.\n\nAll existing tests pass.\n\n_Generated by the **Create demo branch** workflow (scenario: `security`)._",
  "expected": [
    "Hardcoded fallback API key in src/config.ts (secret in source code; config no longer fails fast).",
    "findByEmail no longer validates its input.",
    "findByEmail logs the full user object including passwordHash (sensitive data in logs) and uses console in src/."
  ]
}
```

- [ ] **Step 4: `demo/scenarios/security/files/src/config.ts`** (full file)

```ts
export interface AppConfig {
  apiBaseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export type Env = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const requestTimeoutMs = Number(env.REQUEST_TIMEOUT_MS ?? "5000");
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new ConfigError("REQUEST_TIMEOUT_MS must be a positive integer");
  }
  return {
    apiBaseUrl: new URL(required(env, "API_BASE_URL")).href,
    apiKey: env.API_KEY ?? "demo-hardcoded-api-key-123456",
    requestTimeoutMs,
  };
}
```

- [ ] **Step 5: `demo/scenarios/security/files/src/users.ts`** (full file)

```ts
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

export type PublicUser = Omit<User, "passwordHash">;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export class UserStore {
  readonly #users = new Map<string, User>();

  add(user: User): void {
    if (!isValidEmail(user.email)) {
      throw new TypeError("user.email is not a valid email address");
    }
    this.#users.set(user.email.toLowerCase(), user);
  }

  findByEmail(email: string): User | undefined {
    const user = this.#users.get(email.toLowerCase());
    console.info(`user lookup for ${email}`, user);
    return user;
  }
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _omitted, ...publicFields } = user;
  return publicFields;
}
```

- [ ] **Step 6: `demo/scenarios/conventions/scenario.json`**

```json
{
  "title": "Add price formatting helper",
  "body": "## Summary\n\nAdds `formatPrice` so the shop UI can show prices consistently.\n\n_Generated by the **Create demo branch** workflow (scenario: `conventions`)._",
  "expected": [
    "Uses `any` for parameters (violates .github/copilot-instructions.md).",
    "console.log in src/ (violates the no-console convention).",
    "New exported function without a unit test.",
    "Formats with string concatenation instead of Intl.NumberFormat; no cents validation."
  ]
}
```

- [ ] **Step 7: `demo/scenarios/conventions/files/src/format.ts`**

```ts
export function formatPrice(cents: any, currency: any = "EUR") {
  console.log("formatting price", cents);
  return (cents / 100).toFixed(2) + " " + currency;
}
```

- [ ] **Step 8: `demo/scenarios/clean/scenario.json`**

```json
{
  "title": "Add locale-aware currency formatting",
  "body": "## Summary\n\nAdds `formatCents`, which formats integer cents with `Intl.NumberFormat` and validates the amount. Includes table-driven tests.\n\n_Generated by the **Create demo branch** workflow (scenario: `clean`)._",
  "expected": [
    "Few or no comments: the change follows all project conventions and is tested.",
    "Copilot may still suggest optional improvements; judge whether they add value."
  ]
}
```

- [ ] **Step 9: `demo/scenarios/clean/files/src/format.ts`**

```ts
import { assertCents } from "./pricing";

export function formatCents(amountCents: number, currency = "EUR", locale = "en-US"): string {
  assertCents(amountCents, "amountCents");
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountCents / 100);
}
```

- [ ] **Step 10: `demo/scenarios/clean/files/src/format.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { formatCents } from "./format";

describe("formatCents", () => {
  it.each([
    [123_456, "USD", "$1,234.56"],
    [50, "EUR", "€0.50"],
    [0, "USD", "$0.00"],
  ])("formatCents(%i, %s) returns %s", (amount, currency, expected) => {
    expect(formatCents(amount, currency)).toBe(expected);
  });

  it.each([-1, 1.5])("rejects invalid amount %d", (amount) => {
    expect(() => formatCents(amount)).toThrow(RangeError);
  });
});
```

- [ ] **Step 11: Verify the CLI lists scenarios and main tests are unaffected**

Run: `node scripts/create-demo-branch.mjs list && npm test`
Expected: prints `clean`, `conventions`, `logic-bug`, `security`; tests PASS (no test files collected from `demo/`).

- [ ] **Step 12: Commit**

```bash
git add demo
git commit -m "feat: add demo review scenarios"
```

---

### Task 7: Scenario checker

**Files:**
- Create: `scripts/check-scenarios.mjs`

- [ ] **Step 1: Implement `scripts/check-scenarios.mjs`**

```js
#!/usr/bin/env node
// Applies every scenario to a temporary copy of the repository and verifies
// that it has valid metadata, typechecks, and keeps the existing tests green.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyScenario, listScenarios, loadScenario } from "./create-demo-branch.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const COPY_EXCLUDES = new Set([".git", "node_modules", "site", "docs"]);

function assertMetadata(scenario) {
  for (const key of ["title", "body"]) {
    if (typeof scenario[key] !== "string" || scenario[key].trim() === "") {
      throw new Error(`${scenario.name}: scenario.json needs a non-empty "${key}"`);
    }
  }
  if (!Array.isArray(scenario.expected) || scenario.expected.length === 0) {
    throw new Error(`${scenario.name}: scenario.json needs a non-empty "expected" array`);
  }
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, stdio: "inherit" }).status === 0;
}

async function checkScenario(name) {
  assertMetadata(await loadScenario(name));
  const workDir = await mkdtemp(path.join(os.tmpdir(), `scenario-${name}-`));
  try {
    await cp(repoRoot, workDir, {
      recursive: true,
      filter: (source) => !COPY_EXCLUDES.has(path.relative(repoRoot, source).split(path.sep)[0]),
    });
    await symlink(path.join(repoRoot, "node_modules"), path.join(workDir, "node_modules"), "dir");
    await applyScenario(name, workDir);
    const bin = path.join(workDir, "node_modules", ".bin");
    return run(path.join(bin, "tsc"), ["--noEmit"], workDir) && run(path.join(bin, "vitest"), ["run"], workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const names = await listScenarios();
const failed = [];
for (const name of names) {
  console.log(`\n▶ Checking scenario "${name}"`);
  if (!(await checkScenario(name))) failed.push(name);
}

if (failed.length > 0) {
  console.error(`\n✖ Scenario check failed: ${failed.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`\n✔ All ${names.length} scenarios typecheck and keep the tests green`);
}
```

- [ ] **Step 2: Run it**

Run: `npm run check:scenarios`
Expected: last line `✔ All 4 scenarios typecheck and keep the tests green`, exit 0. The `clean` run shows the extra `format.test.ts` passing.

- [ ] **Step 3: Prove it catches drift**

Run: `printf 'export const broken: number = "x";\n' > demo/scenarios/clean/files/src/broken.ts && npm run check:scenarios; echo "exit=$?"; rm demo/scenarios/clean/files/src/broken.ts`
Expected: tsc error for `broken.ts` in `clean`, `✖ Scenario check failed: clean`, `exit=1`.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-scenarios.mjs
git commit -m "feat: add scenario checker"
```

---

### Task 8: Custom review instructions

**Files:**
- Create: `.github/copilot-instructions.md`, `.github/instructions/tests.instructions.md`, `.github/instructions/workflows.instructions.md`

- [ ] **Step 1: `.github/copilot-instructions.md`**

```markdown
# Copilot instructions

This repository demonstrates GitHub Copilot code review. `src/` contains a small TypeScript "order pricing" library.

## Review priorities

1. Correctness bugs, especially in money calculations.
2. Security: hardcoded secrets, missing input validation, sensitive data in logs or return values.
3. The project conventions below.

Skip purely stylistic remarks that a formatter would fix.

## Project conventions

- Money is always an integer number of cents. Flag floating-point money math and any result that can contain fractional cents.
- Never use `any`. Use precise types, or `unknown` with narrowing.
- No `console.*` calls in `src/`. Library code returns values or throws errors.
- Every new exported function needs a unit test in a sibling `*.test.ts` file.
- Never hardcode secrets, API keys or fallback credentials. Required configuration must fail fast when missing.
- Never log or return `passwordHash`; use `toPublicUser` for user data that leaves the module.
- Validate external input (emails, environment variables) at the module boundary.

## Comment format

- Write review comments in English.
- Start each comment with a severity tag: `[blocker]`, `[major]`, `[minor]` or `[nit]`.
- State the impact in one sentence and propose a concrete fix, preferably as a suggestion block.
```

- [ ] **Step 2: `.github/instructions/tests.instructions.md`**

```markdown
---
applyTo: "**/*.test.ts"
---

# Test review rules

- Tests must be deterministic: no real network, no real clock, no unseeded randomness.
- Prefer table-driven cases with `it.each` for input/output checks.
- Each test checks one behavior, and its name states the expected behavior.
- Flag tests that only restate the implementation or assert on constants.
```

- [ ] **Step 3: `.github/instructions/workflows.instructions.md`**

```markdown
---
applyTo: ".github/workflows/**"
---

# GitHub Actions review rules

- Pin every action to a release tag (for example `@v5`) or a full commit SHA, never to a branch such as `@main`.
- Declare least-privilege `permissions:` at workflow or job level; flag `write-all` or a missing `permissions:` block.
- Never interpolate `${{ github.event.* }}` or `${{ inputs.* }}` directly into `run:` scripts; pass values through `env:`.
- Never print secrets or write them to the job summary.
```

- [ ] **Step 4: Commit**

```bash
git add .github/copilot-instructions.md .github/instructions
git commit -m "docs: add Copilot code review custom instructions"
```

---

### Task 9: Workflows

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/create-demo-branch.yml`, `.github/workflows/pages.yml`

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run check:scenarios
```

- [ ] **Step 2: `.github/workflows/create-demo-branch.yml`**

```yaml
name: Create demo branch

on:
  workflow_dispatch:
    inputs:
      scenario:
        description: Demo scenario with planted issues for Copilot code review
        type: choice
        required: true
        default: logic-bug
        options:
          - logic-bug
          - security
          - conventions
          - clean

permissions:
  contents: write

jobs:
  create:
    runs-on: ubuntu-latest
    env:
      SCENARIO: ${{ inputs.scenario }}
      BASE_BRANCH: ${{ github.event.repository.default_branch }}
      BRANCH: demo/${{ inputs.scenario }}-${{ github.run_number }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.repository.default_branch }}
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: Apply scenario
        run: node scripts/create-demo-branch.mjs apply "$SCENARIO"
      - name: Commit and push demo branch
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git switch -c "$BRANCH"
          git add -A
          git commit -m "demo: apply $SCENARIO scenario"
          git push origin "$BRANCH"
      - name: Write job summary
        run: node scripts/create-demo-branch.mjs summary "$SCENARIO" "$BRANCH" >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 3: `.github/workflows/pages.yml`**

```yaml
name: Deploy site

on:
  push:
    branches: [main]
    paths:
      - "site/**"
      - ".github/workflows/pages.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 4: Lint workflows**

Run: `go run github.com/rhysd/actionlint/cmd/actionlint@latest`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows
git commit -m "ci: add CI, demo branch and Pages workflows"
```

---

### Task 10: GitHub Pages site

**Files:**
- Create: `site/style.css`, `site/index.html`, `site/setup.html`, `site/try-it.html`, `site/customize.html`, `site/.nojekyll`

All pages share the same `<header>` and `<footer>`; only `aria-current="page"` moves. Links are relative so the site works under `/<repo>/`.

- [ ] **Step 1: `site/style.css`** – light/dark stylesheet for layout, tables, callouts and the flow diagram:

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #59636e;
  --border: #d1d9e0;
  --accent: #0969da;
  --code-bg: #f6f8fa;
  --note-bg: #ddf4ff;
  --warn-bg: #fff8c5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #9198a1;
    --border: #3d444d;
    --accent: #4493f8;
    --code-bg: #151b23;
    --note-bg: #0c2d6b;
    --warn-bg: #3b2e00;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
}

.wrap { max-width: 54rem; margin: 0 auto; padding: 0 1.25rem; }

header { border-bottom: 1px solid var(--border); }
header .wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1.5rem;
  padding-block: 0.75rem;
}
.brand { font-weight: 600; color: var(--fg); text-decoration: none; }
nav ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin: 0; padding: 0; }
nav a { color: var(--muted); text-decoration: none; }
nav a:hover, nav a[aria-current="page"] { color: var(--accent); }

main { padding-block: 2rem 3rem; }
h1 { font-size: 2rem; line-height: 1.25; margin-top: 0; }
h2 { margin-top: 2.5rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--border); }
h3 { margin-top: 1.75rem; }
a { color: var(--accent); }
.lead { font-size: 1.15rem; color: var(--muted); }

code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.875em; background: var(--code-bg); border-radius: 6px; }
code { padding: 0.1em 0.35em; }
pre { padding: 1rem; overflow-x: auto; }
pre code { padding: 0; background: none; }

table { border-collapse: collapse; width: 100%; margin: 1rem 0; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--border); padding: 0.4rem 0.75rem; text-align: left; vertical-align: top; }
th { background: var(--code-bg); }

.callout { border-left: 4px solid var(--accent); background: var(--note-bg); padding: 0.75rem 1rem; border-radius: 6px; margin: 1rem 0; }
.callout.warn { border-left-color: #bf8700; background: var(--warn-bg); }
.callout > :first-child { margin-top: 0; }
.callout > :last-child { margin-bottom: 0; }

.button { display: inline-block; padding: 0.5rem 1rem; border-radius: 6px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; }
.button:hover { filter: brightness(1.1); }

ol.steps > li { margin-bottom: 0.75rem; }

.flow { width: 100%; height: auto; margin: 1rem 0; }
.flow rect { fill: var(--code-bg); stroke: var(--border); stroke-width: 1.5; }
.flow text { fill: var(--fg); font-size: 14px; font-family: inherit; }
.flow .num { fill: var(--accent); font-size: 12px; font-weight: 700; }
.flow line { stroke: var(--muted); stroke-width: 2; }
.flow .head { fill: var(--muted); }

footer { border-top: 1px solid var(--border); color: var(--muted); font-size: 0.875rem; padding-block: 1.5rem; }
```

- [ ] **Step 2: `site/index.html`** – overview, flow diagram, billing table, repo map. Full content:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Copilot code review demo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <div class="wrap">
      <a class="brand" href="index.html">Copilot code review demo</a>
      <nav aria-label="Main">
        <ul>
          <li><a href="index.html" aria-current="page">Overview</a></li>
          <li><a href="setup.html">Setup</a></li>
          <li><a href="try-it.html">Try it</a></li>
          <li><a href="customize.html">Customize</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <main class="wrap">
    <h1>GitHub Copilot code review</h1>
    <p class="lead">Copilot reviews a pull request like an extra teammate: it reads the change, leaves inline comments, and proposes fixes you can commit with one click. This repository lets you watch that happen on a small TypeScript project.</p>
    <p><a class="button" href="try-it.html">Try the review flow →</a></p>

    <h2>How the flow works</h2>
    <svg class="flow" viewBox="0 0 960 100" role="img" aria-labelledby="flow-title">
      <title id="flow-title">Demo flow: run workflow, branch pushed, open pull request, Copilot requested, review comments, fix and re-review</title>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path class="head" d="M0,0 L10,5 L0,10 z"/>
        </marker>
      </defs>
      <g text-anchor="middle">
        <rect x="2" y="10" width="136" height="80" rx="8"/>
        <text class="num" x="70" y="32">1</text><text x="70" y="54">Run workflow</text><text x="70" y="74">“Create demo branch”</text>
        <rect x="166" y="10" width="136" height="80" rx="8"/>
        <text class="num" x="234" y="32">2</text><text x="234" y="54">Branch pushed</text><text x="234" y="74">demo/&lt;scenario&gt;-N</text>
        <rect x="330" y="10" width="136" height="80" rx="8"/>
        <text class="num" x="398" y="32">3</text><text x="398" y="54">Open pull request</text><text x="398" y="74">from job summary</text>
        <rect x="494" y="10" width="136" height="80" rx="8"/>
        <text class="num" x="562" y="32">4</text><text x="562" y="54">Copilot requested</text><text x="562" y="74">by the ruleset</text>
        <rect x="658" y="10" width="136" height="80" rx="8"/>
        <text class="num" x="726" y="32">5</text><text x="726" y="54">Review comments</text><text x="726" y="74">+ CI results</text>
        <rect x="822" y="10" width="136" height="80" rx="8"/>
        <text class="num" x="890" y="32">6</text><text x="890" y="54">Fix &amp; re-review</text><text x="890" y="74">then close the PR</text>
      </g>
      <g marker-end="url(#arrow)">
        <line x1="140" y1="50" x2="163" y2="50"/>
        <line x1="304" y1="50" x2="327" y2="50"/>
        <line x1="468" y1="50" x2="491" y2="50"/>
        <line x1="632" y1="50" x2="655" y2="50"/>
        <line x1="796" y1="50" x2="819" y2="50"/>
      </g>
    </svg>
    <ol class="steps">
      <li><strong>Run the workflow.</strong> In <em>Actions → Create demo branch</em> you pick a scenario, for example a logic bug or a security problem.</li>
      <li><strong>Branch pushed.</strong> The workflow copies the scenario files over <code>main</code> and pushes a branch called <code>demo/&lt;scenario&gt;-&lt;run number&gt;</code>.</li>
      <li><strong>Open the pull request.</strong> The job summary has a link that opens a prefilled pull request. You are the author, just as in real work.</li>
      <li><strong>Copilot is requested.</strong> A repository ruleset adds Copilot as a reviewer automatically. You can also add it by hand under <em>Reviewers</em>.</li>
      <li><strong>Review comments arrive.</strong> Copilot leaves inline comments, often with suggested changes. CI runs in parallel.</li>
      <li><strong>Fix and re-review.</strong> Commit a suggestion or push a fix, ask Copilot to review again, then close the pull request.</li>
    </ol>

    <h2>What Copilot does in a review</h2>
    <ul>
      <li>Reads the diff plus surrounding project context. The agentic part runs on GitHub Actions runners.</li>
      <li>Leaves a review with inline comments. Many comments include a <em>suggested change</em> you can commit directly.</li>
      <li>By default it submits a <em>Comment</em> review, so it does not block merging and does not count as a required approval. Admins can opt in to Copilot approvals.</li>
      <li>Follows custom instructions from the pull request's <strong>head branch</strong>, so you can test instruction changes inside the same pull request.</li>
      <li>Supports review effort levels <em>Lite</em>, <em>Balanced</em> (default) and <em>Max</em>.</li>
    </ul>
    <div class="callout">
      <p>Copilot is a reviewer, not the reviewer. It can miss problems and can be wrong. Keep human review for anything that matters.</p>
    </div>

    <h2>Who can use it, and who pays</h2>
    <p>Copilot code review is part of Copilot Pro, Pro+, Max, Business and Enterprise. On Business and Enterprise, organization owners can also let members <em>without</em> a Copilot license use it; that usage is billed to the organization.</p>
    <p>A review consumes AI credits for the model and GitHub Actions minutes for the agentic context gathering.</p>
    <table>
      <thead><tr><th>How the review starts</th><th>AI credits are attributed to</th></tr></thead>
      <tbody>
        <tr><td>Someone requests Copilot under <em>Reviewers</em></td><td>The person who requested it</td></tr>
        <tr><td>Automatic review (ruleset or personal setting)</td><td>The pull request author</td></tr>
        <tr><td>Pull request authored by Copilot cloud agent</td><td>The human co-author, otherwise the organization</td></tr>
        <tr><td>Pull request authored by another bot (for example <code>github-actions[bot]</code>)</td><td>The organization</td></tr>
      </tbody>
    </table>
    <p>That last row is why this demo pushes only a branch and lets <em>you</em> open the pull request: billing follows your license, and CI runs normally. Pull requests created with <code>GITHUB_TOKEN</code> would not trigger other workflows.</p>

    <h2>What is in this repository</h2>
    <table>
      <thead><tr><th>Path</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>src/</code></td><td>Small TypeScript library (pricing, users, config) with Vitest tests – the code under review</td></tr>
        <tr><td><code>demo/scenarios/</code></td><td>Scenario overlays with planted issues, plus a clean control scenario</td></tr>
        <tr><td><code>scripts/</code></td><td>Applies scenarios, renders the job summary, and checks that scenarios still compile</td></tr>
        <tr><td><code>.github/copilot-instructions.md</code><br><code>.github/instructions/</code></td><td>Custom review instructions (repository-wide and path-specific)</td></tr>
        <tr><td><code>.github/workflows/</code></td><td>CI, <em>Create demo branch</em>, and the Pages deployment</td></tr>
        <tr><td><code>site/</code></td><td>This documentation site</td></tr>
      </tbody>
    </table>
  </main>
  <footer>
    <div class="wrap">
      Official documentation: <a href="https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review">About Copilot code review</a> ·
      <a href="https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review">Configure code review</a>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 3: `site/setup.html`** – one-time admin setup. Full content:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Setup – Copilot code review demo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <div class="wrap">
      <a class="brand" href="index.html">Copilot code review demo</a>
      <nav aria-label="Main">
        <ul>
          <li><a href="index.html">Overview</a></li>
          <li><a href="setup.html" aria-current="page">Setup</a></li>
          <li><a href="try-it.html">Try it</a></li>
          <li><a href="customize.html">Customize</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <main class="wrap">
    <h1>One-time setup</h1>
    <p class="lead">A repository admin does these steps once. Afterwards anyone with write access can run the demo.</p>

    <h2>Prerequisites</h2>
    <ul>
      <li>Copilot code review is enabled for the organization (organization settings → Copilot → Policies).</li>
      <li>Demo users have a Copilot license, or the organization allows members without a license to use Copilot code review.</li>
      <li>You are an admin of this repository.</li>
    </ul>

    <h2>1. Request Copilot automatically with a ruleset</h2>
    <ol class="steps">
      <li>Open <em>Settings → Rules → Rulesets</em> and click <strong>New ruleset → New branch ruleset</strong>.</li>
      <li>Name it, for example <code>copilot-review</code>, and set <em>Enforcement status</em> to <strong>Active</strong>.</li>
      <li>Under <em>Target branches</em>, click <strong>Add target → Include default branch</strong>.</li>
      <li>Under <em>Branch rules</em>, select <strong>Automatically request Copilot code review</strong>.</li>
      <li>Optionally enable <strong>Review new pushes</strong> (Copilot reviews each push again) and <strong>Review draft pull requests</strong>.</li>
      <li>Click <strong>Create</strong>.</li>
    </ol>
    <div class="callout">
      <p>Without the ruleset the demo still works: open the pull request, then choose <strong>Copilot</strong> under <em>Reviewers</em>. Each user can also turn on automatic review for their own pull requests in their personal Copilot settings → <em>Code review</em>.</p>
    </div>

    <h2>2. Review settings (optional)</h2>
    <p>Open <em>Settings → Copilot → Code review</em> in the repository:</p>
    <ul>
      <li><strong>Review effort level</strong> for automatic reviews: Lite, Balanced or Max.</li>
      <li><strong>Use custom instructions</strong> is on by default; keep it on so the files in <code>.github/</code> take effect.</li>
      <li><strong>Auto-approval</strong>: leave off for this demo.</li>
    </ul>

    <h2>3. GitHub Pages</h2>
    <ol class="steps">
      <li>Open <em>Settings → Pages</em> and set <em>Source</em> to <strong>GitHub Actions</strong>.</li>
      <li>Run <em>Actions → Deploy site → Run workflow</em> once. Later pushes to <code>site/</code> on <code>main</code> deploy automatically.</li>
      <li>The site URL is shown in <em>Settings → Pages</em> and in the workflow run.</li>
    </ol>
    <div class="callout warn">
      <p>This repository is private. GitHub Pages for private repositories needs a paid plan, and the site is <strong>public</strong> unless your organization uses GitHub Enterprise Cloud and you set the Pages visibility to <strong>Private</strong>. Check what your organization allows before publishing internal content.</p>
    </div>

    <h2>4. Branch housekeeping</h2>
    <ul>
      <li>Enable <em>Settings → General → Automatically delete head branches</em>, so closed demo pull requests clean up their branch. Branches of pull requests that are closed <em>without</em> merging are not deleted automatically; use the <em>Delete branch</em> button on the pull request.</li>
      <li>The <em>Create demo branch</em> workflow declares <code>permissions: contents: write</code> itself. No change to the default workflow permissions is needed unless an organization policy blocks it.</li>
      <li>Optionally require the <em>CI</em> check on <code>main</code> in the same ruleset.</li>
    </ul>

    <p><a class="button" href="try-it.html">Continue: try the flow →</a></p>
  </main>
  <footer>
    <div class="wrap">
      Official documentation: <a href="https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review">Configure code review</a> ·
      <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site">Pages publishing source</a>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 4: `site/try-it.html`** – walkthrough, scenarios, local variant, troubleshooting. Full content:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Try it – Copilot code review demo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <div class="wrap">
      <a class="brand" href="index.html">Copilot code review demo</a>
      <nav aria-label="Main">
        <ul>
          <li><a href="index.html">Overview</a></li>
          <li><a href="setup.html">Setup</a></li>
          <li><a href="try-it.html" aria-current="page">Try it</a></li>
          <li><a href="customize.html">Customize</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <main class="wrap">
    <h1>Try the review flow</h1>
    <p class="lead">About five minutes from start to the first Copilot comment.</p>
    <p><a class="button" href="https://github.com/cbs-Group/github-code-review-test/actions/workflows/create-demo-branch.yml">Open “Create demo branch” →</a></p>

    <h2>Step by step</h2>
    <ol class="steps">
      <li><strong>Start the workflow.</strong> On the workflow page click <strong>Run workflow</strong>, choose a scenario (see below), and click <strong>Run workflow</strong> again.</li>
      <li><strong>Open the run.</strong> When it finishes, open it. The <em>Summary</em> shows the branch name, a link, and what Copilot should find.</li>
      <li><strong>Create the pull request.</strong> Click <strong>Open the pull request</strong>. Title and description are prefilled; keep <code>main</code> as base and click <strong>Create pull request</strong>.</li>
      <li><strong>Wait for Copilot.</strong> With the ruleset active, Copilot appears under <em>Reviewers</em> and starts on its own. Without it, click <em>Reviewers</em> and select <strong>Copilot</strong>. A review usually takes a few minutes.</li>
      <li><strong>Read the review.</strong> Open <em>Files changed</em> or the <em>Conversation</em> tab. Compare the comments with the expected findings from the job summary.</li>
      <li><strong>Act on a comment.</strong> Use <strong>Commit suggestion</strong> on a suggested change, or reply and resolve the conversation. Rate comments with 👍 / 👎 to give feedback.</li>
      <li><strong>Re-review.</strong> If <em>Review new pushes</em> is on, Copilot reviews the new commit automatically. Otherwise click the re-request button next to Copilot under <em>Reviewers</em>.</li>
      <li><strong>Clean up.</strong> Close the pull request without merging and click <strong>Delete branch</strong>.</li>
    </ol>

    <h2>Scenarios</h2>
    <table>
      <thead><tr><th>Scenario</th><th>What the change does</th><th>What Copilot should flag</th></tr></thead>
      <tbody>
        <tr><td><code>logic-bug</code></td><td>“Simplifies” tax math and applies a loyalty discount to the total</td><td>Discount applied twice; tax returns fractional cents</td></tr>
        <tr><td><code>security</code></td><td>Makes local setup “easier” and adds lookup logging</td><td>Hardcoded fallback API key; missing email validation; password hash in logs</td></tr>
        <tr><td><code>conventions</code></td><td>Adds a price formatting helper</td><td><code>any</code>, <code>console.log</code> and no test – rules from <code>.github/copilot-instructions.md</code></td></tr>
        <tr><td><code>clean</code></td><td>Adds a tested, locale-aware currency formatter</td><td>Little or nothing – a control to show Copilot does not invent issues</td></tr>
      </tbody>
    </table>
    <p>All scenarios compile and keep the existing tests green, so CI passes and only the review catches the problems. Copilot is non-deterministic: wording, number and order of comments vary between runs.</p>

    <h2>Experiment with instructions</h2>
    <p>Copilot reads custom instructions from the pull request's head branch. In a demo pull request, edit <code>.github/copilot-instructions.md</code> – for example, remove the severity tag rule or add “Flag every function longer than 10 lines” – push, and request a new review. Compare the comments.</p>

    <h2>Create a demo branch locally</h2>
    <pre><code>npm ci
node scripts/create-demo-branch.mjs list
node scripts/create-demo-branch.mjs apply security
git switch -c demo/security-local
git add -A
git commit -m "demo: apply security scenario"
git push -u origin HEAD</code></pre>
    <p>Then open a pull request from that branch as usual.</p>

    <h2>Troubleshooting</h2>
    <table>
      <thead><tr><th>Symptom</th><th>Check</th></tr></thead>
      <tbody>
        <tr><td>Copilot is not offered under <em>Reviewers</em></td><td>You have no access to Copilot code review: missing license, or the organization policy is off.</td></tr>
        <tr><td>No automatic review started</td><td>Ruleset is not <em>Active</em> or does not target <code>main</code>; the pull request is a draft and draft reviews are off. Request Copilot manually.</td></tr>
        <tr><td>Review fails or never finishes</td><td>AI credit budget or quota is exhausted, or GitHub-hosted runners are disabled for the organization. Re-request after fixing.</td></tr>
        <tr><td>Workflow fails at <code>git push</code></td><td>An organization policy restricts <code>GITHUB_TOKEN</code> write access, or a ruleset blocks creating <code>demo/*</code> branches.</td></tr>
      </tbody>
    </table>
  </main>
  <footer>
    <div class="wrap">
      Official documentation: <a href="https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-code-review">Using Copilot code review</a> ·
      <a href="https://docs.github.com/en/copilot/tutorials/use-copilot-code-review-across-the-pull-request-lifecycle">Pull request lifecycle tutorial</a>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 5: `site/customize.html`** – instructions, effort, automatic options, limits. Full content:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Customize – Copilot code review demo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <div class="wrap">
      <a class="brand" href="index.html">Copilot code review demo</a>
      <nav aria-label="Main">
        <ul>
          <li><a href="index.html">Overview</a></li>
          <li><a href="setup.html">Setup</a></li>
          <li><a href="try-it.html">Try it</a></li>
          <li><a href="customize.html" aria-current="page">Customize</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <main class="wrap">
    <h1>Customize Copilot reviews</h1>
    <p class="lead">Tell Copilot what matters in your codebase, choose how deep it looks, and decide when it runs.</p>

    <h2>Custom instructions</h2>
    <table>
      <thead><tr><th>File</th><th>Scope</th><th>In this repository</th></tr></thead>
      <tbody>
        <tr><td><code>.github/copilot-instructions.md</code></td><td>Whole repository</td><td>Review priorities, money-in-cents rule, no <code>any</code>, no <code>console</code>, severity tags</td></tr>
        <tr><td><code>.github/instructions/*.instructions.md</code></td><td>Files matching <code>applyTo</code></td><td><code>tests.instructions.md</code> for <code>**/*.test.ts</code>, <code>workflows.instructions.md</code> for <code>.github/workflows/**</code></td></tr>
        <tr><td><code>AGENTS.md</code></td><td>Whole repository, shared with other AI agents</td><td>Not used</td></tr>
      </tbody>
    </table>
    <p>A path-specific file starts with front matter:</p>
    <pre><code>---
applyTo: "**/*.test.ts"
# optional: hide this file from code review or from the cloud agent
# excludeAgent: "code-review"
---

- Tests must be deterministic: no real network, no real clock.</code></pre>
    <h3>Writing good review instructions</h3>
    <ul>
      <li>Write short, concrete, checkable rules (“Money is an integer number of cents”) instead of general wishes (“write good code”).</li>
      <li>Say what to prioritize and what to skip, for example formatter-level style.</li>
      <li>Specify the comment format you want, such as severity tags.</li>
      <li>Instructions are read from the pull request's head branch, so you can try changes in a pull request before merging them.</li>
      <li>Repository admins can turn off custom instructions for code review in <em>Settings → Copilot → Code review</em>.</li>
    </ul>

    <h2>Review effort</h2>
    <table>
      <thead><tr><th>Level</th><th>Use for</th></tr></thead>
      <tbody>
        <tr><td>Lite</td><td>Standard review, lowest cost</td></tr>
        <tr><td>Balanced (default)</td><td>Deeper analysis of complex logic, security-sensitive code, and cross-service changes</td></tr>
        <tr><td>Max</td><td>Most intensive review with multiple high-reasoning models, for changes that need the most scrutiny</td></tr>
      </tbody>
    </table>
    <p>Set it per request under <em>Reviewers</em>, as a personal default in your Copilot settings, or as the repository default for automatic reviews. Organizations and enterprises can cap the maximum level. Higher levels use more AI credits.</p>

    <h2>When Copilot runs</h2>
    <ul>
      <li><strong>Manual:</strong> choose Copilot under <em>Reviewers</em>. Good for selective use.</li>
      <li><strong>Automatic for your own pull requests:</strong> personal Copilot settings → <em>Code review</em>.</li>
      <li><strong>Automatic for a repository or organization:</strong> a ruleset with <em>Automatically request Copilot code review</em>, optionally with <em>Review new pushes</em> and <em>Review draft pull requests</em>.</li>
    </ul>
    <p>Without <em>Review new pushes</em>, Copilot reviews a pull request once; request a re-review manually after larger changes.</p>

    <h2>Limits and good practice</h2>
    <ul>
      <li>Copilot can miss issues and can produce false positives. Treat comments as suggestions and keep human review.</li>
      <li>By default Copilot does not approve or block a pull request; approvals must be enabled explicitly by an admin.</li>
      <li>Small, focused pull requests get better reviews and cost less.</li>
      <li>Rate comments with 👍 / 👎 to send feedback to GitHub.</li>
      <li>Pull requests opened by bots are billed to the organization; plan budgets accordingly.</li>
    </ul>
  </main>
  <footer>
    <div class="wrap">
      Official documentation: <a href="https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions">Repository custom instructions</a> ·
      <a href="https://docs.github.com/en/copilot/tutorials/customize-code-review">Customize code review</a>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 6: Create empty `site/.nojekyll`**

Run: `touch site/.nojekyll`

- [ ] **Step 7: Verify locally in the browser**

Run: `python3 -m http.server 8765 --directory site` (async), open `http://localhost:8765/index.html`, click through all four nav links, check the flow diagram renders, check light layout at 1280 px and 390 px width.
Expected: every page loads, nav highlights the current page, no horizontal overflow except inside tables/code blocks.

- [ ] **Step 8: Check internal links**

Run: `node -e 'const fs=require("fs");let bad=0;for(const f of fs.readdirSync("site").filter(f=>f.endsWith(".html"))){for(const [,h] of fs.readFileSync("site/"+f,"utf8").matchAll(/href="([^"#:]+)"/g)){if(!fs.existsSync("site/"+h)){console.log(f,"->",h);bad++}}}process.exit(bad?1:0)'`
Expected: no output, exit 0.

- [ ] **Step 9: Commit**

```bash
git add site
git commit -m "docs: add GitHub Pages site for the Copilot review demo"
```

---

### Task 11: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Copilot code review demo

Example repository showing how GitHub Copilot code review works on pull requests.

📖 **Documentation site:** deployed from [`site/`](site/) via GitHub Pages – see *Settings → Pages* for the URL.

## Quick start

1. A repository admin completes the one-time setup ([`site/setup.html`](site/setup.html)): ruleset with *Automatically request Copilot code review*, Pages source *GitHub Actions*.
2. Run **Actions → Create demo branch** and pick a scenario (`logic-bug`, `security`, `conventions`, `clean`).
3. Open the pull request from the link in the job summary. Copilot reviews it; compare with the expected findings.

## Local development

```bash
npm ci
npm run typecheck
npm test
npm run check:scenarios           # every scenario compiles and keeps tests green
npm run demo -- list              # list scenarios
npm run demo -- apply logic-bug   # apply a scenario to the working tree
```

## Layout

| Path | Purpose |
|------|---------|
| `src/` | TypeScript library under review |
| `demo/scenarios/` | Scenario overlays with planted issues |
| `scripts/` | Scenario tooling |
| `.github/copilot-instructions.md`, `.github/instructions/` | Custom review instructions |
| `.github/workflows/` | CI, demo branch creation, Pages deployment |
| `site/` | Documentation site |
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

### Task 12: Full verification, push, and end-to-end check

- [ ] **Step 1: Full local verification**

Run: `npm ci && npm run typecheck && npm test && npm run check:scenarios && go run github.com/rhysd/actionlint/cmd/actionlint@latest`
Expected: all green, actionlint silent.

- [ ] **Step 2: Push `main`**

Run: `git push -u origin main`
Expected: push succeeds; *CI* starts on GitHub.

- [ ] **Step 3: Manual GitHub settings (repository admin)** – follow `site/setup.html`: ruleset and Pages source *GitHub Actions*.

- [ ] **Step 4: End-to-end**

1. *CI* run on `main` is green.
2. Run *Deploy site*; the Pages URL serves `index.html`.
3. Run *Create demo branch* with `logic-bug`; the summary shows the link; the `demo/logic-bug-N` branch exists.
4. Open the pull request via the link; Copilot is requested; review comments appear; CI runs on the PR.
