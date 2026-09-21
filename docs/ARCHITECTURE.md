# TenderScope architecture

The static Netlify website reads public tender records and sanitized source health from Supabase. Supabase Auth manages verified member sessions. Protected Edge Functions authorize document downloads and CSV export against the member's access policy.

Private scheduled workers collect official GeM data, persist unique bid identities and immutable change histories, track deadline extensions, and preserve document versions and retry cursors. Collection continues independently of the website and ChatGPT.

Only public frontend assets are included in the Netlify build. Backend source, database migrations, collection rules, service credentials and source-session data are excluded from this repository and published website.

Supabase PostgreSQL remains the production source of truth. There is no spreadsheet upload dependency. A successful page fetch or screen refresh does not imply a completed source sweep.

The platform is for discovery and document access; it does not accept or submit bids.
