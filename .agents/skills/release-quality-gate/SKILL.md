---
name: release-quality-gate
description: Enforce the Masahi Desu User Site pre-release quality gate. Use before pushing or releasing main, or when changing release, test, browser-verification, GitHub Pages, WebKit, or iPhone Simulator procedures.
---

# Release Quality Gate

Before pushing `main`, review the complete diff and select local checks by change impact. Local validation is the primary gate; full validation is required only under the escalation conditions below. Minimal remote CI never substitutes for required local checks. Treat any failure, skipped required check, or unavailable required check as a blocker. Record the selection and results; do not require unrelated publication checks for documentation or CI-only changes.

## Procedure

1. Read `../../../CONTRIBUTING.md`, especially **リリース品質ゲート**, and `../../../AGENTS.md`.
2. Fetch `origin/main`; confirm the local release is a fast-forward and review `git status --short` plus the complete diff.
3. Classify publication scope separately from test scope. For mixed changes, take the union of the required checks:
   - **Documentation and policy only:** `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `THIRD_PARTY_LICENSES.md`, `docs/**`, and `.agents/**` with no executable, test, dependency, workflow, or public-source changes.
   - **CI and verification only:** `tests/**`, `tools/**`, `.github/workflows/**`, test/development scripts, and verification-only dependencies with no public build input changes.
   - **Publication-affecting:** changes to `site/**`, `vite.config.mjs`, runtime dependencies, Vite, the build script, or the Vite/three.js dependency graph in `package-lock.json`.
   - Package metadata such as description-only changes require only classification and document validation; they do not require CI or deployment.
4. Trace changed behavior through direct and indirect consumers, shared CSS, generated assets, configuration, related interactions and browser/device environments. Shared components require related behavior checks at every consumer, not every unrelated feature on those pages. Add a focused regression or concrete manual check when existing coverage is absent. Do not infer sufficient coverage from filenames alone.
5. Select and execute the gate:
   - Documentation/policy or package metadata only: `npm run test:docs`, reference/diff review and `git diff --check`.
   - CI/verification only: `npm run test:release-base` plus checks for the changed test logic or command/workflow wiring. Execute modified test bodies. Pure aggregation changes can be checked through the script dependency graph when constituent commands are unchanged; record that evidence. No publication visual or Simulator checks are required.
   - Publication-affecting: `npm run test:release-base`, `npm run build`, related automated tests and the affected screen/environment checks below. Publication scope alone does not require the full suite.
   - Shared scroll input changes: `npm run test:release-scroll` groups core, generated bundle, packed-library Chromium/WebKit, all three consumers' wheel/touch regressions and mobile home/catalog gestures. Add layout, rendering synchronization and native Safari checks when affected; this group is not a complete visual gate.
6. Escalate to the full gate if impact cannot be bounded, build infrastructure/dependency/global CSS changes have broad impact, or a large refactor crosses multiple features. On macOS run `npm test` (`test:release-local`), retaining every `test:full` suite and `test:local-environment` check. Publication-affecting full gates also require production build and affected PC/Mobile Safari screen checks. A shared component with identified consumers and covered behavior can still use selected validation.
7. Apply `$use-repo-temp-artifacts`. Record the base revision and tested revision/diff, changed behavior and consumers, selected commands/environments, selection reasons, results, and reasons for major omissions under `.temp/<task-slug>/reports/`.
8. If tracked files change after validation, assess the additional diff and rerun affected checks. Reuse unaffected results only with recorded evidence that their source, dependencies and environment are unchanged. If uncertain, broaden validation. Before push, review the final diff, `git status --short` and `git diff --check`; confirm the final change is covered and no temporary evidence is staged.

## Screen and Environment Checks

1. When a public change affects display or interaction, serve the production output with `npm run preview`. Apply `$browser-noninvasive-verification` before any browser work. Use an isolated PC browser when desktop behavior is affected.
2. Mobile layout, viewport, safe-area, touch or Safari-specific changes require related WebKit tests and iPhone Simulator Mobile Safari checks. Documentation, CI configuration and desktop-only changes do not automatically require a Simulator.
3. Inspect the affected pages' relevant layout, interaction, visual effects and media/LiquidGL, plus horizontal overflow and console errors. Run related native codec/GPU/frame tests on macOS when those functions are affected; Linux CI or Chromium mobile emulation cannot replace them.
4. For Simulator checks, record existing booted devices and select an available shutdown iPhone using `xcrun simctl list devices available`. Run `xcrun simctl boot <UDID>` and `xcrun simctl bootstatus <UDID> -b`, then `xcrun simctl openurl <UDID> <URL>`. Capture with `xcrun simctl io <UDID> screenshot <path>` under `.temp/<task-slug>/evidence/`. Follow the noninvasive skill for input testing and record any physical-device-specific limitations.
5. Shut down only the Simulator booted for the check. Keep all evidence ignored and outside the staged diff.

## CI Boundary

The normal Pages workflow does not start for documentation-and-policy-only pushes. CI-and-verification-only pushes run minimal `npm run test:ci` but skip publication build and deploy. The automated checks still perform a validation build. Publication-affecting pushes run minimal CI before build and deploy, and CI failure blocks publication.

`test:ci` runs non-browser checks plus packed-library fixtures in Chromium and WebKit. It retains clean-checkout build, types, CSS and input compatibility checks without repeating full-page, multi-viewport, animation, media or 3D tests. `test:release-base` is only a lightweight common check, not automatic proof of sufficient coverage. `npm test` remains an explicit full-suite entry point depending on `test:full`, never on reduced CI. `test:quality-gate-contract` checks the selectable groups, retained full coverage, CI separation and both deployment workflows.

The TypeFetch appcast workflow owns validation, mutation, build, and deploy for appcast-only updates. It has no local gate for the generated XML: run `npm run test:typefetch-appcast` (generator tests, build and canonical/legacy output verification) before commit, then rebuild the committed revision and verify XML again before deploy. Do not install Playwright or run full site tests on this appcast-only path. The normal Pages workflow excludes `site/products/TypeFetch/appcast.xml`-only pushes to prevent duplicate deployment.

When timing a change, record the selected local commands and wall time, the remote `quality-gate` job duration, and total workflow duration separately under `.temp/<task-slug>/reports/`, with commit and run IDs. Compare equivalent validation scopes; selected checks versus a full suite or a CI-only push versus a complete deployment are not equivalent performance measurements.
