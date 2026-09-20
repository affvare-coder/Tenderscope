# Next actions

1. Finish and inspect additive database foundation; apply via named Supabase migration and execute rollback acceptance tests.
2. Finish deterministic official GeM worker and run tests against cached real records plus live public sources.
3. Deploy authenticated Edge Function, configure vaulted cron invocation and check real run/queue results.
4. Connect frontend lifecycle, history, document versions and health; build only public assets and deploy to existing Netlify project.
5. Record each of the 22 acceptance gates with evidence; Phase 1 stays incomplete while a critical gate is unproven.

Local test command once all implementation files exist: `npm test`.
Public frontend build: `npm run build`.
Database target: existing project `agdmlgbfxoqhztiormij`.
No user secrets should be pasted into chat or committed.
