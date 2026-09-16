# API gaps — 15 KPIs that need new endpoints

These fields are not in the live PHP extract (`jubilant_sample_data.xlsx` / `_SCHEMA`). The dashboard hides them instead of inventing numbers. Each item is one question plus the **minimum JSON** we can ingest.

Health calendar year, education academic year, and enterprise `financial_year` are **different clocks**. Do not send a single FY string and expect it to filter all modules.

Health `state_id=1` is Gautam Budh Nagar; livelihood `district_id=1` is Gajraula. Do not reuse health location IDs for livelihood.

---

## 1. Mentorship sessions / hours / expertise

**Question:** What is one mentorship *event* (not an enterprise member)?

Nearby today: `enterprise_support.member_type`, `member_mode` — these are members, not sessions.

```json
{
  "event_id": "M-1001",
  "member_id": "ES-22",
  "session_date": "2025-06-12",
  "hours": 2.5,
  "expertise_area": "bookkeeping",
  "mentor_id": "U-9",
  "state_id": "3",
  "district_id": "12"
}
```

---

## 2. Funding agency / amount / type

**Question:** What is one funding row (not monitoring profit)?

Nearby today: `enterprise_support_monitoring.profit`, `enterprise_support.supported_by` (`jbf`). `MA_enterprise_support_monitoring` returns API_ERROR — do not merge it into `market_access`.

```json
{
  "funding_id": "F-88",
  "member_id": "ES-22",
  "agency_name": "NABARD",
  "amount": 150000,
  "funding_type": "grant",
  "financial_year": "2025-26",
  "state_id": "3",
  "district_id": "12"
}
```

---

## 3. SROI inputs

**Question:** What is programme cost and the outcome value for one person/enterprise, with a documented formula?

Nearby today: `skilltracking_persons.dob`, `gender`, `skilltracking_monitor.monthly_income`, `skilltracking_pre_post_master.category`. No cost column.

```json
{
  "person_id": "P-100",
  "programme_cost": 8500,
  "outcome_value": 42000,
  "currency": "INR",
  "period": "2025-26",
  "formula_note": "outcome_value / programme_cost"
}
```

---

## 4. Satisfaction (1–5)

**Question:** What is one scored satisfaction record, and which visit/person does it attach to?

```json
{
  "response_id": "S-1",
  "appointment_id": "A-900",
  "profile_patient_id": "PT-12",
  "score": 4,
  "scale_min": 1,
  "scale_max": 5,
  "asked_on": "2025-03-02"
}
```

---

## 5. BPL household flag

**Question:** How is BPL recorded on a patient or household?

```json
{
  "patient_id": "PT-12",
  "household_id": "HH-4",
  "is_bpl": true,
  "ration_card_type": "BPL",
  "as_of": "2025-01-01"
}
```

---

## 6. Recorded CO₂

**Question:** What is a measured or attributed CO₂ figure (not `patients × 0.3`)?

```json
{
  "record_id": "C-1",
  "period": "2025",
  "co2_kg": 1280.5,
  "method": "travel_avoided",
  "source_system": "health"
}
```

---

## 7. Hazardous / liquid waste treated

**Question:** What is one waste-treatment record with quantity and unit?

```json
{
  "record_id": "W-1",
  "period": "2025-Q2",
  "waste_type": "hazardous",
  "quantity": 12.4,
  "unit": "kg",
  "facility_id": "CL-3"
}
```

---

## 8. Education pre / post awareness (values by school)

**Question:** What is one assessment row with pre and post scores, school, and academic year?

`education_assessment` is called by the app but **not in the extract**. Treat as unproven until a live call returns rows.

```json
{
  "assessment_id": "EA-1",
  "school_id": "SCH-19",
  "program_id": "5",
  "academic_year": "2025-26",
  "value_name": "hygiene_awareness",
  "pre_score": 2.1,
  "post_score": 3.4,
  "assessment_date": "2025-11-02"
}
```

---

## 9. Muskaan reading / writing / speaking

**Question:** What is one Muskaan skill-level row (R/W/S), with pre and post levels?

`education_muskaan_assessment` is synced optionally and is empty in the extract.

```json
{
  "assessment_id": "MU-1",
  "school_id": "SCH-19",
  "student_id": "ST-44",
  "academic_year": "2025-26",
  "skill_area": "reading",
  "pre_level": "beginner",
  "post_level": "intermediate",
  "assessment_date": "2025-12-01"
}
```

---

## 10. Placement 4-way status codebook

**Question:** How do we map `work_status` / `placement_status` to employment, self-employment, further study, not interested?

Sample `skilltracking_monitor.work_status` is only Working / Not Working. `skilltracking_pre_post_master.placement_status` is an integer with no codebook.

```json
{
  "code": 2,
  "label": "self_employment",
  "source_field": "placement_status"
}
```

Or send the decoded value on each monitor row:

```json
{
  "monitoring_id": "MON-9",
  "person_id": "P-100",
  "status_4way": "further_study",
  "date_of_monitor": "2025-08-15"
}
```

---

## 11. Income baseline (for “increase”)

**Question:** What is baseline monthly income, and when was it taken? `monthly_income` today is a stock, not a delta.

```json
{
  "person_id": "P-100",
  "baseline_monthly_income": 4000,
  "baseline_date": "2024-06-01",
  "current_monthly_income": 7500,
  "current_date": "2025-08-15"
}
```

---

## 12. Education activity types

**Question:** How do we tag a programme row as Computer Training / Behavioural Communication / Soft Skills?

There is no `activity_type`. `ED_mixprogram.theme_touched` is unrelated free text.

```json
{
  "program_id": "5",
  "activity_type": "computer_training",
  "academic_year": "2025-26"
}
```

---

## 13. Farm-based programmes

**Question:** Which table holds farm-based livelihood programmes? There is none in the extract.

```json
{
  "program_id": "FB-1",
  "program_name": "Kitchen garden",
  "households": 40,
  "financial_year": "2025-26",
  "state_id": "3",
  "district_id": "12"
}
```

---

## 14. Wage-loss savings / recovery time

**Question:** What is a recorded wage-loss avoided or recovery-days figure per visit? Do not use `visits × 150/200`.

```json
{
  "appointment_id": "A-900",
  "wage_loss_saved": 400,
  "recovery_days": 3,
  "currency": "INR"
}
```

---

## 15. Swasthya Prahari programme flag

**Question:** How do we identify Swasthya Prahari vs “age 10–19”? Today only `HL_beneficiary.total_adolescent_10_19` / `HL_profile_patients.age`.

```json
{
  "patient_id": "PT-12",
  "is_swasthya_prahari": true,
  "enrolled_on": "2025-02-10"
}
```

---

## Also required for honest filters (not counted in the 15)

### Shared geography or mapping table

```json
{
  "health_state_id": "1",
  "health_state_name": "Uttar Pradesh",
  "livelihood_state_id": "1",
  "livelihood_state_name": "Uttar Pradesh",
  "canonical_state_code": "UP"
}
```

Health `id=1` and livelihood `district_id=1` are different places today.

### Canonical `financial_year`

Live values include `23-24`, `2025-2026`, `2025-26`, and calendar `2025`. Pick one canonical form and send it on every FY-scoped table (`enterprise_support_monitoring`, `enterprise_market_access`, `skilltracking_pre_post_master`, `mixprogram`).

```json
{
  "financial_year": "2025-26",
  "start_date": "2025-04-01",
  "end_date": "2026-03-31"
}
```

---

## Already shipping from live fields (do not rebuild)

| KPI | Source |
|-----|--------|
| Health year envelope | `health_beneficiary.php` → `total_beneficiary`, `total_village`, `total_state`, `total_adolescent_10_19` |
| Disease mix | `health_desease.php` summary `disease_name`, `total_patients` |
| Skill roster | `COUNT(SK_persons.person_id)` |
| Work status doughnut | `SK_monitor.work_status` (monitored subset) |
| Current income buckets | `SK_monitor.monthly_income` |
| Roster by trade | `training_stream_id` → `stream_name` |
| Students by programme | `SUM(education_program.student_count)` + `TRIM(program_name)` |
| Enterprise members | `COUNT(enterprise_support.member_id)` |
| FY profit | `enterprise_support_monitoring.profit` |
| Market agencies / types | `enterprise_market_access` (sales text is a parsed estimate) |
| Fees collected | `health_patient_appointments.paid_amount` |
