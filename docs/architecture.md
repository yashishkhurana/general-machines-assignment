# Architecture: Bangkok plot envelope tool

Status: plan, written Friday 20 Nov 2026. Deadline Sunday 22 Nov, 18:53 IST. Feature freeze Sunday 12:00.

> **Review, 20 Nov (AI-assisted).** Every point below was checked against the sources in `docs/research-notes.md`:
> - the Royal Gazette text of the 2556 plan, read directly
> - the English translation of Ministerial Regulations 7, 33 and 55
> - OSM data pulled for the Soi 39 area
>
> Challenges are marked **▸ Review** inline. Original text is unchanged.
>
> Each finding is tagged:
> - **[verified]** checked against a primary source
> - **[wrong]** contradicted by a source
> - **[unverified]** no source read yet
> - **[gap]** something the plan doesn't cover
>
> **The five that change the build:**
> 1. **[gap] Parking count is missing.** Reg. 7 cl. 3(1)(C)/(H) sets it, and the parking counts toward floor area. On the test fixture that's 134+ spaces, roughly 4,000 m² of the 16,000 m².
> 2. **[unverified] "Ordinance" clauses (cl. 49, 50, 52, 54, 55) have not been read.** The low-rise 30%-of-plot open-space rule, and test rows that depend on it, rest on cl. 52 alone.
> 3. **[wrong] OSM heights won't carry "real site".** Around Soi 39, 2.2% of 4,702 buildings have `height` and 7.6% have `building:levels`. With a 6 m default, about 90% of the towers would render as 2-storey boxes.
> 4. **[unverified] The 16 m default for Soi 39 has no source yet.** No "16.00–29.99 m group" or Soi 39 entry appears in the gazette text. OSM tags it `tertiary`, `lanes=2`, no width.
> 5. **[gap] "No zoning map shipped" makes two parts of the plan impossible:**
>    - the "plot straddling two zones" validation in §6
>    - catching a plot drawn outside ย.10

## 1. Scope

A browser tool for a developer in Bangkok. The user draws a plot on a map, marks the edge that faces the road, sets the road width, and picks a building type. The tool shows the rules that apply, the 3D space a building may fill, and two concept designs with pass/fail checklists.

| Item | Choice |
|---|---|
| Law | Bangkok Comprehensive Plan B.E. 2556 (2013). The fourth revision is a draft and is not used. |
| Zone | ย.10 as the worked zone. ย.8 and ย.9 share the same clauses with different ratios, so they are selectable. |
| Building type | Residential condo: high-rise and low-rise. |
| Test plot | Mid-block parcel fronting Sukhumvit Soi 39 (Soi Phrom Phong), sub-zone ย.10-4. Not a corner. |
| Road width default | 16 m: the bottom of the plan's 16.00–29.99 m group, where Soi 39 is listed. User-editable. |

Stated limits, shown in the tool:

- Hotel and office are not modelled. Clause 17 allows them in ย.10 with conditions.
- Bonus clauses 53 and 54 are not offered. Both are written for public-building use.
- Corner and two-road plots use the nearest-road rule (section 4.4). Clauses 45 and 46 may allow more height; the tool does not claim it.
- Zone is a user input. No zoning map is shipped.
- Road continuity (Regulation 33 clause 2) is a user tick-box.
- Environmental review is a flag only.

> **▸ Review, §1**
> - **ย.8/ย.9 "share the same clauses" [verified for condos only].** Arts. 15–17 differ for other uses:
>   - hotel above 50 rooms needs a 16 m road in ย.8, against 80 rooms on a 12 m road in ย.10
>   - commerce above 10,000 m² needs a 30 m road in ย.8, against 16 m in ย.10
>
>   The condo rules (no size cap) and the FAR/OSR structure are the same across all three. Reword so the claim isn't broader than the condo-only scope.
> - **Sub-zone "ย.10-4" [unverified].** The zone ย.10 is confirmed: every sample on Soi 39 and plots 40 m either side fall in one ย.10 polygon (feature 457, 285 ha), about 320 m from its edge. The extract carries no sub-area numbers, so "-4" can't be confirmed. Drop it or cite the official map sheet.
> - **Road width 16 m [unverified].**
>   - The gazette text has no road-width grouping and no Soi 39 entry. Road lists sit in annexes (รายการประกอบแผนผัง) that aren't in the 46-page text.
>   - The "16.00–29.99 m" banding looks like the 2567 draft plan's road list. If so, it's the wrong source under the 2556 law.
>   - OSM has `highway=tertiary`, `lanes=2`, no `width`.
>   - Keep the input editable, label the default "assumed", and record where 16 m came from.
> - **Soi 39 is within 500 m of BTS Phrom Phong** for most of its length (art. 37: measured from the platform edge). That doesn't change anything for condos in ย.10, but would matter for hotel/office if those are added.
> - **Bonus clauses 53/54 excluded [verified].** Both are limited to อาคารสาธารณะ (public building). Reg. 55's definition lists hotels but not apartments or condos, so a condo isn't a public building. This closes open item 4 in §10.
> - **Zone as user input [gap].** The user draws a plot on a real map, then types a zone the tool can't check. Options:
>   - (a) ship the zone layer as a reference overlay with an "approximate, verify against BMA" label
>   - (b) ship only the ย.10 polygons
>   - (c) keep it as typed input
>
>   The polygons are the map annex of a Ministerial Regulation, so they're arguably not copyrightable (Thai Copyright Act s.7 excludes laws and regulations). The extraction is a third party's. Your call; record it.

## 2. Stack

- Vite, TypeScript, React.
- MapLibre GL for the map and plot drawing.
- deck.gl over MapLibre for the envelope, concepts and neighbouring buildings. Fallback if the sloped mesh takes more than an hour: a separate three.js view in local metres beside the map.
- Geometry as pure functions in local metres (UTM zone 47N via proj4). Polygon operations with turf and polygon-clipping.
- Vitest for the numbers.
- Deployed on Vercel from `main`.

> **▸ Review, §2**
> - **deck.gl's polygon layers can't draw a sloped top.** The envelope under the 2×-road plane is a sloped surface, so it needs a custom mesh either way. Pick one renderer now:
>   - three.js as a MapLibre custom layer (an official MapLibre example) handles envelope, concepts and neighbours in one scene, with no "fallback" hour
>   - deck.gl `SimpleMeshLayer` also works
> - **UTM 47N is right** for Bangkok (96–102°E).
> - **Name the basemap.** "Public vector tiles" isn't a decision. OpenFreeMap needs no key. MapTiler and Stadia need keys and have quotas.

## 3. Modules

| Module | Job |
|---|---|
| `rules.ts` | One table: id, value, unit, clause, source, applies-to. The calculation and the rules panel both read it. No rule value appears anywhere else. |
| `store.ts` | All inputs in one store: plot polygon, road edge(s), road width, zone, building type, bonuses, road-continuity tick. |
| `validate.ts` | Checks inputs. Returns a list of messages. Never throws. |
| `metrics.ts` | Plot area, frontage, permitted floor area, open-space requirements, which limit binds. |
| `classify.ts` | Decides which building classes are available (high-rise, low-rise) and why. |
| `footprint.ts` | Buildable footprint per class from per-edge setbacks. |
| `envelope.ts` | Height field over the footprint, meshed for display. |
| `concepts.ts` | Two generators that stack floors until a limit binds. |
| `checklist.ts` | Pass or fail per rule, with the clause and the numbers behind it. |
| `data/` | Static buildings and roads around the site. |
| `ui/` | Map, inputs panel, rules panel, floor tables, checklists. |

Everything on screen comes from one call, `compute(inputs) → results`, re-run on every input change and debounced while a vertex is being dragged. There is no reload path.

## 4. Rules as implemented

### 4.1 Floor area

| Rule | Value | Clause |
|---|---|---|
| Floor area ratio | ย.8 6:1, ย.9 7:1, ย.10 8:1 | Plan cl. 15, 16, 17 |
| Bonus | Up to 20% of the base ratio, combined | Plan cl. 57 |
| Bonuses offered | Affordable housing (cl. 52), rainwater storage (cl. 55), certified energy-efficient building (cl. 56) | Plan cl. 52, 55, 56 |
| Cap for high-rise and extra-large | 10:1 | Reg. 33 cl. 5 |

- Floor area counts every floor inside the outer walls, above and below ground: units, core, balconies, parking, basements. The roof deck is excluded. Basis: plan cl. 4 and Reg. 33 cl. 1. Neither excludes parking or basements.
- Rainwater bonus: 5% per 1 m³ of storage per 50 m² of land, read as linear, capped at 20%. The linear reading is an inference.
- Bonus toggles are clamped so the combined total never exceeds 20%.

> **▸ Review, §4.1**
> - **Ratios and the 20% cap [verified].**
>   - Arts. 15/16/17 give 6/7/8.
>   - Art. 57 caps all of arts. 51–56 combined at +20% of the ratio.
>   - Reg. 33 cl. 5 sets 10:1, which never binds here (ย.10 with full bonus is 9.6).
> - **Parking counts toward floor area [verified, with stronger evidence].** Art. 54 explicitly *exempts* extra public parking from FAR and OSR. That only makes sense if ordinary parking counts, so cite art. 54. "Plan cl. 4" defines the ratio, not "floor area". Reg. 33 cl. 1 (as amended by Reg. 50) gives the floor-area definition.
> - **Rainwater "linear reading is an inference" [wrong].** Art. 55 says the bonus goes up "ตามสัดส่วน" (in proportion), with a 20% ceiling. Proportionality is in the text, so it isn't an assumption.
> - **Affordable-housing bonus is missing a cap [gap].** Art. 52 limits the added floor area to 4× the affordable or legacy-resident housing area provided. Affordable means at least 20% below the project's average price per m². The toggle needs an "affordable area (m²)" input, not an on/off switch.
> - **Energy bonus [verified].** Art. 56 gives +5/10/15/20% by certification level 1–4 (TREES, or another body approved by the town planning board). Make it a level picker.

### 4.2 Building class

| Class | Test | Clause |
|---|---|---|
| High-rise | Roof-deck height 23 m or more | Reg. 33 cl. 1 |
| Extra-large | Floor area 10,000 m² or more | Reg. 33 cl. 1 |
| Low-rise | Roof deck under 23 m and floor area under 10,000 m² | by exclusion |

Access for a high-rise or extra-large building (Reg. 33 cl. 2):

- Frontage of at least 12 m on a public road.
- Road right-of-way at least 10 m for floor area up to 30,000 m², at least 18 m above that.
- The road must connect to another public road of the same minimum width (tick-box).

If access fails, only the low-rise class is available. If the road is under 18 m, floor area is capped at 30,000 m² and the tool says so.

> **▸ Review, §4.2**
> - **Thresholds and access [verified]** against Reg. 33 cl. 1–2.
>   - Extra-large also triggers at 10,000 m² or more on any single floor. That's irrelevant at these plot sizes, but it belongs in `rules.ts`.
>   - Cl. 2 ¶3 adds a requirement: the 12 m frontage strip must stay open and continuous up to the building as a fire-engine entrance. That constrains concept A's podium and drop-off layout.
> - **Third class missing [gap].** Reg. 55 and Reg. 7 define a "large building": more than 2,000 m², or 15 m+ tall with 1,000–2,000 m². It isn't a separate envelope, but it switches the parking rule (§5 review).

### 4.3 Setbacks

High-rise or extra-large (Reg. 33 cl. 3 and 4):

- 6 m from every plot boundary and from the public road, above and below ground.
- A 6 m fire road all round. Modelled as the same 6 m ring. Assumption logged. The ring stays clear at ground level: no podium, ramp or planting in it.

Low-rise, front edge (Reg. 55 cl. 41; Ordinance cl. 50):

| Road width W | Setback from the plot's road edge |
|---|---|
| Under 10 m | max(0, 6 − W/2). The rule is 6 m from the road centreline. |
| 10 m to 20 m | W / 10 |
| Over 20 m | 2 m |

Assumption: the plot's road edge is the road boundary, and the road is symmetric about its centreline.

Low-rise, side and rear edges (Reg. 55 cl. 50; Ordinance cl. 54 and 55). The tool assumes walls with openings on every side:

| Building height | Distance from boundary |
|---|---|
| Up to 9 m | 2 m |
| Over 9 m, under 23 m | 3 m |

Footprint method: buildable footprint = plot minus the union of buffers of each edge by that edge's setback. This handles concave plots and different setbacks per edge. An empty result is a valid outcome and produces a message.

> **▸ Review, §4.3**
> - **Reg. 33 cl. 3–4 and Reg. 55 cl. 41 and cl. 50 [verified]** against the translation, including the tier boundaries (cl. 41: "10 m and upwards but not exceeding 20 m", then "not less than 20 m"; both give 2 m at exactly 20 m).
> - **High-rise front setback should be computed as max(6 m, the cl. 41 value)** rather than hard-coded to 6. It's always 6 today, because high-rise needs a road of 10 m or more and then W/10 ≤ 2. The max() keeps the code correct if the rules table changes.
> - **Every "Ordinance cl. N" citation is unverified.** None of the Bangkok Building Control Ordinance B.E. 2544 has been read in this project. Either get the text and check each clause, or drop the citations and rely on Reg. 55, which is verified.
> - **Canal edges are missing [gap].** Reg. 55 cl. 42 requires a building-line setback from a canal of 3 m (canal under 10 m wide) or 6 m (10 m or wider). Plan art. 40(2) adds a planted strip of the same widths. Sukhumvit has khlongs, so add an edge type "canal" or list it as a stated limit.

### 4.4 Height

- At any point, height may not exceed twice the horizontal distance to the far boundary of the nearest public road (Reg. 55 cl. 44; Ordinance cl. 49).
- Implemented as `h(p) = 2 × (distance from p to the road edge + W)`, taken for the nearest road edge at each point.
- This limit is measured to the highest part of the building. The 23 m class test is measured to the roof deck. Concepts therefore carry a parapet allowance (default 1.2 m) that must sit under the plane.
- The envelope top is sampled on a grid inside the footprint and meshed. Grid spacing scales with plot size to keep the mesh under a fixed vertex budget.

> **▸ Review, §4.4**
> - **Measure to the road's far edge as drawn, not d + W [gap].**
>   - Cl. 44 measures perpendicular to the *opposite boundary* of the road.
>   - `d + W` is exact only when the plot edge runs parallel to the road. It breaks on angled edges, curved sois and plots near a road end.
>   - Build the far boundary as a polyline (the road edge offset by W, away from the plot) and take distance-to-polyline.
>   - That's the same cost and it's correct in more cases.
> - **"Highest part of the building" means more than a 1.2 m parapet.**
>   - Lift overruns, roof water tanks and stair heads sit on the roof; 3–5 m is typical.
>   - Either add a roof-structure allowance (default ≈ 4 m over the core) that must clear the plane, or say plainly that rooftop plant is not modelled.
>   - The 23 m class test stays at the roof deck, per Reg. 33's definition.
> - **The low-rise height margin is tight.** 7 × 3.2 m = 22.4 m leaves 0.6 m under 23 m. Ground-floor lobbies are usually taller, and Bangkok sites are often raised for flooding. Expose ground-floor height as an input, so the generator drops to 6 floors when it doesn't fit.

### 4.5 Open space

Required open space is the largest of:

| Rule | Value | Applies to | Clause |
|---|---|---|---|
| Plan | ย.8 5%, ย.9 4.5%, ย.10 4% of total floor area | all | Plan cl. 15, 16, 17 |
| Building law, high-rise | 30% of the plot | high-rise, extra-large | Reg. 33 cl. 6 |
| Bangkok ordinance | 30% of the plot | residential | Ordinance cl. 52 |
| Building law, general | 30% of the largest floor | residential | Reg. 55 cl. 33 |

- The checklist shows each rule, the required area, the provided area, and which one binds.
- At least half of the open space must be planted, permeable ground (plan cl. 15–17). The tool takes half of the governing requirement, not half of the plan's own figure. This is the cautious reading and is logged as a decision. Paved fire road and parking do not count towards it.
- Adding a parking floor raises total floor area and so raises the plan's requirement.

> **▸ Review, §4.5**
> - **Plan OSR values and Reg. 33 cl. 6 (30% of plot) [verified].** Reg. 55 cl. 33 (30% of the *largest floor*) [verified].
> - **The ordinance row (30% of plot, all residential) [unverified]** and it carries a lot of weight.
>   - For low-rise, the difference between 30% of plot and 30% of the largest floor is what sets the 1,400 m² plate in §8.
>   - If cl. 52 doesn't say this, the low-rise plate rises to the full 1,543.6 m² setback footprint.
>   - Verify it before locking the tests.
> - **There are three readings of the "50% planted" clause.** The text reads "ไม่น้อยกว่าร้อยละห้าสิบของพื้นที่ว่าง" (not less than 50% of the open space):
>   - (a) 50% of the plan's required open space: the narrowest, 196 m² in §8
>   - (b) 50% of the governing requirement: the plan's current choice, 300 m²
>   - (c) 50% of the open space *actually provided*: the strictest
>
>   (b) is labelled "cautious" but (c) is stricter. Pick one and log it as a decision. (c) is easy to show alongside as a warning.
> - **What counts as open space.** Reg. 33 and Reg. 55 count outdoor car parks, pools, and structures under 1.20 m with no roof. So the paved fire road and surface parking *do* count toward the 30%/OSR totals. They only fail to count toward the planted half. Say both explicitly, because the current sentence reads as if they count toward neither.

### 4.6 Not applicable to the test plot, but checked

- Planted strip along listed roads (plan cl. 40(1)): Soi 39 is not on the 40-road ล.2 schedule.
- No clause in the plan caps condo size by road width in ย.8–ย.10. Clauses 12–14 do so for ย.5–ย.7.

> **▸ Review, §4.6**
> - **Art. 40(1) wording [verified]:** a 2 m planted strip from the road boundary along listed roads. The list itself ("40 roads", Soi 39 not on it) is in the annex and hasn't been read, so treat that part as [unverified].
> - **Arts. 12–14 [verified].** In ย.5–ย.7, condos above 10,000 m² are prohibited except where the stated road-width or station conditions are met.

## 5. Concepts

Both generators add floors one at a time and stop at the first limit that binds: permitted floor area, the class cap, the height plane, or open space. Each floor's plate is the footprint clipped to where the height plane clears that floor plus the parapet.

| | A: tower on podium | B: low-rise block |
|---|---|---|
| Class | High-rise | Low-rise |
| Footprint | High-rise footprint (6 m all round) | Low-rise footprint |
| Height | Up to the plane | Roof deck under 23 m |
| Floor area cap | Zone ratio with bonus; 30,000 m² if road under 18 m | Under 10,000 m² in total, basement and parking included |
| Parking | Podium floors, counted in floor area | Basement inside the plot, counted in floor area |
| Floor-to-floor | 3.2 m default | 3.2 m default, so 7 floors = 22.4 m |

The class test runs on total floor area, parking included, each time a floor is added. A low-rise that crosses 10,000 m² becomes extra-large and loses the low-rise envelope, so the generator stops one floor earlier. The basement footprint stays clear of the ground counted as planted, permeable open space.

Each concept shows a floor table (level, use, plate area, running total against the cap) and its own checklist. If the high-rise class is unavailable, concept A is replaced by a second low-rise layout and the tool explains why.

> **▸ Review, §5: parking count is the biggest gap.**
>
> Reg. 7 cl. 3(1), for Bangkok [verified against the translation]:
> - (C) a condominium needs 1 space per unit, for units over 60 m²
> - (H) a large building needs the per-use count or 1 space per 120 m² of floor area, whichever is more
>
> On the fixture:
> - 16,000 m² needs at least 134 spaces
> - at about 30 m² of gross parking per space, that's about 4,000 m²
> - because parking counts toward FAR, residential floor area drops to about 12,000 m²
>
> Effect on the concepts:
> - Concept A's podium grows to roughly 4 floors of its 1,064 m² plate.
> - Concept B's basement-only parking can't hold its count: 9,800 m² needs 82 spaces, about 2,460 m², against a 1,400 m² basement. The generator has to solve parking floors and residential floors together.
>
> Stall size:
> - Reg. 7 cl. 5 was repealed by Reg. 41, which now sets stall size, ramps and aisles. Read Reg. 41 (on file in `Thai_02_MRs.pdf`) before fixing the 30 m² figure.
> - Reg. 7 cl. 8 sets the driveway at 6 m (two-way) or 3.5 m (one-way).
>
> Unit-level rules for the checklist [verified]:
> - Reg. 55 cl. 19: units at least 20 m²
> - cl. 22: residential floor-to-floor at least 2.60 m
> - cl. 21: corridors at least 1.50 m in apartment buildings
>
> Environmental review:
> - At 80+ units or 4,000 m²+ it applies to nearly every concept, so show it as a standing note rather than a pass/fail line.

## 6. Validation

Each case returns a clear message and leaves the page working:

- Fewer than three vertices; duplicate or zero-length edges.
- Self-crossing outline.
- Plot under 100 m² or over 50,000 m².
- Plot outside Bangkok's bounds.
- No road edge selected; frontage under 12 m (allowed, but blocks the high-rise class).
- Road width zero, negative, non-numeric, or over 100 m.
- Setbacks leave no buildable area.
- Height plane leaves no usable floor.
- Bonuses summing over 20% (clamped, with a note).
- Plot straddling two zones (user is told the tool applies one zone to the whole plot).

> **▸ Review, §6**
> - **"Plot straddling two zones" can't be detected without a zone layer**, and §1 and §7 say none is shipped. Either ship the layer or drop this case.
> - **Add these cases:**
>   - a road edge that isn't on the plot boundary after a vertex drag
>   - two road edges with different widths (feeds the corner rule in §4.4)
>   - a plot drawn over an existing OSM road
>   - a 4-vertex sliver (the zoning extract itself has these)

## 7. Data

| Data | Source | Handling |
|---|---|---|
| Buildings and roads | OpenStreetMap, via the Geofabrik Thailand extract | Clipped to about 500 m round the site, saved as static GeoJSON in the repo |
| Building heights | `height` tag, else `building:levels` × 3 m, else 6 m | Buildings with assumed heights are drawn in a lighter tone |
| Basemap | Public vector tiles | If tiles fail, the static buildings and roads still draw |
| Zoning | User input | The unlicensed KNS.MAP extract is used only to confirm the test plot's zone. It is not shipped. |

OpenStreetMap is credited on the map as "© OpenStreetMap contributors".

> **▸ Review, §7: heights are the weak link [measured].**
>
> OSM API extract for bbox 100.560–100.583 E, 13.7245–13.7425 N, on 20 Nov:
> - 4,702 buildings
> - 103 (2.2%) with `height`
> - 357 (7.6%) with `building:levels`
>
> The 6 m fallback would flatten about 90% of the tower stock around Soi 39, which a reviewer from Bangkok will notice straight away. Options, roughly in order of effort:
> - (a) Overture Maps buildings: OSM merged with other footprint sources, some carrying height. Coverage for Bangkok is unmeasured.
> - (b) Google Open Buildings 2.5D: check whether it covers Thailand.
> - (c) Hand-set heights for the ~30 tallest buildings within 300 m of the test plot from public listings, logged as manual.
>
> Doing (c) on top of OSM is reliable and quick. Whichever you choose, keep the lighter tone for assumed heights.
>
> **Sources:**
> - Public Overpass was overloaded all through research. The OSM API `map` call (small bbox) and Geofabrik both worked, so pre-baking is the right decision.
> - The BMA zoning servers (`*.bangkok.go.th`) reset every connection from outside Thailand.

## 8. Tests

Written and passing before any 3D work. Fixture: a 40 × 50 m rectangle, 40 m side on a 16 m road, zone ย.10.

| Quantity | Expected |
|---|---|
| Plot area | 2,000 m² |
| Permitted floor area | 16,000 m² |
| With full 20% bonus | 19,200 m² |
| Ratios with full bonus | ย.8 7.2, ย.9 8.4, ย.10 9.6 |
| Open space, plan, at 16,000 m² | 640 m² |
| Open space, 30% of plot | 600 m² |
| Binding open-space rule at full build-out | Plan |
| High-rise footprint | 28 × 38 m = 1,064 m² |
| Height plane at the front setback line | 2 × (16 + 6) = 44 m |
| Low-rise front setback on an 8 m road | 6 − 4 = 2 m |
| High-rise class on a 9 m road | Unavailable |
| Floor area cap on a 16 m road | 30,000 m² |
| Low-rise footprint after setbacks (3 m sides and rear, 1.6 m front) | 34 × 45.4 m = 1,543.6 m² |
| Low-rise plate after the 30% open-space rule | 1,400 m² |
| Low-rise, 7 floors, no basement | 9,800 m²: low-rise |
| Low-rise, 7 floors, one 1,400 m² basement | 11,200 m²: extra-large, not allowed as low-rise |
| Low-rise, 6 floors, one 1,400 m² basement | 9,800 m²: low-rise. Generator stops here. |
| Planted, permeable ground required at 9,800 m² | 300 m² (half of the governing 600 m²; the narrower reading would be 196 m²) |

> **▸ Review, §8**
>
> **Arithmetic [verified]:** every row was recomputed and matches.
> - 2,000 m² plot; 16,000 and 19,200 m² of floor area; ratios 7.2, 8.4 and 9.6
> - open space 640 and 600 m²; high-rise footprint 28 × 38 = 1,064 m²
> - height plane 2 × (16 + 6) = 44 m; low-rise front setback 6 − 4 = 2 m
> - low-rise footprint 34 × 45.4 = 1,543.6 m²; plate 0.7 × 2,000 = 1,400 m²
> - totals 9,800, 11,200 and 9,800 m²; planted 300 m² against 196 m²
>
> **The tests rest on things that aren't verified:**
> - The 1,400 m² plate depends on ordinance cl. 52 (§4.5 review).
> - Both concepts change once parking is counted (§5 review).
> - Add the parking count to the fixture: 16,000 m² needs 134 spaces at 1 per 120 m², rounded up.
>
> **Missing fixtures:**
> - A concave L-shaped plot, to test the per-edge buffer footprint.
> - A deep plot on a narrow road, where the height plane binds before FAR. This is the case that shows the sloped envelope.
> - A plot with a non-parallel road edge, to test the far-boundary polyline in §4.4.

## 9. Order of work

1. `rules.ts`, `metrics.ts`, `classify.ts`, `checklist.ts`, tests.
2. Map, plot drawing, `validate.ts`, rules panel.
3. `footprint.ts`, then `envelope.ts`.
4. Neighbouring buildings and roads.
5. Concepts A and B with floor tables.
6. Break-testing, performance, visual polish.

Push to `main` as each step works so the live link always shows a working version. Submit a first version at the Sunday noon freeze, then resubmit the final one.

## 10. Open items

- Confirm the test parcel's zone on a zoning map.
- Check cited clause numbers against the Royal Gazette text. The copies read so far are third-party and partly OCR.
- Environmental review trigger: wording not yet confirmed.
- Whether a condo counts as a public building for clauses 53 and 54. Currently excluded.

> **▸ Review, §9–10**
> - **Order of work:** move the height data decision (§7 review) from step 4 up to step 1 or 2. It's the riskiest input, and Geofabrik or Overture processing can run in the background while you write `rules.ts`.
> - **Open item 1 (zone): done.** It's ย.10, confirmed on a map; see the published zone-check page. Sub-area "-4" is still unconfirmed.
> - **Open item 2 (clause numbers): partly done.**
>   - Plan arts. 4, 12–17, 36, 37, 40, and 51–57 were checked against the Royal Gazette text itself (`download.asa.or.th/03media/04law/cpa/mr56-bma.pdf`). It's a text-layer PDF, not OCR.
>   - Regs. 7, 33 and 55 were checked against the IIBH English translation, not the Thai gazette.
>   - The Ordinance hasn't been checked at all.
> - **Open item 3 (environmental review): still open.** Only secondary sources so far.
> - **Open item 4 (condo as public building): closed.** It isn't one (see §1 review).
> - **New items:**
>   - parking: Reg. 41 stall and aisle sizes
>   - Ordinance B.E. 2544 text
>   - source for the 16 m width of Soi 39
>   - zone layer: ship it or not
