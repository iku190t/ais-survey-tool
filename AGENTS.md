# EZ Viewer repository instructions

## Start every change

- Run `git status --short`, identify the current branch/commit, and preserve all existing uncommitted work.
- Read `docs/ai-knowledge/INDEX.md`, then open only the documents routed for the current task.
- Check `VERIFIED_BASELINES.md` and related entries in `INCIDENTS.md` before changing behavior that worked previously.
- Treat conversation and screenshots as observations until code, reproduction, or tests confirm them.

## Evidence and changes

- Use the status labels `観察`, `再現済み`, `検証済み`, and `廃止`. Label unverified explanations `仮説`.
- Prefer the smallest isolated change. Do not rewrite unrelated working features.
- Run the tests routed by `TEST_MATRIX.md`; report pre-existing failures separately from new regressions.
- Add a knowledge entry only after evidence is available. Promote a rule to a permanent decision only after it is confirmed independently at least twice.
- Never record secrets, personal information, customer data, or attached customer drawing contents.
- Do not publish or push unless the user explicitly asks.

## Finish every verified change

- Record the verified behavior, root cause, tests, commit, and rollback point in `docs/ai-knowledge/`.
- Keep this file short. Put details in the routed knowledge documents.
