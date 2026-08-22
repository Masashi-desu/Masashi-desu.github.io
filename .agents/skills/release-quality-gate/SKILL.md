---
name: release-quality-gate
description: Enforce the Masahi Desu User Site pre-release quality gate. Use before pushing or releasing main, or when changing release, test, browser-verification, GitHub Pages, WebKit, or iPhone Simulator procedures.
---

# Release Quality Gate

Before pushing `main`, classify the complete diff and run the strongest applicable gate below. Treat any failure, skipped required check, or unavailable required check as a blocker. Do not run publication-only checks for documentation-only changes. If a tracked file changes after validation, restart at classification.

## Procedure

1. Read `../../../CONTRIBUTING.md`, especially **リリース品質ゲート**, and `../../../AGENTS.md`.
2. Fetch `origin/main`; confirm the local release is a fast-forward and review `git status --short` plus the complete diff.
3. Classify the diff. Mixed changes use the strongest applicable class:
   - **Documentation and policy only:** `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `THIRD_PARTY_LICENSES.md`, `docs/**`, and `.agents/**` with no executable, test, dependency, workflow, or public-source changes.
   - **CI and verification only:** `tests/**`, `tools/**`, `.github/workflows/**`, test/development scripts, and verification-only dependencies with no public build input changes.
   - **Publication-affecting:** changes to `site/**`, `vite.config.mjs`, runtime dependencies, Vite, the build script, or the Vite/three.js dependency graph in `package-lock.json`.
   - Package metadata such as description-only changes require only classification and document validation; they do not require CI or deployment.
4. For documentation and policy only, run `npm run test:docs` and `git diff --check`. Review all references and the rendered Markdown source. Skip `npm test`, production build, desktop-browser verification, and iPhone Simulator because the Pages artifact cannot change.
5. For CI and verification only, run `npm run test:ci`. If the diff changes macOS-specific codec, GPU, WebGL, or real-time media checks, also run the affected `npm run test:local-environment` coverage. Skip production build and visual browser checks when no publication input changed.
6. For publication-affecting changes, run the complete publication gate:
   1. On macOS, run `npm test` (`test:release-local`). Confirm its `test:ci` phase passes the grouped `test:pc-browser` and `test:webkit` suites, then confirm `test:local-environment` passes the native H.264, LiquidGL video-frame/texture, and WebGL context checks. Do not substitute CI, Chromium emulation, or Linux WebKit for the local environment-dependent phase.
   2. Run `npm run build`, then serve the production output with `npm run preview`.
   3. Before visual browser work, use `$browser-noninvasive-verification`. Use an isolated desktop browser at a normal PC viewport and inspect every affected page for layout, interaction, visual effects, horizontal overflow, and console errors.
   4. Use `$use-repo-temp-artifacts` and save browser evidence only under `.temp/<task-slug>/evidence/`.
   5. Select an available iPhone with `xcrun simctl list devices available`. Boot it with the literal command `xcrun simctl boot <UDID>` and wait with `xcrun simctl bootstatus <UDID> -b`.
   6. Open the production preview in that Simulator's Mobile Safari with `xcrun simctl openurl <UDID> <URL>`. Inspect every affected page for layout, interaction, visual effects, safe areas, horizontal overflow, and Safari-specific failures. Capture evidence with `xcrun simctl io <UDID> screenshot <path>`.
   7. Shut down only the Simulator booted for this check. Confirm all evidence remains ignored and outside the staged diff.
7. Re-run `git status --short` and `git diff --check`. Push `main` only when every required gate for the classified diff passed and no tracked file changed afterward.

## CI Boundary

The normal Pages workflow does not start for documentation-and-policy-only pushes. CI-and-verification-only pushes run `npm run test:ci` but skip build and deploy. Publication-affecting pushes run `npm run test:ci` before build and deploy, and CI failure blocks publication.

The TypeFetch appcast workflow owns validation, mutation, build, and deploy for appcast-only updates. The normal Pages workflow excludes `site/products/TypeFetch/appcast.xml`-only pushes to prevent duplicate CI and deployment.

Linux workflows repeat deterministic Chromium and WebKit automation but intentionally exclude native H.264 decoding, GPU/WebGL implementation checks, and real-time video-frame assertions. CI cannot replace `test:local-environment`, the local PC visual check, or the `xcrun simctl boot` Mobile Safari check when the diff is publication-affecting.
