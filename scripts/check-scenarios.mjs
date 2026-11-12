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
