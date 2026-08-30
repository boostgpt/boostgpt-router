# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-29

1.0.0 could not be used the way its README described. This release makes the
documented path work.

### Fixed

- **Adapters can be constructed the documented way.** `BaseAdapter`'s constructor
  threw `'BoostGPT instance is required'`, but adapters are built inside the
  `adapters: [...]` array the Router receives — before the Router can inject
  anything. Every quick-start example and both shipped examples threw. The check
  moved to `assertConfigured()`, called by `start()`, and `Router.start()` now
  validates every adapter before starting any of them.

- **The default message path no longer loops forever.** `processMessage()` ran
  `while (attempts < 3)` with no `break` on success and no increment, so a
  successful reply re-entered the loop and called `chat()` again indefinitely,
  billing the caller's BoostGPT account for as long as the process ran. Anyone
  who did not supply their own `onMessage` handler was affected.

- **Retries work.** The failure branch called `sleep()`, which was defined
  nowhere in the package, so the first upstream error became
  `ReferenceError: sleep is not defined` instead of a retry.

- **The package imports under ESM.** `slack.js` used a named import from
  `@slack/bolt`, which is CommonJS, so `import { Router } from '@boostgpt/router'`
  failed with a `SyntaxError` before any of your code ran.

- **`getStatus()`** read `boostgpt.body.project_id`, an internal removed in
  boostgpt 7.0.0. It reads `project_id` now.

- **`addAdapter()`** installed the unwrapped handler, so adapters added after
  `onMessage()` lost `context.router`, `context.boostgpt` and error routing.

- **Returning `null` from a handler falls through to BoostGPT**, as both
  examples describe. It previously returned the null to the adapter, which sent
  an empty message. Adapters now also refuse to send an empty reply.

- **Stale chat parameters removed.** The payload sent `vector` and `channel`;
  neither has existed in the SDK's `chat()` signature for several majors.

### Changed

- **Channel SDKs are optional peer dependencies.** Installing this package no
  longer pulls Discord, Slack, Crisp and WhatsApp for everyone — the last of
  which brings puppeteer and a Chromium download. Install what you use:
  `npm install node-telegram-bot-api`. Each adapter imports its SDK inside
  `start()` and names the missing package if it is absent.

  **`adapter.client` is `null` until `start()` resolves.** Code reaching for the
  underlying client before then must move after `router.start()`.

- **`boostgpt` is a required peer** at `^7.0.0`, so your application and the
  router share one client instance and one version.

### Added

- `memory` and `reasoningMode` adapter options, forwarded to `chat()` as
  `memory` and `reasoning_mode`. Set `reasoningMode: 'agent'` to run BoostGPT's
  server-side tool loop.
- `npm test` runs a smoke suite (`test/smoke.mjs`) covering each fault above.

## [1.0.0] - 2025-11-24

Initial release.
