# GERMILLION

Seven questions. Twenty seconds each. Your answers infect the machine.

A playable daily trivia game with green DOS text, a spreading field of corrupted characters, and no mascot. Pick an answer high on the question's numerical scale. Its measured value determines how much of the computer you infect.

## Run

Requires **Node.js 24 or later**. No npm dependencies or build step.

```sh
npm start
# http://localhost:3000
```

```sh
npm test
```

## Included

- Seven deterministic daily prompts, shared globally; reset at midnight UTC.
- Server-timed 20-second rounds, one answer each, manual advance between reveals.
- Fixed per-question measurement scales, tied values treated equally, aliases and conservative typo matching.
- Animated 100-file text corruption, optional synthesized sound, reduced-motion support, responsive layout.
- Saved daily progress and streaks, including after server restarts.
- Results with top-five answers, sources, actual daily score distribution and sample size. No fabricated players or assumed bell curve.
- Optional attack links: replay the sender's questions, compare each answer's rank, split tied chunks. Your completed run can be sent back.
- Unlimited runs and an archive, excluded from daily statistics.

## Content

`data/curated.json` contains **one researched seven-question playtest set**: forest share, mammal sleep, original Pokémon base Speed, Oscar nominations, state water share, metal melting points and alcohol consumption per person. See [QUESTION-SET.md](QUESTION-SET.md) for sources, precise scopes, calibration examples and rebuild instructions.

The daily and Unlimited currently reorder this same set. This is not yet a full daily editorial bank. Source years and coverage are shown in each question's [?] and in the final report. The old `data/prompts.json` remains loaded for compatibility with saved prototype runs.

Scoring: each question owns 1/7 of 100%. Fixed numerical anchors interpolate smoothly from weak to exceptional values; the highest earns the full chunk. Equal measurements earn equal shares. Invalid or late answers earn zero. Scores do not depend on answer popularity or how many weak entries exist in the catalogue. The [?] shows the round's scale. Old prompt IDs retain their original percentile scoring, and daily population comparisons exclude runs with different prompt sets.

## Hosting

This runs a Node HTTP server and SQLite database. **GitHub stores the source; GitHub Pages alone cannot run the scoring API or shared results.** Deploy the included Dockerfile on a Node/container host with a persistent volume mounted at `/app/var`.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` on a host/container |
| `DB_PATH` | `var/germillion.sqlite` | Persistent SQLite file |
| `PUBLIC_ORIGIN` | request origin | Set to the deployed HTTPS origin, e.g. `https://germillion.example` |

Use HTTPS and a persistent disk, and back up the SQLite database. The app only serves an explicit public-file allowlist; the answer catalogue and database stay server-side. Shared links expose the optional chosen name and completed challenge comparison, not browser identifiers.

`germillion` is an anonymous HttpOnly browser cookie. Clearing it permits another daily run. The leaderboard is suitable for a prototype, **not tamper-proof competition**. Before a broad streamer launch, add edge rate limiting and stronger player identity if competitive integrity matters. No payment system or analytics tracking is included.

## Data credits

Factual extracts retain names, numerical measurements and answer aliases only:

- Countries and borders: [mledoze/countries](https://github.com/mledoze/countries), ODbL. Derived country data remains subject to its source terms.
- Elements: [Bowserinator/Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON), source measurements linked to Wikipedia.
- Pokémon: [veekun/pokedex](https://github.com/veekun/pokedex), factual Pokédex values. Pokémon names are owned by their respective rights holders; no artwork is included.
- Mammals: [ggplot2 msleep](https://ggplot2.tidyverse.org/reference/msleep.html), via [Rdatasets](https://github.com/vincentarelbundock/Rdatasets). V. M. Savage and G. B. West (2007), “A quantitative, theoretical framework for understanding mammalian sleep,” PNAS.
- Legacy films: [sundeepblue/movie_rating_prediction](https://github.com/sundeepblue/movie_rating_prediction), IMDb 5000 snapshot. Most-voted version chosen for duplicate titles; runtime range 40–300 minutes.
- New curated sources: World Bank/FAO/WHO, US Census 2010, DLu’s Academy database extract (BSD-2-Clause, retained in `data/OSCAR-LICENSE.txt`), and Royal Society of Chemistry. Full links in [QUESTION-SET.md](QUESTION-SET.md).
- Legacy US state areas: [jakevdp/data-USstates](https://github.com/jakevdp/data-USstates), total square miles in its frozen snapshot.
- Font: [VT323](https://github.com/google/fonts/tree/main/ofl/vt323), Peter Hull, SIL Open Font License. Full license: `public/licenses/VT323-OFL.txt`.

Source links and coverage are also available inside the game. Review source terms and editorial coverage before commercial release.
