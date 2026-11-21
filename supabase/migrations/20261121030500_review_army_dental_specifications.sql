-- The named GeM BOQ PDF and ATC URL returned identical 1,073,382-byte PDFs.
-- Compared all three rendered source pages with the original 23-row CSV on 21 November 2026.
-- Replaying this seed never re-attests a changed bid or replaces newer source evidence.
with target as (
 select t.id,public.bid_pack_extracted_source(t.id,false) base from public.tenders t
 where t.bid_number='GEM/2026/B/8261632'
), evidence as (
 select $rows$[
 {
  "n": 1,
  "name": "Plaster of paris special dental grade 1",
  "unit": "Kg",
  "quantity": 50,
  "pvms": "100402",
  "page": 1,
  "specification": "High Compressive strength\nMinimal setting expansion\nType II",
  "condition": "Good brand with more than presence of 5 year in market",
  "question": "The item is described as grade 1 and the specification says Type II. Confirm the required classification.",
  "nomenclature": "Plaster of paris special dental-grade 1"
 },
 {
  "n": 2,
  "name": "Self cure acrylic powder pink shade bott of 110 gm with rapid repair liquid 110 ml ",
  "unit": "Set",
  "quantity": 5,
  "pvms": "100420",
  "page": 1,
  "specification": "Pink shade high strength low expansion\nSelf cure\nSet of powder and liquid",
  "condition": "Good brand with more than presence of 5 year in market",
  "question": "",
  "nomenclature": "Self cure acrylic powder pink shade bott of 110gm with rapid repair liquid 110ml"
 },
 {
  "n": 3,
  "name": "Self cure acrylic powder clear shade bottle of 110 gm with self cure acrylic liquid 110 ml",
  "unit": "Set",
  "quantity": 4,
  "pvms": "100421",
  "page": 1,
  "specification": "Clear shade with pink shade for coloring it\nSelf cure high strength low expansion\nSet of powder and liquid",
  "condition": "Good brand with more than presence of 5 year in market",
  "question": "",
  "nomenclature": "Self cure acrylic powder clear shade, bottle of 110 gm with self cure acrylic liquid 110 ml"
 },
 {
  "n": 4,
  "name": "Spray anaesthetic surface bott of 100 ml",
  "unit": "Bott",
  "quantity": 6,
  "pvms": "100585",
  "page": 1,
  "specification": "Anesthetic spray for topical use over oral mucosa\nComposition 10-15% lignocaine\n100ml bottle\nISO certified medical grade\nFor dental use",
  "condition": "Good brand with more than presence of 5 year in market",
  "question": "",
  "nomenclature": "Spray anaesthetic surface bott of 100 ml"
 },
 {
  "n": 5,
  "name": "Arch wire ss preformed lower 0 point 016 round ",
  "unit": "Pkt",
  "quantity": 8,
  "pvms": "100605",
  "page": 1,
  "specification": "Type: Preformed archwires\nMaterial: Nickel-Titaniumalloy\nCross-section: Round\nArch Form: Round\nSize: 0.016 lower",
  "condition": "Good brand with more than presence of 5 year in market",
  "question": "The item name says ss while the specification calls for Nickel-Titaniumalloy. Confirm the required material.",
  "nomenclature": "Arch wire ss preformed lower 0.016 round"
 },
 {
  "n": 6,
  "name": "Arch wire NiTi copper preformed ideal uppper 0 point 016 roud ",
  "unit": "Set",
  "quantity": 1,
  "pvms": "100655",
  "page": 1,
  "specification": "Category: Orthodontic wires\nType: Preformed archwires\nMaterial: Nickel-Titaniumalloy\nCross-section: Round\nArch Form: Ovoid\nSize: 0.016 lower",
  "condition": "Good brand with more than presence of 5 year in market",
  "question": "The item names the upper arch. The specification states 0.016 lower. Confirm the arch.",
  "nomenclature": "Arch wire NiTi copper preformed ideal uppper 0.016 roud"
 },
 {
  "n": 7,
  "name": "Arch wire NiTi copper preformed ideal uppper 0 point 016 multiply 0 point 022 rectangular",
  "unit": "Set",
  "quantity": 1,
  "pvms": "100655B",
  "page": 1,
  "specification": "Category: Orthodontic wires\nType: Preformed archwires\nMaterial: Nickel-Titanium alloy\nCross-section: Round\nArch Form: Ovoid\nSize: 16x22 Upper",
  "condition": "Good brand with more than presence of 5 year in market",
  "question": "The item names a rectangular wire. The specification states Round. Confirm the cross-section.",
  "nomenclature": "Arch wire NiTi copper preformed ideal uppper 0.016x0.022 rectangular"
 },
 {
  "n": 8,
  "name": "Arch wire NiTi copper preformed ideal uppper 0 point 017 multiply 0 point 025 rectangular",
  "unit": "Set",
  "quantity": 1,
  "pvms": "100655C",
  "page": 1,
  "specification": "Category: Orthodontic wires\nType: Preformedarchwires\nMaterial: Nickel-Titanium alloy\nCross-section: Round\nArch Form: Ovoid\nSize: Upper #17x25",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "The item names a rectangular wire. The specification states Round. Confirm the cross-section.",
  "nomenclature": "Arch wire NiTi copper preformed ideal uppper 0.017x0.025 rectangular"
 },
 {
  "n": 9,
  "name": "Material impression alginate pkt in 300 to 500gm",
  "unit": "Pkt",
  "quantity": 20,
  "pvms": "100816",
  "page": 1,
  "specification": "Non chromatic and rubber effect\nEasy mix formula\nDust free\n\nPreferred Zenmark,Septodont",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Material impression alginate pkt in 300 to 500gm"
 },
 {
  "n": 10,
  "name": "Composition impression thermoplastic pkt of 5 cakes",
  "unit": "Box",
  "quantity": 2,
  "pvms": "100818",
  "page": 2,
  "specification": "Thermoplastic, smooth consistency, rigid, softens when 60 digree C heated hardens when cooled ,distinct color",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Composition impression thermoplastic pkt of 5 cakes"
 },
 {
  "n": 11,
  "name": "Crown and bridge plaster diestone super hard for pkt of 100 gm",
  "unit": "Pkt",
  "quantity": 72,
  "pvms": "100821",
  "page": 2,
  "specification": "1 or 3 kg pack with total qty not exceeding 7.2 kg Type IV Extra hard natural die High strength stone for all type of prosthesis",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "The item names a 100 gm packet. The specification calls for 1 or 3 kg packs. Confirm the pack against the 72-packet BOQ.",
  "nomenclature": "Crown and bridge plaster diestone super hard for pkt of 100 gm"
 },
 {
  "n": 12,
  "name": "Rubber base impression material kit with accessories",
  "unit": "Pkt",
  "quantity": 1,
  "pvms": "100828",
  "page": 2,
  "specification": "High strength and stability, low volume shrinkage , setting time 3 to 5 min, high viscosity, easy to mix. Preferably recommended ().",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Rubber base impression material kit with accessories"
 },
 {
  "n": 13,
  "name": "Base acrylic resin based provisional kit for temporary crown work",
  "unit": "Kit",
  "quantity": 1,
  "pvms": "100831",
  "page": 2,
  "specification": "Acrylic resin tooth colored vita A1 A2 A3 shade, self curing, smooth partials",
  "condition": "Good brand with-more than 5 years presence in market",
  "question": "",
  "nomenclature": "Base acrylic resin based provisional kit for temporary crown work"
 },
 {
  "n": 14,
  "name": "Material temporary filling  no mix  single phase bott of 25 to 30 gm",
  "unit": "Bott",
  "quantity": 15,
  "pvms": "100972",
  "page": 2,
  "specification": "Higer wear resistance\nIngredients: zinc oxide and calcium hydroxide based\nLow leakage\nsoothing to pulp\nGood plasticity\nEasy set in cavity\nISO certified\nAnd for dental use\nFDA approved",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Material temporary filling, no mix (single phase) bott of 25-30 gm"
 },
 {
  "n": 15,
  "name": "Sol sod hypochlorite 2 percentage  for endodontic irrigation bott of 500 ml",
  "unit": "Bott",
  "quantity": 12,
  "pvms": "100979",
  "page": 2,
  "specification": "A 2% sodium hypochlorite solution is an aqueous base that contains 2% active chlorine.\nTightly packed with shelf ife\nISO certified medical grade",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Sol sod-hypochlorite 2% for endodontic irrigation bott of 500 ml"
 },
 {
  "n": 16,
  "name": "Matrix retainer ss  ivory pattern  band for pkt of 12 for molars and premolars",
  "unit": "Pkt",
  "quantity": 6,
  "pvms": "100985",
  "page": 2,
  "specification": "Bands gingivally adapting\nStainless steel With  01 pkt SS bands\nsterile",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "The item names an ivory pattern retainer and 12 bands. The specification mentions one packet of bands. Confirm the required contents.",
  "nomenclature": "Matrix retainer ss (ivory pattern) band for, pkt of 12 (for molars and premolars)"
 },
 {
  "n": 17,
  "name": "Outfit matrix ss  siqveland bands narrow",
  "unit": "Pkt",
  "quantity": 6,
  "pvms": "100987",
  "page": 2,
  "specification": "(Tofflemire matrix retainer)\nStainless steel High grade, Crosson resisting autoclavable and reusable instrument used to hold matrix band",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "The item names narrow Siqveland bands. The specification identifies a Tofflemire matrix retainer. Confirm the product.",
  "nomenclature": "Outfit matrix ss (siqveland) bands narrow"
 },
 {
  "n": 18,
  "name": "Mineral trioxide aggregate  pkt of 1 gm",
  "unit": "Pkt",
  "quantity": 2,
  "pvms": "101002",
  "page": 2,
  "specification": "Salicylate resin\nBismuth trioxide\nFumed silica\nTitanium dioxide\nMineral Trioxide Aggregate 40%",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Mineral trioxide aggregate ( pkt of 1 gm)"
 },
 {
  "n": 19,
  "name": "Duplicating silicone 2 multiply 1 kg bottle  base plus catalyst",
  "unit": "Bott",
  "quantity": 3,
  "pvms": "101044",
  "page": 2,
  "specification": "Mixing ration 1:1 (base and catalyst)\nFinal hardness: typically 22 Shores a to 25 Shores\nWorking time: 1.30 seconds to 5 min\nHigh Fluidity and higher liner dimensional stability",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Duplicating silicone (2 x 1 kg bottle, base+ catalyst)"
 },
 {
  "n": 20,
  "name": "Teeth acrylic cross linked set of 28 complete comprising one set each of upper and lower anterior teeth and one set each of upper and lower posterior teeth",
  "unit": "Set",
  "quantity": 20,
  "pvms": "100435",
  "page": 3,
  "specification": "Material composition: Produced with polymethylmethacrylate (PMMA)\nChromatic layers: A two layer chromatic design with natural crown cut incisal edges.\nPreferably recommended (Acryrock, Vita, Ivoclar).",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Teeth acrylic cross linked set of 28 complete (comprising one set each of upper and lower anterior teeth and one set each of upper and lower posterior teeth)"
 },
 {
  "n": 21,
  "name": "Teeth anterior acrylic cross linked lower acry rock set of 6 ",
  "unit": "Set",
  "quantity": 20,
  "pvms": "100436",
  "page": 3,
  "specification": "Material composition: Produced with polymethylmethacrylate (PMMA)\nChromatic layers: A two layer chromatic design with natural crown cut incisal edges.\nPreferably recommended (Acryrock, Vita, Ivoclar).",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Teeth anterior acrylic cross linked lower set of 6"
 },
 {
  "n": 22,
  "name": "Teeth anterior acrylic cross linked upper acryrock set of 6 ",
  "unit": "Set",
  "quantity": 20,
  "pvms": "100437",
  "page": 3,
  "specification": "Material composition: Produced with polymethylmethacrylate (PMMA)\nChromatic layers: A two layer chromatic design with natural crown cut incisal edges.\nPreferably recommended (Acryrock, Vita, Ivoclar).",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "",
  "nomenclature": "Teeth anterior acrylic cross linked upper set of 6"
 },
 {
  "n": 23,
  "name": "Teeth anterior acrylic cross linked acrylic set  acry rock of 16 upper and lower ",
  "unit": "Set",
  "quantity": 20,
  "pvms": "100438",
  "page": 3,
  "specification": "Material composition: Produced with polymethylmethacrylate (PMMA)\nChromatic layers: A two layer chromatic design with natural crown cut incisal edges.\nPreferably recommended (Acryrock, Vita, Ivoclar).",
  "condition": "Good brand with more than 5 years presence in market",
  "question": "The CSV names anterior teeth. The BBQR nomenclature says Teeth posterior cross linked, acrylic set of 16 upper and lower. Confirm which teeth are required.",
  "nomenclature": "Teeth posterior cross linked, acrylic set of 16 upper and lower"
 }
]$rows$::jsonb rows
)
insert into public.tender_specification_reviews(tender_id,base_version,source_url,source_sha,reviewed_at,rows)
select id, base->>'version','https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/BoqDocument/2026/11/11/bbqr_2026-11-11-07-53-22_02fc358f84d30e57cd984ef4267ee4f6.pdf','107f7fec103d84575b4b8a4469a34034151222324c7e563512f4bc8ef6979bc3',
 '2026-11-21 02:32:46.585974+00',rows from target,evidence
where base->>'version'='681657cb1f7658f90b87db0cbc4d2c91'
 and jsonb_array_length(base->'items')=23 and (base#>>'{expected,count}')::int=23
 and not exists(select from jsonb_array_elements(rows) x where not exists(
  select from jsonb_array_elements(base->'items') i where i->>'item_key'='https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/BoqLineItemsDocument/2026/11/11/boq_item_sample_file_2026-11-11-07-53-22_8e700dbd189b984cf0a6b5c7814a2fff.csv#row='||(x->>'n')
  and i->>'item_number'=x->>'n' and i->>'name'=x->>'name' and i->'quantity'=x->'quantity' and i->>'unit'=x->>'unit'))
on conflict do nothing;
