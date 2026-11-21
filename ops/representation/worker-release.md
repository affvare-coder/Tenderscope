# Source document review worker

The production baseline for this update is tenderscope-sync version 31. To reproduce version 32, apply worker-v31.patch in the root of the recovered function source. Copy evidence.mjs to worker/representation.mjs, and copy attachment-roles.mjs and specification-table.mjs to worker/ under their existing names. Use the same entry point, import map and authentication settings as version 31.

The worker reads both labelled links in the GeM bid PDF. The CSV provides the ordered schedule. The buyer PDF provides its own page evidence. Only explicitly headed specification tables can produce automatic row candidates. A unique item number and item name must also agree with the schedule. Scans, conflicts, incomplete tables and missing official files require review. A new source hash invalidates the existing match.

The November 21 regression uses GEM/2026/B/8222756. On pages 18 and 19 of its parent the upper link points to the specification PDF and the lower link to the BOQ CSV. Appendix A of the specification contains 54 items on pages 8 and 9. An anonymous visit to the bid should show both official files separately and both wordings for Enalapril Maleate in item 3.
