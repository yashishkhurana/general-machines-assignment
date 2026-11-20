# Research notes — Bangkok plot feasibility tool

AI-assisted research log (session 1, 2026-11-20). Primary sources read directly; secondary sources flagged.
These are working notes, not the write-up.

## 1. Which plan is in force

- **In force: Bangkok Comprehensive Plan B.E. 2556 (2013)** — Ministerial Regulation, Royal Gazette vol. 130 part 41 ก, 16 May 2013.
  Primary text: https://download.asa.or.th/03media/04law/cpa/mr56-bma.pdf (46 pp, Thai, extracted cleanly with pdftotext).
- Draft 4th revision ("2569"/2026 draft): public hearing ran Aug 10 – Nov 9 2026, ~5,000 petitions, stage 11 of 18.
  Expected in force ~mid/late 2027. **Not law yet.** Many blogs mix draft values (road tiers 12/16/20/30 m, Y.10–Y.12 codes) with 2556 values.
  Sources: nationthailand.com/business/property/40073336, lad.co.th draft-2026 article.

## 2. FAR by zone (2556 gazette, verified line by line)

| Zone | Colour | FAR | OSR (open space / total floor area) |
|---|---|---|---|
| ย.1 / Y.1 | yellow | 1 | (see gazette) |
| ย.2 | yellow | 1.5 | 20% |
| ย.3 | yellow | 2.5 | |
| ย.4 | yellow | 3 | |
| ย.5 | orange | 4 | |
| ย.6 | orange | 4.5 | 6.5% (secondary) |
| ย.7 | orange | 5 | 6% |
| **ย.8** | brown | **6** | **5%** (Art. 15) |
| **ย.9** | brown | **7** | **4.5%** (Art. 16) |
| **ย.10** | brown | **8** | **4%** (Art. 17) |
| พ.1–พ.5 / C.1–C.5 | red | 5, 6, 7, 8, 10 | |

Every OSR clause also says: open space must be ≥50% permeable/planted, and must not be less than the Building Control Act minimum.
Plot-subdivision clause: once a plot is used, FAR/OSR are computed across all subdivided parts combined.

**Condos (อาคารอยู่อาศัยรวม) by zone:** no size cap in ย.8–ย.10. Capped above 10,000 m² in ย.5–ย.7, above 5,000 m² in พ.1–พ.3 (unless road-width / 500 m-from-station exceptions). Exact exception wording: Art. 12–14, 18–20.

Other uses in ย.8–ย.10 are gated by road width (e.g. ย.8 hotel >50 rooms needs road ≥16 m or ≤500 m from a rail station; ย.10 hotel >80 rooms needs ≥12 m; commerce >10,000 m² needs 30 m in ย.8, 16 m in ย.10).

**Art. 36 — what "fronts a road ≥ X m" means:** plot must have one side ≥ X-tier width (12/12/16/30 m) adjoining the road, the road must stay ≥ X m continuously to another road, and the plot must lie within 200/200/300/500 m of that road edge.
**Art. 37:** "within 500 m of a station" is measured from the platform edge.

**FAR bonuses (Art. 51–57):** affordable housing, public open space (ย.8–10, พ.2–5, public buildings), public parking near stations, rainwater retention (1 m³ per 50 m² land → +5%, up to +20%), green building (+5/10/15/20%). **Total of all bonuses ≤ +20% (Art. 57).**

## 3. Zoning map data

- BMA City Planning Dept ArcGIS: `http://3d-cpd.bangkok.go.th/ArcGIS/rest/services/DOL/LupDolWms/MapServer`.
  **All bangkok.go.th / bangkokgis.com hosts reset the connection from here (India) — likely geo-blocked.** The live tool can't depend on them.
- Pre-extracted GeoJSON in a public GitHub repo (Kanesuan/KNS.MAP, `public/data/bkk-zoning-current.geojson`, 498 features, props `zone`, `category`). **No licence on that repo.**
  Validation: per-zone feature counts match the gazette's sub-area numbering exactly (ย.8 = 26, ย.9 = 30, ย.10 = 13 named areas; ย.3 = 70, ย.4 = 40…).
  Quality: boundaries simplified (4–105 vertices), plus many degenerate 4-point ~0 ha slivers. Zone edges are approximate.
- ย.10 areas cluster around Sukhumvit (Thonglor/Ekkamai, ~13.742, 100.570), Khlong Toei / Rama IV (~13.718, 100.544), Phra Khanong (~13.726, 100.589), Sathorn/Charoen Krung (~13.711, 100.523) and Phahonyothin (~13.782, 100.545).

## 4. Building Control Act rules (national; English translation of MRs: https://www.iibh.org/kijun/pdf/Thai_02_MRs.pdf)

**Thresholds:**
- High-rise = ≥ 23 m (ground to roof deck).
- Extra-large = ≥ 10,000 m² total floor area, or that much on any one floor.
- Large = > 2,000 m².

**MR 33 (high-rise / extra-large):**
- Cl. 2: plot side ≥ 12 m must adjoin a public road ≥ 10 m wide, continuous to another ≥ 10 m road. If > 30,000 m², the road must be ≥ 18 m.
- Cl. 3: 6 m fire-truck road all round the building.
- Cl. 4: outermost part of the building (above and below ground) ≥ 6 m from neighbouring land and public road.
- Cl. 5: FAR ≤ 10 (the city plan is stricter, so it governs).
- Cl. 6: residential needs vacant land ≥ 30% of the plot (non-residential 10%).
- Floor area includes balconies and verandas, but excludes the sun deck and stairs above the roof.

**MR 55 (all buildings):**
- Cl. 33: open space ≥ 30% of the largest floor (residential) — this is the low-rise version.
- Cl. 41 building line from the road:
  - road < 6 m → 3 m from the road centreline
  - for buildings > 2 storeys / 8 m:
    - road < 10 m → 6 m from the centreline
    - road 10–20 m → 1/10 of the road width from the road boundary
    - road ≥ 20 m → 2 m from the road boundary
- Cl. 42: canal setback 3 m (< 10 m wide) or 6 m (≥ 10 m wide).
- **Cl. 44: height at any point ≤ 2 × horizontal distance from that point to the *opposite* boundary of the nearest public road.** This is a sloped plane, not a flat cap. It is the key 3D envelope rule.
- Cl. 45/46: two roads or a corner plot → measure from the wider road; length along the narrower road ≤ 60 m.
- Cl. 48: buildings on the same plot ≥ 4 m apart (≤ 9 m high) or ≥ 6 m (9–23 m).
- Cl. 50: walls with openings ≥ 2 m from the boundary (≤ 9 m high), ≥ 3 m (9–23 m). Solid walls can be closer; a wall on the boundary limits height to ≤ 15 m and needs the neighbour's consent.
- Cl. 19: apartment units ≥ 20 m². Cl. 22: residential floor-to-floor ≥ 2.60 m.

## 5. Interactions worth showing in the tool

- **The narrow-soi effect:** a soi narrower than 10 m fails MR 33 Cl. 2, so no high-rise (≥ 23 m) and no ≥ 10,000 m² building. Result: the Bangkok "low-rise condo" (8 storeys, < 23 m, < 10,000 m²). Blogs state "roads < 10 m → 23 m max" as if it were in MR 55. It isn't; it falls out of MR 33.
- **Two open-space rules, check both:** the city-plan OSR is a % of floor area, the Building Control Act rule is a % of land.
  - ย.10 at full FAR 8 needs 4% × 8 = 32% of land open, versus MR 33's 30%. The city plan binds at full FAR.
  - ย.8 at FAR 6 needs 5% × 6 = 30%, a tie.
- Achievable gross floor area = min(FAR × land, what fits inside the envelope after setbacks, the 2× road height plane and the open-space footprint cap).
- EIA (informational): residential with ≥ 80 units or ≥ 4,000 m² needs EIA approval before construction (secondary sources; the exact ONEP wording is not verified).

## 6. Site data

- Public Overpass endpoints were at capacity or timing out during research. **Pre-bake OSM data at build time.** Don't query at runtime.
- Candidates: Geofabrik Thailand .osm.pbf, Overture Maps buildings (may carry height), Google Open Buildings 2.5D. Coverage of height/levels tags in Sukhumvit **not yet measured.**
- OSM road `width` tags are likely sparse, so road width should be a user input with a default by highway class.

## 7. Open questions / not yet verified

- Bangkok Building Control Ordinance B.E. 2544 (ข้อบัญญัติ กทม. ควบคุมอาคาร 2544) may add stricter local setbacks. Full text not yet read.
- What counts toward FAR "total floor area" under the 2556 plan (parking? basement?) — check the gazette definitions and BMA practice.
- Special height-control areas (airport approach zones, Rattanakosin) — not relevant to Sukhumvit ย.10, but confirm.
- Exact OSR values for ย.1, ย.3–ย.5 (only needed if the tool goes beyond one zone).

## 8. Update (session 1, later): two open questions closed

**Bangkok Building Control Ordinance B.E. 2544** — ASA copy https://download.asa.or.th/03media/04law/cba/bb/bb44-03.pdf (34 pp, text layer; some Thai vowel marks drop in extraction).

| Clause | What it says | Effect |
|---|---|---|
| 49 | Same as Reg. 55 cl. 44. Exception: within 100 m of a road ≥ 80 m wide, measure from the widest road | none for Soi 39 |
| 50 | Same tiers as Reg. 55 cl. 41. Exempts residential ≤ 3 storeys / ≤ 10 m and ≤ 1,000 m² | none |
| 52(1) | Residential: open space ≥ 30% of **land** area | confirms the low-rise 1,400 m² plate |
| 52(6) | Buildings > 2 storeys / 8 m **not** on a public way: 6 m front open space (12 m if > 3 storeys) | not for a road-fronting plot |
| 53 | Building on a public way: road-side face > 1/8 of the outer perimeter, within 20 m of the road | new checklist line |
| 54 | Openings 2 m from boundary (≤ 2 storeys or ≤ 9 m), 3 m (3rd storey up or > 9 m) | matches Reg. 55 cl. 50 |
| 55 | ≥ 1 m clear all round a building ≤ 15 m, ≥ 2 m if > 15 m; can't be shared | low-rise front setback on a 16 m road becomes 2 m, not 1.6 m |

**Soi 39 road width** — full plan gazette https://download.asa.or.th/03media/04law/cpa/mr56-bma-full.pdf (287 pp; the 46-page `mr56-bma.pdf` omits the annexes).
- Annex road list 13, "16.00–29.99 m", item (13): ซอยสุขุมวิท ๓๙ (ซอยพร้อมพงษ์), from Sukhumvit Rd to Phetchaburi Rd.
- Transport annex: **ถนนสาย ข ๓๘**, an existing road designated for widening, about 2,000 m from Khlong Saen Saep to Sukhumvit Rd. Art. 44(2): ข roads = **16 m right-of-way**.
- Art. 36 ¶2: for ก and ข widened roads, the **planned ROW line is the road boundary** for building lines and distances under building-control law.
- Art. 45: land inside a project road's ROW may be used only for transport or public purposes.
- Still unknown: the soi's current ROW width, and whether the widening strip counts toward plot area for FAR.

**Correction to my earlier review:** I flagged the 16 m figure as unsourced because the 46-page text has no road lists. It was right; the annex has them.
