# Legacy Exam Result Contract

Production contains six official `exam_results` created before the canonical exam-session contract. All six have `submitted_at`; all six lack `submission_id`, `source_version`, and `activity_type`. They belong to two users. Production also contains 37 training attempts and no official attempt linked through `exam_result_id`.

## Preservation Rules

- Preserve all six rows, IDs, users, scores, details, and timestamps exactly.
- Do not synthesize submission IDs, payload hashes, sessions, manifests, source versions, activity types, or attempts.
- Keep `exam_session_id` nullable for grandfathered rows.
- Continue treating the six rows as official performance for Dashboard, Performance, and Ranking.
- Continue treating the 37 attempts as Training because `exam_result_id IS NULL`.

## Proposed Version Contract

- `legacy_pre_cutover_v1` identifies the six preserved rows.
- `canonical_exam_v1` identifies every result created by the post-cutover RPC.
- A future explicit version marker is preferred over guessing from a `user_` prefix or from missing fields.
- Marking legacy provenance may be the only historical-row update considered, and only after snapshot/hash verification and separate approval.

Post-cutover triggers and constraints apply strong session, submission, manifest, payload, ownership, and idempotency invariants only to `canonical_exam_v1`. They must permit the exact grandfathered shape while preventing any new legacy-shaped insert.

No scoring algorithm or historical score is reinterpreted by this contract.
