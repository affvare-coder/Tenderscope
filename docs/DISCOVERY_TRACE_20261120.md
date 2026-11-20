# Morning discovery and BOQ verification, 20 November 2026

All times are IST. The public Netlify manifest returned HTTP 200 and clean main revision `dbbbadaeb9de90c861e39e6a8dfbb0bc31be0c2d`. Netlify published that build on 19 November at 23:54:15. The worker and queue have separate revisions.

## Fresh bids and the attachment queue

At 06:43, 0 of 91 indexed open bids published in the preceding 24 hours had current item rows. At 07:06 the same query returned 2 of 91. Zero of the 91 had a proven pack-ready result. This denominator uses the official publication timestamp for reviewed, published tenders with a future deadline. Bids still absent from the index are outside the denominator.

The 01:00 publication scan had reached 282 pages and scanned 2,830 records, adding 33 bids, at its 06:36 checkpoint. It had no completion timestamp. A separate full discovery job begun on 19 November was also unfinished, with 93 of 2,036 lanes recorded complete at its 06:12 checkpoint. A four-hour check samples a rotating subset. Neither metric establishes complete source coverage.

The main PDFs for Endodontic items (8288830), Drugs and Consumables (8291836) and BOQ105 (8292024) had already been fetched. Their product CSVs and linked BOQ PDFs were still queued. In the fresh lane, 37 of 257 jobs were child attachments and 13 were CSVs. One of the two fresh document turns now prefers attachments from the oldest eligible fresh publication, with its product file first. The other stays in queue order. Deadline, corrigendum, expiry and backlog reservations remain in the same rotation. The migration and its transaction-isolated functional test are in commit `2d542499cff1fd5d79df1e76b60856f596c7e34f`.

DGLP bid 8196754 was published at 09:01:29 on 19 November. Its earliest retained tender version recorded an official observation at 14:40:11, followed by a published database record at 14:40:16. The main-PDF change was recorded at 06:28 on 20 November. The scheduled worker produced the 94 item rows at 06:56:08, about 21 hours 55 minutes after publication. The first actual browser view and the time to verified pack completeness are unknown. The API check below establishes subsequent public visibility.

## Independent official BOQ comparison

A separate HTTP client fetched each official GeM CSV. Each returned 200, and its byte count matched Content-Length. Python's CSV reader independently counted rows. The public Netlify API was then compared on original row ordinal, item number, exact item name and description, numeric quantity and literal unit. The three files each list one consignee. This comparison does not verify linked specification PDFs, buyer ATCs or amendments.

| Bid | Source rows | Public rows matching all compared fields | SHA-256 of official CSV |
| --- | ---: | ---: | --- |
| 8196754, DGLP drugs | 94 | 94 | 3b422661bfb6cfe696d7c60942e59b72ce69bfcd03b991dae57cfbe0a9d3ad2b |
| 8261632, Army dental BOQ 6 | 23 | 23 | 6c6d9248d1a79b712f66c04f8c1f5438cfa9e34c86e83458bdf0e38023876998 |
| 8291836, Drugs and Consumables | 15 | 15 | 3b0d08e3a72dc5298003555008d01184e077e4b6cd1dfb748f421d40bb4bb13b |

CSV parser v3 collapsed internal spaces and trimmed source fields. In the 94-row case, 32 names, 32 descriptions and one unit differed from the official text. In BOQ 6, 12 names differed. No difference other than whitespace was observed in those fields. Worker v30 preserves nonblank text verbatim, including embedded line breaks. The two existing extracts were refreshed using the original verified document hash. The 15-row file was reconciled using the same deployed parser and the standard document and product ingestion functions. The refreshed API data matched all 132 source rows. Separate specification PDFs remain unresolved.

## Bidder acceptance checks

- AIIMS Rishikesh 8256161 had an excluded archived candidate on 11 November. A fresh exact GeM lookup restored the public bid at 06:52 on 20 November. The buyer PDF, page 2, declares an estimated ₹60,00,000 and EMD ₹1,80,000. Page 7 names the Virbhadra Road consignee near Bairaj Lake, PIN 249203. The public API returned these facts. Quantity is one Automated ELISA Processor (V2).
- AIIMS Bilaspur 8270018 is public with a listing quantity of 600, EMD ₹1,50,000 and the Kothipura consignee, PIN 174001. EMD is on page 2. The address and ATC precedence are on page 6. Page 11 clause 19 limits the cited exemption and specifies a signed Integrity Pact. Both AIIMS locations were cross-checked with the buyer-published GeM PDFs. Both still need the production worker's GeM PDF hash and source-linked product records. The manual financial and address corrections retain the reviewed PDF URL, SHA-256 and page references in the tender's verification note.
- Web-space maintenance bid 8127314 was absent from the healthcare register. It is a historical ATC-amendment fixture. The fresh ongoing-bid lookup returned no row for this ID.
- The production BOQ 6 page showed Ahmednagar and 23 item rows. With dummy bidder details and no signature, stamp or affirmative product declaration, the live Word export produced a four-page editable draft with 23 item rows, each marked NEEDS REVIEW. All four rendered pages carried the blocked draft label. Linked specifications still require review. The production Edit Word button initially opened the Ask AI tab. PR 13 corrects this routing, labels unknown commercial values accurately and adds the incomplete-draft acknowledgement. Its candidate passed 100 tests and CI. It has not been published to Netlify.

The sample used the following buyer registers and documents. [AIIMS Bilaspur](https://www.aiimsbilaspur.edu.in/index.php/procurement/tender/gem), [AIIMS Rishikesh](https://aiimsrishikesh.edu.in/a1_1/?page_id=2525), [ICMR](https://www.icmr.gov.in/tenders), [ACTREC](https://actrec.gov.in/gem?page=5), [RML and earlier sample](DISCOVERY_TRACE_20261119.md).

## Evening recheck

At 22:36 IST, 16 of the 20 sampled bids had a published, reviewed tender record, up from 7 at the morning baseline. Sample IDs were 8245667, 8270018, 8227390, 8162214, 8184259, 8178742, 8116037, 8256161, 8261671, 8282595, 8246770, 8290265, 8251805, 8231507, 8260746, 8260782, 8208981, 8109838, 8130062 and 8121636. Four current official GeM candidates had been excluded at classification: 8260746, 8260782, 8109838 and 8130062. All four had a future official closing date. None of these four was an unresolved source access failure. This purposive sample measures register inclusion, not BOQ readiness or overall GeM recall.

At 22:37, 0 of 52 reviewed open tenders with official publication in the preceding 24 hours had a current item row bound to an available source document and hash. The verified pack readiness rate for that indexed publication cohort was 0/52. The separate all-location health counter reported 112/858 with product coverage at 22:36. The scheduled 01:00 publication sweep had reached 875 pages and 8,750 listings at 19:36 and was marked RECOVERY_REQUIRED, with no verified completion time.
