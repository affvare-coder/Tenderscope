// A candidate is scoped to the exact reviewed buyer PDF, row and wording.
// Additional authorisations, common bid conditions and pack suitability require bidder review.
const entries=[{
  specificationHash:'688842681d3e4536b55a10753fb22e1512b7be1f850c01b3c4d77f7d7d9726dc',
  number:'7',requirement:'Ibuprofen 400 mg Tab',
  offer:'Expert Pharmaceuticals Private Limited · Ibuprofen BP 400 mg film-coated tablets · 10 × 10 tablets',
  evidence:'https://www.expertpharmaceuticals.com/product/ibuprofen-tablets-3/',
  photoSource:'https://www.expertpharmaceuticals.com/wp-content/uploads/2020/08/ibu-big.jpg',
  photoAsset:'/assets/oem/expert-ibuprofen-400.jpg'
}];
export function catalogueCandidate(item){
 if(!item.specification_verified||item.source_question||!item.spec_url)return null;
 return entries.find(e=>e.specificationHash===item.spec_sha && e.number===String(item.item_number)
  && e.requirement===item.specification?.trim())||null;
}
