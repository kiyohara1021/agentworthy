import { QUALITY_KINDS } from "../../discovery/commands.js";
import {
  collectDocumentation,
  findDocumentedCommands,
  repositoryDocumentation,
  type DocumentedCommand,
} from "../../discovery/documentation.js";
import { detectEcosystems, hasSourceCode } from "../../discovery/ecosystems.js";
import { hasHeading } from "../../discovery/markdown.js";
import { discoverScripts, scriptsOfKind } from "../../discovery/scripts.js";
import { discoverQualityTooling } from "../../discovery/tooling.js";
import type { RepositoryContext } from "../../core/repository-context.js";
import type { Detector, Evidence, Finding } from "../../core/types.js";
import { documentedCommandEvidence, limitEvidence } from "./shared.js";

/**
 * `instructions.quality` — is lint/format/type-check guidance documented?
 *
 * Why it matters: linting, formatting, and static analysis catch classes of
 * change that tests do not.
 *
 * Evidence: documented lint/type-check commands, plus configured tooling and
 * scripts that show whether such validation exists at all.
 *
 * Partial credit:
 *
 *   documented quality command                        +3
 *   documentation backed by configured tooling        +1
 *   command sits under a quality/validation section   +1
 *   tooling exists but is undocumented                +1  (instead of the above)
 *
 * Applicability: a repository with no source code and no project manifest —
 * a documentation-only repository — is not expected to document quality
 * validation, so the check is marked not applicable and leaves the score alone.
 *
 * Ecosystem fairness: `dart analyze`, `go vet`, and similar commands count for
 * both linting and type analysis, so ecosystems without a separate type-check
 * step are not penalized.
 */

const ID = "instructions.quality";
const MAX_SCORE = 5;

const QUALITY_HEADING =
  /\b(lint|linting|format|formatting|style|analysis|analyse|analyze|type ?check|types|quality|checks?|validation|ci)\b/;

function finding(overrides: Omit<Finding, "id" | "category" | "maxScore">): Finding {
  return { id: ID, category: "instructions", maxScore: MAX_SCORE, ...overrides };
}

export const qualityInstructionsDetector: Detector = {
  id: ID,
  category: "instructions",

  async analyze(context: RepositoryContext): Promise<Finding> {
    const [allDocs, scripts, tooling, ecosystems, sourceCode] = await Promise.all([
      collectDocumentation(context),
      discoverScripts(context),
      discoverQualityTooling(context),
      detectEcosystems(context),
      hasSourceCode(context),
    ]);
    const docs = repositoryDocumentation(allDocs);

    if (ecosystems.length === 0 && !sourceCode) {
      return finding({
        status: "info",
        title: "Quality instructions are not applicable",
        message:
          "No source code or project manifest was found, so lint or type-check guidance is not expected.",
        score: 0,
        applicable: false,
      });
    }

    const documented: DocumentedCommand[] = QUALITY_KINDS.flatMap((kind) =>
      findDocumentedCommands(docs, kind, scripts),
    );

    const discoveredScripts = QUALITY_KINDS.flatMap((kind) => scriptsOfKind(scripts, kind));

    if (documented.length > 0) {
      const backed = tooling.length > 0 || discoveredScripts.length > 0;
      const documentingPaths = new Set(documented.map((match) => match.doc.path));
      const explained = docs.some(
        (doc) => documentingPaths.has(doc.path) && hasHeading(doc.signals, QUALITY_HEADING),
      );

      const score = 3 + (backed ? 1 : 0) + (explained ? 1 : 0);
      const evidence: Evidence[] = documentedCommandEvidence(documented);
      const tool = tooling[0];
      if (tool) evidence.push({ kind: "config", path: tool.path, label: `${tool.label} configuration` });

      const gaps = [
        backed ? undefined : "a matching script or tool configuration in the repository",
        explained ? undefined : "a dedicated section explaining the checks",
      ].filter((gap) => gap !== undefined);

      return finding({
        status: "pass",
        title: "Quality instructions are documented",
        message:
          gaps.length === 0
            ? "Documentation states how to run lint, format, or type-check validation, and the tooling is configured in the repository."
            : `Documentation states how to run quality validation, but the repository lacks ${gaps.join(" and ")}.`,
        score,
        applicable: true,
        evidence: limitEvidence(evidence),
        ...(gaps.length === 0
          ? {}
          : { recommendation: { priority: "low", message: `Add ${gaps.join(" and ")}.` } }),
      });
    }

    if (tooling.length > 0 || discoveredScripts.length > 0) {
      const evidence: Evidence[] = [
        ...discoveredScripts.slice(0, 2).map((script) => ({
          kind: "script" as const,
          path: script.source,
          label: `Undocumented quality command (${script.command})`,
        })),
        ...tooling.slice(0, 2).map((tool) => ({
          kind: "config" as const,
          path: tool.path,
          label: `${tool.label} configuration`,
        })),
      ];

      return finding({
        status: "warning",
        title: "Quality tooling exists but is not documented",
        message:
          "Lint or type-check tooling is configured, but no documentation tells a reader how to run it.",
        score: 1,
        applicable: true,
        recommendation: {
          priority: "medium",
          message: "Document the lint, format, and type-check commands a change is expected to pass.",
        },
        evidence: limitEvidence(evidence),
      });
    }

    return finding({
      status: "fail",
      title: "No quality instructions",
      message:
        "No lint, format, or type-check command is documented or configured for the detected project type.",
      score: 0,
      applicable: true,
      recommendation: {
        priority: "medium",
        message: "Configure a linter or type checker for this ecosystem and document how to run it.",
      },
    });
  },
};
