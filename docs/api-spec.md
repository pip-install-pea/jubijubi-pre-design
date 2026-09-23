# Jubicare Centralised Dashboard API: Request Spec

Converted from `Jubilant_Centralized_Monitoring_Platform_20092026.docx`.
This file contains **only what the original document states**. Anything added by the converter is labelled.

**Markers used in this file**

- `⚠️ VERIFY` means the spec looks inconsistent or ambiguous. Test it against the live API before relying on it.
- `❓ NOT DOCUMENTED` means the spec is silent. Find out by calling the API, and never guess.
- `🔎 INFERRED` means the converter's reading of the spec, not something the spec says.

---

## 0. Read this first

**What the spec covers:** endpoint URLs, allowed `table_name` values, and example request bodies.

**What the spec does NOT cover (all ❓ NOT DOCUMENTED):**

- Response bodies or field names
- Authentication (API key, token, IP allow-list, or none)
- Required request headers (assume `Content-Type: application/json`, unconfirmed)
- Error formats and HTTP status behaviour
- Pagination details beyond `Limit` / `offset` (no total count is mentioned)
- Rate limits
- What each table or metric means, and any KPI definitions
- Environments (a single production-looking base URL is given)

**Consequence for the coding agent:** the "correct response" for every endpoint below must be discovered by calling the API and recorded in `docs/api-contract.md`. Where this spec and the real API disagree, the real API wins. Record both.

---

## 1. Global conventions

| Item | Value |
|---|---|
| Base URL | `https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/` |
| Method | `POST` for every endpoint |
| Body | JSON |
| Response format | JSON (per the spec's one-line statement: "All APIs follow REST standards and return data in JSON format") |
| Modules | Livelihood, Health, Education |

Quick call template (headers are ❓ NOT DOCUMENTED, so adjust once auth is known):

```bash
curl -sS -X POST "https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/health.php" \
  -H "Content-Type: application/json" \
  -d '{"module_type":"health","table_name":"state"}'
```

---

## 2. Endpoint index

The spec contains **33 distinct documented request shapes**: 9 + 1 + 2 + 2 for Health, 13 + 2 + 2 + 1 for Livelihood, and 1 for Education, counting each `table_name` as one.

| # | Module | File | Selector fields | Allowed values |
|---|---|---|---|---|
| 1 | Health | `health.php` | `module_type`, `table_name` | 9 tables (§3.1) |
| 2 | Health | `health_beneficiary.php` | `module_type`, `year` | year |
| 3 | Health | `health_desease.php` | `module_type`, `year` (+ optional paging variant) | year, disease_id |
| 4 | Health | `health_symtom.php` | `module_type`, `year` (+ optional paging variant) | year, disease_id |
| 5 | Livelihood | `skilltracking.php` | `module_type`, `project`, `table_name` | 13 tables (§4.1) |
| 6 | Livelihood | `enterprise_support.php` | `module_type`, `project`, `table_name` | 2 tables (§4.2) |
| 7 | Livelihood ⚠️ | `mixprogram.php` | `program_id`, `year` | see §4.3 |
| 8 | Livelihood | `market_access.php` | `module_type`, `project`, `table_name` | 2 tables (§4.4) |
| 9 | Education | `education.php` | `module_type`, `project`, `table_name` | 1 table (§5.1) |

Endpoint spellings are exactly as in the spec: `health_desease.php` and `health_symtom.php` are misspelled but presumably literal filenames. ⚠️ VERIFY.

---

## 3. Health

### 3.1 `health.php`: master and reference tables

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/health.php`

Allowed `table_name` values:

```
state, district, disease, block, village,
profile_patients, patient_appointments_new, profile_doctors, partner
```

Request:

```json
{
  "module_type": "health",
  "table_name": "state"
}
```

Response: ❓ NOT DOCUMENTED. Capture one sample per table.

Notes:

- 🔎 INFERRED: `state → district → block → village` looks like a geographic hierarchy. Confirm the parent-ID field names from the real responses.
- 🔎 INFERRED: `profile_patients`, `patient_appointments_new` and `profile_doctors` probably contain **personal or health data**. Sample sparingly and mask before committing anything.
- ⚠️ VERIFY: in the original document the hyperlink behind this URL carries `?type=reach` (visible text does not). Test whether that query parameter changes anything. It is probably a leftover.

### 3.2 `health_beneficiary.php`: beneficiary data by year

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/health_beneficiary.php`

```json
{
  "module_type": "health",
  "year": "2025"
}
```

Response: ❓ NOT DOCUMENTED.
`year` is sent as a string in the spec, in the format `"2025"`. ⚠️ VERIFY whether other formats such as `"2025-26"` work here (see §6).

### 3.3 `health_desease.php`: disease data

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/health_desease.php`

**Summary request:**

```json
{
  "module_type": "health",
  "year": "2025"
}
```

**Disease-wise patient data** (the spec's label for the paged variant):

```json
{
  "module_type": "health",
  "year": "2025",
  "disease_id": "2025",
  "Limit": "20",
  "offset": "0"
}
```

Response: ❓ NOT DOCUMENTED for both variants.

⚠️ VERIFY:

- `disease_id: "2025"` is identical to the `year` value, so it is almost certainly a copy-paste placeholder. Get real IDs from `health.php` with `table_name: "disease"`, then test.
- `Limit` is capitalised while `offset` is lowercase. Test whether the server is case-sensitive (`limit` vs `Limit`).
- All values are strings in the examples. Test numbers as well.
- Is the paged variant on the same URL as the summary variant? The spec lists both under this URL heading. Confirm the server tells them apart by the presence of `disease_id`.

### 3.4 `health_symtom.php`: symptom data

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/health_symtom.php`

**Summary request:**

```json
{
  "module_type": "health",
  "year": "2025"
}
```

**Symptom-wise patient data** (the spec's label for the paged variant):

```json
{
  "module_type": "health",
  "year": "2025",
  "disease_id": "2025",
  "Limit": "20",
  "offset": "0"
}
```

Response: ❓ NOT DOCUMENTED for both variants.

⚠️ VERIFY: the same points as §3.3. In particular, a *symptom*-wise request that filters by `disease_id` (not a symptom ID) looks like a copy-paste from the disease endpoint. Check what the filter actually does.

---

## 4. Livelihood

For all Livelihood endpoints that take `module_type` and `project`, the spec's example values are the literal strings shown below, with their spellings.

### 4.1 `skilltracking.php`: skill tracking

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/skilltracking.php`

Allowed `table_name` values:

```
state, district, block, village, persons, monitor, batch_list,
qualification, skill_center, training_stream, pre_post_master,
program, kkp_pre_and_post
```

Request:

```json
{
  "module_type": "livelyhood",
  "project": "skilltracting",
  "table_name": "state"
}
```

Response: ❓ NOT DOCUMENTED.

⚠️ VERIFY:

- `"livelyhood"` and `"skilltracting"` are misspelled in the spec. They are either the literal server values or typos. Send the spec spelling first (and record it), then try `"livelihood"` / `"skilltracking"` and record which the server accepts.
- 🔎 INFERRED: `persons` probably contains personal data. Sample sparingly and mask.

### 4.2 `enterprise_support.php`: enterprise support

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/enterprise_support.php`

Allowed `table_name` values:

```
enterprise_support, enterprise_support_monitoring
```

Request (spec example uses the monitoring table):

```json
{
  "module_type": "livelyhood",
  "project": "enterprise_support",
  "table_name": "enterprise_support_monitoring"
}
```

Response: ❓ NOT DOCUMENTED.

⚠️ VERIFY: this section is headed "1 Skilltracking" in the original document, which is a copy-paste artefact. The URL, `project` value and table names all clearly say enterprise support.

### 4.3 `mixprogram.php`: mixed programme data (placement is ambiguous)

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/mixprogram.php`

```json
{
  "program_id": "5",
  "year": "2025-26"
}
```

Response: ❓ NOT DOCUMENTED.

⚠️ VERIFY:

- The spec heads this "1 Education" but places it **between Enterprise Support and Market Access** under the Livelihood section. Its module is unclear.
- It has **no `module_type`, `project` or `table_name`**, unlike every other Livelihood/Education endpoint. Test whether adding `module_type` changes anything.
- `year` uses the format `"2025-26"` here, versus `"2025"` in Health. See §6.
- Valid `program_id` values are not listed. 🔎 INFERRED: they may come from the `program` table in §4.1. Confirm before assuming.

### 4.4 `market_access.php`: market access

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/market_access.php`

Allowed `table_name` values:

```
market_access, enterprise_support_monitoring
```

Request:

```json
{
  "module_type": "livelyhood",
  "project": "market_access",
  "table_name": "market_access"
}
```

Response: ❓ NOT DOCUMENTED.

⚠️ VERIFY: `enterprise_support_monitoring` is also allowed on `enterprise_support.php` (§4.2). Compare the two responses. If identical, the duplication is intentional. If not, one listing is a copy-paste.

---

## 5. Education

### 5.1 `education.php`: education programme

The visible URL in the spec is:

`POST https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/education.php`

Allowed `table_name` values:

```
education_program
```

Request:

```json
{
  "module_type": "education",
  "project": "education_program",
  "table_name": "education_program"
}
```

Response: ❓ NOT DOCUMENTED.

⚠️ VERIFY: in the original document the hyperlink **behind** this text points to `market_access.php`, while the visible text says `education.php`. Use `education.php` (the visible text and the naming pattern both support it) and confirm it responds correctly.

---

## 6. Field reference (as seen in the spec's examples)

| Field | Used by | Example values in spec | Notes |
|---|---|---|---|
| `module_type` | 1–6, 8, 9 (not 7) | `"health"`, `"livelyhood"`, `"education"` | ⚠️ `"livelyhood"` spelling. Not present on `mixprogram.php`. |
| `project` | 5, 6, 8, 9 | `"skilltracting"`, `"enterprise_support"`, `"market_access"`, `"education_program"` | ⚠️ `"skilltracting"` spelling. Not used by Health endpoints. |
| `table_name` | 1, 5, 6, 8, 9 | see per-endpoint allow-lists | Server presumably rejects values outside the allow-list. ❓ error shape unknown. |
| `year` | 2, 3, 4, 7 | `"2025"`, `"2025-26"` | ⚠️ Two formats in use. Confirm which endpoints accept which. |
| `disease_id` | 3, 4 (paged variants) | `"2025"` | ⚠️ Placeholder-looking. Real IDs come from the `disease` table. |
| `Limit` | 3, 4 (paged variants) | `"20"` | ⚠️ Capital L. String in the spec. |
| `offset` | 3, 4 (paged variants) | `"0"` | String in the spec. |
| `program_id` | 7 | `"5"` | Valid set ❓ NOT DOCUMENTED. |

All example values in the spec are JSON **strings**, including numeric-looking ones. Whether the server also accepts numbers is ❓ NOT DOCUMENTED.

---

## 7. Cross-cutting checklist for the agent

Things to settle by calling the API, in priority order:

1. Auth: is anything needed beyond the JSON body? Look at how the already-integrated endpoints in the codebase call it.
2. Response envelope: is it a bare array, or an object like `{status, data, ...}`? Is it consistent across endpoints?
3. Error and empty shapes: invalid `table_name`, missing fields, no rows.
4. The spelling questions: `livelyhood` / `skilltracting` (§4.1), and the misspelled filenames (§2).
5. `year` format per endpoint (§6), and whether omitting it is allowed.
6. Paging: `Limit` / `offset` behaviour, maximum `Limit`, presence of a total count.
7. Real `disease_id` and `program_id` values (§3.3, §4.3).
8. Duplicated or suspicious definitions: §4.2 / §4.4 (`enterprise_support_monitoring`), §4.3 (module of `mixprogram.php`), §5.1 (hyperlink mismatch).
9. Business meaning of each table and metric. The spec defines **no KPIs**, so this must come from the product owner, not from the agent.

Output of that work belongs in `docs/api-contract.md`, with real request/response samples and every unconfirmed item marked UNVERIFIED.
