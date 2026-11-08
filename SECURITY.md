# Security Policy

## Supported versions

Piw is pre-1.0. Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub Security Advisories](https://github.com/mnml-tools/piw/security/advisories/new)
("Report a vulnerability"), with steps to reproduce and the affected version and OS. You should
get an answer within 7 days.

Never include your real notes or tasks in a report. Use made-up content to demonstrate the
problem.

## Scope

Piw has no accounts, no telemetry and makes no network requests. Its data is one SQLite file in
your user's app-data directory, protected by your OS account permissions but **not encrypted**;
use full-disk encryption if your device may be lost or shared. Packages are unsigned, so verify
them against the release's `SHA256SUMS.txt` before installing.

The security boundaries (CSP, per-window capabilities, navigation lock, content handling) are
described in the [architecture guide](docs/architecture.md#security-boundaries).
