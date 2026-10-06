/** Draft for review. Unmatched names stay in Other/Unspecified. */
export const SYMPTOM_CATEGORIES = [
  'Respiratory',
  'Pain-related',
  'Infection-related',
  'Lifestyle-related',
  'General',
  'Other/Unspecified'
];

const RULES = [
  { category: 'Pain-related', test: /pain|ache|arthral|joint|knee|backache|headache/i },
  { category: 'Infection-related', test: /fever|infection|fungal|ulcer|vomit|loose motion|worm|dengue|wound|burn|abscess|cultur/i },
  { category: 'Respiratory', test: /cough|cold|breath|throat|asthma|wheez/i },
  { category: 'Lifestyle-related', test: /sugar|diabet|hypertension|blood pressure|cholesterol|thyroid|epilep/i },
  { category: 'General', test: /weakness|acidity|gastric|routine|constipation|appetite|acne|itch|allerg|anc\b|anaem|anem|hemoglobin|haemoglobin|piles|giddiness|dehydr/i }
];

export function symptomCategory(name) {
  const text = String(name || '').trim();
  if (!text || text.toLowerCase() === 'unknown') return 'Other/Unspecified';
  const match = RULES.find((rule) => rule.test.test(text));
  return match ? match.category : 'Other/Unspecified';
}

export function summariseSymptomMix(mix) {
  const totals = new Map(SYMPTOM_CATEGORIES.map((label) => [label, 0]));
  let total = 0;
  (mix || []).forEach((row) => {
    const mentions = Number(row.patients) || 0;
    total += mentions;
    const category = symptomCategory(row.symptom);
    totals.set(category, (totals.get(category) || 0) + mentions);
  });
  return {
    total_mentions: total,
    categories: SYMPTOM_CATEGORIES
      .map((label) => ({ label, value: totals.get(label) || 0 }))
      .filter((row) => row.value > 0),
    bars: (mix || []).slice(0, 12).map((row) => ({
      label: row.symptom,
      value: Number(row.patients) || 0,
      category: symptomCategory(row.symptom)
    })),
    top3: (mix || []).slice(0, 3).map((row) => ({
      label: row.symptom,
      value: Number(row.patients) || 0,
      category: symptomCategory(row.symptom)
    }))
  };
}
