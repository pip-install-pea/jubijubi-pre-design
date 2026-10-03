/**
 * Employer names are read from the placement-status text. There is no employer column.
 * Keys are the trimmed text, compared case-insensitively with collapsed spaces.
 * Role-only texts are not employers. Status words are not employers.
 */

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const STATUS_TEXTS = [
  'further study',
  'futher study',
  'on going course',
  'ongoing course',
  'self employment',
  'self employement',
  'self employe',
  'self employ',
  'job searching',
  'homemaker',
  'not working',
  'unemployed'
];

const GENERIC_WORKING = ['employed'];

const ROLE_ONLY = [
  'data entry',
  'bill entry',
  'own business',
  'govt.. employee',
  'data entry(bharuch)',
  'data entry (bharuch)',
  'data entry (ankleshwar gidc)',
  'bill entry (ankleshwar)',
  'bill entry(bharuch)',
  'bill entry (bharuch)',
  'account (ankleshwar)'
];

/** Raw text → one employer name. Listed in full for review. */
export const EMPLOYER_MAP = {
  'Ascent Academy of Training and Development Pvt. Ltd.': 'Ascent Academy of Training and Development Pvt. Ltd.',
  'Cogent E Services Limited': 'Cogent E Services Limited',
  'Writer Business Services Pvt Ltd': 'Writer Business Services Pvt Ltd',
  'Mahaveer cllasis': 'Mahaveer Classics',
  'pace setters business solution pvt ltd': 'Pace Setters Business Solution Pvt Ltd',
  'D mart': 'D Mart',
  'Sales Account( Dmart)': 'D Mart',
  'Sales(D mart)': 'D Mart',
  'Bill entry (D Mart Bharuch)': 'D Mart',
  'Timken Company': 'Timken Company',
  'YokohamaTyre Private Limited Dahej': 'Yokohama',
  'Yokohama Company Dahej': 'Yokohama',
  'Merino industry  Limited Dahej [Computer Operator]': 'Merino Industries Limited',
  'Man Beautician Studio(Bharuch)': 'Man Beautician Studio',
  'Man Beautistudeo)': 'Man Beautician Studio',
  'Blue chip cinema Bharuch': 'Blue Chip Cinema',
  'Spectrum Talent MaFurther Studygement Pvt Ltd': 'Spectrum Talent Management Pvt Ltd',
  'Shri Ram Jan Seva Kendra': 'Shri Ram Jan Seva Kendra',
  'Prathna School (Bharuch)': 'Prathna School',
  'UPL (Bharuch)': 'UPL',
  'Kickstart Vision To Reality Private Limited': 'Kickstart Vision To Reality Private Limited',
  'Pal Enterprises': 'Pal Enterprises',
  'College of Agriculture Navsari Agriculture university campus Bharuch': 'College of Agriculture, Navsari Agricultural University, Bharuch',
  'Silpi square ( Data Entry))': 'Silpi Square',
  'Kanha CSC Center': 'Kanha CSC Center',
  'Narayan School': 'Narayan School',
  'Sadhana Marbal Shop ( Bill Enatry)': 'Sadhana Marble Shop',
  'Bill entry (ATAL TECHNO ASSOCIATES LLP BHOLAV GIDC)': 'ATAL Techno Associates LLP',
  'Account (HDFC Bank)Bharuch': 'HDFC Bank',
  'Data entry (DO Office Bharuch)': 'DO Office, Bharuch'
};

const EMPLOYER_BY_NORM = new Map(
  Object.entries(EMPLOYER_MAP).map(([raw, name]) => [norm(raw), name])
);

export function classifyEmployerText(raw) {
  const key = norm(raw);
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!key) return { kind: 'blank', raw: text };
  if (STATUS_TEXTS.includes(key)) return { kind: 'status', raw: text };
  if (GENERIC_WORKING.includes(key)) return { kind: 'generic', raw: text };
  if (ROLE_ONLY.includes(key)) return { kind: 'role', raw: text };
  if (EMPLOYER_BY_NORM.has(key)) return { kind: 'employer', name: EMPLOYER_BY_NORM.get(key), raw: text };
  return { kind: 'unmapped', raw: text };
}

export function summariseEmployers(rows) {
  const employers = new Map();
  const roleOnly = [];
  const generic = [];
  const unmapped = [];
  for (const row of rows || []) {
    const count = Number(row.count ?? row.n) || 0;
    const found = classifyEmployerText(row.raw ?? row.status ?? '');
    if (found.kind === 'blank' || found.kind === 'status') continue;
    if (found.kind === 'generic') {
      generic.push({ text: found.raw, count });
    } else if (found.kind === 'role') {
      roleOnly.push({ text: found.raw, count });
    } else if (found.kind === 'employer') {
      const prev = employers.get(found.name) || { name: found.name, count: 0, sources: [] };
      prev.count += count;
      prev.sources.push(found.raw);
      employers.set(found.name, prev);
    } else {
      unmapped.push({ text: found.raw, count });
    }
  }
  const list = [...employers.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    employer_count: list.length,
    employers: list,
    role_only: roleOnly.sort((a, b) => b.count - a.count),
    generic,
    unmapped
  };
}
