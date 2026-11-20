insert into public.tender_buyer_reviews(tender_id,source_sha256,source_url,gem_url,reviewed_at,facts)
select id,'b0f6fcc0ad6c13ad03a3ed4318377598251e391b5163667ebe2c8f62697c9fe1','https://www.aiimsbilaspur.edu.in/sites/default/files/2026-11/GeM-Bidding-Medical%20Oxygen%20Gas%20Cylinders.pdf','https://bidplus.gem.gov.in/showbidDocument/10161134',
'2026-11-20 17:06:00+00', $facts${
  "bidder": {
    "value": "₹26 lakh",
    "page": 1,
    "section": "Minimum average annual bidder turnover, last three financial years",
    "quote": "26 Lakh (s)"
  },
  "turnover_method": {
    "value": "To be verified by the buyer at the time of technical evaluation",
    "page": 1,
    "section": "Turnover eligibility criteria",
    "quote": "To be verified by the buyer at the time of technical evaluation"
  },
  "mse": {
    "value": "Complete, subject to supporting evidence",
    "page": 1,
    "section": "MSE relaxation for experience and turnover",
    "quote": "Yes | Complete"
  },
  "startup": {
    "value": "No",
    "page": 1,
    "section": "Startup relaxation for experience and turnover",
    "quote": "No"
  },
  "ra": {
    "value": "Enabled · H1 elimination",
    "page": 2,
    "section": "Bid to RA enabled / RA Qualification Rule",
    "quote": "H1-Highest Priced Bid Elimination"
  },
  "evaluation": {
    "value": "Total value wise",
    "page": 2,
    "section": "Evaluation Method",
    "quote": "Total value wise evaluation"
  },
  "emd": {
    "value": "₹1,50,000",
    "page": 2,
    "section": "EMD Amount",
    "quote": "150000"
  },
  "epbg": {
    "value": "5% · 24 months",
    "page": 3,
    "section": "ePBG percentage / required duration",
    "quote": "5.00"
  },
  "item": {
    "value": "Medical Oxygen Gas Cylinders - Steel (Normalized) (V2) · 600 pieces",
    "page": 6,
    "section": "Additional Specification Parameters",
    "quote": "600 pieces"
  },
  "consignee": {
    "value": "174001,aiims ,kothipura,changar palasia",
    "page": 6,
    "section": "Consignee 1 · address and quantity",
    "quote": "174001,aiims ,kothipura,changar palasia"
  },
  "exemption": {
    "value": "MSME EMD exemption limited to OEMs. Traders and resellers are ineligible.",
    "page": 11,
    "section": "Buyer Added Bid Specific ATC 19(1)",
    "quote": "Traders /Resellers are not eligible for EMD exemption."
  },
  "precedence": {
    "value": "ATC specifications govern technical evaluation.",
    "page": 6,
    "section": "Additional Specification Parameters · Overall Specifications",
    "quote": "The specifications mentioned in the ATC will Supersede the specifications selected in the product bid."
  },
  "undertaking": {
    "value": "Integrity Pact on ₹100 stamp paper is mandatory.",
    "page": 11,
    "section": "Buyer Added Bid Specific ATC 19(3)",
    "quote": "Non-submission of Integrity Pact will lead to disqualification of bidder."
  },
  "beneficiary": {
    "value": "Miscellaneous Fund AIIMS Bilaspur H.P\nAll India Institute of Medical Sciences (AIIMS) Bilaspur Himachal Pradesh, Department of Health and Family Welfare, , Ministry of Health and Family Welfare\n(Executive Director Aiims Bilaspur)",
    "page": 3,
    "section": "Beneficiary",
    "quote": "Miscellaneous Fund AIIMS Bilaspur H.P"
  },
  "mii": {
    "value": "Yes",
    "page": 3,
    "section": "MII purchase preference",
    "quote": "Yes"
  }
}$facts$::jsonb
from public.tenders where bid_number='GEM/2026/B/8270018' and source_url='https://bidplus.gem.gov.in/showbidDocument/10161134';
insert into public.tender_buyer_reviews(tender_id,source_sha256,source_url,gem_url,reviewed_at,facts)
select id,'9908c0de9a3be27d13b87fed020b639d7a63d2668d727406658954b43c07ebc4','https://aiimsrishikesh.edu.in/images/upload_documents/GeM-Bidding-10145234%20%281%29%2010th%20nov%202026.pdf','https://bidplus.gem.gov.in/showbidDocument/10145234',
'2026-11-20 17:06:00+00', $facts${
  "bidder": {
    "value": "₹30 lakh",
    "page": 1,
    "section": "Minimum average annual bidder turnover, last three financial years",
    "quote": "30 Lakh (s)"
  },
  "turnover_method": {
    "value": "GeM verified turnover",
    "page": 1,
    "section": "Turnover eligibility criteria",
    "quote": "GeM verified turnover"
  },
  "mse": {
    "value": "Complete, subject to supporting evidence",
    "page": 1,
    "section": "MSE relaxation for experience and turnover",
    "quote": "Yes | Complete"
  },
  "startup": {
    "value": "Complete, subject to supporting evidence",
    "page": 1,
    "section": "Startup relaxation for experience and turnover",
    "quote": "Yes | Complete"
  },
  "ra": {
    "value": "Enabled · H1 elimination",
    "page": 2,
    "section": "Bid to RA enabled / RA Qualification Rule",
    "quote": "H1-Highest Priced Bid Elimination"
  },
  "evaluation": {
    "value": "Total value wise",
    "page": 2,
    "section": "Evaluation Method",
    "quote": "Total value wise evaluation"
  },
  "emd": {
    "value": "₹1,80,000",
    "page": 2,
    "section": "EMD Amount",
    "quote": "180000"
  },
  "epbg": {
    "value": "5% · 26 months",
    "page": 3,
    "section": "ePBG percentage / required duration",
    "quote": "5.00"
  },
  "oem": {
    "value": "₹60 lakh",
    "page": 1,
    "section": "OEM Average Turnover (Last 3 Years)",
    "quote": "60 Lakh (s)"
  },
  "item": {
    "value": "Automated ELISA Processor (V2) · 1 piece",
    "page": 7,
    "section": "Additional Specification Parameters",
    "quote": "Automated ELISA Processor (V2) ( 1 pieces )"
  },
  "consignee": {
    "value": "249203,AIIMS, Virbhadra Road, Near Bairaj Lake, Rishikesh, Uttarakhand-249203",
    "page": 7,
    "section": "Consignee 1 · address and quantity",
    "quote": "249203,AIIMS, Virbhadra Road, Near Bairaj Lake, Rishikesh, Uttarakhand-249203"
  },
  "exemption": {
    "value": "Goods manufacturers may claim the MSE exemption with supporting documents. Traders are excluded.",
    "page": 3,
    "section": "EMD exemption (a)",
    "quote": "Traders are excluded from the purview of this Policy."
  },
  "precedence": {
    "value": "The buyer directs bidders to the specifications in the ATC.",
    "page": 7,
    "section": "Additional Specification Parameters",
    "quote": "Notwithstanding anything contained above, the technical specifications mentioned in ATC must be compiled"
  },
  "beneficiary": {
    "value": "EXECUTIVE DIRECTOR\nRishikesh, Department of Health and Family Welfare, All India Institute of Medical Sciences (AIIMS), Ministry of Health and Family Welfare\n(Aiims Rishikesh)",
    "page": 3,
    "section": "Beneficiary",
    "quote": "EXECUTIVE DIRECTOR"
  },
  "mii": {
    "value": "No · GTE relaxation approval cited",
    "page": 3,
    "section": "MII purchase preference / approval number",
    "quote": "No. F.4/1/2023-PPD dated 17.02.2025"
  }
}$facts$::jsonb
from public.tenders where bid_number='GEM/2026/B/8256161' and source_url='https://bidplus.gem.gov.in/showbidDocument/10145234';
