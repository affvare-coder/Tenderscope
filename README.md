# TenderScope

Healthcare procurement workspace for official GeM opportunities.

Live site: https://tenderscope-healthcare.netlify.app

This public repository contains the website only. Discovery rules, source collection, database migrations and download authorization run in the private backend.

## Development

Use Node.js 22 or newer.

```sh
npm ci
npm run check
npm run build
```

Netlify publishes `dist/`. The build includes only the public HTML, stylesheet, application and pinned Supabase authentication client.

For an upload to the existing Netlify project, run `npm run package:drop` (Python 3.11+). Upload `release/TenderScope_Public_Static.zip`. This package preserves the API proxy and headers, disables a second build, and serves the already-built files from its root. Uploading the build files with the repository's build command would fail because the package deliberately excludes development dependencies and build scripts.

Members can sign in with email or Google, download official documents and export filtered opportunities. Downloads currently require a verified account and are free. Payment collection is not enabled. TenderScope does not accept or submit procurement bids.

For deployment and acceptance status see `docs/PHASE_STATUS.md`.
