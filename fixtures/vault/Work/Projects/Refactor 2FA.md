---
tags: [auth, security]
---

# Refactor 2FA

## Problem

SMS codes are being phased out. Move TOTP into the auth service. #backend

## Plan

- [x] Read RFC 6238 ✅ 2026-11-08
- [ ] Agree on the tolerance window 📅 2026-11-11
- [ ] Add unit tests
  - [ ] Clock drift of one step
  - [x] Wrong secret ✅ 2026-11-09
- [ ] Review with the team 📅 2026-11-09

## Verification

```ts
// - [ ] not a task: inside a code block
export function verify(code: string) {}
```

See [[Meetings]] and [[Onboarding#Week 1|the onboarding plan]].
