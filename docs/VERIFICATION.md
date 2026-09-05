# Verification — 2026-09-05

Scope: current local source, macOS, bundled Playwright/Chromium, iOS 26.5 simulator and Android API 36 emulator. Native tests use the synthetic BugDrop demo apps, not production/customer apps.

## Passed

- 11 Node unit tests; JavaScript syntax and manifest asset checks.
- Chrome extension with production permissions: actual activeTab grant, clicks, input omission, console/runtime errors, unsuccessful fetch/XHR, SPA navigation, screenshot, stop, event removal, clipboard, JSON/Markdown downloads, full navigation stop and deletion.
- Desktop iOS and Android: device/app selection, scoped app logs, synthetic secret masking, screenshot, video metadata/playback readiness, stop, reviewed JSON and Markdown downloads.
- Editing a mobile report resets export consent; evidence can be deselected.
- Two successive captures receive distinct URLs; the previous report remains reachable within the controller session.
- API rejects missing session token, foreign Origin, incorrect Host, invalid capture access, missing device, and stop without recording.
- A fresh source copy runs CLI help, syntax checks and packaging without npm dependencies.

## Fixes made during verification

- Capture URLs previously pointed at whichever report was current. URLs now include the capture ID and resolve to that capture throughout the controller session.
- Background polling previously cleared action error messages. Polling now preserves them.
- HTTP access tests now run in GitHub Actions.

## Limits and observation

One Android desktop start attempt timed out before recording; an instrumented repeat passed, including two successive recordings. The earlier failure was not reproduced and its cause is unconfirmed. Treat this as an open startup-stability observation, not a resolved issue.

No validation on physical devices, Windows/Linux hosts, every Android/iOS version, arbitrary third-party apps, or automatic native touch/network capture. Native media are not automatically redacted. iOS stdout-only logs and Android app process restarts have the documented limitations. A source-copy check is not a test of a published GitHub release or npm package; neither is published yet.

Report links are scoped to a controller session. After a controller restart, previous reports can still be opened from their capture directories.
