/**
 * Zod schemas from live Jubicare responses (2026-09-21).
 * Requires `zod` if you import this file into the app. Not wired into runtime yet.
 */
import { z } from 'zod';

export const healthErrorZ = z.object({
  status: z.literal(false),
  message: z.string()
});

export const livelihoodErrorZ = z.object({
  status: z.literal(false),
  msg: z.string()
});

export const healthStateRowZ = z.object({
  id: z.string(),
  name: z.string(),
  del_action: z.string()
});

export const healthDistrictRowZ = healthStateRowZ.extend({
  state_id: z.string()
});

export const healthBlockRowZ = z.object({
  id: z.string(),
  name: z.string(),
  district_id: z.string(),
  del_action: z.string()
});

export const healthVillageRowZ = z.object({
  id: z.string(),
  name: z.string(),
  block_id: z.string(),
  del_action: z.string()
});

export const healthDiseaseRowZ = z.object({
  id: z.string(),
  disease_name: z.string(),
  del_action: z.string()
});

export const healthPartnerRowZ = z.object({
  partner_id: z.string(),
  partner_name: z.string(),
  partner_logo: z.string(),
  active_status: z.string(),
  created_at: z.string()
});

export const healthDoctorRowZ = z.object({
  id: z.string(),
  user_id: z.string(),
  full_name: z.string(),
  registration_no: z.string().nullable(),
  email: z.string(),
  degree: z.string(),
  contact_no: z.string(),
  address: z.string(),
  description: z.string(),
  state_id: z.string(),
  district_id: z.string(),
  block_id: z.string(),
  village_id: z.string(),
  doctor_sign: z.string(),
  profile_pic: z.string(),
  created_at: z.string(),
  del_action: z.string(),
  doctor_status: z.string(),
  post_office: z.string(),
  applicable_in: z.string(),
  active_cases: z.string(),
  number_of_patient_scene: z.string(),
  partner_id: z.string()
});

export const healthPatientRowZ = z.object({
  patient_id: z.string(),
  user_id: z.string(),
  full_name: z.string(),
  gender: z.string(),
  female_is_pregnant: z.string(),
  edd: z.string(),
  is_edd_lmp: z.string().nullable(),
  age: z.string(),
  age_month: z.string(),
  partner_id: z.string(),
  self_added: z.string(),
  dob: z.string(),
  aadhar_no: z.string(),
  contact_no: z.string(),
  state_id: z.string(),
  district_id: z.string(),
  block_id: z.string(),
  village_id: z.string(),
  address: z.string(),
  pin_code: z.string(),
  profile_pic: z.string(),
  height: z.string(),
  weight: z.string(),
  blood_group_id: z.string(),
  caste_id: z.string(),
  disability: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  del_action: z.string(),
  added_by: z.string(),
  unique_code: z.string(),
  sync_status: z.string()
});

export const healthAppointmentRowZ = z.object({
  appointment_id: z.string(),
  profile_patient_id: z.string(),
  symtom: z.string(),
  bp_lower: z.string(),
  bp_upper: z.string(),
  sugar: z.string(),
  temperature: z.string(),
  blood_oxygen_level: z.string(),
  pulse: z.string(),
  hemoglobin: z.string(),
  currently_taking_any_prescribed_medication: z.string(),
  date_of_prescribed_medication: z.string(),
  fees_free_or_paid: z.string(),
  paid_amount: z.string(),
  assigned_doctor_id: z.string(),
  previous_prescription: z.string(),
  disease: z.string(),
  is_doctro_done: z.string(),
  is_doctor_done_date: z.string(),
  doctor_remarks: z.string(),
  prescription: z.string(),
  is_send_prescription: z.string(),
  is_edit_pharmacist_prescription: z.string(),
  pharmacist_prescription: z.string().nullable(),
  is_pharmacist_done: z.string(),
  pharmacist_done_date: z.string(),
  patient_remark: z.string(),
  medicine_given: z.string(),
  state_id: z.string(),
  district_id: z.string(),
  created_at: z.string(),
  partner_id: z.string(),
  sync_status: z.string()
});

export const healthBeneficiaryEnvelopeZ = z.object({
  status: z.literal(true),
  module_type: z.literal('health'),
  year: z.string(),
  data: z.object({
    total_beneficiary: z.number(),
    total_village: z.number(),
    total_state: z.number(),
    total_adolescent_10_19: z.number()
  })
});

export const healthDiseaseSummaryEnvelopeZ = z.object({
  status: z.literal(true),
  module_type: z.literal('health'),
  year: z.number(),
  total_diseases: z.number(),
  data: z.array(
    z.object({
      disease_id: z.number(),
      disease_name: z.string(),
      total_patients: z.number()
    })
  )
});

export const healthSymptomSummaryEnvelopeZ = z.object({
  status: z.literal(true),
  module_type: z.literal('health'),
  year: z.number(),
  total_symtom: z.number(),
  data: z.array(
    z.object({
      symptom_id: z.number(),
      symptom_name: z.string(),
      total_patients: z.number()
    })
  )
});

export const skillStateRowZ = z.object({
  state_id: z.string(),
  state_name: z.string(),
  status: z.string()
});

export const skillProgramRowZ = z.object({
  id: z.string(),
  program_name: z.string(),
  program_code: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const skillKkpPrePostRowZ = z.object({
  id: z.string(),
  financial_year: z.string(),
  location_name: z.string(),
  value_name: z.string(),
  pre_kkp: z.string(),
  post_kkp: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const enterpriseSupportRowZ = z.object({
  member_id: z.string(),
  member_name: z.string(),
  member_type: z.string(),
  member_mode: z.string(),
  phone_number: z.string(),
  state_id: z.string(),
  district_id: z.string(),
  block_id: z.string(),
  village_id: z.string(),
  user_id: z.string(),
  supported_by: z.string(),
  status: z.string(),
  created_at: z.string()
});

export const enterpriseSupportMonitoringRowZ = z.object({
  monitoring_id: z.string(),
  member_id: z.string(),
  user_id: z.string(),
  financial_year: z.string(),
  profit: z.string(),
  status: z.string(),
  created_at: z.string()
});

export const marketAccessRowZ = z.object({
  id: z.string(),
  agency_name: z.string(),
  sales_generated_average: z.string(),
  market_access_type: z.string(),
  state_id: z.string(),
  district_id: z.string(),
  user_id: z.string(),
  financial_year: z.string(),
  status: z.string(),
  created_at: z.string()
});

export const mixprogramEnvelopeZ = z.object({
  status: z.literal(true),
  message: z.string(),
  program: z.object({
    id: z.number(),
    name: z.string(),
    code: z.string()
  }),
  filter: z.object({
    year: z.string(),
    status: z.string()
  }),
  table_name: z.string(),
  total: z.number(),
  data: z.array(
    z.object({
      id: z.number(),
      program_id: z.number(),
      sno: z.number(),
      location: z.string(),
      block: z.string(),
      school_name: z.string(),
      year: z.string(),
      students_male: z.number(),
      students_female: z.number(),
      students_total: z.number(),
      teachers_reached: z.number(),
      theme_touched: z.string(),
      class: z.string(),
      status: z.string(),
      created_at: z.string(),
      updated_at: z.string()
    })
  )
});

export const educationProgramRowZ = z.object({
  id: z.string(),
  program_name: z.string(),
  no_of_school: z.string(),
  no_of_students_participating: z.string(),
  activity_count: z.string(),
  total_interventions: z.string(),
  state_id: z.string(),
  district_id: z.string(),
  user_id: z.string(),
  status: z.string(),
  created_at: z.string()
});
