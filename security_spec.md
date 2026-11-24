# Security Specification — Classroom Desktop Companion

## 1. Data Invariants
1. **No PII in Classroom Collections**: Student emails, real names, or account metadata are never stored in `rooms`, `signals`, `messages`, or `mutes`.
2. **Room Ownership & Isolation**: Only verified authenticated users (`request.auth.token.email_verified == true`) can interact with rooms. `/rooms` cannot be listed (`allow list: if false`); users can only `get` a specific room if they know its `roomId`.
3. **Teacher Authority**: Only the room's `teacherUid` can increment `resetEpoch`, toggle `chatPaused`, mark messages `resolved`, or manage `/mutes`.
4. **Master Gate & Relational Consistency**: Every `signal` and `message` must reference an existing `/rooms/{roomId}` that already has a valid `teacherUid`, and must copy `roomTeacherUid` accurately so `allow list` enforces query boundaries without `get()` calls.
5. **Chat Pause Enforcement**: Students cannot create new `messages` while `rooms/{roomId}.chatPaused == true`.
6. **Immutable Provenance & Strict Keys**: `createdAt`, `createdBy`, `ownerUid`, `roomId`, `terminalId`, `anonId`, and `roomTeacherUid` are immutable after creation. All writes require exact field allowlists and size bounds.

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Room Read**: `get(/rooms/CS101)` with `auth == null`.
2. **Room Enumeration Scrape**: `list(/rooms)` by any signed-in user.
3. **Shadow Field Injection on Room Create**: `create(/rooms/CS101)` with extra field `{ isAdmin: true }`.
4. **Client Timestamp Forgery**: `create(/rooms/CS101)` with `createdAt: Timestamp(2020-01-01)` instead of `request.time`.
5. **Teacher Hijack**: Student `update(/rooms/CS101)` attempting to overwrite `teacherUid` when `teacherUid != ""`.
6. **Unauthorized Reset**: Non-teacher `update(/rooms/CS101)` incrementing `resetEpoch`.
7. **Non-Monotonic Epoch Tampering**: Teacher `update(/rooms/CS101)` setting `resetEpoch: existing.resetEpoch + 99` or `0`.
8. **Signal Identity Spoofing**: Student A creating `/rooms/CS101/signals/sig1` with `ownerUid: "studentB"`.
9. **Paused Chat Bypass**: Student creating `/rooms/CS101/messages/msg1` when `rooms/CS101.chatPaused == true`.
10. **Message Text Exhaustion (DoW)**: Student creating `/rooms/CS101/messages/msg1` with 10,000-char `text`.
11. **Student Resolving Own/Other Message**: Student updating `resolved: true` on `/rooms/CS101/messages/msg1`.
12. **Cross-Room List Scraping**: User listing `/rooms/CS101/messages` without matching `roomTeacherUid == uid` or `ownerUid == uid`.
