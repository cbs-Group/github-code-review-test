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
