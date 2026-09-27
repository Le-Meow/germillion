# First researched playtest set

Frozen 27 September 2026. One set of seven, reordered by the daily seed; this is not yet a bank of fresh questions for every day. Unlimited reorders the same set. Previous prototype prompts remain available to already-saved runs.

## Questions and evidence

| Prompt / measurement | Accepted pool | Evidence and scope |
| --- | ---: | --- |
| Country / forest share | 194 | [FAO via World Bank](https://data.worldbank.org/indicator/AG.LND.FRST.ZS), 2021, percent of land. Excludes aggregates and dependent territories. |
| Mammal / hours asleep | 83 | [msleep documentation](https://ggplot2.tidyverse.org/reference/msleep.html), Savage & West (2007). Study averages; species in the study only. |
| Original Pokémon / base Speed | 151 | [veekun game-data extract](https://github.com/veekun/pokedex/blob/master/pokedex/data/csv/pokemon_stats.csv), standard forms, modern base stats. Electrode uses its Gen VII-onward 150 stat, not its original 140. |
| Oscar-nominated film / nominations | 2,469 | [DLu's Academy database extract](https://github.com/DLu/oscar_data), ceremonies 1980–2025. Counts competitive nominations including multiple acting/song nominations; excludes honorary/technical awards. Shorts count. Repeated normalized titles require a year. |
| US state / water share | 50 | [US Census 2010](https://www.census.gov/geographies/reference-files/2010/geo/state-area.html), total water / total area from square-mile columns. Includes coastal waters and Great Lakes shares. |
| Metal element / melting point | 68 | [Periodic Table JSON](https://github.com/Bowserinator/Periodic-Table-JSON), metals up to uranium with known values, rounded to whole Celsius degrees. Top five use primary RSC fact boxes linked below. Alloys excluded. |
| Country / alcohol per person aged 15+ | 187 | [WHO via World Bank](https://data.worldbank.org/indicator/SH.ALC.PCAP.LI), 2019 annual litres of pure alcohol, including non-drinkers in denominator. A historical estimate, not current-year consumption. |

The frozen JSON includes input URLs and SHA-256 hashes. World Bank values and derived state percentages are rounded to two decimals before ranking, so displayed equal measurements genuinely tie. Every accepted entry's canonical name is exercised by the scoring test. Source coverage remains finite: for example, koalas are not in the 83-mammal sleep study; the game explains the pool in [?] and identifies an unmatched answer as unmatched rather than asserting it is biologically wrong.

### Manual cross-checks

- [Academy 1998 results](https://www.oscars.org/oscars/ceremonies/1998): Titanic 14 nominations; Good Will Hunting 9; The Fifth Element 1.
- RSC melting-point fact boxes: [tungsten 3,414°C](https://periodic-table.rsc.org/element/74/tungsten), [rhenium 3,185°C](https://periodic-table.rsc.org/element/75/rhenium), [osmium 3,033°C](https://periodic-table.rsc.org/element/76/osmium), [tantalum 3,017°C](https://periodic-table.rsc.org/element/73/tantalum), [molybdenum 2,622°C](https://periodic-table.rsc.org/element/42/molybdenum). The secondary extract differs on three of these; explicit primary-source overrides are recorded in the builder.
- Census rows: Michigan 40,175 / 96,714 square miles = 41.54%; Hawaii 4,509 / 10,932 = 41.25%. Rounded source columns mean these are approximate ratios.
- Country snapshots: forest share Japan 68.41%, Brazil 59.27%; alcohol Romania 16.99 litres, Germany 12.22, Russia 10.42. These are the selected years, not general timeless claims.

## Scoring

Each question owns 100/7 percentage points of infection. A fixed list of measurement/strength anchors defines a continuous, piecewise-linear scale. It never uses today's answer popularity. Adding weak entries cannot raise an existing answer's reward. Every higher measured value earns more; tied values earn equal amounts; the maximum earns the full chunk. Invalid or expired answers earn zero. Players can inspect each scale in [?].

Anchor strengths are generally 5%, 15%, 30%, 50%, 70%, 85%, 100% of a chunk, adjusted per question (forest uses 75%/90%; metals use 90% before the maximum). The measurements for each are stored alongside the question, rather than hidden in scoring code. Labels TRACE, ACTIVE, SPREADING, VIRULENT, CRITICAL and TOTAL TAKEOVER summarize strength, not rarity or factual danger.

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

Perfect answers can theoretically score 100%. There is no artificial ceiling. This calibration separates the examples; only human playtests can establish whether the difficulty and question mix are enjoyable. The actual population chart uses completed daily runs with the same ordered prompt IDs, keeping old prototype scoring out of the comparison.

## Rebuilding

`npm run data` builds the legacy compatibility pool and this set. Cached `.raw` inputs are ignored by Git; committed `data/curated.json` is the runtime source of truth. A network rebuild may fetch upstream revisions: review hashes and diffs, and create new prompt IDs before changing any published measurement or scoring scale. Never rewrite a published ID under saved runs.

Oscar extract licence is retained in `data/OSCAR-LICENSE.txt`. World Bank data is CC BY 4.0; attribution is above and in the game. Country names/aliases retain the legacy ODbL source attribution in README.
