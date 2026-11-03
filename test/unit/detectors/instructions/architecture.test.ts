import { describe, expect, it } from "vitest";

import { buildRepositoryContext } from "../../../../src/core/repository-context.js";
import { architectureInstructionsDetector } from "../../../../src/detectors/instructions/architecture.js";
import { createTempRepo, fixture } from "../../../helpers/temp-repo.js";

async function analyzeFixture(name: string) {
  return architectureInstructionsDetector.analyze(await buildRepositoryContext(fixture(name)));
}

async function analyzeFiles(files: Record<string, string>) {
  const { root, cleanup } = await createTempRepo(files);
  try {
    return await architectureInstructionsDetector.analyze(await buildRepositoryContext(root));
  } finally {
    await cleanup();
  }
}

const ARCHITECTURE_BODY = [
  "The service is split into three layers. The HTTP layer validates requests and",
  "shapes responses. The service layer owns business rules and is the only layer",
  "allowed to coordinate several data modules. The data layer is the only code",
  "that touches storage, which keeps query details out of everything else.",
].join("\n");

describe("instructions.architecture", () => {
  it("awards full credit for a document, a module map, and decision records", async () => {
    const finding = await analyzeFixture("node-healthy");

    expect(finding.id).toBe("instructions.architecture");
    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(5);
    expect(finding.evidence?.map((entry) => entry.path)).toStrictEqual([
      "docs/architecture.md",
      "docs/architecture.md",
      "docs/adr/0001-record-decisions.md",
    ]);
  });

  it("passes a substantial architecture section inside a README", async () => {
    const finding = await analyzeFixture("python-uv");

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
    expect(finding.evidence?.[0]?.label).toContain("Architecture section");
  });

  it("fails when no structural documentation exists", async () => {
    const finding = await analyzeFixture("minimal-repo");

    expect(finding.status).toBe("fail");
    expect(finding.score).toBe(0);
    expect(finding.recommendation?.priority).toBe("medium");
  });

  it("does not pass a heading with nothing behind it", async () => {
    const finding = await analyzeFixture("stub-instructions");

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
  });

  it("does not pass a stub architecture document", async () => {
    const finding = await analyzeFiles({ "docs/architecture.md": "# Architecture\n\nTBD.\n" });

    expect(finding.status).toBe("warning");
    expect(finding.score).toBe(1);
    expect(finding.evidence?.[0]?.path).toBe("docs/architecture.md");
  });

  it("credits a directory map drawn as a tree", async () => {
    const finding = await analyzeFiles({
      "README.md": [
        "# app",
        "",
        "## Architecture",
        "",
        ARCHITECTURE_BODY,
        "",
        "```text",
        "src/",
        "├── http/",
        "├── services/",
        "└── data/",
        "```",
      ].join("\n"),
    });

    expect(finding.status).toBe("pass");
    expect(finding.score).toBe(4);
  });

  it("credits an ADR index", async () => {
    const finding = await analyzeFiles({
      "ARCHITECTURE.md": `# Architecture\n\n${ARCHITECTURE_BODY}\n`,
      "docs/adr/0001-choose-storage.md": "# 1. Choose storage\n\nAccepted.\n",
    });

    expect(finding.score).toBe(4);
    expect(finding.evidence?.map((entry) => entry.label)).toContain("Architecture decision records");
  });

  it("finds guidance in AGENTS.md as well as in dedicated documents", async () => {
    const finding = await analyzeFiles({
      "AGENTS.md": `# AGENTS.md\n\n## Modules\n\n${ARCHITECTURE_BODY}\n`,
    });

    expect(finding.status).toBe("pass");
    expect(finding.evidence?.[0]?.path).toBe("AGENTS.md");
  });

  it("treats a document inside docs/architecture/ as an architecture document", async () => {
    const finding = await analyzeFiles({ "docs/architecture/data-model.md": `# Data model\n\n${ARCHITECTURE_BODY}\n\n${ARCHITECTURE_BODY}\n` });

    expect(finding.status).toBe("pass");
    expect(finding.evidence?.[0]?.path).toBe("docs/architecture/data-model.md");
  });

  it("does not count UI designs under docs/design/ as architecture", async () => {
    const finding = await analyzeFiles({ "docs/design/screens.md": `# Screens\n\n${ARCHITECTURE_BODY}\n` });

    expect(finding.status).toBe("fail");
  });

  it("recognizes a Japanese architecture heading", async () => {
    const body = [
      "画面は React で描画し、データの取得と保存は TanStack Query に任せる。サーバーは Express の",
      "ルート・サービス・データアクセスの三層に分け、ルートは入力の検証だけを行う。業務の規則は",
      "サービスに集め、データベースに触れるのはデータアクセスの層だけにしている。共有パッケージに",
      "入力の検証規則と型を置き、画面とサーバーの両方から同じ規則を使う。こうしておくと、検証の",
      "規則を変えたときに画面とサーバーの片方だけが古いまま残ることがない。並び順の計算も共有",
      "パッケージにあり、ドラッグ中の仮の並びと保存する値が食い違わないようにしている。",
    ].join("\n");
    const finding = await analyzeFiles({ "README.md": `# サンプル\n\n## アーキテクチャ\n\n${body}\n` });

    expect(finding.status).toBe("pass");
    expect(finding.evidence?.[0]?.label).toContain("アーキテクチャ");
  });
});
