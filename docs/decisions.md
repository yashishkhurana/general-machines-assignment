# Decisions log

Every choice the build made that the law or the brief doesn't settle, with the reason. Rule values themselves
live only in `src/core/rules.ts`, each tagged gazette / Reg. translation / assumed.

**Third-party copies.** No clause was read on the Royal Gazette's own site (ratchakitcha.soc.go.th). Every rule
was read only through a third-party copy, marked in the tables below:

- **[ASA copy]**: the Thai gazetted text in the Association of Siamese Architects' PDFs. The 2556 plan is
  `download.asa.or.th/03media/04law/cpa/mr56-bma.pdf`, and `mr56-bma-full.pdf` for the annexes. The Bangkok
  Building Control Ordinance B.E. 2544 is `.../cba/bb/bb44-03.pdf`, whose text layer drops some Thai vowel
  marks. The `gazette` source tag in the app means this.
- **[ASA consolidated]**: ASA's consolidated Thai texts of Reg. 33 (`download.asa.or.th/03media/04law/cba/mr/mr35-33-upd69.pdf`)
  and Reg. 55 (`.../cba/mr/mr43-55-upd68.pdf`), with later amendments as footnotes. Checked 21 Nov 2026 for Reg. 33
  cl. 1–6 and Reg. 55 cl. 19, 21, 22, 33, 41, 44 and 50. Despite its "upd69" name, the Reg. 33 file's PDF metadata
  dates it to 9 June 2021. The Reg. 55 file was modified 10 Sep 2026. These rules now carry the `gazette` tag.
- **[IIBH translation]**: the IIBH English translation of Ministerial Regulations 7, 33, 41, 50 and 55
  (`iibh.org/kijun/pdf/Thai_02_MRs.pdf`). This is not the Thai text, and it predates later amendments (it lacks
  Reg. 68 of B.E. 2563). It is now the only source for Reg. 7 and Reg. 41 (`Reg. translation` tag).

**Re-check against the Thai texts (21 Nov).** All values in use match. Three wording differences from the IIBH
translation matter:
1. **Reg. 33 cl. 3 (as amended by Reg. 50, B.E. 2540)** requires a *road with a traffic surface* at least 6 m wide,
   unroofed, round the building, not "road or open space". Its ¶3 says that where a widening line applies, the
   width counts from that line. This supports the paved fire ring (G2) inside the planned line.
2. **Reg. 55 cl. 44 ¶3 (added by Reg. 68, B.E. 2563)**: other structures that count as buildings and stand on the
   roof or roof deck are not counted in the building's height. See R12.
3. **Reg. 33 cl. 4** excludes foundations from the 6 m distance. The tool applies 6 m to the whole footprint
   (stricter).
- **[secondary]**: blogs or news only (the environmental review trigger).
- LawPlayer was not used for any rule.

| Rule group (rules.ts ids) | Clauses | Read only in |
|---|---|---|
| `far.*`, `osr.*`, `planted.share`, `bonus.*` (except `far.cap.reg33`) | Plan arts. 15–17, 52, 55, 56, 57 | [ASA copy] |
| Soi 39 road group 13, road ข 38, the planned line, land in the right-of-way | Plan annex; arts. 36 ¶2, 44(2), 45 | [ASA copy] (`mr56-bma-full.pdf`) |
| `clear.*`, `side.*`, `face.*`, `os.ord52`; Ordinance column of `front.*` and `height.plane` | Ordinance cl. 49, 50, 52(1), 53, 54, 55 | [ASA copy] |
| `class.highrise.height`, `class.extralarge.area`, `access.*`, `hr.*`, `far.cap.reg33`, `os.reg33` | Reg. 33 cl. 1–6 | [ASA consolidated], checked 21 Nov; first read in [IIBH translation] |
| `front.*`, `height.plane`, `os.reg55`, `unit.*` | Reg. 55 cl. 19, 21, 22, 33, 41, 44, 50 | [ASA consolidated], checked 21 Nov; first read in [IIBH translation] |
| `park.unit.threshold`, `park.perUnit`, `park.large.divisor`, `park.aisle`, `class.large.*` | Reg. 7 cl. 1(12), 2(3), 3(1)(C), 3(1)(H), 8 | [IIBH translation] only (no Thai text checked) |
| `park.stall.*`, `park.headroom` | Reg. 41 cl. 2, 4 | [IIBH translation] |
| `eia.*` | ONEP notification | [secondary] |

## Decisions taken from the brief (applied, not revisited)

| # | Decision | Reason / source |
|---|---|---|
| B1 | The tool verifies the zone from a shipped zone layer (ย.8–ย.10 polygons plus neighbours) taken from the KNS.MAP extract. Inside one ย.8/ย.9/ย.10 polygon: zone set and shown. Straddling: warning naming both zones with the plot area in each. Outside ย.8–ย.10: "zone not supported", no result. A typed zone overrides the layer, and the mismatch is flagged. | Brief. Replaces the plan's "zone is a user input" limit (architecture §1, §7). |
| B2 | Straddle: permitted floor area = Σ part area × its zone's ratio; the plan's open-space ratio likewise per part; every other rule takes the strictest zone involved. **This is the tool's assumption, not law: the gazette has no straddle clause.** | Brief. |
| B3 | Planted ground: reading (b), half of the governing open-space requirement, is the pass/fail check; reading (c), half of the open space actually provided, is shown as a warning. | Brief. |
| B4 | Soi 39 legal width 16 m: gazette annex road group 13 (16.00–29.99 m), road ข 38 widened to a 16 m right-of-way (art. 44(2)); art. 36 ¶2 makes the planned line the road boundary for setbacks and the height plane. | Research notes §8. |
| B5 | Licensing of the zone extract is out of scope for this assignment. | Brief. |

## Rules and readings

| # | Decision | Reason |
|---|---|---|
| R1 | [ASA copy] **Review values override the original §8 table.** Low-rise front setback on a 16 m road is max(cl. 50's 1.6 m, cl. 55's 2 m) = **2 m**, so the low-rise footprint test is **34 × 45 = 1,530 m²** (was 34 × 45.4 = 1,543.6 m²). | Ordinance cl. 55 (≥ 2 m clear all round above 15 m, road side included), read 20 Nov. §8 review. |
| R2 | [ASA consolidated] High-rise front setback is computed as max(6 m, the cl. 41 value) rather than hard-coded 6. | §4.3 review. Always 6 today; stays correct if the table changes. |
| R3 | [ASA copy] Low-rise side/rear setback uses Ordinance cl. 54 (by storeys **or** height: 3 m from the 3rd storey or above 9 m), and is never less than cl. 55's 1/2 m. Openings assumed on every side. | Ordinance cl. 54 is slightly stricter than Reg. 55 cl. 50. |
| R4 | [ASA copy] Rainwater bonus is proportional (5% per 1 m³ per 50 m² of land), capped at 20%. Not an inference. | Art. 55 says "ตามสัดส่วน". §4.1 review. |
| R5 | [ASA copy] Affordable-housing bonus takes an "affordable area (m²)" input: extra floor area ≤ 4× that area, ≤ 20%. Energy bonus is a level picker (1–4 → 5/10/15/20%). All bonuses clamped to 20% combined. | Arts. 52, 56, 57. |
| R6 | [ASA copy] for art. 54, [IIBH translation] for Reg. 33/50. Parking counts toward floor area. | Art. 54 exempts only *extra public* parking from FAR/OSR, which only makes sense if ordinary parking counts; Reg. 33 cl. 1 (amended by Reg. 50) floor-area definition. |
| R7 | [IIBH translation only: the tool says so beside the parking line, in the Rules tab and in Limits] Parking count: per unit over 60 m² (Reg. 7 cl. 3(1)(C)) or, for a large building, 1 per 120 m² (cl. 3(1)(H)), whichever is more. **The 120 m² divisor is applied to total floor area including the parking itself** (stricter reading). | Brief item 7. A literal "building area" could be read as excluding parking; including it is the cautious reading. |
| R8 | [IIBH translation] **Parking area per space, recomputed from Reg. 41:** stall 2.40 × 5.00 m (perpendicular, Reg. 41 cl. 2(2)) plus half of a 6.00 m two-way aisle (Reg. 7 cl. 8) = 19.2 m², × **1.40 allowance for ramps, turning, columns and cores (assumed)** = **26.88 m²**. User-editable. | Reg. 41 read in the IIBH translation (p. 60). The 1.40 factor is not law. |
| R9 | ~~5 floors + 2 basements = 9,800 m², 82 needed, 104 fit~~. **Superseded by G8 (21 Nov): at 26.88 m²/space the low-rise fixture is 6 floors + 2 basements on a 1,249 m² plate**: 9,992 m² total, 7,494 m² residential, 84 spaces needed, 92 fit (2 × 46). At the brief's ~30 m²/space: 6 + 2 on 1,230 m², 82 needed, 82 fit (2 × 41), 7,380 m² residential. 6 + 1 still fails on parking. | All are tests in `test/section8.test.ts`. |
| R10 | Unit-mix assumption behind the per-unit count: 75% of residential floor area is saleable, average unit 50 m², 25% of units over 60 m². On the fixture that gives 180 units, 45 over 60 m², so the 1-per-120 m² rule governs (134 spaces at 16,000 m²). All three are inputs. | Reg. 7 cl. 2(3): the per-unit count only applies to units over 60 m². |
| R11 | [secondary] Environmental review (80 units / 4,000 m²) is a standing note, never a pass/fail line. | Trigger wording only seen in secondary sources. Tagged `assumed`, `verified: false`. |
| R12 | [ASA consolidated] Rooftop plant: a 4 m allowance over a 60 m² core must clear the height plane somewhere on the top floor; shown as a warning if not. The 23 m class test stays at the roof deck. **Reg. 55 cl. 44 ¶3 (Reg. 68, B.E. 2563)** exempts separate rooftop structures (tanks, masts) from the height, so the allowance stands for parts of the building itself (lift overrun, stair head). It stays a warning. | §4.4 review; Thai text re-checked 21 Nov. |
| R13 | Ground-floor height is an input (default 4.0 m; typical floors 3.2 m), so the low-rise generator drops to 6 floors when 7 doesn't fit under 23 m. | §4.4 review: 7 × 3.2 = 22.4 m leaves 0.6 m. |
| R14 | [ASA copy] for arts. 53–54, [IIBH translation] for Reg. 55's definition. Bonus clauses 53/54 (public open space, public parking) are not offered: both are limited to public buildings, and a condo isn't one under Reg. 55's definition. | §1 review. |
| R15 | [IIBH translation] for Reg. 55 cl. 42, [ASA copy] for art. 40(2). Canal edges (Reg. 55 cl. 42, plan art. 40(2)) are a stated limit, not modelled. | §4.3 review gap; out of scope for the Soi 39 parcel, which has no canal edge. |

## Road widening (ข 38) and access

| # | Decision | Reason |
|---|---|---|
| W1 | [ASA copy] Each road edge has a legal width (the planned 16 m) and a current width. Under the planned width, a widening strip of depth (planned − current) / 2 comes out of the plot. **The widening is assumed symmetric about the centreline** (the plan doesn't say). | Brief item 8; art. 36 ¶2, art. 45. |
| W2 | **Land inside the widening strip is excluded from plot area for floor area and open space** (cautious reading). | Not stated in the plan; art. 45 limits that land to transport/public use. |
| W3 | [ASA copy] for art. 36 ¶2. Setbacks run from the planned line. **The height plane on a road to be widened is a setting, "Measure the height plane to". The default is the road's current far boundary (strict); the option is the planned far line under art. 36 ¶2.** The summary always gives both figures. On the Soi 39 example: **39.5 m** at the high-rise front line (2 × (6 + 2.25 + 11.5)) by default, 44.0 m under the option. Concept A goes from 20 floors / 14,972 m² to 21 floors / 14,937 m². The setting changes nothing on a road that isn't being widened (tested), and it is kept in share links. | **Changed 21 Nov from brief item 8** (planned line for the plane), on review. The planned-line reading is defensible: art. 36 ¶2 covers "building lines and the various distances", and the plane is a distance rule. The strict default was chosen for three reasons. ¶2 sits in a clause about uses gated by road width, so its reach for a ย.10 condo is uncertain. If the permissive reading is wrong, the tool overstates height by 4.5 m, while the strict reading's error only leaves height unclaimed. And until the road is widened, a permit officer may measure to the physical far boundary. This is a risk judgement, not a settled reading. |
| W4 | [ASA consolidated] **Reg. 33 cl. 2 access (≥ 10 m, ≥ 18 m) is tested on the road's current width**, not the planned one. Setbacks and the height plane use the planned 16 m line (W3). Tests: current 9.9 m / planned 16 m fails access but would pass on 16 m; the plane 6 m behind the planned line is 2 × (6 + 16) = 44 m; the building line on 16 m planned / 8 m current is 1.6 m from the planned line (it would be 2 m on 8 m). | With the W3 default, access and the height plane both use the road as it is now. Under the W3 option they differ, which is consistent with the text: art. 36 ¶2 covers building lines and distances, while Reg. 33 cl. 2 sets a minimum right-of-way *width* (ถนนสาธารณะที่มีเขตทางกว้างไม่น้อยกว่า 10.00 เมตร), and the road isn't physically widened yet. So each rule follows its own text: distances from the planned line, width as it is now. An added test checks that Ordinance cl. 55's clear space (1 m up to 15 m, 2 m above) is met on the road side, measured from the planned line. |
| W5 | The road's far boundary is extended 300 m past the plot edge, i.e. the road is taken as straight beyond the frontage. | Needed for points near the plot's ends. Fails only on sharply curved sois. |
| W6 | Several road edges: the height plane takes the strictest road at every point (min over roads). Equal to the nearest-road rule except in corner cases, where it is stricter. Cl. 45–46's wider-road allowance is not claimed. | Keeps the plate clipping exact with one boolean per floor. |

## Geometry and generators

| # | Decision | Reason |
|---|---|---|
| G1 | Setback strips are built in metres (a transverse Mercator centred on the plot with scale factor 1, see G12) as edge rectangles plus one disc per vertex (radius = largest adjacent setback), unioned with polygon-clipping. Same shape as round-capped segment buffers. | Brief item 5. Duplicate caps at shared corners crashed polygon-clipping's sweep line ("Unable to find segment"); one disc per vertex with rotated vertices fixed it. |
| G2 | The 6 m high-rise fire road is modelled as a clear, **paved** ring round the tower, inside the planned line. Planted ground must fit outside it. On the fixture this trims the tower plate from 1,064 to 864 m². | The Thai Reg. 33 cl. 3, as amended by Reg. 50, requires a road with a traffic surface at least 6 m wide. I had earlier noted that the IIBH translation's "road or open space" might let grass pavers count; that was the older wording, and it is withdrawn. |
| G3 | Plates are trimmed from the rear (keeping the road side) when open space or a ratio cap forces a smaller plate. | Keeps the road-side face (Ordinance cl. 53) and the frontage. |
| G4 | Each floor's plate is the base plate minus where the plane is lower than that floor's top + 1.2 m parapet. Floors under 100 m² stop the stack. | §4.4/§5. |
| G5 | **Simplification, shown in the tool: the low-rise generator keeps one plate size for every floor (trimmed from the rear) and compares floor and basement counts. It doesn't step individual floors or redesign.** (Before G8 was revised it dropped a floor rather than shrink the plate.) | Brief item 10. |
| G6 | Low-rise basements use the same plate as the ground floor. | Keeps the planted ground outside the basement footprint (§5). |
| G7 | If the high-rise class is unavailable, concept A becomes a second low-rise layout with parking floors above ground. | §5. |
| G8 | **Revised 21 Nov: the low-rise generator picks the layout with the most residential floor area that meets every limit, with total floor area including basements kept under 10,000 m².** For each floor and basement count, the plate is the largest that satisfies open space (Ordinance cl. 52(1), Reg. 55 cl. 33, plan OSR on the total), total < 10,000 m², the permitted floor area, and parking (searched down in 1 m² steps). On the fixture: 6 + 2 on 1,249 m² (7,494 m² residential) beats 5 + 2 on 1,400 m² (7,000 m²). **This changes the §8 value** (R9). The largest open-space plate is still 1,400 m² (a test). Parking spaces per plate allow 0.05 m² for the trim's geometric tolerance. | User decision, 21 Nov (replaces "keep 5 + 2"). |
| G9 | Existing OSM buildings whose centroid lies inside the plot are taken as demolished (drawn as dotted outlines). | Otherwise they hide the concepts. |
| G10 | Basements are listed in the floor table but not drawn in 3D (fill-extrusion can't go below ground). | Rendering limit. |
| G11 | Floors under 100 m², or that leave no room for the 4 m roof plant, stop the stack or warn; roof plant is a warning, not a fail. | Assumptions `a.minPlate`, `a.roofPlant`. |
| G12 | **Local metres come from a transverse Mercator centred on the plot (k = 1), not UTM 47N.** UTM's scale factor at Phrom Phong is about 0.99995. The 40 × 50 m parcel came out at 1,999.8 m², and the panel showed "1,910 × 8" next to 15,279. Corners are also kept to 9 decimal places (~1 mm) in the example and share links, since at 7 places the area moved by ~0.3 m². The summary shows area × ratio = permitted floor area, adding a decimal to the area when whole-m² rounding would break the equality. | Fix 1, 21 Nov. Test in `test/geo.test.ts`. |
| G14 | **Margin shown beside every low-rise result:** m² under the 10,000 m² extra-large line (and %), and m under the 23 m high-rise line. Under 1% (100 m²) it is flagged as fragile, in the concept card and as a checklist warning. The fixture's 6 + 2 is 8 m² (0.08%) under: legal on paper, but a survey difference of a fraction of a percent tips it over. The generator does not hold a margin back itself. | Review, 21 Nov. Threshold `class.extralarge.margin` (assumed). |
| G13 | Print: before printing, the map is rendered synchronously and copied to an image (`preserveDrawingBuffer` is on too), and the print stylesheet shows the image in place of the WebGL canvas, in light colours. | Fix 3. WebGL canvases often print blank. |

## Zone layer

| # | Decision | Reason |
|---|---|---|
| Z1 | Shipped `src/data/zones.json`: 186 of the 498 features in `bkk-zoning-current.geojson` (all 69 ย.8–ย.10 features, plus every zone whose bounding box is within ~1.5 km of one). **124 sliver parts dropped** (≤ 4 distinct vertices and under 1,000 m²; most are ~0 ha). | Brief: "drop the 4-point ~0 ha slivers"; neighbours let the tool name the zone of a plot outside ย.8–ย.10. |
| Z2 | A zone counts as present under the plot if it covers at least 0.5% of it. | The simplified boundaries leave hairline overlaps. |
| Z3 | Plot area that falls in no zone polygon (gaps along roads and canals in the extract) is shared out in proportion to the zones present; a warning shows above 5%. | Gaps are an artefact of the extract. |
| Z4 | Bangkok bounds for the "outside Bangkok" check: a generous box 100.32–100.94 E, 13.48–13.96 N. Outside the OSM site box the tool still computes (zone and rules) but has no neighbours or width estimates. | Tool limit. |

## Site data (OSM)

| # | Decision | Reason |
|---|---|---|
| D1 | OSM API 0.6 `map` call for bbox 100.5635–100.5775 E, 13.7285–13.7405 N, **downloaded 20 Nov 2026**, converted by `scripts/build-data.mjs` and committed as static GeoJSON. 1,754 buildings, 488 road ways. | Public Overpass was overloaded (research notes §6). |
| D2 | **Height tags: 18 buildings (1.0%) have `height`, 70 more (4.0%) have only `building:levels`: 5.0% in all.** (The research session's wider bbox gave 2.2% / 7.6% of 4,702.) Levels × 3.0 m; otherwise 6 m assumed, drawn in a lighter tone. | Architecture §7. |
| D3 | The tall buildings next to the plot already carry levels tags (Noble State 39: 36, kept although **CondoDee lists 38**, Le Raffiné 39: 34, Grand 39 Tower: 30, The XXXIX: 32, Royal Castle: 17, 39 by Sansiri: 32, The Diplomat 39: 31). **Four more heights were hand-set from public listings** (floors × 3.0 m): Adelphi Grande, Soi 41: 20 floors (oyster.com, hotels.com); CNC Residence, Soi 33: 27 (fazwaz, nestopa, hipflat); The Bless Hotel & Residence, Soi 33: 8 (hotels.com, expedia, nestopa; tallest wing); Fuji Supermarket, Soi 33/1: 5 (travel guide; low confidence). No listing was found for "PSI Tower", "The Manor" (a mall at 32/1 Soi 39) or the former Banphaeo hospital building (branch closed 2016), so they stay at the assumed 6 m in the lighter tone. **Updated 21 Nov (user-supplied):** PSI Tower (208691131) 22 levels, "sourced: contractor's project page"; D.S. Tower II (324280507) 30 and 39 Suites (324280512) 9, "sourced: property listing". **Former Banphaeo hospital (331962370): 6 levels, visual estimate** from Street View (Aug 2024), north face from Soi Phrom Mit: open ground floor, a tall blank level, four window rows. Medium-low confidence, ±1 level. **The Manor (340477772): left as "height unknown: 6 m assumed" (final).** No exterior street imagery shows it: the building sits back from the road, and the only photo at its centroid (13.734724 N, 100.571946 E) is a 2017 interior shot of a clinic. An honest unknown is better than a guess for one low building. Eight heights are hand-set in all (7 sourced listings, 1 visual estimate). | §7 review option (c). Only counts stated in a source were used. |
| D4 | Building heights carry one of three source tags, each with its own colour in the legend: **OSM tag** (`height` or `building:levels`), **sourced listing** (a floor count stated in a listing or project page), **visual estimate** (judged from imagery). A fourth, lighter tone marks "height unknown: 6 m assumed". | User instruction, 21 Nov. |

## Soi 39 example parcel and its current width

| # | Decision | Reason |
|---|---|---|
| E1 | Example parcel: 40 m frontage × 50 m deep on the west side of Soi 39 (OSM way 156261446), 406–446 m north of Sukhumvit Road, mid-block, not a corner. It is a drawn test plot, not a surveyed land parcel. Zone ย.10 (detected; also the research session's finding). No sub-area number is stated: "ย.10-4" is unconfirmed. | Brief item 2. Picked where buildings face each other across the soi, so the building-gap bound exists. |
| E2 | **Current-width default = 11.5 m, the building-gap upper bound, not a survey.** Method: perpendicular rays from the OSM centreline every 2 m over the frontage, ≤ 40 m each side, kept only where both sides hit a building outline; the value is the minimum gap (the tightest valid bound). Measured from the plot's own front edge, the same estimator the panel runs, **3 of 20 rays** hit both sides, with a median of **16.4 m**. (The first build measured from the centreline window and logged 4 of 21 and 16.7 m; the example now uses the panel's estimator, so the two agree.) The note beside the current-width input gives this, the 6.5–16.4 m range, and the fact that 11.5 m is only 1.5 m above the 10 m high-rise access threshold, so the result is sensitive to it. The plot's front edge sits 5.75 m (half of 11.5) from the centreline (symmetric assumption). Lower bound (a): lanes=2 × 3.25 m = 6.5 m, no sidewalk tags. | Brief item 8. The right-of-way is at or below the gap; it is at least the carriageway. |
| E3 | With 16 m planned and 11.5 m current, the widening strip is 2.25 m: plot 2,000 m² − 90 m² = **1,910 m²** for floor area. | W1–W2. |
| E4 | The measure tool (c) gives a click-to-click distance over Esri World Imagery; the user decides whether it's a boundary-to-boundary width. The tool never fills it in itself. | Brief: don't invent a measured value. |

## Interface (redesign, 21 Nov): presentation only, no calculation changed

| # | Decision | Reason |
|---|---|---|
| U1 | Layout: 56 px top bar, 340 px setup panel, map, 420 px results. On the map only zoom, a collapsed attribution and three callouts (height limit at the front line, road edge, clearance). The 13-item legend is gone. | Review: the legend covered the model, and the answer wasn't on screen. |
| U2 | Under 900 px the panels stack: a header with a one-line summary and an Edit button, a 300 px map, then the results in normal page flow. Setup opens in flow under Edit. 20 px side padding, 44 px tap targets. | One breakpoint family. |
| U3 | The setup is a sentence ("A condo on a 1,910 m² plot in zone ย.10, facing Soi Sukhumvit 39…") whose underlined values open small editors. Method detail (rays, building-gap bound) moved to the Rules view. | Plain words first. |
| U4 | The verdict comes first ("A 21-storey tower fits here"), then one line naming what stops it, taken from the generator's `binding`. On the example that is floor area; the redesign mockup wrongly said the height limit. Then an A/B switch, three limit bars with plain notes, the checks (fails and warnings first, clause one click away), and floor by floor in a disclosure. | Review. |
| U5 | Colour by meaning only: white/grey neighbours on a pale grey-green ground, drafting blue envelope, brown residential, pale tan parking, red road edge. Height sources (OSM tag, sourced listing, visual estimate, assumed) moved from model colours to a hover card and the Rules view. The envelope follows the selected option (tower or low-rise). Zone and gap-line layers are off by default. | Review. |
| U6 | Type: Bai Jamjuree for headings and figures, Sarabun for text (both Thai-designed), with tabular figures so numbers don't shift as they change. The camera stays still while values change; it moves only on Reset or a share link, and not at all with reduced motion. | Review. |
| U7 | The bonus inputs stay numeric (affordable m², rainwater m³, energy level 1–4), not tick boxes as in the mockup, because each bonus depends on an amount. | The calculation needs the amounts. |

## Break-test fixes (21 Nov)

| # | Decision | Reason |
|---|---|---|
| T1 | "Reset to example" is enabled whenever any input differs from the example (plot, road edges, zone override, every setting; the view alone doesn't count), and it resets all of them. | Break test 1. Tests in `test/breakfix.test.ts`. |
| T2 | Comparison text shows as many decimals as it needs to stay on the right side of the threshold (`fmtVs`): "9.99 m (current) is under 10 m", never "10.0 m is under 10 m". | Break test 2. |
| T3 | Values under a legal minimum stop the result: floor-to-floor or ground floor under 2.60 m (Reg. 55 cl. 22), average flat under 20 m² (Reg. 55 cl. 19). | Break test 3. A design that breaks them isn't feasible. |
| T4 | A share link that can't be read (truncated, garbage, non-numeric or too few corners, malformed road edges) shows "This link couldn't be read, so you're seeing the example." | Break test 4. |
| T5 | Typed numbers are parsed strictly: digits with a dot, or a single comma as the decimal point only when there's no other separator ("12,5"). Hex ("0x10"), exponents ("1e3") and thousands separators ("1,000", "1 000") are rejected with a message under the field, and the value isn't applied. | Break test 5. |
| T6 | A plot mostly (> 50%) outside every zone polygon gives no result and says what share has no zone ("96% of the plot is outside any zone… may be a river, canal (khlong) or unzoned land"). Smaller gaps still compute, with the same caveat. Waterways aren't in the tool's data, so a plot over Khlong Saen Saep can't be detected directly. Canal setbacks (Reg. 55 cl. 42) stay a stated limit, now worded in Limits. | Break test 6. |
| T7 | The URL state is written at once on `pagehide` and when the tab is hidden, so a refresh right after an edit keeps it. Limits notes that edits replace the history entry, so Back leaves the tool. | Break test 7. |
| T8 | The example opens with one line above the result: "Example: a 2,000 m² plot on Sukhumvit Soi 39, 1,910 m² once the road is widened. A is a tower on a podium, B a low-rise block. Draw your own plot, or drag the corners." | Break test 8. |
| T9 | **Share link written at once on every discrete edit.** A reload picks its URL before `pagehide` fires, so the earlier 250 ms debounce plus a pagehide save lost an edit made just before a refresh (9.5 typed, 11.5 back). Only corner drags are throttled (400 ms), and writes fall back to throttling after 60 in 30 s (Safari allows 100). A flush on `pagehide`, `beforeunload` and tab hide reads the latest state from a ref. `src/ui/urlWriter.ts`, tested; also checked in Chrome by typing and reloading immediately. | Break test, 21 Nov. |
| T10 | Callouts sit out from the plot on leader lines, along the line from the plot's centre through their point, with a per-callout bias, kept inside the map. Any that still overlap are pushed apart, and they re-lay out as the camera moves. On phones only "Height limit" shows; a 44 px "Labels" button on the map adds the road edge and clearance. | Phone review: the three stacked on the front edge and hid the outline and tower base. |
| T11 | A refused typed value says which value is still in use ("Not a number. Use digits, with a dot for decimals. Still using 12.5 m."). Unfinished input ("9.", "12,") is neither an error nor applied. | Break test, 21 Nov. |
| T12 | **Desktop page no longer scrolls into empty background.** The screen-reader-only status labels (`.sr`, absolutely positioned) inside the checks had no positioned ancestor, so they were placed against the page and stretched the document to ~2,000–2,500 px at every window size. Both scrolling panels (`.app > aside.inputs`, `.app > section.results`) and each check row are now positioned. `npm run check:layout <url>` (real Chrome) asserts that on desktop (1440×900, 1280×720, 1920×1080, 1024×1366) document scrollHeight equals innerHeight, there's no horizontal scroll and the results panel scrolls, and that on a 390 px phone the page still scrolls normally with no horizontal scroll. | Bug report, 21 Nov. |
