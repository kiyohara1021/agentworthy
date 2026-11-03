# Scoring Model

## Purpose

The Agent Readiness Score is a transparent heuristic for repository preparedness.

It is not a guarantee that coding agents will produce correct code.

The score should reward repository characteristics that reduce ambiguity, improve validation, and make safe modification easier.

## Principles

The scoring system must be:

- deterministic
- documented
- explainable
- reasonably ecosystem-neutral
- resistant to trivial score gaming
- based on observable repository evidence

A file existing is not always enough. Where practical, detectors should verify useful signals inside the file.

## Score range

Overall score:

```text
0–100
```

Suggested interpretation:

```text
90–100  Excellent
75–89   Good
60–74   Fair
40–59   Needs improvement
0–39    Poor
```

Do not present these labels as scientific measurements.

## Categories

### Instructions — 30 points

#### `instructions.agents-md` — 10

Goal: coding-agent-specific guidance is discoverable.

Suggested scoring:

```text
AGENTS.md exists                              +3
contains development/setup guidance          +2
contains test/validation guidance             +2
contains project-specific constraints         +2
contains useful scoped/nested guidance        +1
```

Do not grant full points to an empty or boilerplate-only file.

#### `instructions.setup` — 5

Repository explains how a developer or agent can prepare the project.

Suggested scoring:

```text
documented install/dependency command         +3
documented runtime/toolchain requirement      +1
documented local run/dev command              +1

setup implied but undocumented                 1   (instead of the above)
```

#### `instructions.tests` — 5

A developer can determine how to run the relevant tests.

Suggested scoring:

```text
documented test command                       +3
dedicated testing section                     +1
guidance on when/how to run the tests         +1

tests exist but are undocumented               1   (instead of the above)
```

#### `instructions.quality` — 5

Lint, format, type-check, static-analysis, or equivalent validation guidance is documented.

Suggested scoring:

```text
documented quality command                    +3
backed by configured tooling or a script      +1
explained under a quality/validation section  +1

tooling exists but is undocumented             1   (instead of the above)
```

This check is not applicable to a repository with no source files and no project
metadata, and is then excluded from the denominator.

#### `instructions.architecture` — 5

A useful high-level system or repository map exists.

Examples:

- `docs/architecture.md`, or documents under `docs/architecture/`
- architecture section in README (English or Japanese headings, e.g. `## アーキテクチャ`)
- ADR index
- concise module ownership explanation

Suggested scoring:

```text
substantial architecture document or section  +3
architecture heading with little behind it    +1   (instead of the above)
directory/module map                          +1
ADR index or multiple design documents        +1
```

### Automation — 25 points

#### `automation.tests` — 5

A runnable test command can be inferred from known project metadata or build files.

Suggested scoring:

```text
a test entry point is discoverable            +3
a test suite exists in the repository         +1
CI runs the tests                             +1

testing ecosystem but no clear command         1   (instead of the above)
```

This check is not applicable to a repository with no source files and no project
manifest, and is then excluded from the denominator.

#### `automation.lint` — 5

A lint/format/static-quality command can be inferred.

Suggested scoring:

```text
a lint entry point is discoverable            +3
backed by checked-in tool configuration       +1
CI runs the lint command                      +1

ecosystem check available but not wired up     1   (instead of the above)
```

The warning tier keeps ecosystem conventions in view: Go, Rust, and Dart ship a
static check that runs without configuration, so a repository in those
ecosystems has the capability even when nothing uses it.

Not applicable to a repository with no source files and no project manifest.

#### `automation.typecheck` — 5

A type-check or static-analysis command can be inferred where the ecosystem reasonably supports one.

Suggested scoring:

```text
a type-check entry point is discoverable      +3
backed by checked-in analyzer configuration   +1
CI runs the type check                        +1
```

The detector must avoid unfairly penalizing ecosystems where a separate type-check command is not conventional.

A separate step is expected for PHP, Python, and TypeScript. Other ecosystems are
marked not applicable unless they actually define such a command, so the check
leaves their score alone rather than reducing it.

#### `automation.ci` — 5

CI is present and appears to validate code.

Presence alone may earn partial credit.

Higher confidence requires evidence of test/build/lint execution.

Suggested scoring:

```text
a CI workflow exists                          +2
a test step runs                              +2
a lint, type-check, or build step runs        +1
```

A build shares the third point with static analysis so that a project with
nothing to build is not capped below full marks. CI configuration for a system
that is recognized but not parsed earns the presence points only.

Not applicable to a repository with no source files and no project manifest.

#### `automation.dependencies` — 5

Dependency update or dependency risk automation is configured.

Examples:

- Dependabot
- Renovate
- ecosystem-equivalent automation

Suggested scoring:

```text
dependency update automation is configured    +3
covers a package ecosystem used here          +1
covers CI workflow/action versions            +1

configuration exists but declares no updates   1   (instead of the above)
```

Not applicable when the repository has neither a dependency manifest nor a CI
workflow.

### Repository Context — 25 points

#### `context.readme` — 5

README exists and has useful project description/setup information.

Suggested scoring:

```text
README describes the project                  +2
setup or installation section                 +1
usage or example section                      +1
development, testing, or contributing section +1

README exists but is minimal                   1   (instead of the above)
```

A heading with nothing behind it earns nothing.

#### `context.architecture` — 5

Architecture or design context is discoverable.

This overlaps conceptually with instructions but measures repository context rather than agent-specific guidance.

Avoid double-counting identical evidence where possible.

Suggested scoring:

```text
architecture or design documentation exists   +2
the README references it, or it is in the
  README itself                               +1
directory or module map                       +1
decision records or a second design document  +1
```

Reachability is what separates this check from `instructions.architecture`: a
document the README never references cannot pass here, however good the guidance
inside it is.

#### `context.metadata` — 5

Project identity and important metadata are clear.

Signals may include:

- package description
- license
- repository URL
- supported runtime
- meaningful project name

Suggested scoring:

```text
project name                                  +1
description of what the project is            +1
license                                       +1
repository or homepage URL                    +1
runtime or toolchain constraint               +1
```

A pass needs at least three signals, one of which says what the project is. Each
signal has a source in every supported ecosystem, and the README can supply name
and description, so a missing npm `description` never penalizes a non-Node
project.

#### `context.ignore` — 5

Ignore configuration makes irrelevant repository content easier to avoid.

Signals:

- `.gitignore`
- ecosystem ignores
- AI-specific ignore files where relevant

Suggested scoring:

```text
ignore rules exist                            +2   (+1 when only agent
                                                    ignore files exist)
they exclude the ecosystems' generated output +2
they exclude editor/OS files, or an agent
  ignore file narrows what an agent reads     +1
```

#### `context.generated` — 5

Generated/vendor/build content is clearly separated or excluded.

Examples:

- `node_modules`
- `vendor`
- `.venv`
- `dist`
- `.next`
- `.nuxt`
- `.dart_tool`
- build output
- generated clients

Suggested scoring:

```text
every generated directory present is excluded +3
ignore rules declare the ecosystem's output   +1
no generated content is visible in the index  +1
```

A directory existing is not a failure on its own. `vendor/` is exempt in Go and
Ruby, where a checked-in copy is a supported workflow.

### Safety — 20 points

#### `safety.gitignore` — 5

Basic local/sensitive artifacts are excluded.

Suggested scoring:

```text
.gitignore exists and declares rules          +2
it excludes the ecosystems' build artifacts   +2
it excludes logs, caches, or local overrides  +1

no .gitignore, little produced locally         1   (instead of the above)
```

A repository with no source, no manifest, and no generated directories produces
almost nothing locally, so a missing `.gitignore` is warned rather than failed.

#### `safety.secrets` — 5

Common secret-bearing files are excluded or appropriately templated.

Positive examples:

- `.env` ignored
- `.env.example` committed
- private keys excluded

Suggested scoring:

```text
ignore rules exclude environment files        +2
ignore rules exclude keys and credentials     +2
a committed template documents the settings   +1

key material exposed in a test/fixture path    1   (instead of the above)
a secret-bearing file exposed elsewhere        0   (instead of the above)
```

The detector must never print actual secrets. It never reads a candidate file at
all: classification is by filename, and a finding carries only the path and the
category of file.

#### `safety.security-policy` — 5

`SECURITY.md` or equivalent responsible disclosure/security policy exists.

Suggested scoring:

```text
a security policy exists                      +3
it explains how to report a vulnerability     +1
it states supported versions or a response
  expectation                                 +1

a policy that exists but is nearly empty       1   (instead of the above)
```

#### `safety.lockfile` — 5

A dependency lockfile exists when conventional for the detected ecosystem.

For repositories without applicable dependency management, mark as neutral rather than automatically failing.

Suggested scoring:

```text
a lockfile exists where one is meaningful     +3
every such ecosystem is locked                +1
the lockfile matches the declared manager     +1
```

Locking is meaningful only where the ecosystem has a conventional lockfile *and*
the manifest declares dependencies. A dependency-free project, and an ecosystem
with no conventional lockfile such as Java or .NET, are not applicable and are
excluded from the denominator.

## Finding statuses

### Pass

Evidence strongly satisfies the detector.

### Warning

Partial or ambiguous readiness.

Examples:

- README exists but setup instructions are unclear
- CI exists but no test step is detected

### Fail

Important expected evidence is absent.

### Info

Useful observation that should not directly reduce score.

## Recommendation priority

Suggested mapping:

```text
high
medium
low
```

High-priority examples:

- no test command
- no setup instructions
- committed secret-risk configuration
- no usable project entry documentation

Medium:

- no architecture overview
- incomplete AGENTS.md

Low:

- no SECURITY.md for a small personal sample project
- optional metadata improvements

Priority should consider context and not merely point weight.

### Derivation

A finding produces a recommendation only when acting on it could improve the report:

- the detector attached a recommendation
- the check applies to this repository
- the check left points unearned

A non-applicable check never produces advice, for the same reason it never reduces the score: it was not asked. A check already at full marks has nothing left to recommend.

### Ordering

Recommendation order is a total order, so it depends only on the set of findings and never on the order detectors happened to finish in:

```text
1. priority
2. points recoverable, larger first
3. category order
4. finding id
```

Priority leads because a detector sets it from context. Recoverable points break ties within a priority so the larger win is offered first.

## Avoiding score gaming

The scorer should not blindly reward filenames.

Examples:

Bad:

```text
AGENTS.md exists → full 10 points
```

Better:

```text
AGENTS.md exists                           3
contains actual project instructions       2
contains test guidance                     2
contains constraints                       2
scoped guidance                            1
```

Similarly, a CI file that contains no meaningful validation should not receive full CI points.

## Multi-project repositories

Monorepos require care.

v0.1 may score repository-level readiness primarily while detecting obvious workspace structure.

Future versions may introduce:

- root score
- package/workspace sub-scores
- scoped `AGENTS.md` evaluation

Do not pretend monorepo support is more precise than implemented.

## Missing-applicability behavior

A detector may be:

- applicable
- not applicable
- unknown applicability

A not-applicable check should not unfairly reduce the score.

If category maximums need normalization because of non-applicable checks, normalization must be deterministic and documented.

### Chosen behavior

v0.1 does not renormalize.

A non-applicable check is removed from both the numerator and the denominator. Nothing is redistributed to the remaining checks, and a category is not scaled back up to its documented maximum.

Consequences:

- an applicable check keeps the absolute point value documented above, whatever else applies
- a category with non-applicable checks reports a smaller maximum, and therefore carries proportionally less weight for that repository
- a category with no applicable checks is omitted from the breakdown rather than reported as zero
- a repository with no applicable checks at all scores `0`

Example: a Go repository has no conventional separate type-check step, so `automation.typecheck` is not applicable. Automation reports a maximum of 20 rather than 25, and the overall denominator is 95 rather than 100.

Renormalizing back to a fixed category share would be a second scoring model. Do not add one without changing this document first.

### Budget enforcement

The sum of `maxScore` across a category's detectors — applicable or not — must equal the documented category total.

Scoring rejects findings that exceed it. A detector claiming points the model does not allocate is a defect in the tool, not a property of the analyzed repository, and must not silently produce a wrong score.

## Score calculation

Preferred model:

```text
sum(earned applicable points)
-------------------------------- × 100
sum(max applicable points)
```

Round to nearest integer.

If all standard checks are applicable, the denominator is 100.

## Stability

Scoring changes can materially affect CI.

Therefore:

- detector weight changes require documentation
- JSON schema version and tool version must be emitted
- significant score-model changes should be noted in release notes
- avoid changing weights casually in patch releases

## Validation fixtures

Maintain reference fixtures with expected score ranges.

Examples:

- minimal empty repository
- typical healthy Node project
- healthy Laravel project
- Python package
- repository with strong docs but no CI
- repository with CI but poor instructions
- monorepo fixture

Exact scores may change before 1.0, but regression intent should be explicit.
