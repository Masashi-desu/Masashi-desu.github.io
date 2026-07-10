---
name: use-repo-temp-artifacts
description: Route generated local-only artifacts into the repository's ignored `.temp/` workspace. Use when creating design QA reports, screenshots, overlays, visual comparisons, browser evidence, logs, traces, render exports, scratch downloads, caches, or other generated files that are not product code and must not enter release commits.
---

# Use Repository Temp Artifacts

## Rules

- Resolve the repository root with `git rev-parse --show-toplevel` before choosing an output path.
- Put local-only generated artifacts under `.temp/<task-slug>/`.
- Group outputs into `reports/`, `evidence/`, `downloads/`, or another concise subdirectory when useful.
- Never create `design-qa.md`, `design-qa-assets/`, screenshots, overlays, traces, or similar transient outputs at the repository root or under `site/`.
- Never stage or commit `.temp/` contents.
- Do not move user-provided source files unless the task explicitly authorizes it. Put generated copies or derivatives in `.temp/`.
- Promote an artifact to a tracked path only when the user explicitly requests it or when it is required as product code, a runtime asset, a test fixture, or maintained documentation. State the reason for promotion.

## Procedure

1. Read `README.md` and `AGENTS.md` and classify the output as tracked project content or local-only evidence.
2. Choose a stable kebab-case task slug, for example `.temp/retreatscreen-design-qa/`.
3. Create the task directory and write all generated reports and evidence beneath it.
4. Verify ignore coverage with `git check-ignore -v .temp/<task-slug>/<artifact>`.
5. Reference temporary evidence by its `.temp/` path in the current task report, without adding it to release scope.
6. Before staging or releasing, run `git status --short` and confirm that no temporary artifact exists outside `.temp/`.
7. If an existing temporary artifact is misplaced and belongs to the current task, move it into `.temp/<task-slug>/` while preserving its internal organization.

## Examples

- Store a design review at `.temp/retreatscreen-design-qa/reports/design-qa.md`.
- Store comparison images at `.temp/retreatscreen-design-qa/evidence/reference-vs-implementation.png`.
- Keep a downloaded inspection input at `.temp/<task-slug>/downloads/` unless the user identifies it as a tracked source asset.

## References

- `../../../README.md`
- `../../../AGENTS.md`
- `../../../.gitignore`
