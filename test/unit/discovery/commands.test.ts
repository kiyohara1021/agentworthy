import { describe, expect, it } from "vitest";

import {
  COMMAND_PATTERNS,
  matchCommands,
  matchedKinds,
  toCommandSegments,
} from "../../../src/discovery/commands.js";

describe("toCommandSegments", () => {
  it("splits chained commands", () => {
    expect(toCommandSegments(["npm ci && npm test"])).toStrictEqual(["npm ci", "npm test"]);
  });

  it("strips prompts, environment assignments, and runner wrappers", () => {
    expect(toCommandSegments(["$ ci=true uv run pytest"])).toStrictEqual(["pytest"]);
    expect(toCommandSegments(["sudo npx eslint ."])).toStrictEqual(["eslint ."]);
  });

  it("keeps both the original and the path-stripped form", () => {
    expect(toCommandSegments(["./vendor/bin/phpstan analyse"])).toStrictEqual([
      "./vendor/bin/phpstan analyse",
      "phpstan analyse",
    ]);
  });

  it("ignores empty segments", () => {
    expect(toCommandSegments(["", "   ", "$ "])).toStrictEqual([]);
  });
});

describe("matchCommands", () => {
  it("recognizes test commands across ecosystems", () => {
    const cases: Record<string, string> = {
      "npm test": "npm test",
      "composer test": "composer test",
      pytest: "pytest -q",
      "cargo test": "cargo test",
      "go test": "go test ./...",
      "dart/flutter test": "flutter test",
      "make test": "make test",
      "php artisan test": "php artisan test",
    };

    for (const [label, command] of Object.entries(cases)) {
      expect(matchCommands(toCommandSegments([command]), "test").map((p) => p.label)).toContain(label);
    }
  });

  it("recognizes setup commands across ecosystems", () => {
    const commands = ["npm ci", "composer install", "uv sync", "bundle install", "flutter pub get", "go mod download"];

    for (const command of commands) {
      expect(matchCommands(toCommandSegments([command]), "setup")).not.toHaveLength(0);
    }
  });

  it("counts a first build that fetches dependencies as setup", () => {
    for (const command of ["swift build", "swift build -c release", "go build ./...", "dotnet build", "cargo build"]) {
      expect(matchCommands(toCommandSegments([command]), "setup"), command).not.toHaveLength(0);
    }
    expect(matchCommands(toCommandSegments(["swift test"]), "setup")).toHaveLength(0);
  });

  it("anchors patterns so prose and code samples are not commands", () => {
    // `black` is a formatter, but also a colour in a CSS example.
    expect(matchCommands(toCommandSegments(["color: black;"]), "lint")).toHaveLength(0);
    expect(matchCommands(toCommandSegments(["black src"]), "lint")).not.toHaveLength(0);

    expect(matchCommands(toCommandSegments(["we run a lot of tests"]), "test")).toHaveLength(0);
  });

  it("counts a combined analyzer for both quality kinds", () => {
    expect(matchedKinds(toCommandSegments(["dart analyze"]), ["lint", "typecheck"])).toStrictEqual([
      "lint",
      "typecheck",
    ]);
  });

  it("returns matches in catalog order regardless of input order", () => {
    const forward = matchCommands(toCommandSegments(["npm test", "pytest"]), "test");
    const reverse = matchCommands(toCommandSegments(["pytest", "npm test"]), "test");

    expect(forward.map((pattern) => pattern.label)).toStrictEqual(
      reverse.map((pattern) => pattern.label),
    );
  });

  it("uses non-global patterns so matching has no hidden state", () => {
    for (const { pattern } of COMMAND_PATTERNS) {
      expect(pattern.global).toBe(false);
    }
  });
});
