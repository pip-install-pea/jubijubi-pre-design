/**
 * Jubicare PHP endpoint registry — port of registry.py.
 * Spellings that live calls accept: livelyhood, skilltracting, health_desease.php,
 * health_symtoms.php, Limit (capital L). Never call market_access +
 * enterprise_support_monitoring together (MA copy is Table not allowed).
 */

export const API_BASE = 'https://jubicare.indevconsultancy.com/api/centralizeddashboardapi';

export const DEFAULT_YEAR = process.env.HEALTH_SYNC_START?.slice(0, 4) || '2025';
export const DEFAULT_EDU_YEAR = (process.env.EDU_MIX_YEARS || '2025-26').split(',')[0].trim();
export const DEFAULT_PROGRAM_ID = process.env.EDU_PROGRAM_ID || '5';

export const HEAVY_HEALTH_TABLES = new Set(['profile_patients', 'patient_appointments_new']);
export const APPOINTMENT_TABLES = new Set(['patient_appointments_new']);

export const SYMPTOM_PATHS = [
  'health_symtoms.php',
  'health_symtom.php',
  'health_symptom.php',
  'health_symptoms.php'
];

export const TABLE_ENDPOINTS = [
  {
    module: 'health',
    prefix: 'HL',
    path: 'health.php',
    thematic: 'health',
    baseBody: { module_type: 'health' },
    needsDates: true,
    tables: [
      'state', 'district', 'disease', 'block', 'village',
      'profile_patients', 'patient_appointments_new',
      'profile_doctors', 'partner'
    ]
  },
  {
    module: 'livelihood/skilltracking',
    prefix: 'SK',
    path: 'skilltracking.php',
    thematic: 'livelihood',
    baseBody: { module_type: 'livelyhood', project: 'skilltracting' },
    tables: [
      'state', 'district', 'block', 'village', 'persons', 'monitor',
      'batch_list', 'qualification', 'skill_center', 'training_stream',
      'pre_post_master'
    ]
  },
  {
    module: 'livelihood/enterprise_support',
    prefix: 'ES',
    path: 'enterprise_support.php',
    thematic: 'livelihood',
    baseBody: { module_type: 'livelyhood', project: 'enterprise_support' },
    tables: ['enterprise_support', 'enterprise_support_monitoring']
  },
  {
    module: 'livelihood/market_access',
    prefix: 'MA',
    path: 'market_access.php',
    thematic: 'livelihood',
    baseBody: { module_type: 'livelyhood', project: 'market_access' },
    tables: ['market_access']
  },
  {
    module: 'education',
    prefix: 'ED',
    path: 'education.php',
    thematic: 'education',
    baseBody: { module_type: 'education', project: 'education_program' },
    tables: ['education_program']
  }
];

export const AGG_ENDPOINTS = [
  {
    module: 'health',
    thematic: 'health',
    sheet: 'HL_beneficiary',
    path: 'health_beneficiary.php',
    label: 'Year envelope (beneficiary)',
    body: { module_type: 'health' }
  },
  {
    module: 'health',
    thematic: 'health',
    sheet: 'HL_disease_summary',
    path: 'health_desease.php',
    label: 'Disease mix (summary)',
    body: { module_type: 'health' }
  },
  {
    module: 'health',
    thematic: 'health',
    sheet: 'HL_disease_patients',
    path: 'health_desease.php',
    label: 'Disease patients (needs disease_id)',
    needsDiseaseId: true,
    heavy: true,
    caption: 'Pass a disease_id from the summary. Bounded Limit — PHP 500s on a full dump.',
    body: { module_type: 'health', Limit: '20', offset: '0' }
  },
  {
    module: 'health',
    thematic: 'health',
    sheet: 'HL_symptom_summary',
    path: SYMPTOM_PATHS[0],
    altPaths: SYMPTOM_PATHS.slice(1),
    label: 'Symptom mix (summary)',
    optional: true,
    body: { module_type: 'health' }
  },
  {
    module: 'education',
    thematic: 'education',
    sheet: 'ED_mixprogram',
    path: 'mixprogram.php',
    label: 'Mixprogramme schools',
    body: {}
  }
];

const TABLE_LABELS = {
  state: 'States',
  district: 'Districts',
  disease: 'Disease lookup',
  block: 'Blocks',
  village: 'Villages',
  profile_patients: 'Patient registration',
  patient_appointments_new: 'Patient appointments',
  profile_doctors: 'Doctors',
  partner: 'Partners',
  persons: 'Skill roster',
  monitor: 'Placement monitor',
  batch_list: 'Training batches',
  qualification: 'Qualifications',
  skill_center: 'Skill centres',
  training_stream: 'Trades / streams',
  pre_post_master: 'Pre/post master',
  enterprise_support: 'Enterprise members',
  enterprise_support_monitoring: 'FY profit monitor',
  market_access: 'Market access',
  education_program: 'Education programmes'
};

export function yearDateWindow(year) {
  const y = String(year).split('-')[0];
  return [`${y}-01-01`, `${y}-12-31`];
}

export function heavyDateWindow(year) {
  const y = String(year).split('-')[0];
  return [`${y}-12-01`, `${y}-12-31`];
}

export function appointmentDateWindow(year) {
  const y = String(year).split('-')[0];
  return [`${y}-12-29`, `${y}-12-31`];
}

export function pickId(rows, keys) {
  for (const r of rows || []) {
    if (!r || typeof r !== 'object') continue;
    for (const key of keys) {
      const val = r[key];
      if (val != null && val !== '' && val !== 0 && val !== '0') return String(val);
    }
  }
  return null;
}

export function pickDiseaseId(rows) {
  return pickId(rows, ['disease_id', 'id', 'DiseaseId']);
}

export function listLiveSheets() {
  const sheets = [];
  for (const ep of TABLE_ENDPOINTS) {
    for (const t of ep.tables) {
      const heavy = HEAVY_HEALTH_TABLES.has(t);
      sheets.push({
        sheet: `${ep.prefix}_${t}`,
        module: ep.module,
        thematic: ep.thematic,
        path: ep.path,
        tableName: t,
        label: `${ep.prefix} — ${TABLE_LABELS[t] || t}`,
        heavy,
        needsDates: Boolean(ep.needsDates),
        needsDiseaseId: false,
        caption: heavy
          ? 'Windowed extract — PHP 500s on a full year. Default window is a short end-of-year slice unless you set from_date/to_date.'
          : null
      });
    }
  }
  for (const ep of AGG_ENDPOINTS) {
    sheets.push({
      sheet: ep.sheet,
      module: ep.module,
      thematic: ep.thematic,
      path: ep.path,
      label: ep.label,
      heavy: Boolean(ep.heavy),
      needsDiseaseId: Boolean(ep.needsDiseaseId),
      optional: Boolean(ep.optional),
      caption: ep.caption || null
    });
  }
  return sheets;
}

export function buildJob(sheet, opts = {}) {
  const year = opts.year || DEFAULT_YEAR;
  const eduYear = opts.eduYear || opts.academic_year || DEFAULT_EDU_YEAR;
  const programId = opts.programId || DEFAULT_PROGRAM_ID;
  const limit = String(opts.Limit || opts.limit || 20);
  const offset = String(opts.offset || 0);
  const [defaultFrom, defaultTo] = yearDateWindow(year);
  let fromDate = opts.from_date || defaultFrom;
  let toDate = opts.to_date || defaultTo;

  for (const ep of TABLE_ENDPOINTS) {
    for (const t of ep.tables) {
      const name = `${ep.prefix}_${t}`;
      if (name !== sheet) continue;
      const body = { ...ep.baseBody, table_name: t };
      if (ep.needsDates) {
        if (HEAVY_HEALTH_TABLES.has(t) && fromDate === defaultFrom && toDate === defaultTo) {
          [fromDate, toDate] = APPOINTMENT_TABLES.has(t)
            ? appointmentDateWindow(year)
            : heavyDateWindow(year);
        }
        body.from_date = fromDate;
        body.to_date = toDate;
      }
      if (HEAVY_HEALTH_TABLES.has(t)) {
        body.Limit = limit;
        body.offset = offset;
      }
      return {
        sheet: name,
        module: ep.module,
        thematic: ep.thematic,
        endpoint: ep.path,
        url: `${API_BASE}/${ep.path}`,
        altUrls: [],
        body,
        needsDiseaseId: false,
        heavy: HEAVY_HEALTH_TABLES.has(t)
      };
    }
  }

  for (const ep of AGG_ENDPOINTS) {
    if (ep.sheet !== sheet) continue;
    const body = { ...ep.body };
    if (ep.sheet === 'ED_mixprogram') {
      body.program_id = programId;
      body.year = eduYear;
    } else if (ep.path.includes('health')) {
      body.year = year;
    }
    if (ep.needsDiseaseId) {
      if (!opts.disease_id) {
        const err = new Error('disease_id is required (pick one from HL_disease_summary)');
        err.code = 'NEEDS_DISEASE_ID';
        throw err;
      }
      body.disease_id = String(opts.disease_id);
      body.Limit = limit;
      body.offset = offset;
    }
    const altPaths = ep.altPaths || [];
    return {
      sheet: ep.sheet,
      module: ep.module,
      thematic: ep.thematic,
      endpoint: ep.path,
      url: `${API_BASE}/${ep.path}`,
      altUrls: altPaths.map((p) => `${API_BASE}/${p}`),
      body,
      needsDiseaseId: Boolean(ep.needsDiseaseId),
      optional: Boolean(ep.optional),
      heavy: Boolean(ep.heavy)
    };
  }

  return null;
}
