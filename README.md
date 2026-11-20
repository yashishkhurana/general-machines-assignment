# Bangkok plot envelope

Draw a plot in Bangkok, mark the edge that faces the road, and see the rules that apply, the 3D space a
building may fill, and two condominium concepts with pass/fail checklists. It covers zones ย.8–ย.10 of
the Bangkok Comprehensive Plan B.E. 2556.

Live: https://general-machines-assignment.vercel.app

The page opens on an example parcel on Sukhumvit Soi 39 (Phrom Phong). Use **Reset to example** to get back to it.
Every input is kept in the URL, so **Share link** passes a case on.

## What it does

- **Zone check.** The tool looks the zone up from the plot you draw. A plot inside ย.8, ย.9 or ย.10 gets
  that zone. A plot across a zone edge gets a warning naming both zones and the area in each. Anything
  else gets "zone not supported" and no result. You can type a zone instead; a mismatch is flagged.
- **Road.** Each road edge has a legal (planned) width and a current width. Soi 39 is road ข 38, to be
  widened to 16 m (plan art. 44(2)). Where the current right-of-way is narrower, the widening strip comes
  out of the plot, and setbacks and the height plane start from the planned line (art. 36 ¶2). The
  current width is estimated three ways:
  (a) a lower bound from OSM lanes,
  (b) an upper bound from the gap between buildings facing each other across the road,
  (c) your own measurement over satellite imagery.
  None of these is the legal width; that needs the land-office parcel map or a survey.
- **Rules.** Permitted floor area with bonuses, building class, access, setbacks, the 2:1 height plane,
  four open-space rules, planted ground, and parking (Reg. 7 counts, Reg. 41 stall sizes, counted
  toward floor area).
- **Concepts.** A: tower on a parking podium (high-rise). B: low-rise block under 23 m and 10,000 m² with
  basement parking. Each comes with a floor table and a checklist that names the clause behind every line.

## Where the logic is

| File | Job |
|---|---|
| `src/core/rules.ts` | The only place rule values live: value, unit, clause, source tag (gazette / Reg. translation / assumed) |
| `src/core/site.ts` | Plot, road edges, widening strip, planned and far road lines |
| `src/core/metrics.ts` | Zone resolution and straddles, floor area and bonuses, open space, parking count |
| `src/core/classify.ts` | Building classes and Reg. 33 access |
| `src/core/footprint.ts` | Per-edge setback strips (rectangles + round caps, polygon-clipping), footprints |
| `src/core/envelope.ts` | Height plane, plate clipping, envelope mesh |
| `src/core/concepts.ts` | The two generators |
| `src/core/checklist.ts` | Pass/fail lines |
| `src/core/compute.ts` | `compute(inputs) → results`, the one call the UI makes |
| `src/geo/` | Projection (transverse Mercator centred on the plot, true scale), static data, zone lookup, road-width estimates, the example parcel |
| `src/ui/` | MapLibre map, terra-draw editing, three.js envelope layer, panels |
| `docs/` | Architecture plan with review notes, research notes, decisions log |

## Run it

```
npm ci
npm test        # section 8 values, zone fixtures, validation, break tests
npm run dev
npm run build
```

Rebuild the static data from fresh downloads:

```
node scripts/build-data.mjs <bkk-zoning-current.geojson> <osm-map.xml> src/data
```

## Sources and credits

- Rules: Royal Gazette text of the Bangkok Comprehensive Plan B.E. 2556 (vol. 130 part 41 ก, 16 May 2013)
  and the Bangkok Building Control Ordinance B.E. 2544 (ASA copies). Ministerial Regulations 7, 33, 41
  and 55 via the IIBH English translation. Every clause was read through these third-party copies, none on the
  Royal Gazette site; see `docs/decisions.md` (top) and `docs/research-notes.md`.
- Zone polygons: extraction by **Kanesuan/KNS.MAP** (`public/data/bkk-zoning-current.geojson`) of the 2556
  plan map. Approximate boundaries (simplified extract of the 2556 plan map): verify against BMA.
- Buildings and roads: © OpenStreetMap contributors (ODbL), extract of 20 Nov 2026. Four building heights
  hand-set (sourced listing or visual estimate; `docs/decisions.md` D3–D4).
- Basemap: OpenFreeMap. Satellite: Esri World Imagery (Esri, Maxar, Earthstar Geographics, and the GIS
  User Community). No API keys.

Not legal advice. The tool's assumptions are listed in `docs/decisions.md` and in the app's Rules and Limits tabs.
