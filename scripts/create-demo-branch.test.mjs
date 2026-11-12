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
