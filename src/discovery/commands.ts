/**
 * Recognition of validation commands across ecosystems.
 *
 * The catalog is intentionally command-shaped rather than keyword-shaped:
 * matching happens against normalized command segments anchored at the start,
 * so `color: black;` inside a CSS example is not mistaken for the Black
 * formatter, while `sudo npx eslint .` still resolves to ESLint.
 *
 * Nothing here executes, resolves, or interprets a command. Patterns exist only
 * to classify text that a repository already contains.
 */

export type CommandKind = "setup" | "dev" | "test" | "lint" | "typecheck";

/** Kinds that count as quality validation for `instructions.quality`. */
export const QUALITY_KINDS: readonly CommandKind[] = ["lint", "typecheck"];

export interface CommandPattern {
  /**
   * Stable, human-readable label. Evidence reports this rather than the matched
   * documentation line, so detector output never echoes repository text.
   */
  label: string;
  kinds: readonly CommandKind[];
  /** Matched against normalized lowercase segments; must be non-global. */
  pattern: RegExp;
}

/** `a && b`, `a; b`, `a | b` all define separate commands. */
const SEGMENT_SPLIT = /&&|\|\||[;|]/;
const SHELL_PROMPT = /^[$>%]\s*/;
const ENV_PREFIX = /^(?:[a-z_][a-z0-9_]*=\S*\s+)+/;
/** Wrappers that delegate to the real command, e.g. `uv run pytest`. */
const RUNNER_PREFIX =
  /^(?:sudo|npx|pnpm dlx|yarn dlx|bunx|uvx|uv run|poetry run|pipenv run|pdm run|hatch run|rye run|bundle exec|dotnet tool run)\s+/;
const PATH_PREFIX = /^(?:[.\w@-]+\/)+/;

/**
 * Normalizes raw code lines into comparable command segments.
 *
 * A path-stripped variant is emitted alongside the original so that both
 * `./vendor/bin/phpstan analyse` and `phpstan analyse` are recognizable, while
 * patterns that care about the path (`./scripts/setup`) still see it.
 */
export function toCommandSegments(lines: readonly string[]): string[] {
  const segments = new Set<string>();

  for (const line of lines) {
    for (const rawSegment of line.split(SEGMENT_SPLIT)) {
      let segment = rawSegment.trim().replace(SHELL_PROMPT, "").replace(ENV_PREFIX, "").trim();

      let previous = "";
      while (segment !== previous) {
        previous = segment;
        segment = segment.replace(RUNNER_PREFIX, "").trim();
      }

      if (segment === "") continue;
      segments.add(segment);

      const stripped = segment.replace(PATH_PREFIX, "");
      if (stripped !== "" && stripped !== segment) segments.add(stripped);
    }
  }

  return [...segments];
}

export const COMMAND_PATTERNS: readonly CommandPattern[] = [
  // --- dependency and environment setup --------------------------------------
  { label: "npm install", kinds: ["setup"], pattern: /^npm (ci|install|i)\b/ },
  { label: "pnpm install", kinds: ["setup"], pattern: /^pnpm (install|i)\b/ },
  { label: "yarn install", kinds: ["setup"], pattern: /^yarn( install)?$/ },
  { label: "bun install", kinds: ["setup"], pattern: /^bun (install|i)\b/ },
  { label: "npm run setup", kinds: ["setup"], pattern: /^npm run (setup|bootstrap)\b/ },
  { label: "composer install", kinds: ["setup"], pattern: /^composer (install|update)\b/ },
  { label: "pip install", kinds: ["setup"], pattern: /^(pip3?|python3? -m pip) install\b/ },
  { label: "uv sync", kinds: ["setup"], pattern: /^uv (sync|venv|pip install)\b/ },
  { label: "poetry install", kinds: ["setup"], pattern: /^poetry install\b/ },
  { label: "pipenv install", kinds: ["setup"], pattern: /^pipenv (install|sync)\b/ },
  { label: "conda environment setup", kinds: ["setup"], pattern: /^conda (env (create|update)|create)\b/ },
  { label: "bundle install", kinds: ["setup"], pattern: /^bundle install\b/ },
  { label: "cargo build", kinds: ["setup"], pattern: /^cargo (build|fetch)\b/ },
  { label: "go mod download", kinds: ["setup"], pattern: /^go (mod (download|tidy)|get)\b/ },
  // Like `cargo build`, these fetch dependencies as part of the first build.
  { label: "go build", kinds: ["setup"], pattern: /^go build\b/ },
  { label: "pub get", kinds: ["setup"], pattern: /^(flutter|dart) pub get\b/ },
  { label: "swift package resolve", kinds: ["setup"], pattern: /^swift package (resolve|update)\b/ },
  { label: "swift build", kinds: ["setup"], pattern: /^swift build\b/ },
  { label: "gradle build", kinds: ["setup"], pattern: /^(\.\/)?gradlew? (build|assemble)\b/ },
  { label: "maven install", kinds: ["setup"], pattern: /^(mvn|(\.\/)?mvnw)\b.*\binstall\b/ },
  { label: "dotnet restore", kinds: ["setup"], pattern: /^dotnet restore\b/ },
  { label: "dotnet build", kinds: ["setup"], pattern: /^dotnet build\b/ },
  { label: "mix deps.get", kinds: ["setup"], pattern: /^mix deps\.get\b/ },
  { label: "make setup", kinds: ["setup"], pattern: /^make (setup|install|bootstrap|init|deps)\b/ },
  { label: "just setup", kinds: ["setup"], pattern: /^(just|task) (setup|install|bootstrap)\b/ },
  {
    label: "setup script",
    kinds: ["setup"],
    pattern: /^(\.\/)?(bin|script|scripts)\/(setup|bootstrap|install)\b/,
  },
  { label: "toolchain install", kinds: ["setup"], pattern: /^(asdf|mise|rustup|nvm) (install|use|toolchain)\b/ },
  { label: "nix develop", kinds: ["setup"], pattern: /^nix(-shell| develop)\b/ },
  { label: "docker compose", kinds: ["setup", "dev"], pattern: /^docker[- ]compose\b.*\b(up|build)\b/ },

  // --- running the project locally -------------------------------------------
  { label: "npm run dev", kinds: ["dev"], pattern: /^npm (run )?(dev|start|serve)\b/ },
  { label: "package manager dev server", kinds: ["dev"], pattern: /^(pnpm|yarn|bun) (run )?(dev|start|serve)\b/ },
  { label: "php artisan serve", kinds: ["dev"], pattern: /^php artisan serve\b/ },
  { label: "django development server", kinds: ["dev"], pattern: /^python3? manage\.py runserver\b/ },
  { label: "python application server", kinds: ["dev"], pattern: /^(uvicorn|gunicorn|flask run|fastapi dev)\b/ },
  { label: "cargo run", kinds: ["dev"], pattern: /^cargo run\b/ },
  { label: "go run", kinds: ["dev"], pattern: /^go run\b/ },
  { label: "flutter run", kinds: ["dev"], pattern: /^(flutter|dart) run\b/ },
  { label: "rails server", kinds: ["dev"], pattern: /^rails (s|server)\b/ },
  { label: "make dev", kinds: ["dev"], pattern: /^make (dev|run|serve|start)\b/ },
  { label: "swift run", kinds: ["dev"], pattern: /^swift run\b/ },
  { label: "dotnet run", kinds: ["dev"], pattern: /^dotnet run\b/ },
  { label: "gradle run", kinds: ["dev"], pattern: /^(\.\/)?gradlew? (run|bootrun)\b/ },

  // --- tests ------------------------------------------------------------------
  { label: "npm test", kinds: ["test"], pattern: /^npm (run )?test\b/ },
  { label: "package manager test script", kinds: ["test"], pattern: /^(pnpm|yarn|bun) (run )?test\b/ },
  { label: "javascript test runner", kinds: ["test"], pattern: /^(vitest|jest|mocha|ava|tap|node --test)\b/ },
  { label: "playwright test", kinds: ["test"], pattern: /^playwright test\b/ },
  { label: "cypress", kinds: ["test"], pattern: /^cypress (run|open)\b/ },
  { label: "composer test", kinds: ["test"], pattern: /^composer (run-script )?test\b/ },
  { label: "phpunit/pest", kinds: ["test"], pattern: /^(phpunit|pest)\b/ },
  { label: "php artisan test", kinds: ["test"], pattern: /^php artisan test\b/ },
  { label: "pytest", kinds: ["test"], pattern: /^(pytest|py\.test)\b/ },
  { label: "python test module", kinds: ["test"], pattern: /^python3? -m (pytest|unittest)\b/ },
  { label: "tox/nox", kinds: ["test"], pattern: /^(tox|nox)\b/ },
  { label: "cargo test", kinds: ["test"], pattern: /^cargo (test|nextest)\b/ },
  { label: "go test", kinds: ["test"], pattern: /^go test\b/ },
  { label: "rspec", kinds: ["test"], pattern: /^(rspec|minitest)\b/ },
  { label: "rake/rails test", kinds: ["test"], pattern: /^(rake|rails) test\b/ },
  { label: "dart/flutter test", kinds: ["test"], pattern: /^(flutter|dart) test\b/ },
  { label: "swift test", kinds: ["test"], pattern: /^swift test\b/ },
  { label: "gradle test", kinds: ["test"], pattern: /^(\.\/)?gradlew? (test|check)\b/ },
  { label: "maven test", kinds: ["test"], pattern: /^(mvn|(\.\/)?mvnw)\b.*\b(test|verify)\b/ },
  { label: "dotnet test", kinds: ["test"], pattern: /^dotnet test\b/ },
  { label: "ctest", kinds: ["test"], pattern: /^ctest\b/ },
  { label: "mix test", kinds: ["test"], pattern: /^mix test\b/ },
  { label: "make test", kinds: ["test"], pattern: /^make (test|tests|check)\b/ },
  { label: "just test", kinds: ["test"], pattern: /^(just|task) test\b/ },

  // --- lint and formatting ----------------------------------------------------
  { label: "npm run lint", kinds: ["lint"], pattern: /^npm run (lint|format|fmt|style)\b/ },
  { label: "package manager lint script", kinds: ["lint"], pattern: /^(pnpm|yarn|bun) (run )?(lint|format)\b/ },
  { label: "eslint", kinds: ["lint"], pattern: /^(eslint|oxlint|standard)\b/ },
  { label: "biome", kinds: ["lint"], pattern: /^biome (check|lint|ci|format)\b/ },
  { label: "prettier", kinds: ["lint"], pattern: /^(prettier|stylelint)\b/ },
  { label: "php code style", kinds: ["lint"], pattern: /^(pint|php-cs-fixer|phpcs|phpcbf|rector)\b/ },
  {
    label: "composer lint",
    kinds: ["lint"],
    pattern: /^composer (run-script )?(lint|format|fmt|style|cs|pint)\b/,
  },
  { label: "ruff", kinds: ["lint"], pattern: /^ruff\b/ },
  { label: "python linter", kinds: ["lint"], pattern: /^(flake8|pylint|black|isort)\b/ },
  { label: "cargo clippy", kinds: ["lint"], pattern: /^cargo (clippy|fmt)\b/ },
  { label: "go static analysis", kinds: ["lint", "typecheck"], pattern: /^(golangci-lint|staticcheck|go vet)\b/ },
  { label: "gofmt", kinds: ["lint"], pattern: /^(gofmt|goimports)\b/ },
  { label: "rubocop", kinds: ["lint"], pattern: /^(rubocop|standardrb)\b/ },
  { label: "swiftlint", kinds: ["lint"], pattern: /^(swiftlint|swift-format)\b/ },
  { label: "jvm static analysis", kinds: ["lint"], pattern: /^(ktlint|detekt|spotless|checkstyle|spotbugs)\b/ },
  { label: "gradle lint", kinds: ["lint"], pattern: /^(\.\/)?gradlew? (lint|ktlintcheck|detekt|spotlesscheck)\b/ },
  { label: "dotnet format", kinds: ["lint"], pattern: /^dotnet format\b/ },
  { label: "file linter", kinds: ["lint"], pattern: /^(shellcheck|yamllint|markdownlint|hadolint)\b/ },
  { label: "pre-commit", kinds: ["lint"], pattern: /^pre-commit run\b/ },
  { label: "make lint", kinds: ["lint"], pattern: /^make (lint|fmt|format|style)\b/ },
  { label: "just lint", kinds: ["lint"], pattern: /^(just|task) (lint|fmt|format|style)\b/ },
  { label: "dart format", kinds: ["lint"], pattern: /^(dart|flutter) format\b/ },

  // --- type checking and static analysis --------------------------------------
  { label: "npm run typecheck", kinds: ["typecheck"], pattern: /^npm run (typecheck|type-check|types|tsc)\b/ },
  {
    label: "package manager typecheck script",
    kinds: ["typecheck"],
    pattern: /^(pnpm|yarn|bun) (run )?(typecheck|type-check)\b/,
  },
  { label: "tsc", kinds: ["typecheck"], pattern: /^(tsc|vue-tsc|svelte-check)\b/ },
  { label: "phpstan", kinds: ["typecheck"], pattern: /^(phpstan|larastan|psalm)\b/ },
  {
    label: "composer static analysis",
    kinds: ["typecheck"],
    pattern: /^composer (run-script )?(analyse|analyze|stan|phpstan|types)\b/,
  },
  { label: "mypy", kinds: ["typecheck"], pattern: /^(mypy|pyright|pyre|pytype)\b/ },
  { label: "cargo check", kinds: ["typecheck"], pattern: /^cargo check\b/ },
  // Dart's analyzer covers both linting and type analysis; ecosystems without a
  // separate type-check command must not be penalized for lacking one.
  { label: "dart analyze", kinds: ["lint", "typecheck"], pattern: /^(dart|flutter) analyze\b/ },
  { label: "sorbet", kinds: ["typecheck"], pattern: /^(srb tc|srb typecheck|sorbet)\b/ },
  { label: "make typecheck", kinds: ["typecheck"], pattern: /^make (typecheck|type-check|types|analyse|analyze)\b/ },
  {
    label: "just typecheck",
    kinds: ["typecheck"],
    pattern: /^(just|task) (typecheck|type-check|types|analyse|analyze)\b/,
  },
];

/**
 * Command patterns of `kind` matched by any segment, in catalog order so that
 * evidence ordering never depends on document ordering.
 */
export function matchCommands(
  segments: readonly string[],
  kind: CommandKind,
): CommandPattern[] {
  return COMMAND_PATTERNS.filter(
    (candidate) =>
      candidate.kinds.includes(kind) &&
      segments.some((segment) => candidate.pattern.test(segment)),
  );
}

/** Distinct kinds of `kinds` that the segments provide a command for. */
export function matchedKinds(
  segments: readonly string[],
  kinds: readonly CommandKind[],
): CommandKind[] {
  return kinds.filter((kind) => matchCommands(segments, kind).length > 0);
}
