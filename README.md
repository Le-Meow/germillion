# GERMILLION

Seven questions. Twenty seconds each. Your answers infect the machine.

A playable daily trivia game with green DOS text, a spreading field of corrupted characters, and no mascot. Pick an answer high on the question's numerical scale. Its rank determines how much of the computer you infect.

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
- Catalogue-relative scoring, tied values treated equally, aliases and conservative typo matching.
- Animated 100-file text corruption, optional synthesized sound, reduced-motion support, responsive layout.
- Saved daily progress and streaks, including after server restarts.
- Results with top-five answers, sources, actual daily score distribution and sample size. No fabricated players or assumed bell curve.
- Optional attack links: replay the sender's questions, compare each answer's rank, split tied chunks. Your completed run can be sent back.
- Unlimited runs and an archive, excluded from daily statistics.

## Content

`data/prompts.json` is a frozen, versioned starter catalogue: 196 countries, 118 elements, the original 151 Pokémon, 83 studied mammals, 50 US states and 4,790 film titles. There are ten scoring axes across seven daily slots; countries appear twice with different axes. The order and variant axes change by UTC date.

This is a **first playable build**, not a finished editorial catalogue. Film records are a pre-2017 snapshot and may use different cuts; the source includes some television material. Mammal coverage is restricted to the msleep study, and measurements are study averages. These scope limits are exposed in each prompt's `[?]` and results. Broader, manually reviewed question packs are the next content step before a public launch. Official-language counts are deliberately not inferred from a list of spoken languages.

Raw source downloads are excluded from Git. To refresh, run `npm run data` with network access, review the results, update the data version and retain old versions if live runs exist. **Do not change the catalogue under existing daily runs.** The current deployment must keep its dataset fixed until all current runs finish; long-term archives will need versioned catalogues.

Scoring: each question owns 1/7 of 100%. A maximum value earns the full chunk; otherwise `strictly lower answers / (answer count - 1)` determines the share. Equal numeric values earn equal shares. Invalid or late answers earn zero. Aggregate scores round only for display/storage comparison.

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
- Films: [sundeepblue/movie_rating_prediction](https://github.com/sundeepblue/movie_rating_prediction), IMDb 5000 snapshot. Most-voted version chosen for duplicate titles; runtime range 40–300 minutes.
- US state areas: [jakevdp/data-USstates](https://github.com/jakevdp/data-USstates), total square miles in its frozen snapshot.
- Font: [VT323](https://github.com/google/fonts/tree/main/ofl/vt323), Peter Hull, SIL Open Font License. Full license: `public/licenses/VT323-OFL.txt`.

Source links and coverage are also available inside the game. Review source terms and editorial coverage before commercial release.
