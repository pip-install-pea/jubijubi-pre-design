/**
 * Types inferred from live Jubicare centralizeddashboardapi responses (2026-09-21).
 * Generated from probe samples. Do not invent extra fields.
 * PII fields are typed but must be masked in logs and committed samples.
 */

export type PhpStatus = boolean;

export interface HealthTableEnvelope<T> {
  status: true;
  module_type: 'health';
  table_name: string;
  total_records: number;
  data: T[];
}

export interface HealthError {
  status: false;
  message: string;
}

export interface HealthStateRow {
  id: string;
  name: string;
  del_action: string;
}

export interface HealthDistrictRow {
  id: string;
  name: string;
  state_id: string;
  del_action: string;
}

export interface HealthBlockRow {
  id: string;
  name: string;
  district_id: string;
  del_action: string;
}

export interface HealthVillageRow {
  id: string;
  name: string;
  block_id: string;
  del_action: string;
}

export interface HealthDiseaseRow {
  id: string;
  disease_name: string;
  del_action: string;
}

export interface HealthPartnerRow {
  partner_id: string;
  partner_name: string;
  partner_logo: string;
  active_status: string;
  created_at: string;
}

export interface HealthDoctorRow {
  id: string;
  user_id: string;
  full_name: string;
  registration_no: string | null;
  email: string;
  degree: string;
  contact_no: string;
  address: string;
  description: string;
  state_id: string;
  district_id: string;
  block_id: string;
  village_id: string;
  doctor_sign: string;
  profile_pic: string;
  created_at: string;
  del_action: string;
  doctor_status: string;
  post_office: string;
  applicable_in: string;
  active_cases: string;
  number_of_patient_scene: string;
  partner_id: string;
}

export interface HealthPatientRow {
  patient_id: string;
  user_id: string;
  full_name: string;
  gender: string;
  female_is_pregnant: string;
  edd: string;
  is_edd_lmp: string | null;
  age: string;
  age_month: string;
  partner_id: string;
  self_added: string;
  dob: string;
  aadhar_no: string;
  contact_no: string;
  state_id: string;
  district_id: string;
  block_id: string;
  village_id: string;
  address: string;
  pin_code: string;
  profile_pic: string;
  height: string;
  weight: string;
  blood_group_id: string;
  caste_id: string;
  disability: string;
  created_at: string;
  updated_at: string;
  del_action: string;
  added_by: string;
  unique_code: string;
  sync_status: string;
}

export interface HealthAppointmentRow {
  appointment_id: string;
  profile_patient_id: string;
  symtom: string;
  bp_lower: string;
  bp_upper: string;
  sugar: string;
  temperature: string;
  blood_oxygen_level: string;
  pulse: string;
  hemoglobin: string;
  currently_taking_any_prescribed_medication: string;
  date_of_prescribed_medication: string;
  fees_free_or_paid: string;
  paid_amount: string;
  assigned_doctor_id: string;
  previous_prescription: string;
  disease: string;
  is_doctro_done: string;
  is_doctor_done_date: string;
  doctor_remarks: string;
  prescription: string;
  is_send_prescription: string;
  is_edit_pharmacist_prescription: string;
  pharmacist_prescription: string | null;
  is_pharmacist_done: string;
  pharmacist_done_date: string;
  patient_remark: string;
  medicine_given: string;
  state_id: string;
  district_id: string;
  created_at: string;
  partner_id: string;
  sync_status: string;
}

export interface HealthBeneficiaryEnvelope {
  status: true;
  module_type: 'health';
  year: string;
  data: {
    total_beneficiary: number;
    total_village: number;
    total_state: number;
    total_adolescent_10_19: number;
  };
}

export interface HealthDiseaseSummaryEnvelope {
  status: true;
  module_type: 'health';
  year: number;
  total_diseases: number;
  data: Array<{
    disease_id: number;
    disease_name: string;
    total_patients: number;
  }>;
}

export interface HealthDiseasePatientsEnvelope {
  status: true;
  module_type: 'health';
  year: number;
  disease_id: number;
  limit: number;
  offset: number;
  total_records: number;
  total_pages: number;
  data: Array<
    Omit<HealthPatientRow, 'patient_id' | 'user_id' | 'partner_id' | 'state_id' | 'district_id' | 'block_id' | 'village_id' | 'pin_code'> & {
      patient_id: number | string;
      user_id: number | string;
      partner_id: number | string;
      state_id: number | string;
      district_id: number | string;
      block_id: number | string;
      village_id: number | string;
      pin_code: number | string;
    }
  >;
}

export interface HealthSymptomSummaryEnvelope {
  status: true;
  module_type: 'health';
  year: number;
  total_symtom: number;
  data: Array<{
    symptom_id: number;
    symptom_name: string;
    total_patients: number;
  }>;
}

export interface LivelihoodTableEnvelope<T> {
  status: true;
  module_type: 'livelyhood';
  project: string;
  table_name: string;
  data: T[];
}

export interface LivelihoodError {
  status: false;
  msg: string;
}

export interface SkillStateRow {
  state_id: string;
  state_name: string;
  status: string;
}

export interface SkillDistrictRow {
  district_id: string;
  district_name: string;
  state_id: string;
  status: string;
  created_at: string;
}

export interface SkillBlockRow {
  block_id: string;
  block_name: string;
  district_id: string;
  state_id: string;
  status: string;
  created_at: string;
}

export interface SkillVillageRow {
  village_id: string;
  village_name: string;
  block_id: string;
  district_id: string;
  state_id: string;
  status: string;
  created_at: string;
}

export interface SkillPersonRow {
  person_id: string;
  batch_id: string;
  person_name: string;
  email: string;
  dob: string;
  gender: string;
  mobile_number: string;
  address: string;
  qualification_id: string;
  training_stream_id: string;
  center_id: string;
  date_of_completion_of_training: string;
  district_id: string;
  state_id: string;
  profile_pic: string;
  status: string;
  created_at: string;
  user_id: string;
  latitude: string;
  longititude: string;
}

export interface SkillMonitorRow {
  monitoring_id: string;
  person_id: string;
  date_of_monitor: string;
  work_status: string;
  current_work: string;
  employement_type: string;
  monthly_income: string;
  remark: string;
  district_id: string;
  state_id: string;
  status: string;
  created_at: string;
  user_id: string;
}

export interface SkillBatchRow {
  batch_id: string;
  batch_name: string;
  state_id: string;
  district_id: string;
  course_id: string;
  batch_strength: string;
  about_training_discussion: string;
  batch_start_date: string;
  batch_end_date: string;
  center_id: string;
  training_id: string;
  user_id: string;
  latitude: string;
  longititude: string;
  created_at: string;
  updated_at: string;
  status: string;
}

export interface SkillQualificationRow {
  qualification_id: string;
  education_qualification: string;
  status: string;
  created_at: string;
}

export interface SkillCenterRow {
  center_id: string;
  skill_center_name: string;
  district_id: string;
  state_id: string;
  status: string;
  created_at: string;
}

export interface SkillTrainingStreamRow {
  training_id: string;
  training_name: string;
  created_at: string;
  status: string;
}

export interface SkillPrePostMasterRow {
  id: string;
  state_id: string;
  district_id: string;
  user_id: string;
  financial_year: string;
  livelihood: string;
  trade_name: string;
  candidates_trained: string;
  age_group: string;
  category: string;
  male_count: string;
  female_count: string;
  placement_status: string;
  assessment_type: string;
  created_at: string;
}

export interface SkillProgramRow {
  id: string;
  program_name: string;
  program_code: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SkillKkpPrePostRow {
  id: string;
  financial_year: string;
  location_name: string;
  value_name: string;
  pre_kkp: string;
  post_kkp: string;
  created_at: string;
  updated_at: string;
}

export interface EnterpriseSupportRow {
  member_id: string;
  member_name: string;
  member_type: string;
  member_mode: string;
  phone_number: string;
  state_id: string;
  district_id: string;
  block_id: string;
  village_id: string;
  user_id: string;
  supported_by: string;
  status: string;
  created_at: string;
}

export interface EnterpriseSupportMonitoringRow {
  monitoring_id: string;
  member_id: string;
  user_id: string;
  financial_year: string;
  profit: string;
  status: string;
  created_at: string;
}

export interface MarketAccessRow {
  id: string;
  agency_name: string;
  sales_generated_average: string;
  market_access_type: string;
  state_id: string;
  district_id: string;
  user_id: string;
  financial_year: string;
  status: string;
  created_at: string;
}

export interface MixprogramEnvelope {
  status: true;
  message: string;
  program: { id: number; name: string; code: string };
  filter: { year: string; status: string };
  table_name: string;
  total: number;
  data: MixprogramRow[];
}

export interface MixprogramRow {
  id: number;
  program_id: number;
  sno: number;
  location: string;
  block: string;
  school_name: string;
  year: string;
  students_male: number;
  students_female: number;
  students_total: number;
  teachers_reached: number;
  theme_touched: string;
  class: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface EducationProgramRow {
  id: string;
  program_name: string;
  no_of_school: string;
  no_of_students_participating: string;
  activity_count: string;
  total_interventions: string;
  state_id: string;
  district_id: string;
  user_id: string;
  status: string;
  created_at: string;
}
