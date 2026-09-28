# First researched playtest set

First set frozen 27 September 2026; sleep coverage revised for 28 September. One set of seven, reordered by the daily seed; this is not yet a bank of fresh questions for every day. Unlimited uses the latest revision. Previous question IDs remain available to saved runs, attacks and archives.

## Questions and evidence

| Prompt / measurement | Accepted pool | Evidence and scope |
| --- | ---: | --- |
| Country / forest share | 194 | [FAO via World Bank](https://data.worldbank.org/indicator/AG.LND.FRST.ZS), 2021, percent of land. Excludes aggregates and dependent territories. |
| Mammal / hours asleep | 84 | [msleep documentation](https://ggplot2.tidyverse.org/reference/msleep.html), Savage & West (2007), plus a sourced [Zoos Victoria koala estimate](https://www.zoo.org.au/melbourne/animals-and-habitats/australian-bush/koala/). Koala uses the midpoint, 19 hours, of the reported 18–20 hour range; this is explicitly labelled as an estimate. |
| Original Pokémon / base Speed | 151 | [veekun game-data extract](https://github.com/veekun/pokedex/blob/master/pokedex/data/csv/pokemon_stats.csv), standard forms, modern base stats. Electrode uses its Gen VII-onward 150 stat, not its original 140. |
| Oscar-nominated film / nominations | 2,469 | [DLu's Academy database extract](https://github.com/DLu/oscar_data), ceremonies 1980–2025. Counts competitive nominations including multiple acting/song nominations; excludes honorary/technical awards. Shorts count. Repeated normalized titles require a year. |
| US state / water share | 50 | [US Census 2010](https://www.census.gov/geographies/reference-files/2010/geo/state-area.html), total water / total area from square-mile columns. Includes coastal waters and Great Lakes shares. |
| Metal element / melting point | 68 | [Periodic Table JSON](https://github.com/Bowserinator/Periodic-Table-JSON), metals up to uranium with known values, rounded to whole Celsius degrees. Top five use primary RSC fact boxes linked below. Alloys excluded. |
| Country / alcohol per person aged 15+ | 187 | [WHO via World Bank](https://data.worldbank.org/indicator/SH.ALC.PCAP.LI), 2019 annual litres of pure alcohol, including non-drinkers in denominator. A historical estimate, not current-year consumption. |

The frozen JSON includes input URLs and SHA-256 hashes. World Bank values and derived state percentages are rounded to two decimals before ranking, so displayed equal measurements genuinely tie. Tests exercise every canonical name and alias. Coverage remains finite: merging sources is an editorial responsibility, not something typo matching can solve. The sleep supplement records its source and estimation policy alongside the answer; the reveal and report disclose that policy. The original 83-entry sleep question is retained under `sleep-v1` for historical results.

## Validation

The server accepts an exact canonical name or a curated alias. Canonical names take precedence over another entry's alias. Case, accents, punctuation and leading “the” are normalized. Translations and abbreviations must be reviewed aliases; the runtime does not invent them. Close spellings are suggestions, never automatic hits: Siberia must not silently become Liberia.

A miss returns `DATA ENTRY NOT FOUND — TRY AGAIN`. It awards nothing, consumes no answer slot and never resets the original server deadline. Up to three suggestions use textual similarity only, not answer strength. The original input stays intact until the player selects a suggestion and submits it with Enter. Ambiguous “bat” or “The Lion King” needs a species or year. Only a confirmed match, or expiry, ends the round. Late submissions and duplicate accepted submissions cannot add points.

[Krillion's official FAQ](https://krillion.io/faq) confirms its curated, merged-source answer sets and question-specific rarity methods. It does not publish its full validator. Germillion uses that curation approach and observed retry/confirmation behaviour; its measured-property scores are our own fixed scales, not a claimed reproduction of Krillion's private algorithm. No live model decides validity or points.

### Manual cross-checks

- [Academy 1998 results](https://www.oscars.org/oscars/ceremonies/1998): Titanic 14 nominations; Good Will Hunting 9; The Fifth Element 1.
- RSC melting-point fact boxes: [tungsten 3,414°C](https://periodic-table.rsc.org/element/74/tungsten), [rhenium 3,185°C](https://periodic-table.rsc.org/element/75/rhenium), [osmium 3,033°C](https://periodic-table.rsc.org/element/76/osmium), [tantalum 3,017°C](https://periodic-table.rsc.org/element/73/tantalum), [molybdenum 2,622°C](https://periodic-table.rsc.org/element/42/molybdenum). The secondary extract differs on three of these; explicit primary-source overrides are recorded in the builder.
- Census rows: Michigan 40,175 / 96,714 square miles = 41.54%; Hawaii 4,509 / 10,932 = 41.25%. Rounded source columns mean these are approximate ratios.
- Country snapshots: forest share Japan 68.41%, Brazil 59.27%; alcohol Romania 16.99 litres, Germany 12.22, Russia 10.42. These are the selected years, not general timeless claims.

## Scoring

Each question owns 1/7 of the 1,024 MB journey. A fixed list of measurement/strength anchors defines a continuous, piecewise-linear scale. It never uses today's answer popularity. Adding weak entries cannot raise an existing answer's reward. Every higher measured value earns more; tied values earn equal amounts; the maximum earns the full chunk. Misses award nothing and leave the clock running; expiry ends the round at zero. Players can inspect each scale in [?]. Internal percentage points preserve saved-run compatibility; MB totals are rounded once, with rounding carried into displayed gains so the seven gains add up exactly.

Anchor strengths are generally 5%, 15%, 30%, 50%, 70%, 85%, 100% of a chunk, adjusted per question (forest uses 75%/90%; metals use 90% before the maximum). The measurements for each are stored alongside the question. The current tier bands are MINOR GLITCH below 20%, NOT RESPONDING from 20%, SYSTEM FAILURE from 45%, FATAL ERROR from 70%, and BEYOND REPAIR from 90% strength. They describe the hit, not factual danger or measured answer rarity.

### Calibration examples (spoilers)

These are manually chosen examples, not a simulated audience or an estimate of player percentiles.

| Axis | Plausible pick | Infection | More informed pick | Infection |
| --- | --- | ---: | --- | ---: |
| Forest share | Brazil | 7.0% | Finland | 9.6% |
| Sleep | Cat | 6.7% | Sloth | 8.5% |
| Base Speed | Pikachu | 7.1% | Jolteon | 12.1% |
| Oscar nominations | The Matrix | 4.3% | Oppenheimer | 13.2% |
| Water share | Minnesota | 6.2% | Florida | 9.6% |
| Melting point | Gold | 4.7% | Titanium | 8.1% |
| Alcohol per person | Russia | 8.5% | Germany | 10.2% |
| **Total, before per-row rounding** | | **44.5%** | | **71.3%** |

The percentage examples above express fractions of the journey: roughly 456 MB and 730 MB respectively. Seven perfect answers reach 1,024 MB. This calibration separates the examples; only human playtests can establish the population distribution and difficulty. The chart and percentile use actual completed daily runs with the same ordered immutable prompt IDs, comparing rounded MB scores so displayed ties remain ties. No normal curve or target percentile is fabricated.

## Rebuilding

`npm run data` builds the legacy compatibility pool and this set. Cached `.raw` inputs are ignored by Git; committed `data/curated.json` is the runtime source of truth. The curated builder rejects a change to, or removal of, an existing question ID. New measurements, aliases or scales require a new ID and retention of the old question. A network rebuild may fetch upstream revisions: review hashes and diffs before publication.

Final content pass: merge additional reputable sources, add common/local names and abbreviations, check plausible missing answers, and audit estimation consistency. Sleep remains a limited 84-species playtest question; adding Koala does not make it exhaustive. Each new question needs positive answer fixtures, ambiguous-name fixtures, invalid examples, source dates, coverage checks and a frozen scale before entering the daily schedule.

Content direction requested 28 September: include more gaming and nerd culture questions in future sets. Keep the easy open-question format and a clear measured axis, with a mix of recognisable and deep-cut answers. Potential research candidates include Minecraft mobs by health, Pokémon by height, and consoles by launch RAM; these are candidates, not sourced or approved questions yet. Specify editions and versions where measurements differ. This direction does not change already published question sets.

Oscar extract licence is retained in `data/OSCAR-LICENSE.txt`. World Bank data is CC BY 4.0; attribution is above and in the game. Country names/aliases retain the legacy ODbL source attribution in README.


## Rotation added 28 September (daily starts 29 September)

The original seven IDs and dates remain frozen. `data/rotation.json` adds ten sourced prompts for a 17-prompt bank. Unlimited adopts the rotation immediately. New daily games choose seven distinct families and include one Pokémon and one Minecraft question. Counterattacks prefer prompts absent from the original match. Selection uses stable hashing, never client randomness; existing stored runs carry their original prompt IDs.

- Pokémon HP and Attack use the cached veekun base-stat extract for the original 151, standard forms. Chansey HP 250 and Dragonite Attack 134 are checked. Height and weight reuse the frozen factual Pokédex values and reviewed aliases.
- Minecraft: default mob hitbox height in Java 1.21.4, from [minecraft-data](https://github.com/PrismarineJS/minecraft-data/blob/master/data/pc/1.21.4/entities.json). All 82 entries in mob categories except command-only Giant/Illusioner. Default hitboxes, including default Slime/Magma Cube sizes, not artwork height, babies or poses. Enderman is 2.9 blocks; this is tested. The file hash and source attribution are retained.
- Country area/borders, state area, element atomic number and film runtime reuse the existing frozen source pools with explicit fixed measurement scales. Runtime remains the finite IMDb snapshot, not an exhaustive list of every film. Literal canonical titles take priority over dropping “The”, so `Open Road` and `The Open Road` resolve to their own entries.

Build with `node scripts/build-rotation.mjs` after the original data builders. It fetches the versioned Minecraft input only when the local cache is absent, validates numeric scales, and rejects changes to released IDs. This expands variety but is not a year of editorially unique daily content. Add further gaming topics as separately sourced, versioned question IDs.
