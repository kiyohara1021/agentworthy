import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { testInstructionsDetector } from "../../../../src/detectors/instructions/tests.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return testInstructionsDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await testInstructionsDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

describe("instructions.tests", () => {
  it("awards full credit for a documented, explained, and situated test command", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("instructions.tests");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("recognizes a test command run through a wrapper", async () => {
    // The README documents `uv run pytest`.
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
  });

  it("warns when tests exist but nothing documents how to run them", async () => {
    const finding = await analyzeFixture("stub-instructions");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.recommendation?.priority).toBe("high");
    expect(finding.evidence?.map((entry) => entry.label)).toContain(
      "Undocumented test entry point (npm test)",
    );
  });

  it("fails when there are neither tests nor test instructions", async () => {
    const finding = await analyzeFixture("docs-only");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("high");
  });

  it("does not treat prose about testing as a documented command", async () => {
    const finding = await analyzeFiles({
      "README.md": "# app\n\nWe take testing seriously and run the tests often.\n",
      "tests/app_test.go": "package app\n",
    });

    expect(finding.status).toBe("warning");
    expect(finding.evidence?.[0]?.label).toBe("Test suite");
  });

  it("gives partial credit when the command is documented without context", async () => {
    const finding = await analyzeFiles({
      "README.md": "# app\n\n```bash\ncargo test\n```\n",
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(3);
    expect(finding.recommendation?.priority).toBe("low");
  });

  it("credits a testing section and guidance on when to run tests", async () => {
    const finding = await analyzeFiles({
      "README.md": [
        "# app",
        "",
        "## Testing",
        "",
        "Run the suite before submitting a pull request.",
        "",
        "```bash",
        "go test ./...",
        "```",
      ].join("\n"),
    });

    expect(finding.score).toBe(5);
  });

  it("treats a documented aggregate script that runs the tests as a test command", async () => {
    const finding = await analyzeFiles({
      "package.json": JSON.stringify({
        scripts: { typecheck: "tsc --noEmit", test: "node --test", check: "npm run typecheck && npm test" },
      }),
      "README.md": "# Example\n\n## Development\n\n```bash\nnpm run check\n```\n",
      "test/example.test.js": "",
    });

    expect(finding.status).toBe("pass");
    expect(finding.evidence?.map((entry) => entry.label).join(" ")).toContain("package script that runs the tests");
    // The script name is repository text and is never echoed in evidence.
    expect(JSON.stringify(finding.evidence)).not.toContain("check");
  });

  it("follows aggregate scripts through several levels and npm-run-all", async () => {
    const finding = await analyzeFiles({
      "package.json": JSON.stringify({
        scripts: { "test:unit": "vitest run", verify: "run-s lint test:*", ci: "npm run verify", lint: "eslint ." },
      }),
      "README.md": "# Example\n\nRun `pnpm ci` before opening a pull request.\n",
      "test/example.test.js": "",
    });

    expect(finding.status).toBe("pass");
  });

  it("does not loop on scripts that call each other", async () => {
    const finding = await analyzeFiles({
      "package.json": JSON.stringify({ scripts: { a: "npm run b", b: "npm run a" } }),
      "README.md": "# Example\n\n```bash\nnpm run a\n```\n",
      "test/example.test.js": "",
    });

    expect(finding.status).not.toBe("pass");
  });
});

