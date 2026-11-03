import type { RepositoryContext } from "../core/repository-context.js";
import { perContext } from "./cache.js";
import { matchCommands, toCommandSegments, type CommandKind } from "./commands.js";

/**
 * Discovery of project-defined validation entry points.
 *
 * Script definitions are parsed as data — never imported, evaluated, or run.
 * They answer "does a lint command exist at all?", which is what separates
 * "undocumented but present" from "absent" in the instruction detectors.
 */

export type ScriptKind = CommandKind | "other";

export interface DiscoveredScript {
  /** Script/target name as defined by the project, e.g. `lint`. */
  name: string;
  /** Command a developer would run, e.g. `npm run lint`. */
  command: string;
  /** Repository-relative file that defines it. */
  source: string;
  kinds: readonly ScriptKind[];
}

/** Manifests and build files are configuration; a bounded read is enough. */
const SCRIPT_FILE_MAX_BYTES = 64 * 1024;

const MAKEFILE_NAMES: readonly string[] = ["Makefile", "makefile", "GNUmakefile"];
const JUSTFILE_NAMES: readonly string[] = ["justfile", "Justfile", ".justfile"];

/** Name-based classification, applied alongside command-body classification. */
const NAME_RULES: readonly { kind: CommandKind; pattern: RegExp }[] = [
  { kind: "test", pattern: /(^|[.:_-])(test|tests|spec|e2e|unit|integration)([.:_-]|$)/ },
  { kind: "lint", pattern: /(^|[.:_-])(lint|format|fmt|style|prettier|eslint|rubocop|pint|cs)([.:_-]|$)/ },
  { kind: "typecheck", pattern: /(^|[.:_-])(typecheck|type-check|types|tsc|stan|mypy|analyse|analyze)([.:_-]|$)/ },
  { kind: "setup", pattern: /(^|[.:_-])(setup|bootstrap|install|deps|prepare)([.:_-]|$)/ },
  { kind: "dev", pattern: /(^|[.:_-])(dev|start|serve|watch)([.:_-]|$)/ },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses JSON as inert data. Malformed manifests are simply not evidence. */
function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Scaffolding placeholders, most commonly `npm init`'s default test script.
 * A script whose only job is to fail is not a validation entry point.
 */
const PLACEHOLDER_BODY = /\b(no|not) (test|tests) (specified|implemented|configured)\b/;

function classify(name: string, body: string): ScriptKind[] {
  const lowerName = name.toLowerCase();
  if (PLACEHOLDER_BODY.test(body.toLowerCase())) return ["other"];

  const segments = toCommandSegments(body.toLowerCase().split("\n"));

  const kinds = new Set<ScriptKind>();
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(lowerName)) kinds.add(rule.kind);
  }
  for (const kind of ["setup", "dev", "test", "lint", "typecheck"] as const) {
    if (matchCommands(segments, kind).length > 0) kinds.add(kind);
  }

  return kinds.size === 0 ? ["other"] : [...kinds];
}

/** `npm run lint`, `npm test`, `pnpm lint`, `yarn lint`, `bun run lint`: a call to another script. */
const RUN_SCRIPT = /^(?:npm|pnpm|yarn|bun)(?: run| run-script)? ([a-z0-9@][\w:.@/-]*)/;
/** `npm-run-all -s lint test`, `run-s lint test`, `run-p "lint:*"`. */
const RUN_ALL = /^(?:npm-run-all|run-s|run-p)\s+(.+)$/;
/** Composer's `@lint` reference to another script. */
const COMPOSER_REFERENCE = /^@([\w:.-]+)$/;

/** How far an aggregate script is followed, e.g. `check` → `verify` → `test`. */
const MAX_SCRIPT_DEPTH = 5;

/**
 * Names of scripts that the given command segments call, lowercased.
 * Globs such as `lint:*` are kept as written and matched by {@link scriptNameMatches}.
 */
export function invokedScriptNames(segments: readonly string[]): string[] {
  const names: string[] = [];
  for (const segment of segments) {
    const runAll = RUN_ALL.exec(segment);
    if (runAll?.[1] !== undefined) {
      for (const token of runAll[1].split(/\s+/)) {
        const name = token.replace(/^["']|["']$/g, "");
        if (name !== "" && !name.startsWith("-")) names.push(name);
      }
      continue;
    }
    const name = RUN_SCRIPT.exec(segment)?.[1] ?? COMPOSER_REFERENCE.exec(segment)?.[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

export function scriptNameMatches(reference: string, name: string): boolean {
  const lowerName = name.toLowerCase();
  if (!reference.includes("*")) return reference === lowerName;
  const escaped = reference.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(lowerName);
}

/**
 * Adds the kinds of the scripts each script calls, so `check: "npm run typecheck && npm test"`
 * counts as both. Cycles and deep chains stop at {@link MAX_SCRIPT_DEPTH}.
 */
function withCalledKinds(scripts: readonly { script: DiscoveredScript; calls: readonly string[] }[]): DiscoveredScript[] {
  const resolve = (index: number, depth: number, visiting: Set<number>): Set<ScriptKind> => {
    const entry = scripts[index];
    const kinds = new Set<ScriptKind>(entry?.script.kinds ?? []);
    if (!entry || depth >= MAX_SCRIPT_DEPTH) return kinds;
    visiting.add(index);
    for (const reference of entry.calls) {
      for (const [other, candidate] of scripts.entries()) {
        if (visiting.has(other) || !scriptNameMatches(reference, candidate.script.name)) continue;
        for (const kind of resolve(other, depth + 1, visiting)) kinds.add(kind);
      }
    }
    visiting.delete(index);
    if (kinds.size > 1) kinds.delete("other");
    return kinds;
  };

  return scripts.map(({ script }, index) => ({ ...script, kinds: [...resolve(index, 0, new Set())] }));
}

function scriptBody(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  // Composer allows an array of commands for a single script name.
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string").join("\n");
  return undefined;
}

async function readManifestScripts(
  context: RepositoryContext,
  source: string,
  toCommand: (name: string) => string,
): Promise<DiscoveredScript[]> {
  const raw = await context.readTextFile(source, SCRIPT_FILE_MAX_BYTES);
  if (raw === undefined) return [];

  const parsed = safeParseJson(raw);
  if (!isRecord(parsed) || !isRecord(parsed.scripts)) return [];

  const entries = Object.entries(parsed.scripts).flatMap(([name, value]) => {
    const body = scriptBody(value);
    if (body === undefined) return [];
    const calls = invokedScriptNames(toCommandSegments(body.toLowerCase().split("\n")));
    return [{ script: { name, command: toCommand(name), source, kinds: classify(name, body) }, calls }];
  });
  return withCalledKinds(entries);
}

/** `target:` at the start of a line, excluding `VAR := value` assignments. */
const MAKE_TARGET = /^([A-Za-z0-9][A-Za-z0-9._%-]*)\s*:(?!=)/;
const JUST_RECIPE = /^([a-z0-9][A-Za-z0-9._-]*)(?:\s+[^:=\n]*)?:(?!=)/;

/**
 * Extracts targets and their recipe bodies from Make/just files.
 *
 * This is a line-level scan, not a build-system implementation: includes,
 * conditionals, and variable expansion are deliberately ignored.
 */
function parseTargets(
  raw: string,
  source: string,
  pattern: RegExp,
  toCommand: (name: string) => string,
): DiscoveredScript[] {
  const scripts: DiscoveredScript[] = [];
  const lines = raw.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (line.startsWith("\t") || line.startsWith(" ") || line.trimStart().startsWith("#")) continue;

    const name = pattern.exec(line)?.[1];
    if (name === undefined || name.startsWith(".")) continue;

    const body: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const recipeLine = lines[next] ?? "";
      if (recipeLine.trim() === "") continue;
      if (!recipeLine.startsWith("\t") && !recipeLine.startsWith("  ")) break;
      body.push(recipeLine.trim());
    }

    scripts.push({
      name,
      command: toCommand(name),
      source,
      kinds: classify(name, body.join("\n")),
    });
  }

  return scripts;
}

async function readTargets(
  context: RepositoryContext,
  names: readonly string[],
  pattern: RegExp,
  toCommand: (name: string) => string,
): Promise<DiscoveredScript[]> {
  const source = names.find((name) => context.files.has(name));
  if (source === undefined) return [];

  const raw = await context.readTextFile(source, SCRIPT_FILE_MAX_BYTES);
  if (raw === undefined) return [];

  return parseTargets(raw, source, pattern, toCommand);
}

/**
 * Validation entry points defined by the repository itself.
 *
 * Ordering follows the source list below so that evidence never depends on
 * filesystem traversal order.
 */
export const discoverScripts = perContext(
  async (context: RepositoryContext): Promise<DiscoveredScript[]> => {
    const groups = await Promise.all([
      readManifestScripts(context, "package.json", (name) =>
        name === "test" || name === "start" ? `npm ${name}` : `npm run ${name}`,
      ),
      readManifestScripts(context, "composer.json", (name) => `composer ${name}`),
      readTargets(context, MAKEFILE_NAMES, MAKE_TARGET, (name) => `make ${name}`),
      readTargets(context, JUSTFILE_NAMES, JUST_RECIPE, (name) => `just ${name}`),
    ]);

    return groups.flat();
  },
);

/** Discovered scripts that provide a command of `kind`. */
export function scriptsOfKind(
  scripts: readonly DiscoveredScript[],
  kind: CommandKind,
): DiscoveredScript[] {
  return scripts.filter((script) => script.kinds.includes(kind));
}
