import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { matchCommands, toCommandSegments, type CommandKind, type CommandPattern } from "./commands.js";
import { parseDocument, type DocumentSignals } from "./markdown.js";
import { invokedScriptNames, scriptNameMatches, type DiscoveredScript } from "./scripts.js";

/**
 * Documentation discovery.
 *
 * Instruction detectors all ask questions of the same small set of documents,
 * so the corpus is collected and parsed once per analysis. Selection is
 * name-based and bounded: no repository is ever fully read to answer "is setup
 * documented?".
 */

export type DocumentationRole = "agents-root" | "agents-nested" | "readme" | "guide";

export interface DocumentationFile {
  /** Repository-relative POSIX path. */
  path: string;
  role: DocumentationRole;
  signals: DocumentSignals;
  /** Normalized command segments from the document's code. */
  commands: readonly string[];
}

/** Documentation is prose; a bounded read is always enough. */
const DOC_MAX_BYTES = 64 * 1024;

const AGENTS_FILE = "agents.md";

const ROOT_DOC_NAMES: ReadonlySet<string> = new Set([
  "readme.md", "readme.markdown", "readme.rst", "readme.txt", "readme",
  "contributing.md", "contributing.rst", "contributing",
  "development.md", "developing.md", "hacking.md",
  "install.md", "installation.md", "setup.md", "getting-started.md",
  "architecture.md", "design.md",
]);

const NESTED_DOC_DIRECTORIES: readonly string[] = ["docs/", "doc/", ".github/"];
const NESTED_DOC_EXTENSIONS: readonly string[] = [".md", ".markdown", ".mdx", ".rst"];

/** Caps keep documentation reads bounded on doc-heavy repositories. */
const MAX_NESTED_DOCS = 16;
const MAX_NESTED_AGENTS = 12;
/** Path segments allowed for nested docs, e.g. `docs/guides/setup.md`. */
const MAX_NESTED_DEPTH = 3;

function basename(relativePath: string): string {
  const segments = relativePath.split("/");
  return (segments[segments.length - 1] ?? "").toLowerCase();
}

function isRootLevel(relativePath: string): boolean {
  return !relativePath.includes("/");
}

function selectPaths(context: RepositoryContext): { path: string; role: DocumentationRole }[] {
  const selected: { path: string; role: DocumentationRole }[] = [];
  const nestedDocs: string[] = [];
  const nestedAgents: string[] = [];

  // The file index is already sorted by path, so selection is deterministic.
  for (const file of context.files.all) {
    const name = basename(file.path);
    const root = isRootLevel(file.path);

    if (name === AGENTS_FILE) {
      if (root) selected.push({ path: file.path, role: "agents-root" });
      else if (nestedAgents.length < MAX_NESTED_AGENTS) nestedAgents.push(file.path);
      continue;
    }

    if (root && ROOT_DOC_NAMES.has(name)) {
      const role: DocumentationRole = name.startsWith("readme") ? "readme" : "guide";
      selected.push({ path: file.path, role });
      continue;
    }

    if (
      nestedDocs.length < MAX_NESTED_DOCS &&
      file.path.split("/").length <= MAX_NESTED_DEPTH &&
      NESTED_DOC_DIRECTORIES.some((directory) => file.path.toLowerCase().startsWith(directory)) &&
      NESTED_DOC_EXTENSIONS.some((extension) => name.endsWith(extension))
    ) {
      nestedDocs.push(file.path);
    }
  }

  for (const path of nestedAgents) selected.push({ path, role: "agents-nested" });
  for (const path of nestedDocs) selected.push({ path, role: "guide" });

  return selected;
}

/**
 * Reads and parses the repository's instruction-bearing documentation.
 *
 * Ordering is stable: root `AGENTS.md` and other root documents first (index
 * order), then nested `AGENTS.md` files, then documentation directories.
 */
export const collectDocumentation = perContext(
  async (context: RepositoryContext): Promise<DocumentationFile[]> => {
    const selected = selectPaths(context);

    const docs = await Promise.all(
      selected.map(async ({ path, role }): Promise<DocumentationFile | undefined> => {
        const raw = await context.readTextFile(path, DOC_MAX_BYTES);
        if (raw === undefined) return undefined;

        const signals = parseDocument(raw);
        return { path, role, signals, commands: toCommandSegments(signals.code) };
      }),
    );

    return docs.filter((doc): doc is DocumentationFile => doc !== undefined);
  },
);

/**
 * Documentation that speaks for the repository as a whole.
 *
 * Nested `AGENTS.md` files are evidence that *scoped* instructions exist, which
 * is what `instructions.agents-md` scores them for. They are not repository-wide
 * guidance, and treating them as such lets a vendored or fixture project inside
 * the repository answer questions about the repository itself.
 */
export function repositoryDocumentation(
  docs: readonly DocumentationFile[],
): DocumentationFile[] {
  return docs.filter((doc) => doc.role !== "agents-nested");
}

export interface DocumentedCommand {
  doc: DocumentationFile;
  pattern: CommandPattern;
}

/**
 * Commands of `kind` that documentation actually instructs a reader to run.
 *
 * Only code blocks and inline code count: prose that happens to contain the
 * word "test" is not a documented test command.
 */
export function findDocumentedCommands(
  docs: readonly DocumentationFile[],
  kind: CommandKind,
  scripts: readonly DiscoveredScript[] = [],
): DocumentedCommand[] {
  return docs.flatMap((doc) => {
    const direct = matchCommands(doc.commands, kind).map((pattern) => ({ doc, pattern }));
    if (direct.length > 0) return direct;
    // `npm run check` documents the tests when the `check` script runs them.
    const viaScript = invokedScriptNames(doc.commands).some((reference) =>
      scripts.some((script) => scriptNameMatches(reference, script.name) && script.kinds.includes(kind)),
    );
    return viaScript ? [{ doc, pattern: SCRIPT_PATTERNS[kind] }] : [];
  });
}

/**
 * Stable labels for a documented script that runs a command of each kind. The script's
 * own name is repository text, so it is never put in the label.
 */
const SCRIPT_PATTERNS: Record<CommandKind, CommandPattern> = {
  setup: { label: "package script that sets up the project", kinds: ["setup"], pattern: /$^/ },
  dev: { label: "package script that starts the project", kinds: ["dev"], pattern: /$^/ },
  test: { label: "package script that runs the tests", kinds: ["test"], pattern: /$^/ },
  lint: { label: "package script that runs the linter", kinds: ["lint"], pattern: /$^/ },
  typecheck: { label: "package script that runs the type checker", kinds: ["typecheck"], pattern: /$^/ },
};
