// Official GeM equipment names confirmed in RML Hospital's cardiology bids.
export function matchedCardiologyTerms(productText, matchesTerm) {
  return ['cardiac TMT machine', 'angio jet system'].filter(term => matchesTerm(productText, term));
}
