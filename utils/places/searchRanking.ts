import { GENERIC_ADDRESS_TERMS, CONNECTOR_TERMS, KINSHASA_ADMIN_PHRASES, GoogleMapsSearchSuggestion, QueryAnalysis } from './searchModel';

/* =====================================================
   QUERY SCORING
===================================================== */

export const normalizeSearchText = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const unique = (values: string[]) => Array.from(new Set(values));

export const tokenize = (value: string) =>
  normalizeSearchText(value)
    .split(' ')
    .filter((term) => term.length >= 2 && !CONNECTOR_TERMS.has(term));

export const containsAlias = (searchText: string, alias: string) => {
  const normalizedSearch = normalizeSearchText(searchText);
  const normalizedAlias = normalizeSearchText(alias);

  if (!normalizedSearch || !normalizedAlias) {
    return false;
  }

  if (normalizedAlias.length <= 3 && !normalizedAlias.includes(' ')) {
    return normalizedSearch.split(' ').includes(normalizedAlias);
  }

  return normalizedSearch.includes(normalizedAlias);
};

export const getAdminTermsInQuery = (normalizedQuery: string) => {
  const adminTerms = new Set<string>();

  KINSHASA_ADMIN_PHRASES.forEach((phrase) => {
    const normalizedPhrase = normalizeSearchText(phrase);
    if (!normalizedPhrase || !normalizedQuery.includes(normalizedPhrase)) {
      return;
    }

    normalizedPhrase.split(' ').forEach((term) => adminTerms.add(term));
  });

  return adminTerms;
};

export const analyzeQuery = (query: string): QueryAnalysis => {
  const normalizedQuery = normalizeSearchText(query);
  const allTerms = unique(tokenize(query));
  const adminTerms = getAdminTermsInQuery(normalizedQuery);
  const hasAddressIndicator = allTerms.some((term) => GENERIC_ADDRESS_TERMS.has(term));
  const hasAdminQualifier = adminTerms.size > 0;
  const genericTerms = allTerms.filter((term) => GENERIC_ADDRESS_TERMS.has(term));
  const candidateSpecificTerms = allTerms.filter(
    (term) => !GENERIC_ADDRESS_TERMS.has(term) && !adminTerms.has(term),
  );

  return {
    normalizedQuery,
    allTerms,
    specificTerms: candidateSpecificTerms.length > 0 ? candidateSpecificTerms : allTerms,
    contextTerms: candidateSpecificTerms.length > 0
      ? allTerms.filter((term) => adminTerms.has(term))
      : [],
    genericTerms,
    hasAddressIndicator,
    hasAdminQualifier,
  };
};

export const getSuggestionSearchText = (suggestion: GoogleMapsSearchSuggestion) =>
  normalizeSearchText([
    suggestion.name,
    suggestion.fullAddress,
    suggestion.context?.neighborhood,
    suggestion.context?.locality,
    suggestion.context?.district,
    suggestion.context?.region,
    suggestion.context?.country,
  ].filter(Boolean).join(' '));

export const termMatchesText = (text: string, term: string) =>
  text.split(' ').some((word) => word === term || word.startsWith(term) || term.startsWith(word));

export const scoreSuggestionForQuery = (
  suggestion: GoogleMapsSearchSuggestion,
  queryAnalysis: QueryAnalysis,
) => {
  const searchText = getSuggestionSearchText(suggestion);
  const nameText = normalizeSearchText(suggestion.name);
  const addressText = normalizeSearchText(suggestion.fullAddress);
  let score = 0;

  if (queryAnalysis.normalizedQuery && searchText.includes(queryAnalysis.normalizedQuery)) {
    score += 30;
  }

  let matchedSpecificTerms = 0;
  queryAnalysis.specificTerms.forEach((term, index) => {
    if (termMatchesText(searchText, term)) {
      matchedSpecificTerms += 1;
      score += 10;
      if (termMatchesText(nameText, term)) score += 5;
      if (termMatchesText(addressText, term)) score += 2;
      if (index === 0) score += 3;
    } else if (queryAnalysis.specificTerms.length > 0) {
      score -= 8;
    }
  });

  if (queryAnalysis.specificTerms.length > 0 && matchedSpecificTerms === 0) {
    score -= 14;
  }

  queryAnalysis.contextTerms.forEach((term) => {
    score += termMatchesText(searchText, term) ? 3 : -1;
  });

  queryAnalysis.genericTerms.forEach((term) => {
    if (termMatchesText(searchText, term)) {
      score += 2;
    }
  });

  if (suggestion.coordinates.latitude !== null && suggestion.coordinates.longitude !== null) {
    score += 2;
  }

  return score;
};

export const getTypeSpecificityScore = (suggestion: GoogleMapsSearchSuggestion) => {
  if (suggestion.placeType.includes('street_address')) return 6;
  if (suggestion.placeType.includes('premise')) return 6;
  if (suggestion.placeType.includes('route')) return 5;
  if (suggestion.placeType.includes('neighborhood')) return 4;
  if (suggestion.placeType.includes('sublocality')) return 3;
  if (suggestion.placeType.includes('locality')) return 2;
  if (suggestion.placeType.includes('administrative_area_level_1')) return 1;
  return 0;
};

export const shouldRunPreciseTextSearch = (queryAnalysis: QueryAnalysis) =>
  queryAnalysis.normalizedQuery.length >= 6 &&
  (
    queryAnalysis.allTerms.length >= 3 ||
    (queryAnalysis.hasAddressIndicator && queryAnalysis.specificTerms.length >= 1) ||
    (queryAnalysis.hasAdminQualifier && queryAnalysis.specificTerms.length >= 1)
  );
