# Discovery trace, 19 November 2026

Production snapshot at 22:30 IST: 10,462 document jobs due. The 01:00 IST full discovery run had completed 110 of 2,036 lanes at the later read. The four-hour tick sampled eight bids. From midnight until 22:39 IST, 34 published records carried a GeM publication timestamp on 19 November. Median time from that timestamp to the tender row's first-seen timestamp was 181.8 minutes; none had a current item and one had a hashed document. First browser visibility is not timestamped by this trace.

## Independent buyer-register sample

Selected from the RML, ICMR, ACTREC and AIIMS buyer publications. Each had a buyer-listed future submission date. The sample is purposive and weighted towards medical equipment. Direct GeM BidPlus status and subsequent corrigenda were not independently available for every case. The comparison checks the published register, staging, exclusion receipts and retirement receipts. Absence from these tables alone does not prove the collector never saw a listing.

| GeM/2026/B/ | Buyer item | Source | TenderScope baseline |
| --- | --- | --- | --- |
| 8261671 | Cardiac TMT Machine | RML | Excluded |
| 8282595 | Angio Jet System | RML | Excluded |
| 8246770 | Medicines for medical treatment | ICMR | Published |
| 8290265 | PCR master mix for in vitro diagnosis | ICMR | Pending |
| 8251805 | FISH hybridizer | ICMR | No record in checked tables |
| 8231507 | Refrigerated centrifuge | ICMR | No record in checked tables |
| 8260746 | TB identification test kit | ICMR | Excluded |
| 8260782 | MGIT 960 tubes | ICMR | Excluded |
| 8208981 | Dental chair | ACTREC | Pending |
| 8109838 | Intraoperative ultrasound | ACTREC | No record in checked tables |
| 8130062 | Automated blood component processor | ACTREC | No record in checked tables |
| 8064153 | Portable DR | ACTREC | No record in checked tables |
| 8121636 | ELISA reader | ACTREC | Pending |
| 8146461 | Flexible video bronchoscope | ACTREC | Pending |
| 8149172 | Bioimpedance spectroscopy | ACTREC | Excluded |
| 8149117 | Robotic movement therapy | ACTREC | Excluded |
| 8182499 | Ligasure sealer divider | ACTREC | No record in checked tables |
| 8188741 | Sterile connecting device | ACTREC | Excluded |
| 8172153 | Video laryngoscope | ACTREC | Pending |
| 8194713 | Alcohol based hand sanitiser | AIIMS | Excluded |

Source registers: [ICMR](https://www.icmr.gov.in/tenders), [ACTREC](https://actrec.gov.in/gem?page=5), [ACTREC dental chair](https://actrec.gov.in/index.php/dental-chair-0), [AIIMS](https://aiims.edu/index.php/tenders/en/index.php). RML references: [cardiac TMT machine](https://rmlh.mohfw.gov.in/WriteReadData/RTF/T652b8cc86-e206-4238-bfd0-68a980cf1565.pdf), [Angio Jet system](https://www.rmlh.mohfw.gov.in/WriteReadData/RTF/T52946265c-efa5-4350-958e-9d7bd53535d4.pdf).

## First fix and reproduction

Both RML listings reached the all-bids collector on 18 November near 13:00 IST. Both source observations contain an exact cardiology equipment name. Both were staged as non-healthcare with no main-PDF job. Replaying those same inputs through the listing_refresh entry point in the unmodified version 27 worker reproduces the error.

Use the small cardiology module from this revision in the private worker. It supplements the per-item product match in classify and protects a mixed manifest from the automotive-only shortcut when a confirmed cardiology item is present. Keep the persisted configuration and all discovery lanes intact. The public module is mirrored in the worker as worker/cardiology.mjs. Integrated worker/gem.mjs SHA-256 is ada7bee09b7018b97bf8e8c0dc05946a4d171074fa7d569751eb62c28303c534. The former global rules proposal was rehearsed twice in a rolled-back transaction and superseded. Changing the global version would invalidate matching against 20,425 old-version exclusion receipts, including 9,283 with future deadlines.

Replayed both exact listing records through runWorker with an instrumented database adapter. Both now carry medical evidence and queue their official main PDFs with the original observation times. The recorded quadrant for both listing inputs is unknown. Explicit Q2 and non-Q2 variants, mixed automotive and medical manifests, four unrelated descriptions and all three mode lane lists passed. The existing global quadrant filter still applies when the worker processes official documents. Broader bidder-neutral discovery needs a separate change.

## Controls and vendor workflow

- 8281503: Published record, no items or hashed PDF. Its main PDF job remained queued, attempts zero.
- 8278976: Pending generic BOQ candidate. No tender row. Its main PDF job remained queued, attempts zero.
- 8184612: Published dentistry bid. The live bid drawer displayed 189 extracted rows pointing to specifications in the ATC. The expected official count and the underlying full requirements could not be confirmed.
- 8246770: [ICMR's buyer-hosted bid PDF](https://www.icmr.gov.in/icmrobject/uploads/Tender/1794895371_gem-bidding-10134238301031.pdf) contains 22 distinct item sections and consignee quantities totaling 4,920. The live drawer displayed “Products processing.” The linked specification PDF and BOQ CSV returned HTTP 503 in this check. Complete verification, including subsequent amendments, remains open.
- Frontend: main dbbbadaeb9de90c861e39e6a8dfbb0bc31be0c2d passed GitHub verify. Netlify reported production drop 6af276da5b343c9c34b7da61 with a null commit_ref. The live release.json request returned HTML. The exact frontend Git revision remains unverified.
