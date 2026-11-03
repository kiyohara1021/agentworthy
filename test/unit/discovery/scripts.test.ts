import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../src/core/repository-context.js";
import { discoverScripts, scriptsOfKind } from "../../../src/discovery/scripts.js";
import { createTempRepo } from "../../helpers/temp-repo.js";

async function scriptsFor(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await discoverScripts(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("discoverScripts", () => {
  it("reads npm scripts and classifies them by name and body", async () => {
    const scripts = await scriptsFor({
      "package.json": JSON.stringify({
        scripts: { test: "vitest run", lint: "eslint .", ship: "tsc --noEmit" },
      }),
    });

    expect(scripts.find((script) => script.name === "test")?.command).toBe("npm test");
    expect(scripts.find((script) => script.name === "lint")?.command).toBe("npm run lint");
    // Classified from the command body, not the script name.
    expect(scriptsOfKind(scripts, "typecheck").map((script) => script.name)).toStrictEqual(["ship"]);
  });

  it("reads composer scripts, including array form", async () => {
    const scripts = await scriptsFor({
      "composer.json": JSON.stringify({
        scripts: { test: ["@putenv XDEBUG_MODE=off", "phpunit"], analyse: "phpstan analyse" },
      }),
    });

    expect(scriptsOfKind(scripts, "test").map((script) => script.command)).toStrictEqual([
      "composer test",
    ]);
    expect(scriptsOfKind(scripts, "typecheck").map((script) => script.command)).toStrictEqual([
      "composer analyse",
    ]);
  });

  it("reads Makefile targets and their recipes", async () => {
    const scripts = await scriptsFor({
      Makefile: [
        "CFLAGS := -O2",
        "",
        ".PHONY: all",
        "",
        "setup:",
        "\tuv sync",
        "",
        "check:",
        "\tuv run mypy src",
        "",
      ].join("\n"),
    });

    expect(scripts.map((script) => script.command)).toStrictEqual(["make setup", "make check"]);
    expect(scriptsOfKind(scripts, "setup").map((script) => script.name)).toStrictEqual(["setup"]);
    expect(scriptsOfKind(scripts, "typecheck").map((script) => script.name)).toStrictEqual(["check"]);
  });

  it("reads justfile recipes", async () => {
    const scripts = await scriptsFor({ justfile: ["test:", "    cargo test", ""].join("\n") });

    expect(scripts.map((script) => script.command)).toStrictEqual(["just test"]);
  });

  it("does not classify a scaffolding placeholder as a test script", async () => {
    const scripts = await scriptsFor({
      "package.json": JSON.stringify({
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
    });

    expect(scripts.map((script) => script.kinds)).toStrictEqual([["other"]]);
    expect(scriptsOfKind(scripts, "test")).toStrictEqual([]);
  });

  it("treats a malformed manifest as no evidence rather than an error", async () => {
    expect(await scriptsFor({ "package.json": "{ not json" })).toStrictEqual([]);
  });

  it("returns nothing for a repository with no script definitions", async () => {
    expect(await scriptsFor({ "README.md": "# empty" })).toStrictEqual([]);
  });

  it("adds the kinds of the scripts an aggregate script calls", async () => {
    const scripts = await scriptsFor({
      "package.json": JSON.stringify({
        scripts: {
          typecheck: "tsc --noEmit",
          "test:unit": "vitest run",
          verify: "run-p typecheck \"test:*\"",
          check: "npm run verify && npm pack --dry-run",
          deep1: "npm run deep2", deep2: "npm run deep3", deep3: "npm run deep4", deep4: "npm run deep5", deep5: "npm run deep6", deep6: "npm run deep7", deep7: "npm test",
          test: "node --test",
          loop: "npm run loop",
        },
      }),
    });
    const kindsOf = (name: string) => scripts.find((script) => script.name === name)?.kinds;

    expect(kindsOf("verify")).toEqual(expect.arrayContaining(["typecheck", "test"]));
    expect(kindsOf("check")).toEqual(expect.arrayContaining(["typecheck", "test"]));
    expect(kindsOf("check")).not.toContain("other");
    // Five calls deep is followed; six is past the limit.
    expect(kindsOf("deep2")).toContain("test");
    expect(kindsOf("deep1")).toStrictEqual(["other"]);
    expect(kindsOf("loop")).toStrictEqual(["other"]);
  });

  it("follows Composer @script references", async () => {
    const scripts = await scriptsFor({
      "composer.json": JSON.stringify({ scripts: { test: "phpunit", check: ["@test", "@lint"], lint: "pint --test" } }),
    });

    expect(scripts.find((script) => script.name === "check")?.kinds).toEqual(expect.arrayContaining(["test", "lint"]));
  });
});

