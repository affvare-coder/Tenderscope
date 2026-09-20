# Current state

Audit date: 2026-09-20.

- Existing repo: `affvare-coder/Tenderscope`, branch `main`.
- Website: https://tenderscope-healthcare.netlify.app
- Netlify project: `ef2a51b5-ca33-4ba5-8592-8eae11d03008`.
- Supabase project: `agdmlgbfxoqhztiormij`, healthy PostgreSQL 17, Mumbai.
- Baseline: 503 tenders, 1,158 document records, 416 premium records.
- Baseline website reads Supabase directly, hides elapsed deadlines, lacks sync health and immutable versions.
- Baseline has no pg_cron/pg_net scheduler. Two existing temporary Edge Functions are preserved.
- Existing official GeM extraction scripts and cached records are being reused for protocol and regression fixtures; they are not a production source of truth.
- Phase 1 implementation is in progress. Nothing in this file claims a completed autonomous deployment until acceptance evidence is recorded.
