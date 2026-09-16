/**
 * tableSchemas.js — Central registry of all data-entry tables.
 *
 * Each entry defines:
 *   - thematic:    Which role scope can write to this table
 *   - label:       Human-readable name shown in the UI
 *   - primaryKey:  The column used for ON CONFLICT / upsert
 *   - fields:      Ordered array of field definitions rendered in the form
 *
 * Field definition shape:
 *   { col, label, type, required?, lookup? }
 *
 *   type  = 'text' | 'number' | 'date' | 'select' | 'textarea'
 *   lookup = { table, idCol, labelCol }   — for FK dropdown population
 */

export const TABLE_SCHEMAS = {
  // ─── Health ──────────────────────────────────────────────
  health_profile_patients: {
    thematic: 'health',
    label: 'Health — Patient Registration',
    primaryKey: 'patient_id',
    fields: [
      { col: 'patient_id', label: 'Patient ID', type: 'text', required: true },
      { col: 'full_name', label: 'Full Name', type: 'text', required: true },
      { col: 'gender', label: 'Gender', type: 'select', options: ['M', 'F', 'Other'] },
      { col: 'age', label: 'Age (years)', type: 'text' },
      { col: 'age_month', label: 'Age (months)', type: 'text' },
      { col: 'dob', label: 'Date of Birth', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'aadhar_no', label: 'Aadhaar No', type: 'text' },
      { col: 'contact_no', label: 'Contact No', type: 'text' },
      { col: 'partner_id', label: 'Healthcare Partner', type: 'select', required: true, lookup: { table: 'health_partner', idCol: 'source_id', labelCol: 'name' } },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'health_state', idCol: 'source_id', labelCol: 'name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'health_district', idCol: 'source_id', labelCol: 'name' } },
      { col: 'block_id', label: 'Block', type: 'select', lookup: { table: 'health_block', idCol: 'source_id', labelCol: 'name' } },
      { col: 'village_id', label: 'Village', type: 'select', lookup: { table: 'health_village', idCol: 'source_id', labelCol: 'name' } },
      { col: 'address', label: 'Address', type: 'textarea' },
      { col: 'pin_code', label: 'PIN Code', type: 'text' },
      { col: 'height', label: 'Height (cm)', type: 'text' },
      { col: 'weight', label: 'Weight (kg)', type: 'text' },
      { col: 'blood_group_id', label: 'Blood Group', type: 'text' },
      { col: 'caste_id', label: 'Community/Caste', type: 'text' },
      { col: 'disability', label: 'Disability', type: 'select', options: ['Yes', 'No'] },
      { col: 'female_is_pregnant', label: 'Pregnant (F)', type: 'select', options: ['Yes', 'No', ''] },
    ]
  },

  health_profile_doctors: {
    thematic: 'health',
    label: 'Health — Doctor Registration',
    primaryKey: 'source_id',
    fields: [
      { col: 'source_id', label: 'Doctor ID', type: 'text', required: true },
      { col: 'doctor_name', label: 'Doctor Name', type: 'text', required: true },
      { col: 'specialization', label: 'Specialization', type: 'text' },
      { col: 'partner_id', label: 'Healthcare Partner', type: 'select', required: true, lookup: { table: 'health_partner', idCol: 'source_id', labelCol: 'name' } },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'health_state', idCol: 'source_id', labelCol: 'name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'health_district', idCol: 'source_id', labelCol: 'name' } },
    ]
  },

  health_patient_appointments: {
    thematic: 'health',
    label: 'Health — Patient Appointment',
    primaryKey: 'appointment_id',
    fields: [
      { col: 'appointment_id', label: 'Appointment ID', type: 'text', required: true },
      { col: 'profile_patient_id', label: 'Patient', type: 'select', required: true, lookup: { table: 'health_profile_patients', idCol: 'patient_id', labelCol: 'full_name' } },
      { col: 'assigned_doctor_id', label: 'Assigned Doctor', type: 'select', lookup: { table: 'health_profile_doctors', idCol: 'source_id', labelCol: 'doctor_name' } },
      { col: 'symtom', label: 'Symptoms', type: 'text' },
      { col: 'disease', label: 'Disease', type: 'text' },
      { col: 'bp_lower', label: 'BP Lower', type: 'text' },
      { col: 'bp_upper', label: 'BP Upper', type: 'text' },
      { col: 'sugar', label: 'Blood Sugar', type: 'text' },
      { col: 'temperature', label: 'Temperature', type: 'text' },
      { col: 'blood_oxygen_level', label: 'SpO₂', type: 'text' },
      { col: 'pulse', label: 'Pulse', type: 'text' },
      { col: 'hemoglobin', label: 'Haemoglobin', type: 'text' },
      { col: 'fees_free_or_paid', label: 'Free / Paid', type: 'select', options: ['Free', 'Paid'] },
      { col: 'paid_amount', label: 'Amount Paid', type: 'text' },
      { col: 'prescription', label: 'Prescription', type: 'textarea' },
      { col: 'doctor_remarks', label: 'Doctor Remarks', type: 'textarea' },
      { col: 'partner_id', label: 'Healthcare Partner', type: 'select', lookup: { table: 'health_partner', idCol: 'source_id', labelCol: 'name' } },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'health_state', idCol: 'source_id', labelCol: 'name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'health_district', idCol: 'source_id', labelCol: 'name' } },
    ]
  },

  // ─── Livelihood — Skilling ───────────────────────────────
  skilltracking_batch_list: {
    thematic: 'livelihood',
    label: 'Livelihood — Training Batch',
    primaryKey: 'batch_id',
    fields: [
      { col: 'batch_id', label: 'Batch ID', type: 'text', required: true },
      { col: 'batch_name', label: 'Batch Name', type: 'text', required: true },
      { col: 'course_id', label: 'Course / Trade', type: 'select', required: true, lookup: { table: 'skilltracking_training_stream', idCol: 'stream_id', labelCol: 'stream_name' } },
      { col: 'center_id', label: 'Skill Center', type: 'select', required: true, lookup: { table: 'skilltracking_skill_center', idCol: 'center_id', labelCol: 'center_name' } },
      { col: 'batch_strength', label: 'Batch Strength', type: 'text' },
      { col: 'batch_start_date', label: 'Start Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'batch_end_date', label: 'End Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'training_id', label: 'Training Stream', type: 'select', lookup: { table: 'skilltracking_training_stream', idCol: 'stream_id', labelCol: 'stream_name' } },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'skilltracking_state', idCol: 'state_id', labelCol: 'state_name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'skilltracking_district', idCol: 'district_id', labelCol: 'district_name' } },
      { col: 'latitude', label: 'Latitude', type: 'text' },
      { col: 'longitude', label: 'Longitude', type: 'text' },
    ]
  },

  skilltracking_persons: {
    thematic: 'livelihood',
    label: 'Livelihood — Skilling Trainee',
    primaryKey: 'person_id',
    fields: [
      { col: 'person_id', label: 'Person ID', type: 'text', required: true },
      { col: 'person_name', label: 'Full Name', type: 'text', required: true },
      { col: 'batch_id', label: 'Batch', type: 'select', required: true, lookup: { table: 'skilltracking_batch_list', idCol: 'batch_id', labelCol: 'batch_name' } },
      { col: 'gender', label: 'Gender', type: 'select', options: ['M', 'F', 'Other'] },
      { col: 'dob', label: 'Date of Birth', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'email', label: 'Email', type: 'text' },
      { col: 'mobile_number', label: 'Mobile', type: 'text' },
      { col: 'address', label: 'Address', type: 'textarea' },
      { col: 'qualification_id', label: 'Qualification', type: 'select', lookup: { table: 'skilltracking_qualification', idCol: 'qualification_id', labelCol: 'qualification_name' } },
      { col: 'training_stream_id', label: 'Trade / Stream', type: 'select', lookup: { table: 'skilltracking_training_stream', idCol: 'stream_id', labelCol: 'stream_name' } },
      { col: 'center_id', label: 'Skill Center', type: 'select', lookup: { table: 'skilltracking_skill_center', idCol: 'center_id', labelCol: 'center_name' } },
      { col: 'date_of_completion_of_training', label: 'Completion Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'skilltracking_state', idCol: 'state_id', labelCol: 'state_name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'skilltracking_district', idCol: 'district_id', labelCol: 'district_name' } },
    ]
  },

  skilltracking_monitor: {
    thematic: 'livelihood',
    label: 'Livelihood — Placement Monitor',
    primaryKey: 'monitoring_id',
    fields: [
      { col: 'monitoring_id', label: 'Monitoring ID', type: 'text', required: true },
      { col: 'person_id', label: 'Person', type: 'select', required: true, lookup: { table: 'skilltracking_persons', idCol: 'person_id', labelCol: 'person_name' } },
      { col: 'date_of_monitor', label: 'Monitor Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'work_status', label: 'Work Status', type: 'select', options: ['Working', 'Not Working', 'Self Employed'] },
      { col: 'current_work', label: 'Current Work', type: 'text' },
      { col: 'employment_type', label: 'Employment Type', type: 'select', options: ['Salaried', 'Daily Wage', 'Self Employed'] },
      { col: 'monthly_income', label: 'Monthly Income (₹)', type: 'text' },
      { col: 'remark', label: 'Remarks', type: 'textarea' },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'skilltracking_state', idCol: 'state_id', labelCol: 'state_name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'skilltracking_district', idCol: 'district_id', labelCol: 'district_name' } },
    ]
  },

  // ─── Livelihood — Enterprise ─────────────────────────────
  enterprise_support: {
    thematic: 'livelihood',
    label: 'Livelihood — Enterprise Member',
    primaryKey: 'member_id',
    fields: [
      { col: 'member_id', label: 'Member ID', type: 'text', required: true },
      { col: 'member_name', label: 'Member Name', type: 'text', required: true },
      { col: 'member_type', label: 'Member Type', type: 'select', options: ['Individual', 'SHG', 'FPO'] },
      { col: 'member_mode', label: 'Member Mode', type: 'text' },
      { col: 'phone_number', label: 'Phone', type: 'text' },
      { col: 'supported_by', label: 'Supported By', type: 'text' },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'skilltracking_state', idCol: 'state_id', labelCol: 'state_name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'skilltracking_district', idCol: 'district_id', labelCol: 'district_name' } },
      { col: 'block_id', label: 'Block', type: 'select', lookup: { table: 'skilltracking_block', idCol: 'block_id', labelCol: 'block_name' } },
      { col: 'village_id', label: 'Village', type: 'select', lookup: { table: 'skilltracking_village', idCol: 'village_id', labelCol: 'village_name' } },
    ]
  },

  enterprise_support_monitoring: {
    thematic: 'livelihood',
    label: 'Livelihood — Enterprise Profit Monitor',
    primaryKey: 'monitoring_id',
    fields: [
      { col: 'monitoring_id', label: 'Monitoring ID', type: 'text', required: true },
      { col: 'member_id', label: 'Enterprise Member', type: 'select', required: true, lookup: { table: 'enterprise_support', idCol: 'member_id', labelCol: 'member_name' } },
      { col: 'financial_year', label: 'Financial Year', type: 'text', placeholder: 'e.g. 2024-25' },
      { col: 'profit', label: 'Annual Profit (₹)', type: 'text' },
    ]
  },

  skilltracking_pre_post_master: {
    thematic: 'livelihood',
    label: 'Livelihood — Pre/Post Assessment Master',
    primaryKey: 'pre_post_id',
    fields: [
      { col: 'pre_post_id', label: 'Pre/Post ID', type: 'text', required: true },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'skilltracking_state', idCol: 'state_id', labelCol: 'state_name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'skilltracking_district', idCol: 'district_id', labelCol: 'district_name' } },
      { col: 'user_id', label: 'User ID', type: 'text' },
      { col: 'financial_year', label: 'Financial Year', type: 'text', placeholder: 'e.g. 2024-25' },
      { col: 'livelihood', label: 'Livelihood Module', type: 'text' },
      { col: 'trade_name', label: 'Trade Name', type: 'text' },
      { col: 'candidates_trained', label: 'Candidates Trained', type: 'number' },
      { col: 'age_group', label: 'Age Group', type: 'text' },
      { col: 'category', label: 'Category', type: 'text' },
      { col: 'male_count', label: 'Male Count', type: 'number' },
      { col: 'female_count', label: 'Female Count', type: 'number' },
      { col: 'placement_status', label: 'Placement Count', type: 'number' },
      { col: 'assessment_type', label: 'Assessment Type', type: 'select', options: ['PRE', 'POST'] }
    ]
  },

  enterprise_market_access: {
    thematic: 'livelihood',
    label: 'Livelihood — Enterprise Market Access',
    primaryKey: 'access_id',
    fields: [
      { col: 'access_id', label: 'Access ID', type: 'text', required: true },
      { col: 'agency_name', label: 'Agency Name', type: 'text', required: true },
      { col: 'sales_generated_average', label: 'Avg Sales Generated', type: 'text' },
      { col: 'market_access_type', label: 'Market Access Type', type: 'textarea' },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'skilltracking_state', idCol: 'state_id', labelCol: 'state_name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'skilltracking_district', idCol: 'district_id', labelCol: 'district_name' } },
      { col: 'user_id', label: 'User ID', type: 'text' },
      { col: 'financial_year', label: 'Financial Year', type: 'text', placeholder: 'e.g. 2024-25' },
      { col: 'status', label: 'Status', type: 'select', options: ['1', '0'] }
    ]
  },

  // ─── Education ───────────────────────────────────────────
  education_program: {
    thematic: 'education',
    label: 'Education — Programme Session',
    primaryKey: 'program_id',
    fields: [
      { col: 'program_id', label: 'Programme ID', type: 'text', required: true },
      { col: 'program_name', label: 'Programme Name', type: 'text', required: true },
      { col: 'activity_type', label: 'Activity Type', type: 'text' },
      { col: 'school_name', label: 'School Name', type: 'text' },
      { col: 'school_id', label: 'School ID', type: 'text' },
      { col: 'academic_year', label: 'Academic Year', type: 'text', placeholder: 'e.g. 2024-25' },
      { col: 'activity_date', label: 'Activity Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'student_count', label: 'Student Count', type: 'number' },
      { col: 'state_id', label: 'State', type: 'select', lookup: { table: 'skilltracking_state', idCol: 'state_id', labelCol: 'state_name' } },
      { col: 'district_id', label: 'District', type: 'select', lookup: { table: 'skilltracking_district', idCol: 'district_id', labelCol: 'district_name' } },
      { col: 'block_id', label: 'Block', type: 'select', lookup: { table: 'skilltracking_block', idCol: 'block_id', labelCol: 'block_name' } },
      { col: 'village_id', label: 'Village', type: 'select', lookup: { table: 'skilltracking_village', idCol: 'village_id', labelCol: 'village_name' } },
    ]
  },

  education_assessment: {
    thematic: 'education',
    label: 'Education — Values Assessment',
    primaryKey: 'assessment_id',
    fields: [
      { col: 'assessment_id', label: 'Assessment ID', type: 'text', required: true },
      { col: 'program_id', label: 'Programme', type: 'select', required: true, lookup: { table: 'education_program', idCol: 'program_id', labelCol: 'program_name' } },
      { col: 'school_id', label: 'School ID', type: 'text' },
      { col: 'student_id', label: 'Student ID', type: 'text' },
      { col: 'value_name', label: 'Value Name', type: 'text', placeholder: 'e.g. Respect, Empathy' },
      { col: 'pre_score', label: 'Pre Score', type: 'number' },
      { col: 'post_score', label: 'Post Score', type: 'number' },
      { col: 'assessment_date', label: 'Assessment Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'academic_year', label: 'Academic Year', type: 'text', placeholder: 'e.g. 2024-25' },
    ]
  },

  health_beneficiary_year: {
    thematic: 'health',
    label: 'Health — Year envelope',
    primaryKey: 'year',
    fields: [
      { col: 'year', label: 'Calendar year', type: 'text', required: true },
      { col: 'total_beneficiary', label: 'Total beneficiaries', type: 'number' },
      { col: 'total_village', label: 'Villages', type: 'number' },
      { col: 'total_state', label: 'States', type: 'number' },
      { col: 'total_adolescent_10_19', label: 'Adolescents 10–19', type: 'number' },
    ]
  },

  health_disease_summary: {
    thematic: 'health',
    label: 'Health — Disease mix summary',
    primaryKey: 'id',
    fields: [
      { col: 'id', label: 'Row ID', type: 'text', required: true },
      { col: 'year', label: 'Calendar year', type: 'text' },
      { col: 'disease_id', label: 'Disease ID', type: 'text' },
      { col: 'disease_name', label: 'Disease name', type: 'text' },
      { col: 'total_patients', label: 'Patients', type: 'number' },
    ]
  },

  health_disease_patients: {
    thematic: 'health',
    label: 'Health — Disease patients (sample)',
    primaryKey: 'id',
    fields: [
      { col: 'id', label: 'Row ID', type: 'text', required: true },
      { col: 'year', label: 'Calendar year', type: 'text' },
      { col: 'disease_id', label: 'Disease ID', type: 'text' },
      { col: 'patient_id', label: 'Patient ID', type: 'text' },
      { col: 'patient_name', label: 'Patient name', type: 'text' },
    ]
  },

  education_mixprogram: {
    thematic: 'education',
    label: 'Education — Mixprogramme schools',
    primaryKey: 'id',
    fields: [
      { col: 'id', label: 'Row ID', type: 'text', required: true },
      { col: 'program_id', label: 'Programme ID', type: 'text' },
      { col: 'school_name', label: 'School name', type: 'text' },
      { col: 'location', label: 'Location', type: 'text' },
      { col: 'year', label: 'Year', type: 'text' },
      { col: 'students_total', label: 'Students total', type: 'number' },
    ]
  },

  education_muskaan_assessment: {
    thematic: 'education',
    label: 'Education — Muskaan Skill Assessment',
    primaryKey: 'assessment_id',
    fields: [
      { col: 'assessment_id', label: 'Assessment ID', type: 'text', required: true },
      { col: 'school_id', label: 'School ID', type: 'text' },
      { col: 'student_id', label: 'Student ID', type: 'text' },
      { col: 'skill_area', label: 'Skill Area', type: 'text', placeholder: 'e.g. Communication' },
      { col: 'pre_level', label: 'Pre Level', type: 'text', placeholder: 'e.g. Beginner' },
      { col: 'post_level', label: 'Post Level', type: 'text', placeholder: 'e.g. Proficient' },
      { col: 'assessment_date', label: 'Assessment Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { col: 'academic_year', label: 'Academic Year', type: 'text', placeholder: 'e.g. 2024-25' },
    ]
  },
};

/**
 * Returns the thematic domain for a given table name.
 * @param {string} tableName
 * @returns {string|null}
 */
export function getTableThematic(tableName) {
  return TABLE_SCHEMAS[tableName]?.thematic ?? null;
}

/**
 * Returns only the table schemas a user is allowed to access.
 * @param {object} user - Session user with role and thematic
 * @returns {object} Filtered subset of TABLE_SCHEMAS
 */
export function getTablesForUser(user) {
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  const result = {};
  for (const [key, schema] of Object.entries(TABLE_SCHEMAS)) {
    if (isAdmin || user.thematic === schema.thematic) {
      result[key] = schema;
    }
  }
  return result;
}
