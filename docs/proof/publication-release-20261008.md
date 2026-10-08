# Published frontend — 8 October 2026

Production: https://tenderscope-healthcare.netlify.app/

Published Netlify deployment: 6ac70254143c294f4992bd72.
Both redirect rules and all three header rules processed without errors.

The tested 24/96-hour publication logic from functional commit
362e3cbc8db0e64ae14991edd7918e83f3fd9899 is now visible in production.
The final labels consistently describe publication time.
Live checks: 24-hour tab 24 bids; 96-hour tab 86; Extended 103;
Delhi 3. Two displayed 96-hour pages contain 40 distinct records each,
with no overlap. Extended displayed 40 rows all marked extended.
SQL acceptance found zero invalid tested window/extension rows and
zero duplicate bid numbers at 08:05 IST.

The official source link and explicit unverified document label were
observed. An authenticated member PDF download was not tested.
Full discovery, document and location coverage remains incomplete.

Final public static ZIP: 5,854,734 bytes.
SHA256: 7236a7511badfe009a9f79b0de9d3f5b5fd5c2b927fc7fc1bc79185a1b8f4a85

The manual upload package retains redirects/headers and disables
a second build. Private backend source and recovery files are excluded.

