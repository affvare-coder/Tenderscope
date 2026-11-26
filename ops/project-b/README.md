# TenderScope Intelligence Engine

Apply the migrations in this directory to Project B only. Project A remains the production record and login authority. B accepts bounded public GeM BOQ CSV work. The worker rejects changed hashes and stale leases and stores extraction results without publishing them.

Deploy the runner to B as `tenderscope-boq-engine` with entrypoint `supabase/functions/tenderscope-boq-engine/index.ts`. Package the unchanged official retrieval and parsing modules with their relative imports from the pinned TenderScope sync v37 bundle, SHA-256 `9a205b2d2c86ce4201c8ed2db3aa2bdeacca2bde4943daedbcdef118e6bcc129`. The runner checks its own Vault-backed invocation token.

Configure `tenderscope_boq_runner_project_url` in B's Vault with the base HTTPS API URL from that project's dashboard. The live processing project uses the restored Mumbai ref `xwxexchtbviiyxcmuvnn`. Keep the URL and invocation token in the same project.

Use `tenderscope_engine.wake_boq_runner_v1()` for a controlled shadow batch. The current acceptance boundary is proof of the same official source hash and equal extracted item rows. Canonical acceptance and automated dispatch require their own implementation and tests before routing production work. The SQL fixture in `acceptance.sql` is for a disposable database.
