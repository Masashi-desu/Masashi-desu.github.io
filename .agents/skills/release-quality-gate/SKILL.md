---
name: release-quality-gate
description: Enforce the Masahi Desu User Site pre-release quality gate. Use before pushing or releasing main, or when changing release, test, browser-verification, GitHub Pages, WebKit, or iPhone Simulator procedures.
---

# Release Quality Gate

Apply every gate below before pushing `main`. Treat any failure, skipped check, or unavailable check as a release blocker. If a tracked file changes after validation, restart from step 1.

## Procedure

1. Read `../../../README.md`, especially **リリース品質ゲート**, and `../../../AGENTS.md`.
2. Fetch `origin/main`; confirm the local release is a fast-forward and review `git status --short` plus the complete diff.
3. Run `npm test`. Confirm the grouped `test:pc-browser` and `test:webkit` suites both pass; do not substitute Chromium emulation for WebKit.
4. Run `npm run build`, then serve the production output with `npm run preview`.
5. Before visual browser work, use `$browser-noninvasive-verification`. Use an isolated desktop browser at a normal PC viewport and inspect every affected page for layout, interaction, visual effects, horizontal overflow, and console errors.
6. Use `$use-repo-temp-artifacts` and save browser evidence only under `.temp/<task-slug>/evidence/`.
7. Select an available iPhone with `xcrun simctl list devices available`. Boot it with the literal command `xcrun simctl boot <UDID>` and wait with `xcrun simctl bootstatus <UDID> -b`.
8. Open the production preview in that Simulator's Mobile Safari with `xcrun simctl openurl <UDID> <URL>`. Inspect every affected page for layout, interaction, visual effects, safe areas, horizontal overflow, and Safari-specific failures. Capture evidence with `xcrun simctl io <UDID> screenshot <path>`.
9. Shut down only the Simulator booted for this check. Confirm all evidence remains ignored and outside the staged diff.
10. Re-run `git status --short` and `git diff --check`. Push `main` only when every gate passed and no tracked file changed afterward.

## CI Boundary

Every workflow that updates `main` or deploys Pages must run `npm test` before mutation, build, and deploy. CI failure blocks the commit or publication. Linux workflows repeat Chromium and WebKit automation but cannot replace the mandatory local PC visual check or the `xcrun simctl boot` Mobile Safari check.
