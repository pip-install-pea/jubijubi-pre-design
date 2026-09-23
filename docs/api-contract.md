# Jubicare Centralised Dashboard API — live contract

Probed **2026-09-21** against `https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/`.  
Method: **POST** JSON. Auth: **none observed** (existing code and this probe send only `Content-Type: application/json`).  
Spec file documents **request bodies only**. Where spec and live disagree, **live wins**; both are recorded.

**PII:** samples under `api-samples/` are gitignored. Names, phones and IDs below are masked. Do not commit full dumps of `profile_patients`, `profile_doctors`, `persons`, or disease/symptom patient pages.

**Rule for implementers:** read this file before touching PHP client or sync payloads. Never assume fields from memory.

---

## 0. Inventory (spec × code)

| Endpoint | `table_name` / variant | Spec payload | Code uses? | Live (this probe) |
|---|---|---|---|---|
| `health.php` | `state` | `{module_type,table_name}` | Yes — `phpRegistry.js` 54–66; `syncEngine.js` 378–385 | Spec body **fails** (plain text). Works with `from_date`/`to_date` |
| `health.php` | `district` | same | Yes — `phpRegistry.js` 54–66; `syncEngine.js` 388–395 | same |
| `health.php` | `disease` | same | Yes — `phpRegistry.js` 54–66; `syncEngine.js` 418–425 | same. PK field is `id`, not `disease_id` |
| `health.php` | `block` | same | Yes — `phpRegistry.js` 54–66; `syncEngine.js` 398–405 | same |
| `health.php` | `village` | same | Yes — `phpRegistry.js` 54–66; `syncEngine.js` 408–415 | same |
| `health.php` | `profile_patients` | same | Yes — `phpRegistry.js` 54–66, 44; `syncEngine.js` 438–457 | Dated window required. `Limit` **ignored** |
| `health.php` | `patient_appointments_new` | same | Yes — `phpRegistry.js` 54–66, 45; `syncEngine.js` 460–483 | Spec body fails. **~1 month window → HTTP 500**. **3-day window → 200** |
| `health.php` | `profile_doctors` | same | Yes — `phpRegistry.js` 54–66; `syncEngine.js` 486–497 | dated body works |
| `health.php` | `partner` | same | Yes — `phpRegistry.js` 54–66; `syncEngine.js` 428–435 | dated body works |
| `health.php?type=reach` | `state` | leftover query in spec hyperlink | No | Same as without query when dates missing |
| `health_beneficiary.php` | year envelope | `{module_type,year:"2025"}` | Yes — `phpRegistry.js` 106–114; `syncEngine.js` 500–510; `healthAnalytics.js` 270 | Works. `"2025-26"` rejected |
| `health_desease.php` | summary | `{module_type,year}` | Yes — `phpRegistry.js` 115–123; `syncEngine.js` 513–520; `healthAnalytics.js` 288 | Works. Filename spelling is real |
| `health_desease.php` | paged | + `disease_id`,`Limit`,`offset` | Yes — `phpRegistry.js` 124–133; `syncEngine.js` 523–532 | Works with **real** `disease_id`. Spec `"2025"` is empty |
| `health_symtom.php` | summary / paged | spec filename | Listed as alt in `phpRegistry.js` 48–52 | **HTTP 404** |
| `health_symtoms.php` | summary | not in spec | Yes — `phpRegistry.js` 47–48, 134–143; `syncEngine.js` 535–543; `healthAnalytics.js` 303 | **This is the live file** |
| `health_symtoms.php` | patient page | spec uses `disease_id` | Code uses `symptom_id` (`phpRegistry.js` 320–328) | `disease_id` **ignored** (returns summary). `symptom_id` pages patients |
| `skilltracking.php` | `state` … `program` (12 tables) | `{module_type:"livelyhood",project:"skilltracting",table_name}` | Yes — `phpRegistry.js` 68–78; `syncEngine.js` 548–720 | Spec misspellings **required** |
| `skilltracking.php` | `kkp_pre_and_post` | in spec allow-list | **No** (not in `TABLE_ENDPOINTS.tables`) | 200, 60 rows |
| `enterprise_support.php` | `enterprise_support` | spec example uses monitoring table | Yes — `phpRegistry.js` 80–86; `syncEngine.js` 683–695 | Works |
| `enterprise_support.php` | `enterprise_support_monitoring` | spec example | Yes — `phpRegistry.js` 86; `syncEngine.js` 698–706 | Works; **not** the same as MA copy |
| `mixprogram.php` | `program_id`+`year` | no `module_type` | Yes — `phpRegistry.js` 156–163; `syncEngine.js` 331–345 | Works. Extra `module_type` ignored |
| `market_access.php` | `market_access` | spec | Yes — `phpRegistry.js` 88–94; `syncEngine.js` 723–734 | Works (2 rows) |
| `market_access.php` | `enterprise_support_monitoring` | spec allow-list | **Explicitly avoided** (`phpRegistry.js` 3–5) | `{status:false,msg:"Table not allowed for this project"}` |
| `education.php` | `education_program` | spec | Yes — `phpRegistry.js` 96–103; `syncEngine.js` 318–328 | Works. Visible filename is correct (not `market_access.php`) |
| `education.php` | `education_assessment` / `education_muskaan_assessment` | **not in spec** | Optional sync `syncEngine.js` 348–373 | `{status:false,msg:"Table not allowed for this project"}` |

---

## 1. Global live behaviour

| Topic | Spec | Live |
|---|---|---|
| Auth | ❓ | No token/header required |
| HTTP errors | ❓ | Almost always **200**. Real failures are JSON `{status:false,...}` or **plain text** with `Content-Type: application/json`. Missing PHP file → **404** HTML. Overloaded health table → **500** empty body |
| Success envelope (most table APIs) | ❓ | `{status:true, module_type, project?, table_name, data:[...]}`. Health table APIs also set `total_records` |
| Error key | ❓ | Health / beneficiary: **`message`**. Livelihood / education / mixprogram invalid: **`msg`** |
| Pagination | `Limit` + `offset` strings | **Only** `health_desease.php` / `health_symtoms.php` **patient** variants paginate. Echo `limit`/`offset` as numbers. **Hard cap 20** even if `Limit` is `"50"` or `"100000"`. `limit` lowercase also works. `health.php` **ignores** `Limit`/`offset` |
| Total count | not documented | Disease/symptom **patient** pages: `total_records` + `total_pages`. Health tables: `total_records` (equals array length; not a separate grand total). Mixprogram: `total`. Skilltracking success envelope has **no** `total_records` (count = `data.length`) |
| Empty data | ❓ | Success + `data: []` (offset past end, unknown `disease_id`, mixprogram year with no rows). Beneficiary empty year: success + **zeros**, not empty |
| Geography | inferred hierarchy | **Health** and **livelihood** IDs are **different namespaces**. Health `district.id="1"` ≠ livelihood `district_id="1"` (Gajraula) |

---

## 2. `health.php`

**What it holds:** master lists (states, districts, blocks, villages, diseases, partners) plus person-level patient/doctor/appointment rows.

**Spec request (does not work):**

```json
{ "module_type": "health", "table_name": "state" }
```

Live body (plain text, HTTP 200, `Content-Type: application/json`):

`Invalid from_date format. Use YYYY-MM-DD`

**Working request:**

```json
{
  "module_type": "health",
  "table_name": "state",
  "from_date": "2025-01-01",
  "to_date": "2025-12-31"
}
```

For `profile_patients` / `patient_appointments_new`, a **short** `from_date`–`to_date` is required in practice. A full December 2025 window on appointments returned **HTTP 500**. `2025-12-29`–`2025-12-31` returned 200 with `total_records: 5579`. `Limit` did not reduce `data.length`.

**Envelope (success):**

```json
{
  "status": true,
  "module_type": "health",
  "table_name": "state",
  "total_records": 21,
  "data": [{ "id": "1", "name": "<state name>", "del_action": "N" }]
}
```

**Status:** integrated (code already sends dates). Spec is incomplete.

### 2.1 Hierarchy (health)

`state.id` ← `district.state_id` ← `block.district_id` ← `village.block_id`.  
Patients/doctors also carry `state_id`, `district_id`, `block_id`, `village_id`, `partner_id`.

### 2.2 Per-table fields (live)

Nullable here means `null` **or** `""` seen in the sample.

**`state`** (21): `id` string, `name` string, `del_action` string (`"N"`).

**`district`** (85): `id`, `name`, `state_id`, `del_action` (all strings).

**`block`** (278): `id`, `name`, `district_id`, `del_action`.

**`village`** (4592): `id`, `name`, `block_id`, `del_action`.

**`disease`** (342): `id` string, `disease_name` string, `del_action`. There is **no** `disease_id` column. Summary endpoint uses numeric `disease_id` that **matched** these `id`s for id `36` (Cold And Cough) / id `1` (Respiratory Infections).

**`partner`** (25): `partner_id`, `partner_name`, `partner_logo`, `active_status`, `created_at` (strings). No `del_action`.

**`profile_doctors`** (96): `id`, `user_id`, `full_name`, `registration_no` (string\|null), `email` (often `""`), `degree`, `contact_no`, `address`, `description`, `state_id`, `district_id`, `block_id`, `village_id`, `doctor_sign`, `profile_pic`, `created_at`, `del_action`, `doctor_status`, `post_office`, `applicable_in`, `active_cases`, `number_of_patient_scene`, `partner_id`.

**`profile_patients`** (33143 in Dec 2025 window; Limit ignored): `patient_id`, `user_id`, `full_name`, `gender` (`M`/`F`), `female_is_pregnant`, `edd`, `is_edd_lmp` (null\|string), `age`, `age_month`, `partner_id`, `self_added`, `dob`, `aadhar_no`, `contact_no`, `state_id`, `district_id`, `block_id`, `village_id`, `address`, `pin_code`, `profile_pic`, `height`, `weight`, `blood_group_id`, `caste_id`, `disability`, `created_at`, `updated_at`, `del_action`, `added_by`, `unique_code`, `sync_status`. IDs/dates are **strings** on this table.

**`patient_appointments_new`** (keys from 2025-12-30 window; `total_records` 1820 that day): `appointment_id`, `profile_patient_id`, `symtom` (string; often JSON array of `{symptom_id,symptom_name}`), `bp_lower`, `bp_upper`, `sugar`, `temperature`, `blood_oxygen_level`, `pulse`, `hemoglobin`, `currently_taking_any_prescribed_medication`, `date_of_prescribed_medication`, `fees_free_or_paid`, `paid_amount`, `assigned_doctor_id`, `previous_prescription`, `disease` (string; often JSON — UNVERIFIED parse of every row), `is_doctro_done` (typo in API), `is_doctor_done_date`, `doctor_remarks`, `prescription`, `is_send_prescription`, `is_edit_pharmacist_prescription`, `pharmacist_prescription` (null seen), `is_pharmacist_done`, `pharmacist_done_date`, `patient_remark`, `medicine_given`, `state_id`, `district_id`, `created_at`, `partner_id`, `sync_status`. All listed types were strings except `pharmacist_prescription` null.

**Errors (with dates present):**

```json
{ "status": false, "message": "Invalid table for selected module" }
{ "status": false, "message": "module_type and table_name are required" }
```

---

## 3. `health_beneficiary.php`

**What it holds:** one year totals — beneficiaries, villages, states, adolescents 10–19. Not row-level people.

**Working request:** `{ "module_type": "health", "year": "2025" }`

**Trimmed live:**

```json
{
  "status": true,
  "module_type": "health",
  "year": "2025",
  "data": {
    "total_beneficiary": 343412,
    "total_village": 966,
    "total_state": 16,
    "total_adolescent_10_19": 26251
  }
}
```

| Field | Type | Nullable | Example |
|---|---|---|---|
| total_beneficiary | integer | no | 343412 |
| total_village | integer | no | 966 |
| total_state | integer | no | 16 |
| total_adolescent_10_19 | integer | no | 26251 |

Year `"2099"` → same shape with zeros. Year `"2025-26"` → `{status:false,message:"Invalid year format. Use YYYY"}`.

**Status:** integrated.

---

## 4. `health_desease.php` (filename spelling is live)

### 4.1 Summary (no `disease_id`)

**What it holds:** disease mix for a calendar year.

**Request:** `{ "module_type": "health", "year": "2025" }`

```json
{
  "status": true,
  "module_type": "health",
  "year": 2025,
  "total_diseases": 110,
  "data": [
    { "disease_id": 36, "disease_name": "Cold And Cough", "total_patients": 54289 }
  ]
}
```

`year` in the envelope is a **number**. Row `disease_id` is **integer**.

### 4.2 Patient page (`disease_id` present)

Presence of `disease_id` switches the endpoint. Spec placeholder `"2025"` → success, `total_records: 0`. Real id `36` → `total_records: 54289`, `total_pages: 2715`, `data` length **20**.

`Limit: "100000"` and `Limit: 50` both echoed as `"limit": 20`. Numbers and strings both accepted for `Limit`/`offset`. Lowercase `limit` also paginated.

Offset `999999` with `disease_id: "1"`: `status: true`, `data: []`, **`total_records` still 475**.

Patient row fields match `profile_patients` (integers mixed with strings: `partner_id`/`state_id` were **integers** on this endpoint).

**Status:** integrated.

---

## 5. Symptom endpoint

| Filename | Result |
|---|---|
| `health_symtom.php` (spec) | **404** |
| `health_symptom.php` | **404** |
| `health_symtoms.php` | **200** |

### 5.1 Summary

**Request:** `{ "module_type": "health", "year": "2025" }`

```json
{
  "status": true,
  "module_type": "health",
  "year": 2025,
  "total_symtom": 221,
  "data": [
    { "symptom_id": 1, "symptom_name": "Cough", "total_patients": 71940 }
  ]
}
```

### 5.2 Filter quirks

Sending spec `disease_id` + `Limit` + `offset` still returned the **221-row summary** (`total_symtom`). The filter that pages **patients** is **`symptom_id`** (not in the spec). With `symptom_id: "1"`: `total_records: 71940`, `data` length 20, same patient shape as disease-wise.

**Status:** integrated via `health_symtoms.php` + `symptom_id`. Spec filename and `disease_id` on this URL are wrong.

---

## 6. `skilltracking.php`

**Required spellings:** `module_type: "livelyhood"`, `project: "skilltracting"`.

| Tried | Result |
|---|---|
| `livelihood` + `skilltracking` | `{status:false,msg:"Invalid module_type"}` |
| `livelihood` + `skilltracting` | `{status:false,msg:"Invalid module_type"}` |
| `livelyhood` + `skilltracking` | `{status:false,msg:"Invalid project"}` |

**Working request:**

```json
{ "module_type": "livelyhood", "project": "skilltracting", "table_name": "state" }
```

**Envelope:** `{status, module_type, project, table_name, data}` — **no** `total_records`. Invalid table: `{status:false,msg:"Table not allowed for this project"}`. Missing `table_name`: `{status:false,msg:"Required fields missing"}`.

**Hierarchy (livelihood):** `state_id` → `district_id` → `block_id` → `village_id`. Example: `district_id "1"` = Gajraula, `state_id "1"` = Uttar Pradesh.

### Tables

| table_name | n | Meaning (plain) | Fields (live) | Code |
|---|---|---|---|---|
| state | 5 | States | `state_id`, `state_name`, `status` | integrated |
| district | 7 | Districts | `district_id`, `district_name`, `state_id`, `status`, `created_at` (often `0000-00-00 00:00:00`) | integrated |
| block | 7 | Blocks | `block_id`, `block_name`, `district_id`, `state_id`, `status`, `created_at` | integrated |
| village | 92 | Villages | `village_id`, `village_name`, `block_id`, `district_id`, `state_id`, `status`, `created_at` | integrated |
| qualification | 10 | Education levels | `qualification_id`, `education_qualification`, `status`, `created_at` | integrated |
| skill_center | 6 | Training centres | `center_id`, `skill_center_name`, `district_id`, `state_id`, `status`, `created_at` | integrated |
| training_stream | 54 | Trades | `training_id`, `training_name`, `created_at`, `status` | integrated (mapped to `stream_id`/`stream_name`) |
| batch_list | 533 | Batches | `batch_id`, `batch_name`, `state_id`, `district_id`, `course_id`, `batch_strength`, `about_training_discussion`, `batch_start_date`, `batch_end_date`, `center_id`, `training_id`, `user_id`, `latitude`, `longititude` (typo), `created_at`, `updated_at`, `status` | integrated |
| persons | 7044 | Trainees (PII) | `person_id`, `batch_id`, `person_name`, `email`, `dob`, `gender` (`Male`/`Female`), `mobile_number`, `address`, `qualification_id`, `training_stream_id`, `center_id`, `date_of_completion_of_training`, `district_id`, `state_id`, `profile_pic`, `status`, `created_at`, `user_id`, `latitude`, `longititude` | integrated |
| monitor | 94 | Placement follow-up | `monitoring_id`, `person_id`, `date_of_monitor`, `work_status` (e.g. Working), `current_work`, `employement_type` (typo; Employee/Self), `monthly_income` string, `remark`, `district_id`, `state_id`, `status`, `created_at`, `user_id` | integrated |
| pre_post_master | 33 | Batch-level pre/post | `id`, `state_id`, `district_id`, `user_id`, `financial_year` (`2025-2026`), `livelihood`, `trade_name`, `candidates_trained`, `age_group`, `category`, `male_count`, `female_count`, `placement_status` (string integer e.g. `"7"`), `assessment_type` (`POST` seen), `created_at` | integrated |
| program | 12 | Mixprogram catalogue | `id`, `program_name`, `program_code`, `description` (null\|string), `status` (`Active`), `created_at`, `updated_at` | integrated (with `id`→`program_id` fallback) |
| kkp_pre_and_post | 60 | KKP value pre/post scores by location | `id`, `financial_year` (`2025-26`), `location_name`, `value_name`, `pre_kkp`, `post_kkp`, `created_at`, `updated_at` | **not integrated** |

**`program` ids seen:** 1 Jubifarm, 2 Jubifarm Farmers, 3 Schools Working, 4 KKP, 5 KKP 2.0, 6 Muskaan Activity, 7 Muskaan Fellowship, 8 Edulab, 9 HP CLAP, 10 HP WOW, 11 Skilling, 12 Didi Ka Dukan.

These **`id`s are not** `education_program.id` (education `id=1` is also named KKP but is a different table).

---

## 7. `enterprise_support.php`

```json
{
  "module_type": "livelyhood",
  "project": "enterprise_support",
  "table_name": "enterprise_support"
}
```

**`enterprise_support`** (90): members — `member_id`, `member_name`, `member_type` (`internal` seen), `member_mode` (`Individual`), `phone_number`, `state_id`, `district_id`, `block_id`, `village_id`, `user_id`, `supported_by` (`jbf`), `status`, `created_at`.

**`enterprise_support_monitoring`** (270): FY profit — `monitoring_id`, `member_id`, `user_id`, `financial_year` (e.g. `"23-24"`), `profit` string, `status`, `created_at`.

**Status:** integrated.

---

## 8. `market_access.php`

**`table_name: "market_access"`** works (2 rows):

```json
{
  "id": "1",
  "agency_name": "Didi ki Dukan",
  "sales_generated_average": "1 LAKH +",
  "market_access_type": "Affordable and accessible Women Centric local product ",
  "state_id": "1",
  "district_id": "7",
  "user_id": "<masked>",
  "financial_year": "2025-2026",
  "status": "1",
  "created_at": "2026-04-13 05:13:41"
}
```

**Does `enterprise_support_monitoring` match enterprise_support?** **No.** Same `table_name` on `market_access.php` is **rejected**: `{status:false,msg:"Table not allowed for this project"}`. Spec allow-list is a copy-paste. Code is correct to skip it.

---

## 9. `mixprogram.php`

**What it holds:** school-level mixprogramme rows for one `program_id` and FY `YYYY-YY`.

**Working request (no module_type needed):** `{ "program_id": "5", "year": "2025-26" }`

Adding `module_type: "education"` or `"livelyhood"` did **not** change row count (still 5 for program 5).

**Trimmed live:**

```json
{
  "status": true,
  "message": "Program data fetched successfully",
  "program": { "id": 5, "name": "KKP 2.0", "code": "KKP_2" },
  "filter": { "year": "2025-26", "status": "Active" },
  "table_name": "program_kkp_2",
  "total": 5,
  "data": [{
    "id": 40,
    "program_id": 5,
    "sno": 1,
    "location": "Karnataka",
    "block": "Nanjangud",
    "school_name": "PM Shri GHPS Nagamma Girls Nanjangud",
    "year": "2025-26",
    "students_male": 0,
    "students_female": 48,
    "students_total": 48,
    "teachers_reached": 1,
    "theme_touched": "Gadening and groud cleaning",
    "class": "7th-8th",
    "status": "Active",
    "created_at": "2026-09-14 06:47:38",
    "updated_at": "2026-09-14 06:47:38"
  }]
}
```

| program_id | 2025-26 rows |
|---|---|
| 1 | 0 (success empty; program exists) |
| 2 | 1 |
| 3 | 8 |
| 4 | 35 |
| 5 | 5 |
| 6 | 76 |
| 7 | 3 |
| 8 | 32 |
| 99999 | `{status:false,msg:"Invalid program_id"}` |

Year `"2025"` (calendar): **success**, `total: 0`, same envelope (not an error). Format `"2025-26"` is the one that returns rows.

**Status:** integrated. Module is programme-catalogue based, not Health.

---

## 10. `education.php`

```json
{
  "module_type": "education",
  "project": "education_program",
  "table_name": "education_program"
}
```

26 rows. Fields: `id`, `program_name`, `no_of_school`, `no_of_students_participating`, `activity_count`, `total_interventions`, `state_id`, `district_id`, `user_id`, `status`, `created_at`. **No `academic_year` in the live sample.** Counts are strings.

**Status:** `education_program` integrated. Extra tables in sync are **broken** on the live API.

---

## 11. UNVERIFIED

- Whether `from_date`/`to_date` on health **filters** lookups or is only validated (lookup counts look like full catalogues).
- Full enum of `work_status`, `member_type`, `fees_free_or_paid`, `placement_status` codes.
- KPI formulas (spec has none).
- Rate limits (not measured beyond ~500 ms spacing).
- `disease` JSON parse of every appointment `disease`/`symtom` value.
- Health `state.id="1"` display name (masked in samples; first character `U`).
- Whether `health.php` ever honours `Limit` on some tables/builds.

---

## 12. Probe script

`scripts/probe-apis.mjs` — sequential POST, ≥500 ms gap, headers from `JUBICARE_API_HEADERS` / `JUBICARE_API_TOKEN` / `JUBICARE_API_KEY` if set. Writes `api-samples/` (gitignored). Follow-up dated/ID cases: `scripts/probe-apis-followup.mjs`.

Types: `src/lib/generated/jubicareApi.types.ts` and `src/lib/generated/jubicareApi.zod.ts`.

---

## 13. Reconcile: integrated code vs this contract (report only)

Do not treat this as a fix list that was applied. None of these were changed in this pass.

1. **Spec `health.php` body vs code:** code always adds `from_date`/`to_date` (`phpRegistry.js` 273–280, `syncEngine.js` 1025–1026). Spec does not. Live **requires** dates. Code is right; spec is incomplete.

2. **`health.php` `Limit`/`offset`:** code sends them for heavy tables (`phpRegistry.js` 282–285). Live **ignores** them (`profile_patients` returned 33143 rows in one call). Sync of patients/appointments can blow memory/timeouts.

3. **Appointments window:** `syncEngine` uses 3-day chunks; `phpRegistry.appointmentDateWindow` is Dec 29–31 of the year. A **31-day** Dec 2025 window returned HTTP **500**. Code’s small chunks match live.

4. **Symptom filename:** spec `health_symtom.php` 404s. Code prefers `health_symtoms.php` — correct.

5. **Symptom patient filter:** spec `disease_id` does nothing on `health_symtoms.php`. Code’s `symptom_id` is the live filter. `phpRegistry.js` 320–328 is right; spec is wrong.

6. **`kkp_pre_and_post`:** live 60 rows; **not** in `TABLE_ENDPOINTS` or `SYNC_PLANS`.

7. **`market_access` + `enterprise_support_monitoring`:** spec lists it; live rejects; code skips. Code is right.

8. **`skilltracking.program` PK:** live field is `id`, not `program_id`. `fieldMap` uses `program_id` (`syncEngine.js` 554) but a later normaliser copies `id` → `program_id` (853–863). Works if that path runs.

9. **`training_stream`:** live `training_id` / `training_name`. Postgres columns `stream_id` / `stream_name` via fieldMap 608. Intentional rename, not a live field.

10. **`qualification`:** live `education_qualification` mapped to `qualification_name`.

11. **`skill_center`:** live `skill_center_name` mapped to `center_name`.

12. **`employement_type` / `longititude` / `is_doctro_done`:** live typos. Code maps the first two to `employment_type` / `longitude` and `is_doctro_done` → `is_doctor_done`. Correct.

13. **`education_program`:** live has **no** `academic_year`; fieldMap still lists it (327). Sync will store null/undefined unless derived (`syncEngine.js` 811).

14. **`education_assessment` / `education_muskaan_assessment`:** code optional-syncs tables the API **rejects**.

15. **Doctors:** live has many fields (`registration_no`, `contact_no`, `block_id`, …) not in `fieldMap` (494–496). They are dropped on ingest.

16. **Partners:** live `partner_id`/`partner_name`/`active_status` mapped to `source_id`/`name`/`del_action`. `partner_logo` dropped.

17. **Health geo PKs:** live `id` mapped to `source_id`. Fine if consistent.

18. **Disease patients ingest:** `fieldMap` expects `patient_name`/`payload`; live paged rows are full **patient** objects (same as profile_patients), not `{patient_name}`. Normaliser 840–850 compensates.

19. **Beneficiary `data` is an object** not an array. `phpClient.parseApiResponse` / `postPhpEnvelope` unwraps this (42–45, 93–95). Matches live.

20. **Error keys:** `phpClient` treats `status: false` as throw. Health uses `message`; livelihood uses `msg`. Both are read. **Plain-text** `Invalid from_date...` is not JSON; parser throws `API returned error string`.

21. **`phpRegistry` `API_BASE`** has no trailing slash; `syncEngine` `API_BASE` has trailing slash. Both produce valid URLs.

22. **Gender vocab:** health patients `"M"`/`"F"`; skill persons `"Male"`/`"Female"`. Charts that assume one encoding will mis-group.

23. **FY strings:** monitoring `"23-24"`, market/pre_post `"2025-2026"`, mixprogram `"2025-26"`. Code comments already warn; still easy to join-miss.

24. **Health vs livelihood location IDs** must not be mixed (`API_GAPS.md` already). Confirmed: livelihood district 1 = Gajraula.

25. **No auth headers in `phpClient`.** Live currently allows that. If the server later requires a key, env hooks exist only in the probe script, not in `phpClient.js`.
