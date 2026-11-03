import type { RepositoryContext } from "../core/repository-context.js";
import type { DocumentationFile } from "./documentation.js";
import { hasHeading } from "./markdown.js";

/**
 * Recognition of architecture and design documentation.
 *
 * Two detectors read these documents for different reasons:
 * `instructions.architecture` asks whether the guidance is good enough to edit
 * against, and `context.architecture` asks whether it is discoverable as
 * repository context. They must agree on *what* the documents are, so
 * classification lives here rather than in either detector.
 */

/** Lines needed before a code block counts as a directory map. */
const MIN_TREE_LINES = 3;

export const ARCHITECTURE_DOCUMENT =
  /(^|\/)(architecture|design|system-design|system_design|code-map|codemap|module-map|overview)\.(md|mdx|rst)$/;

/**
 * Documents filed under an `architecture/` directory, e.g. `docs/architecture/data-model.md`.
 * `design/` is left out on purpose: it usually holds UI or screen designs, not a code map.
 */
export const ARCHITECTURE_DIRECTORY = /(^|\/)architecture\/[^/]+\.(md|mdx|rst)$/;

/** Anchored at the repository root so a vendored project's ADRs do not count. */
export const DECISION_DIRECTORY = /^(docs?\/)?(adr|adrs|decisions|rfcs)\//;

// `\b` needs a word character on one side, so Japanese terms get their own alternatives without it.
export const ARCHITECTURE_HEADING =
  /\b(architecture|system design|high-?level design|design overview|how it works|components?|modules?|data flow|layers?|code ?map)\b|アーキテクチャ|システム構成|全体構成|構成図|設計方針|設計概要|全体像|仕組み|処理の流れ|データの流れ|データフロー|モジュール構成|レイヤー構成|層構造|コードマップ/;

export const STRUCTURE_HEADING =
  /\b((project|repository|directory|folder|code|codebase|package) (structure|layout|map|overview)|structure|layout)\b|(ディレクトリ|フォルダ|ファイル|プロジェクト|リポジトリ|コード|パッケージ)(構成|構造)/;

export const DECISION_HEADING = /\b(architecture decision record|adrs?|decision records?|rfcs?)\b|設計判断|意思決定記録|決定記録/;

const TREE_CHARACTER = /[├└│]/;
const DIRECTORY_LINE = /^[\w.@-]+\/$/;

/** `true` when the document's path names it an architecture or design document. */
export function isArchitectureDocument(doc: DocumentationFile): boolean {
  const lowerPath = doc.path.toLowerCase();
  return ARCHITECTURE_DOCUMENT.test(lowerPath) || ARCHITECTURE_DIRECTORY.test(lowerPath);
}

/** `true` when a code block in the document draws a directory tree. */
export function hasDirectoryMap(doc: DocumentationFile): boolean {
  const treeLines = doc.signals.code.filter(
    (line) => TREE_CHARACTER.test(line) || DIRECTORY_LINE.test(line),
  );
  return treeLines.length >= MIN_TREE_LINES;
}

/** `true` when the document carries a structure heading or a directory tree. */
export function describesStructure(doc: DocumentationFile): boolean {
  return hasDirectoryMap(doc) || hasHeading(doc.signals, STRUCTURE_HEADING);
}

/** The first file inside a decision-record directory, when one exists. */
export function findDecisionRecords(context: RepositoryContext): string | undefined {
  return context.files.all.find((file) => DECISION_DIRECTORY.test(file.path.toLowerCase()))?.path;
}
