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

Members can sign in with email or Google, download official documents and export filtered opportunities. Downloads currently require a verified account and are free. Payment collection is not enabled. TenderScope does not accept or submit procurement bids.

For deployment and acceptance status see `docs/PHASE_STATUS.md`.
