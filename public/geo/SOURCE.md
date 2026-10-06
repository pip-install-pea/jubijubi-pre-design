# public/geo: India boundaries

| File | Content |
|---|---|
| `india_states.geojson` | 40 features: 36 states/UTs + 4 SoI inter-state disputed areas (`disputed: true`) |
| `india_districts.geojson` | 742 districts (9 disputed pieces), SoI release c. 2020–21 |
| `india_district_points.geojson` | 1 inner point per district (labels / bubbles) |

**Source:** Survey of India boundary data (the same set as SoI "Administrative Boundary Database", OVSF/1M/7, https://onlinemaps.surveyofindia.gov.in/Digital_Product_Show.aspx), taken from the public mirror **ramSeraph/indian_admin_boundaries** (GitHub releases `states/SOI_States.geojsonl.7z`, sha256 `210bbb0d95d7e1b2a7ecd358d855c184521ef8f3cb2cdc566420b6384060f5ce`; `districts/SOI_Districts.geojsonl.7z`, sha256 `d160bc8cab093d58ba7f400a4ae44bd3d0ff521b7955bedfb0ff5dc5e8cc72ba`; repo HEAD at retrieval `552a971d866324f9a7fa2be6665c07e35f98af5d`). Retrieved 6 Oct 2026.

**Licence:** CC0 1.0. The mirror requests attribution to the DataMeet community and the original government source (https://github.com/ramSeraph/indianopenmaps/blob/main/DATA_LICENSE.md). National Geospatial Guidelines 2021, para xiii, make SoI boundary data the standard and permit its digital display.

**Attribution shown on every map:** "Boundaries: Survey of India (via DataMeet / indian_admin_boundaries)".

**Processing:**
- Properties are renamed or added (`name`, `state_code` = LGD, `state_abbr`, `key`, `disputed`, `remarks`).
- Geometry is simplified with mapshaper 0.6.121 (`-simplify 0.9%` states, `1%` districts, `weighting=0.7 keep-shapes`, precision 0.001°).
- Nothing else: no `-clean`/`-snap`, clipping, erasing or dissolving. The self-intersections in the source were left as delivered.

**Rebuild:** `npm run geo:build`. **Check:** `npm run geo:check`.

**Known limits:**
- The district set is the SoI release of c. 2020–21, so newer districts (e.g. Andhra Pradesh's 2022 split) are absent. App names that don't match are listed as unmapped, never forced.
- Simplification moves border towns by up to a few hundred metres, so pins carry their district in config.
