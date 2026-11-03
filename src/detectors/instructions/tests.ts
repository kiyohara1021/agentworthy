import {
  collectDocumentation,
  findDocumentedCommands,
  repositoryDocumentation,
} from "../../discovery/documentation.js";
import { findTestFiles } from "../../discovery/entry-points.js";
import { hasHeading } from "../../discovery/markdown.js";
import { discoverScripts, scriptsOfKind } from "../../discovery/scripts.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { documentedCommandEvidence, limitEvidence } from "./shared.js";

/**
 * `instructions.tests` — can a reader validate a change?
 *
 * Why it matters: an agent should verify its work before proposing it, which
 * requires knowing the test command.
 *
 * Evidence: documented test commands, testing sections in documentation, and —
 * for the warning case — test suites or test scripts that exist but are never
 * explained.
 *
 * Partial credit:
 *
 *   documented test command                 +3
 *   dedicated testing section               +1
 *   guidance on when/how to run tests       +1
 *   tests exist but are undocumented        +1  (instead of the above)
 */

const ID = "instructions.tests";
const MAX_SCORE = 5;

const TEST_HEADING = /\b(test|tests|testing|validation|validate|verify|verification|checks?)\b/;
/** Guidance beyond the bare command: when to run tests, or how to narrow them. */
const TEST_GUIDANCE =
  /(before (submitting|committing|opening|pushing|merging)|coverage|watch mode|--watch|--filter|single test|specific test|run a subset)/;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "instructions", maxScore: MAX_SCORE, ...overrides };
}

export const testInstructionsDetector: Detector = {
  id: ID,
  category: "instructions",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [allDocs, scripts, testFiles] = await Promise.all([
      collectDocumentation(context),
      discoverScripts(context),
      findTestFiles(context),
    ]);
    const docs = repositoryDocumentation(allDocs);

    const documented = findDocumentedCommands(docs, "test", scripts);

    if (documented.length > 0) {
      const documentingPaths = new Set(documented.map((match) => match.doc.path));
      const explained = docs.some(
        (doc) => documentingPaths.has(doc.path) && hasHeading(doc.signals, TEST_HEADING),
      );
      const guided = docs.some((doc) => TEST_GUIDANCE.test(doc.signals.text));

      const score = 3 + (explained ? 1 : 0) + (guided ? 1 : 0);
      const gaps = [
        explained ? undefined : "a dedicated testing section",
        guided ? undefined : "guidance on when to run the tests",
      ].filter((gap) => gap !== undefined);

      return finding({
        status: "pass",
        title: "Test instructions are documented",
        message:
          gaps.length === 0
            ? "Documentation states how to run the tests and when to run them."
            : `Documentation states how to run the tests, but does not include ${gaps.join(" or ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(documentedCommandEvidence(documented)),
        ...(gaps.length === 0
          ? {}
          : { recommendation: { priority: "low", message: `Add ${gaps.join(" and ")}.` } }),
      });
    }

    const testScript = scriptsOfKind(scripts, "test")[0];
    const testFile = testFiles[0];

    if (testScript !== undefined || testFile !== undefined) {
      const evidence: Evidence[] = [];
      if (testScript) {
        evidence.push({
          kind: "script",
          path: testScript.source,
          label: `Undocumented test entry point (${testScript.command})`,
        });
      }
      if (testFile) {
        evidence.push({ kind: "file", path: testFile.path, label: "Test suite" });
      }

      return finding({
        status: "warning",
        title: "Tests exist but running them is not documented",
        message:
          "The repository contains tests or a test entry point, but no documentation explains how to run them.",
        score: 1,
        applicable: true,
        recommendation: {
          priority: "high",
          message: "Document the exact command that runs the test suite.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "fail",
      title: "No test instructions",
      message: "No documented test command and no test suite were found, so changes cannot be validated.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "high",
        message: "Add a test suite and document the command that runs it.",
      },
    });
  },
};
