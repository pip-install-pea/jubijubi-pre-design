# Task: implement JBF client feedback on the Livelihood dashboard

Repo: `pip-install-pea/nextjs-boilerplate` (Next.js 16, Postgres). `src/lib/syncEngine.js` copies the Jubicare PHP API (`https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/`, POST + JSON, no key, only `Content-Type`) into Postgres. The pages read from Postgres.
Pages: `src/app/livelihood/{skilling,placement,enterprise}/page.js`. Logic: `src/lib/livelihoodAnalytics.js`. Click-through: `src/app/api/livelihood/drilldown/route.js` + `src/lib/mixDrilldown.js` + `src/components/DrilldownModal.js`.

The client reviewed 62 asks. **Build 53 of them, in 5 phases. Do not touch the other 9 (see "DO NOT BUILD").** Build each one exactly as the client asked. Where a client-given wording, label, order or colour exists below, use it.

---

## 0. Working rules (read first)

1. **Read before editing:** `AGENTS.md`, the Next 16 docs in `node_modules/next/dist/docs/` (this Next version has breaking changes), `docs/api-contract.md`, `docs/API_GAPS.md`, `er_diagram_document.md`, and every file named below. Check that each path exists; the paths here are best guesses. **Then post a plan and wait for my go-ahead.** The plan should cover, per phase, the files you'll touch, how each ID maps to code, anything below that doesn't match the code, and your answers to the "Ask first" list.
2. **Branches and PRs:** base branch is **`main`** (the default). `pea` and `newbie` are stale, so don't use them. Open **one branch and one PR per phase**: `feat/jbf-livelihood-p1-sync`, `-p2-calcs`, `-p3-clicks`, `-p4-ui`, `-p5-layout`. Start each branch from fresh `origin/main` once the previous PR is merged. If I tell you to continue before a merge, stack the branch on the previous one and say so in the PR. Before opening a PR, `git fetch && git rebase origin/main` and rebuild. Make small commits, one ask per commit where possible, with the ID in the message (e.g. `P3.2: Candidates Placed KPI`). Never push to `main`, never force-push a branch someone else uses, and never merge your own PR.
3. **Scope:** change only what an item needs. No refactors, formatting sweeps or dependency upgrades, and no Education or Health changes. Shared components (`EChart`, `ColumnBar`, `BrandDoughnut`, `RankingBar`, `FunnelBars`, `DrilldownModal`, `GlobalFilters`, `chartTheme`) are also used by other modules. Add new behaviour there as opt-in props, then check that `/education` and `/health` still render. Ask before adding any new dependency or asset (the map needs one).
4. **Data safety:** never commit API dumps, row-level data, `.env`, or screenshots that show names or phones (drill-down tables do). `api-samples/` is gitignored, so keep any dumps there. Live API calls must be read-only and at least 0.6 s apart, and only aggregates go into the PR. Never modify source data. Don't trigger a production sync or write to the production DB. Use local Postgres (`npm run db:up`, `db:init`, `db:sync`, with my `.env`). Ask before touching any deployed env or DB.
5. **Checks every phase:** `npm run lint` and `npm run build` must be clean. There is no test suite, so don't add a framework. Run `npm run dev` and open all three livelihood pages with **FY = All years** and with **FY = 2026-27** (the default). The browser console must show no errors.
6. **Verification:** check every acceptance criterion against (a) the live API, using an aggregate-only script, and (b) your local DB after `db:sync`. Each PR includes the checklist table from section 7, with screenshots of charts and KPIs only (no PII).
7. **Ask instead of guessing.** If something is ambiguous, stop and ask. Known open points to raise in your plan:
   - A1. P5.3: should the Placement income-change chart also drop the "Income fell" bar, to match S4.2? The client only asked for this on Skilling.
   - A2. Which date column should roster, batch and monitor cards use for the FY and Month filters (for S3.1)?
   - A3. S14.4: the client labelled the batches chart "Trade wise Candidates", but it counts batches. Proposed title: "Trade-wise batches".
   - A4. P2.1: the India GeoJSON source and licence. It must show India's official boundaries.
   - A5. P3.1: "Candidates Trained" is proposed from the M&E sheet (rows not on an ongoing course). The roster alternative is 7,105 people with a completion date.
   - A6. Placement slide 8 has an arrow from the "Didi Ka Dukan" title to the text "Didi ki dukan". Is that a rename request? It isn't in the matrix.

---

## 1. Global data rules (apply everywhere you touch)

- **G1 Valid income:** a value counts only if it is numeric, > 0 and < 1,000,000. This excludes `0.00`, the 21 × `9,999,999,999.99` placeholders and the monitor's `2147483647`. Every average or median shows **"n = X"** with a caption like "Average of candidates with a recorded income (n = …). Zero and blank values are left out." Implement it once as a shared SQL helper. Today `moneySql` lets zeros into the AVG. Don't reuse `SHEET_INCOME_MAX = 200000` for Didi, because household post income goes up to ₹2,15,657.
- **G2 Indian number format:** create one shared helper, e.g. `src/lib/format.js`, and replace the per-page `fmt`/`fmtINR` copies.
  - Counts use en-IN grouping (7,159).
  - ₹ below 1 lakh is shown in full (₹4,918).
  - ₹ of 1 lakh or more uses the short form on tiles and labels (₹11 L, ₹1.11 Cr: up to 2 decimals, trailing zeros trimmed). Tooltips show the full figure.
  - Percentages use 1 decimal.
- **G3 Sync years:** `MIXPROGRAM_YEARS` in `syncEngine.js` defaults to `financialYearList(3)`, which never loads FY 2023-24 and will drop older years as the window rolls. Change the default to **every FY from 2023-24 up to the current FY**. Update `.envExample`, and tell me whether `EDU_MIX_YEARS` needs changing on the deployment (don't change it yourself). Re-syncing must not create duplicate rows.
- **G4 Year filter:**
  - Livelihood defaults to the current FY (2026-27). Expected values below are for **All years** unless stated otherwise; test both.
  - FY formats differ across sources: mixprogram uses `2023-24`, enterprise monitoring `23-24`, market access and pre_post `2025-2026`. Normalise them in the filter builder (`src/lib/analytics.js` `buildFilters` / `mixYearClauses`) so a mismatch never returns empty.
  - Today roster, monitor and batch cards ignore FY. Every card must either follow the filter or show a visible tag like "All years". Until S3.1, just add the tag.
  - The FY dropdown must include 2023-24.
- **G5 Never drop rows silently:** every exclusion (zero/placeholder income, 1970 dates, blank gender, state 0, top-N tails, negative durations) is either shown as an explicit category ("Not recorded", "State not recorded") or disclosed in the caption or tooltip ("n shown; X left out because …"). Remove silent `.slice()` truncation, like the heatmap's top 10.
- **G6 Label proxies:** if a metric isn't exactly what the client defined, mark it "(proxy)" and say in the caption what it really is.
- **G7 One normalisation:**
  - Gender has 7 spellings: Female, Male, Not recorded.
  - Placement status has 51 spellings and goes through `placementStatusSql`. "Placed" = Working (including employer or role text) + Self employment.
  - `mixWorkingSql` currently disagrees and drops employer-name rows. Make it use the same rule.
  - Merge `joya` into `Joya`.
- **G8 No fake data:** no placeholder tiles, dummy values or "coming soon" cards. The only hard-coded content allowed is client-given text and static map coordinates.

### Expected values (live API, 1 Oct 2026 ~17:10 IST, FY = All years)
(D) = likely to drift as data changes; (S) = closed FY, unlikely to change. The deployed DB is behind the live API (roster 7,044 vs 7,159), so sync locally first. The numbers in the client's screenshots are stale; don't chase them.

| Source | Value |
|---|---|
| Skilling M&E (program 11) rows | 3,250 (D): 2024-25 175, 2025-26 2,116, 2026-27 959. No 2023-24 rows |
| Status (normalised) | Further study 2,039 (62.7%), Self employment 796 (24.5%), Ongoing course 172 (5.3%), Working 113 (3.5%: 90 employer/role text + 23 generic), Job searching 95 (2.9%), Homemaker 35 (1.1%) (D) |
| Placed | 909 (28.0%) (D) |
| Gender (sheet) | Female 2,571 (79.1%), Male 678 (20.9%), Not recorded 1 (D). Female placed 856 (33.3%), male placed 53 (7.8%) (D) |
| Income (sheet, G1) | Pre: ₹7,450, n = 110 (3.4%). Post: ₹4,918, n = 721 (22.2%). Placed with post: mean ₹4,911 / median ₹3,000, n = 705. Pairs with both values: 92, of which 5 fell (D) |
| Sheet locations | Nanjangud 1,967, Gajraula 637, SUC Bharuch 436, Nira 165, SUC Vilayat 45 (D) |
| Courses (sheet) | 52 normalised names. Top: Basic Computer 790 (24.3%), Basic Tailoring 661 (20.3%), Program in Cyber Awareness AI Basic 370 (11.4%), Tally 167 (5.1%) (D) |
| Roster `persons` | 7,159 (D). Female 6,135 (85.7%), Male 919 (12.8%), blank 103 (1.4%), Others 2. By state: Karnataka 5,583, Uttar Pradesh 801, Maharashtra 540, Gujarat 186, state_id 0: 49 |
| Batches | 547: completed 513, ongoing 32, no dates 2, upcoming 0. Depends on today's date (D) |
| Monitor | 94 rows / 55 people. Working 67, Not Working 19, blank 8. 3 incomes of 2147483647, 4 dates of 1970-01-01 (D) |
| Didi (program 12) | 129 rows. Phase 1 = 2023-24 = 50 (S), Phase 2 = 2024-25 = 25, Phase 3 = 2025-26 = 40, Phase 4 = 2026-27 = 14 (D). Gajraula 98, Hasanpur 18, Joya 9, Dhanaura 4. Pre individual (G1): ₹4,770, n = 16. Post individual mean ₹14,019, n = 129. Duration: 6 Day 115, 8 Day 14 |
| Farmers (program 2) | 2023-24: 872 (Savli 449, Bharuch 423) (S). 2024-25: 1,426. 2025-26: 1,639. 2026-27: 2,090 (Savli 763, Bharuch 527, Kapasan 800) (D) |
| Market access | 2 rows: Didi ki Dukan "1 LAKH +", GSK "1 CR 10 LAKHS", total ₹1.11 Cr |
| Enterprise | 90 members, all status 1, all in Amroha, `created_at` empty for all 90 |

---

## 2. Phase 1: data/sync fixes (1 item + G3, G4, G7)

**P9.1 Women in each phase** (Enterprise › Didi Ka Dukan; Placement deck slide 9)
- Client: "Metion women in each phase | Phase 1 missing | It shuld be sequential phase 1 followed by phase 2 | Then phase 3"
- Build:
  - Apply G3 and run a sync.
  - Replace the Sankey "Phase to training type" with a vertical bar chart titled "Women in each phase".
  - Order the x-axis Phase 1 → 2 → 3 → 4, sorted by phase number, not by count.
  - Add count labels and keep the click-through (`mix_didi_phase`).
  - Caption: "Counted per phase; a woman in more than one phase is counted in each."
- Data: `education_mixprogram`, program 12, `phase`.
- Files: `syncEngine.js`, `phpRegistry.js`, `.envExample`, `getMixprogramDidi`, `enterprise/page.js`, `EChart.js`.
- Accept: 50 / 25 / 40 / 14 in that order. Farmers 2023-24 = 872 now appears. The Didi KPI moves from 79 to 129 under All years.

---

## 3. Phase 2: calculation fixes and KPIs from existing data (16 items)

**Placement indicators (P3.x).** Add a KPI row at the top of the Placement page, in the client's order.
- Source: M&E Skilling sheet (program 11). It follows the FY filter.
- Description under each tile = the client's own "What it measures" text, quoted below (Placement slide 3).
- Do not add a Job Offers tile.
- Files:
  - new `getPlacementIndicators` in `livelihoodAnalytics.js`
  - new `src/app/api/livelihood/placement/indicators/route.js`
  - `placement/page.js`
  - for P3.9 / P4.2: a reviewed employer mapping constant, e.g. `src/lib/employerMap.js`. List the full mapping in the PR.

| ID | Tile title | Client text (verbatim) | Calculation | Accept |
|---|---|---|---|---|
| P3.1 | Candidates Trained | "Number of candidates who completed the training" | Sheet rows minus "Ongoing course" (see A5) | 3,078 (D) |
| P3.2 | Candidates Placed | "Number of candidates who secured employment" | Working + Self employment (G7). Sub-line: % of all candidates | 909, 28.0% (D) |
| P3.3 | Placement Rate | "Placed candidates ÷ placement-eligible candidates × 100" | **Doable part only:** placed ÷ all candidates. Caption: "Placed ÷ all candidates on the M&E sheet. Not yet adjusted for placement eligibility." | 28.0% (D) |
| P3.4 | Self-Employment Rate | "Candidates starting their own income-generating activity" | Self employment ÷ all candidates | 24.5% (D) |
| P3.5 | Average Starting Salary (proxy) | "Average salary at the time of placement" | G1 mean `post_income` of placed candidates. Caption: "Post-training income of placed candidates; the sheet has no salary-at-placement field." | ₹4,911, n = 705 (D) |
| P3.6 | Median Starting Salary (proxy) | "Median salary, useful when salaries vary significantly" | G1 median, same set and caption as P3.5 | ₹3,000, n = 705 (D) |
| P3.7 | Post-Training Income | "Income earned after completing the program" | G1 mean `post_income`, all candidates | ₹4,918, n = 721 (D) |
| P3.8 | Income Increase | "Change in income compared with the pre-training level" | Mean (post − pre) over pairs where both values are valid, including the 5 that fell. Caption: "Based on n = 92 candidates with both pre and post income." | n = 92 (D). Report the value |
| P3.9 | Employer Linkages | "Number of employers/companies engaged for recruitment" | Distinct employers after the mapping; role-only texts ("Data Entry", "Bill Entry", "Own Business", "Govt.. Employee", …) excluded and disclosed. Caption: "Employers named in the placement-status field; there is no separate employer field yet." | Report the count and the full mapping |
| P3.11 | Female Placement Rate | "Placement rate among female candidates" | Placed women ÷ women (same basis as P3.3). Sub-line shows the male rate | 33.3% (856/2,571); male 7.8% (D) |

**P4.4 Work status by gender** (Placement slide 4)
- Client: "Bifurcate in male and Female and in perscetnatge"
- Build:
  - Keep the monitor source.
  - Draw one doughnut per gender (Female, Male, plus "Gender not recorded" if any), with % labels on slices and n under each.
- Files: `getPlacementStatus`, `placement/status` route, `placement/page.js`.
- Accept: slice counts add up to the overall chart, and each doughnut's percentages add up to 100%.

**P5.3 Income change: candidate counts by gender** (Placement slide 5)
- Client: "Unable to understand what we are trying to show | Please mention is it showing candidates count , bifurcate in Male and female"
- Build:
  - In `incomeChangeBuckets` / `incomeDeltaSql`, count only pairs where both values are valid (G1). This removes the ~750 "No change" rows that are really 0→0.
  - Add Male and Female series, an axis title "No. of candidates", and n in the caption.
  - The shared function also fixes the Skilling (S4.x) and Didi income-change charts.
- Files: `livelihoodAnalytics.js` (`incomeChangeBuckets`, `getPlacementDistributions`), `placement/page.js`, `ColumnBar.js` (multi-series support as an opt-in prop).
- Accept: the bars add up to 92 pairs (Skilling, All years) and "No change" is no longer the tallest bar.

**P5.4 Median time to first employment** (Placement slide 5)
- Client: "Median Time to first employment"
- Build:
  - Rename the card.
  - Show a median-days KPI plus the existing bucket bars.
  - Measure from `persons.date_of_completion_of_training` to the first monitor row with `work_status = 'Working'`.
  - Exclude 1970-01-01 dates and negative intervals, and disclose them (G5).
  - Caption: "Skill-tracking follow-ups only (n = …). The M&E sheet has no placement date."
- Files: `placementWindowCte`, `getPlacementDistributions`, `placement/page.js`.
- Accept: n is 55 people or fewer, and the excluded count is shown.

**S3.3 Courses ongoing / completed / total** (Skilling slide 3)
- Client: "Mention Skilling Courses ongoing , Total and Completed in different columns"
- Build:
  - Replace the "Courses" tile with three columns, Ongoing | Completed | Total, under the heading "Skilling courses (batches)".
  - Caption: "From skill-tracking app batch start/end dates."
  - Count rules: completed = end date before today; ongoing = start ≤ today ≤ end (or no end date yet); upcoming shown only if > 0; "no dates" disclosed.
- Data: `batch_list`.
- Accept: 32 / 513 / 547 with 2 having no dates, as of 1 Oct (D, changes daily).

**S3.4 Mean Pre Income** (Skilling slide 3)
- Client: "Mention Mean Pre Income( With Discription)"
- Build: tile "Mean Pre Income" using G1, with the description "Average income before training, among candidates with a recorded pre-training income (n = …)".
- Files: `getMixprogramSkilling` `avg_pre`, `skilling/page.js`.
- Accept: ₹7,450, n = 110 (not ₹324) (D).

**S3.5 Post Income** (Skilling slide 3)
- Client: "Mention Post Income( With Description)"; "Post income should be written like Post Income ( Enhancement in income status post completion of corse)"
- Build:
  - Title "Post Income".
  - Subtitle "(Enhancement in income status post completion of course)" (the client's text with "corse" corrected).
  - G1 value with n.
- Accept: ₹4,918, n = 721 (not ₹1,772) (D).

---

## 4. Phase 3: click-through bugs (6 items)

Rule for every clickable element: the modal's total must equal the number clicked, under the same filters. If an element can't do that, remove its pointer and hover styling. Filter on the raw stored value, not the display label: pass a raw key with each chart point.

**P2.3 / S2.3 Clicks show wrong or no data** (all pages; slide 2 of both decks)
- Client: "Display of data on clicking any things in dashboard is not correct"
- Build:
  - Audit every clickable element on the 3 pages.
  - `DrilldownModal` shows the API error message and a Retry button instead of "0 of 0".
  - Drill-downs receive the same FY (and later Month) filter as the card.
- Accept: the PR has a table of every clickable element with chart value vs modal total, and they all match.

**P3.12 "Detail View: persons" shows 0 of 0** (Placement slide 3)
- Client: "Fetching is not there"
- Build:
  - Reproduce under FY 2026-27 and All years, and fix the root cause (the default `persons` branch; suspect `buildFilters` on `created_at`).
  - The "People monitored" KPI must open the distinct monitored people, not the whole roster.
- Accept: columns render, the total equals the KPI, and monitored people = 55 (D).

**P7.3 Farmers chart click doesn't fetch** (Enterprise farmers; Placement slide 7)
- Client: "On clicking unable to fetch details"
- Build:
  - Make bars and line points in `FarmerGrowth` clickable.
  - Clicking lists the location rows for that FY (location, FY, number_of_farmers).
  - Caption: "Farmer-level list not available in source data."
- Accept: clicking 2026-27 shows Savli 763, Bharuch 527, Kapasan 800.

**P10.2 Members: unable to fetch; cards don't open** (Enterprise members; Placement slide 10)
- Client: "Unable to fetchdata even"
- Build:
  - "Active share" opens the active-members list.
  - "Districts covered" opens members by district.
  - Confirm that Total and Active members load.
  - Hide the "Created on" column, which is empty for every member.
  - Don't invent a status or date.
- Files: drill-down `enterprise_*` branches, `enterprise/page.js`.
- Accept: each opens 90 rows (D) and no `0000-00-00` appears.

**S13.1 Work status (Skilling): clicking shows nothing** (Skilling slide 13)
- Client: "Data is Not visible while clicking on this mention it in percentage as well"; "Employement outcomes fo Candidates, Create it location wise as well"
- Build:
  - Rename to "Employment outcomes of candidates".
  - Fix the "Not Reported" slice: filter on blank/NULL, not on the label.
  - Add % labels.
  - Add a location-wise stacked bar by monitor district, with n.
  - Caption: "Skill-tracking follow-ups (n = … people)".
- Files: `getSkillingBeneficiaries` (`status: 'Not Reported'`), drill-down `work_status` branch, `BrandDoughnut.js`, `skilling/page.js`.
- Accept: every slice's click total equals the slice count, and Not reported = 8 (D).

**S14.1 Gender · roster: blank slice; clicks show nothing** (Skilling slide 14)
- Client: "Others is displaying filed on clicking any color it is displaying noting make it percentage wise"; "Gender Ratio- Program wise"
- Build (doable part only):
  - Map blank to "Not recorded" with its own legend label.
  - Keep "Others".
  - Every slice opens its rows; add % labels.
  - Title "Gender ratio". **Don't** add "programme-wise" (see DO NOT BUILD).
- Files: `getSkillingDemographics`, drill-down `gender` branch.
- Accept: Female 6,135 (85.7%), Male 919 (12.8%), Not recorded 103 (1.4%), Others 2, and every click matches its slice (D).

---

## 5. Phase 4: chart, UI and text changes (26 items)

For each item: client quote; slide; what to build; acceptance (A:).

- **P2.2 / S2.2 / S15.2 Descriptions and percentages**
  - Client: "Write little Discription of every thing below the main title so that it is easy to interpret"; "add description in every graph and Percentage for Easiness" (slide 2 of both decks; Skilling slide 15).
  - Build:
    - Add a one-sentence plain-language description under every card and KPI title: what is counted, the source, and n.
    - Show % labels on every part-of-whole chart (pie, doughnut, funnel, count bars).
    - Remove the captions the client flagged.
    - List all new text in the PR for client approval.
  - A: no card without a description.
- **P4.1 / S2.4 KPI icons** (Phosphor is already installed)
  - Client: "Candidates Enrolled ; Candidate Icon with Man and Woman / Courses ; Skilling Icon / Placement ; Placement bag kind of icon / Income ;" (slides 2–4).
  - Build: a man-and-woman icon for enrolled, a skilling icon for courses, a briefcase/bag for placement, on both the Skilling and Placement tiles. **No Income icon** (the client left it blank).
- **P4.2 Pie: companies where candidates are placed** (Placement slide 4)
  - Client: "Create a Pie Chart for Companies where candidates are placed"
  - Build (doable part):
    - A pie built from the P3.9 mapping: top 8 employers plus "Other employers (n)", which is clickable. Distinct colours.
    - Disclose "Placed with no employer named: n".
    - Caption that the source is the placement-status text.
  - A: slice total = employer-named rows.
- **P4.3 Field-sheet post income** (Placement slide 4)
  - Client: "Make different colors and clear graphs"
  - Build:
    - One distinct colour per bucket.
    - Value and % labels, axis title "No. of candidates", G1 buckets with n.
    - Title "Post-training income of placed candidates".
- **P6.1 Typical post income by year** (Placement slide 6)
  - Client: "Unable to understand the data"
  - Build:
    - Keep the chart.
    - Title "Median post-training income by year".
    - Bars labelled "Candidates with a recorded post income", with clearly labelled axes.
    - G1 median (the 2025-26 median of ₹0 comes from zeros) and n per year.
    - **Don't** remove or redefine the chart.
- **P7.1 Farmers icon** (Placement slide 7)
  - Client: "Add farmers icon"
  - Build: a farmer/plant icon on the farmers KPI tiles.
- **P8.1 "79 People" → Women** (Placement slide 8)
  - Client: "79 Woman"
  - Build: label "Women", with the P9.1 caption.
  - A: 129 under All years after sync (D).
- **P8.4 Pre vs post graph** (Placement slide 8)
  - Client: "Prepare a graph of this pre and post"
  - Build (doable part):
    - Grouped bars by phase (1→4): mean pre individual vs mean post individual, both G1, with n on each bar.
    - Where a phase has no pre data, show "no pre data" instead of a 0 bar.
    - Don't label the values monthly or annual.
- **P8.6 Training hours** (Placement slide 8)
  - Client: "Training hours provided"
  - Build (doable part): tile "Training duration (days)" showing 6 days: 115, 8 days: 14. **Don't** convert to hours.
- **P8.7 Funding box** (Placement slide 8)
  - Client: "Prepare a box and write no outside funding completely by JBF"
  - Build: a static callout reading "No outside funding – completely by JBF".
- **P9.2 Didi by location** (Placement slide 9)
  - Client: "Woman entreprenuers location wise in Gajrauala"; "Make a different graph , names are not visible"
  - Build: replace the treemap with a horizontal bar titled "Women entrepreneurs location-wise", with names, counts and %.
  - A: Gajraula 98, Hasanpur 18, Joya 9, Dhanaura 4 (All years, after sync).
- **P11.1 Market access charts** (Placement slide 11)
  - Client: "Wrong garaph representing what?"
  - Build (doable part):
    - Replace the "Agencies" and "Access types" count bars (each is 1) with one horizontal bar of reported sales per agency.
    - The value is parsed from the text band; the tooltip shows the raw band and the access type.
    - Caption: "Sales as reported (text bands), FY 2025-26".
- **P11.2 ₹1.2 Cr format and icons** (Placement slide 11)
  - Client: "Please Check and add Icons, and write in 1.2 cr way"
  - Build:
    - G2 on all ₹ tiles. Sales estimate becomes "₹1.11 Cr".
    - Add icons to the market-access tiles.
    - Caption: "Sum of the agencies' reported average sales".
- **S3.6 Rename the header and People tile** (Skilling slide 3)
  - Client: "Skill Development Stats or way like this which sounds interactive"; "Total Candidates Enrolled"
  - Build: "Skilling field sheet" → "Skill Development Stats"; "People" → "Total Candidates Enrolled".
  - A: 3,250 for All years, 959 for 2026-27 (D).
- **S4.1 Income Mobility title** (Skilling slide 4)
  - Client: "Income Mobility pre to post training ( Change in Monthly income among participants with both pre and post training income data)"
  - Build: use exactly that as the title and subtitle.
- **S4.2 Remove "Income fell"** (Skilling slide 4)
  - Client: "Income Fell Is not possible , Remove it present the chart with different colors, In side bar graph manner"
  - Build:
    - Remove the bar.
    - Horizontal bars with a distinct colour per bucket.
    - Footnote: "5 of 92 candidates reported a lower post income and are not shown." Use the live n.
  - A: the bars add up to 87 (D).
- **S5.1 Course-wise enrolment** (Skilling slide 5)
  - Client: "Couse wise enrollement"; "Create icon for each course Mention Percentage,"
  - Build:
    - Replace the treemap with a horizontal bar titled "Course-wise enrolment", sorted descending, with count and % labels.
    - Show all courses (scroll or dynamic height; no silent top-N).
    - Keep the click and shift-click behaviour.
    - **No per-course icons.**
  - A: Basic Computer 790 (24.3%) is first.
- **S6.1 Gender-wise portfolio** (Skilling slide 6)
  - Client: "Gender Wise Portfolio"; "Change colors and Mention percentage"
  - Build: replace the rose chart with a doughnut titled "Gender-wise portfolio", using distinct female and male colours (not two blues) and % labels.
  - A: 79.1% / 20.9% / Not recorded 1.
- **S7.1 Post-Training Career Outcomes** (Skilling slide 7, with reference image)
  - Client: "Write Post training career Outcomes"; "Mention percentage of share in each funnel"; caption: "Remove this"
  - Build:
    - Title "Post-Training Career Outcomes", subtitle "Current status of skilling program participants".
    - Remove the "Status only…" caption.
    - % share on each stage.
    - Stage labels, order and colours from the reference: Higher Education / Further Study (blue), Self-Employment (light blue), Continuing Training = Ongoing course (yellow), Employment = Working (green), Status Not Reported (purple), Job Seeking (orange), Homemaker (teal). Show only stages with n > 0.
  - A: 62.7 / 24.5 / 5.3 / 3.5 / 2.9 / 1.1%.
- **S8.1 Course-wise Mean Pre vs Post Income** (Skilling slide 8, with reference image)
  - Client: "Course wise – Mean Pre vs Post Income"
  - Build:
    - Horizontal grouped bars: pre in blue, post in orange (as in the reference), with value labels.
    - Sorted by mean post, G1 means, n in the tooltip.
    - A course with no valid pre shows no pre bar.
- **S8.2 / S10.1 Remove the heatmap; post income by location** (Skilling slides 8 and 10)
  - Client: "Remove this"; "Post Income of Candidates location wise("; "Display not appropiat"
  - Build:
    - Remove "People by course and location".
    - Add "Post income of candidates location-wise": horizontal bar of G1 mean post income for the 5 locations, n on each bar, median in the tooltip.
  - A: the n's add up to 721 (D).
- **S11.1 / S15.1 States vs programme average** (Skilling slides 11 and 15)
  - Client: "States vs Porgram average of what? Make a proper title"; "Remove this"; "What is data presenting if taking average mention the average in corner so that comparison is there"
  - Build:
    - Title "Skill roster candidates by state" (use the matching wording at district grain).
    - Remove the "Roster geography only…" caption and add a description.
    - Corner badge "Average per state: 1,778", the mean of states with candidates. State 0 is shown as "State not recorded" (49), left out of the average, and disclosed.
    - Add % labels.
- **S12.2 Women participation** (Skilling slide 12)
  - Client: "Women participation"
  - Build: rename "Women share".
  - A: 85.7% (D).
- **S13.2 Post-program income ranges** (Skilling slide 13)
  - Client: "Post program income income ranges"; "Make it in different colors and In different kind of graphs"
  - Build:
    - Title "Post-program income ranges".
    - Horizontal bar with one colour per range, % labels, and an updated caption saying who is counted.
- **S14.3 Trade-wise candidates** (Skilling slide 14)
  - Client: "What is this graph presenting please mention details"; "Trade wise Candidates"
  - Build:
    - Title "Trade-wise candidates".
    - `pareto={false}` to drop the cumulative-% line, % labels, and a description.
    - Show all trades, or make "Other trades (n)" open exactly those trades.
- **S14.4 Batches by trade** (Skilling slide 14)
  - Client: "Use different colors and use percentage"; "Trade wise Candidates"
  - Build:
    - Title per A3.
    - Distinct colours and % labels.
    - Fix the `maxItems = 12` "Other" bar: it is the largest only because it merges the tail, and its click is empty. Either show all trades or make "Other" clickable.

---

## 6. Phase 5: bigger items doable now (4 items)

**P2.1 / S2.1 / S3.2 India map** (slide 2 of both decks; Skilling slide 3)
- Client: "States working should be like this"; "Add these in similar manner"; "Locations in Map of India"
- Build:
  - An ECharts India map with a GeoJSON from an approved source (A4), at the top of the Skilling, Placement and Enterprise pages.
  - Exactly the client's 5 pins, with name and state labels and the sample's colours: Kapasan – Rajasthan (orange), Savli – Gujarat (blue), Bharuch – Gujarat (purple), Gajraula – Uttar Pradesh (green), Nanjangud – Karnataka (red). Lightly shade those states.
  - Coordinates come from a static town lookup kept in one config constant. Never use `persons`/batch lat-long (PII).
  - Tooltip counts are optional, and only from existing aggregates.
- **Don't** add Nira, Roorkee, Vilayat, Hasanpur, Joya or Dhanaura.

**S3.1 / S5.2 Month filter** (Skilling slides 3 and 5)
- Client: "Month Wise Filter"; "Add Month Filter As well"
- Build:
  - A Month multi-select next to FY in `GlobalFilters`, for livelihood only, with URL param `month`. A month sits inside the FY (Apr–Mar).
  - Apply it to the M&E Skilling sheet (`month` + `year`) and, once A2 is answered, to roster/batch/monitor date columns. Drill-downs get it too.
  - Cards whose source has no month (Didi, farmers, enterprise, market access, FY profit) show "Month filter not available for this data" and keep their FY data.
- **Don't** infer months, and don't act on "Data Missing".

**S3.7 Regroup the Skilling page into 4 sections** (Skilling slide 3)
- Client: "It should be training and Course portfolio, Gender Inclusion, Employment outcomes, Income and Livelihood Outcomes"
- Build: put a heading over each section. Every card carries a small source tag ("M&E field sheet" / "Skill-tracking app"). The data is not merged.
  - **Training & Course Portfolio:** map, Total Candidates Enrolled, Skilling courses (batches), Locations, Skill roster headcount, Course-wise enrolment, Trade-wise candidates, Trade-wise batches, Skill roster candidates by state.
  - **Gender Inclusion:** Gender-wise portfolio, Women participation, Women on roster, Gender ratio, Age brackets (unchanged).
  - **Employment Outcomes:** Post-Training Career Outcomes, Employment outcomes of candidates.
  - **Income & Livelihood Outcomes:** Mean Pre Income, Post Income, Income Mobility, Course-wise Mean Pre vs Post, Post income location-wise, Post-program income ranges.

**S9.1 Reference template look** (Skilling slide 9)
- Client: "Dashboard , should be visible like this"
- Build (doable part): only the structure. KPI tiles with icon, value and % where it means something; the map; charts in a 2-column grid; consistent cards.
- **Don't** re-theme to green, change the sidebar or nav, add pyramid/weather/lorem widgets, or touch other modules.

---

## 7. DO NOT BUILD: waiting on the client

Leave these untouched. No tiles, placeholders, guessed definitions, or label or meaning changes. The G-rules may still change a number on one of these cards as a side effect (e.g. the G1 average); that's fine, but change nothing else.

| ID | Ask | Why it waits |
|---|---|---|
| P3.10 | Job Offers Generated | No data in any source (needs `job_offers_received` or an offers log) |
| P5.1 / S12.1 | Combine app + M&E data into one API / one skilling view | No shared key between the sources; needs a person_id/mobile on the sheet or a merged endpoint from the API owner, plus a decision on which source wins |
| P8.5 | Number of Didi trainings, internal vs external | `training_type` is "Internal" in every row and the sessions field is a constant; no count exists |
| P5.2 | Skilling → placement → income funnel | Unclear: the client must choose a single-source funnel. Leave the card as it is |
| P7.2 | "Total farmers since last year" | Unclear: cumulative (2,090) or added (451)? Also, is `number_of_farmers` cumulative? Keep the labels |
| P8.2 | "What is this" on the Didi income KPIs | Unclear: monthly or annual? Individual vs household? Keep the labels; no unit wording |
| P10.1 | Enterprise members: which programme? | Unclear: no programme field. The link to Didi is only a guess; don't label it |
| S14.2 | "Age bracket of what?" | Unclear: overall or per programme/course? Keep the card as it is |
| P8.3 | Monthly average income (Didi) | Income period unknown. **Don't** divide by 12 or add a "monthly" tile |

**Partial asks: the parts NOT to build**
- P3.3: no eligibility exclusions (such as the 87.5% figure) until the placement-eligible definition is agreed.
- P3.5 / P3.6: never call the proxy a "starting salary" without "(proxy)".
- P3.8: no claim of an overall increase beyond n = 92.
- P3.9 / P4.2: no employer field invented; text-derived only.
- P5.4: no time-to-employment from the M&E sheet.
- P6.1: no removal or redefinition.
- P7.3: no farmer-level rows.
- P8.4 / P8.6: no unit or hours conversion.
- P9.1 / P8.1: no "unique women" dedupe by name.
- P10.2: no invented status or enrolment dates.
- P11.1 / P11.2: no per-FY numeric sales and no new meaning for the sum.
- S3.1: nothing for "Data Missing", and no months for Didi, farmers or enterprise.
- S3.3: no course dates from the M&E sheet.
- S4.2: don't edit the 5 "fell" records.
- S5.1 / P4.1: no per-course or Income icons.
- S9.1: no full re-theme.
- S14.1: no programme-wise split.
- P2.1: no extra locations.
- Never clean, delete or edit source data: monitor test entries, the `funding_support = "Phase 4"` rows, the template-looking enterprise profit figures. If a value is obviously invalid, leave it out of calculations and disclose it (G5).

---

## 8. PR checklist (one per phase PR; copy into the description)

| ID | Status (done / partial / skipped) | What changed (files) | Expected | Actual (source: live API or local DB, time IST) | Screenshot |
|---|---|---|---|---|---|

Also include:
- lint and build output
- the clickable-element audit (Phase 3)
- all new UI text (Phase 4)
- the employer mapping (Phase 2)
- any env change I need to make
- any value that drifted from this brief, with its new number
