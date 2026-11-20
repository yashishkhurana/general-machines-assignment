# Decisions log

Every choice the build made that the law or the brief doesn't settle, with the reason. Rule values themselves
live only in `src/core/rules.ts`, each tagged gazette / Reg. translation / assumed.

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
| R1 | **Review values override the original §8 table.** Low-rise front setback on a 16 m road is max(cl. 50's 1.6 m, cl. 55's 2 m) = **2 m**, so the low-rise footprint test is **34 × 45 = 1,530 m²** (was 34 × 45.4 = 1,543.6 m²). | Ordinance cl. 55 (≥ 2 m clear all round above 15 m, road side included), read 20 Nov. §8 review. |
| R2 | High-rise front setback is computed as max(6 m, the cl. 41 value) rather than hard-coded 6. | §4.3 review. Always 6 today; stays correct if the table changes. |
| R3 | Low-rise side/rear setback uses Ordinance cl. 54 (by storeys **or** height: 3 m from the 3rd storey or above 9 m), and is never less than cl. 55's 1/2 m. Openings assumed on every side. | Ordinance cl. 54 is slightly stricter than Reg. 55 cl. 50. |
| R4 | Rainwater bonus is proportional (5% per 1 m³ per 50 m² of land), capped at 20%. Not an inference. | Art. 55 says "ตามสัดส่วน". §4.1 review. |
| R5 | Affordable-housing bonus takes an "affordable area (m²)" input: extra floor area ≤ 4× that area, ≤ 20%. Energy bonus is a level picker (1–4 → 5/10/15/20%). All bonuses clamped to 20% combined. | Arts. 52, 56, 57. |
| R6 | Parking counts toward floor area. | Art. 54 exempts only *extra public* parking from FAR/OSR, which only makes sense if ordinary parking counts; Reg. 33 cl. 1 (amended by Reg. 50) floor-area definition. |
| R7 | Parking count: per unit over 60 m² (Reg. 7 cl. 3(1)(C)) or, for a large building, 1 per 120 m² (cl. 3(1)(H)), whichever is more. **The 120 m² divisor is applied to total floor area including the parking itself** (stricter reading). | Brief item 7. A literal "building area" could be read as excluding parking; including it is the cautious reading. |
| R8 | **Parking area per space, recomputed from Reg. 41:** stall 2.40 × 5.00 m (perpendicular, Reg. 41 cl. 2(2)) plus half of a 6.00 m two-way aisle (Reg. 7 cl. 8) = 19.2 m², × **1.40 allowance for ramps, turning, columns and cores (assumed)** = **26.88 m²**. User-editable. | Reg. 41 read in the IIBH translation (p. 60). The 1.40 factor is not law. |
| R9 | Recomputed low-rise fixture at 26.88 m²/space: **5 floors + 2 basements = 9,800 m²**, 82 spaces needed, **104 fit** (2 × 52). 6 + 1 fails (52 fit). At the brief's ~30 m²/space: 5 + 2, 82 needed, 92 fit (2 × 46; 93 in aggregate). | Both are tests. |
| R10 | Unit-mix assumption behind the per-unit count: 75% of residential floor area is saleable, average unit 50 m², 25% of units over 60 m². On the fixture that gives 180 units, 45 over 60 m², so the 1-per-120 m² rule governs (134 spaces at 16,000 m²). All three are inputs. | Reg. 7 cl. 2(3): the per-unit count only applies to units over 60 m². |
| R11 | Environmental review (80 units / 4,000 m²) is a standing note, never a pass/fail line. | Trigger wording only seen in secondary sources. Tagged `assumed`, `verified: false`. |
| R12 | Rooftop plant: a 4 m allowance over a 60 m² core must clear the height plane somewhere on the top floor; shown as a warning if not. The 23 m class test stays at the roof deck. | §4.4 review: "highest part of the building" includes lift overruns and tanks. |
| R13 | Ground-floor height is an input (default 4.0 m; typical floors 3.2 m), so the low-rise generator drops to 6 floors when 7 doesn't fit under 23 m. | §4.4 review: 7 × 3.2 = 22.4 m leaves 0.6 m. |
| R14 | Bonus clauses 53/54 (public open space, public parking) are not offered: both are limited to public buildings, and a condo isn't one under Reg. 55's definition. | §1 review. |
| R15 | Canal edges (Reg. 55 cl. 42, plan art. 40(2)) are a stated limit, not modelled. | §4.3 review gap; out of scope for the Soi 39 parcel, which has no canal edge. |

## Road widening (ข 38) and access

| # | Decision | Reason |
|---|---|---|
| W1 | Each road edge has a legal width (the planned 16 m) and a current width. Under the planned width, a widening strip of depth (planned − current) / 2 comes out of the plot. **The widening is assumed symmetric about the centreline** (the plan doesn't say). | Brief item 8; art. 36 ¶2, art. 45. |
| W2 | **Land inside the widening strip is excluded from plot area for floor area and open space** (cautious reading). | Not stated in the plan; art. 45 limits that land to transport/public use. |
| W3 | Setbacks and the height plane are measured from the planned line; the far boundary is the planned far side (current edge offset outward by current + strip). | Art. 36 ¶2. |
| W4 | **Reg. 33 cl. 2 access (≥ 10 m, ≥ 18 m) is tested on the road's current width**, not the planned one. | Art. 36 ¶2 covers building lines and distances, not access width; the road isn't physically widened yet. Cautious. |
| W5 | The road's far boundary is extended 300 m past the plot edge, i.e. the road is taken as straight beyond the frontage. | Needed for points near the plot's ends. Fails only on sharply curved sois. |
| W6 | Several road edges: the height plane takes the strictest road at every point (min over roads). Equal to the nearest-road rule except in corner cases, where it is stricter. Cl. 45–46's wider-road allowance is not claimed. | Keeps the plate clipping exact with one boolean per floor. |

## Geometry and generators

| # | Decision | Reason |
|---|---|---|
| G1 | Setback strips are built in metres (UTM 47N) as edge rectangles plus one disc per vertex (radius = largest adjacent setback), unioned with polygon-clipping. Same shape as round-capped segment buffers. | Brief item 5. Duplicate caps at shared corners crashed polygon-clipping's sweep line ("Unable to find segment"); one disc per vertex with rotated vertices fixed it. |
| G2 | The 6 m high-rise fire road is modelled as a clear, **paved** ring round the tower. Planted ground must fit outside it. On the fixture this trims the tower plate from 1,064 to 864 m². | Architecture §4.3 assumption kept. Reg. 33 cl. 3 says "road **or open space**", so grass-paver fire lanes might count; the tool doesn't assume so. |
| G3 | Plates are trimmed from the rear (keeping the road side) when open space or a ratio cap forces a smaller plate. | Keeps the road-side face (Ordinance cl. 53) and the frontage. |
| G4 | Each floor's plate is the base plate minus where the plane is lower than that floor's top + 1.2 m parapet. Floors under 100 m² stop the stack. | §4.4/§5. |
| G5 | **Simplification: the low-rise generator drops a floor or a basement, rather than redesigning, when the next one would take the total to 10,000 m² (extra-large).** Shown in the tool. | Brief item 10. |
| G6 | Low-rise basements use the same plate as the ground floor. | Keeps the planted ground outside the basement footprint (§5). |
| G7 | If the high-rise class is unavailable, concept A becomes a second low-rise layout with parking floors above ground. | §5. |
