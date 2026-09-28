# GERMILLION

Seven questions. Twenty seconds each. Your answers infect the machine.

A playable daily trivia game set inside an abstract VGA-era computer. Insert the disk, then propel a small green virus horizontally through five system regions. Higher measured answers take it further, up to 1,024 MB.

## Run

Requires **Node.js 24 or later**. The local Node server has no runtime dependencies or build step. Cloudflare development/deployment uses Wrangler (`npm ci`).

```sh
npm start
# http://localhost:3000
```

```sh
npm test
```

## Included

- Home hub with daily/resume/results, Unlimited, Archive, My Virus and Attack Log; help, settings, feedback and privacy pages. Daily reset countdown uses server time and midnight UTC.
- Three-second question previews followed by server-timed 20-second rounds, unlimited misses until one accepted answer, manual advance between reveals.
- Fixed per-question measurement scales across a 1,024 MB journey, tied values treated equally, reviewed aliases and spelling suggestions requiring confirmation.
- Greyscale 486 opening, disk insertion, small approved virus sprite, accelerating horizontal travel, braking and a scrolling MB ruler. The virus plants into the system and leaves infected blocks behind.
- Five fixed regions and muted palettes; passing discoveries, numbered landings, yesterday and personal-best markers.
- Five strengths of result feedback: restrained weak hits, stronger impacts, a moving spotlight for deep breaches and a distinct top-tier score finish. Rejected entries jolt the input while the original timer runs.
- Approved reward icons and IT-guy artwork, central breach assessments and occasional contextual DOS-style comments from the lower edge.
- Infection log with achieved tier icons at each answer's plotted endpoint, recovered files and clickable answer review.
- Five selectable streak skins (current milestones: 0, 3, 7, 14 and 30 days), retained through the longest historical streak.
- Six restrained synthesized cues, remembered mute, reduced-motion support and phone layout.
- Server-saved daily progress, longest/current streaks, equipped skin, personal best, average and run history. Optional private recovery codes restore the same profile on another device; only code hashes are stored. Unlocked skins survive a broken streak, with a milestone reveal when earned.
- Results with top-five answers, sources and a DOS block chart of actual daily runs in 32 MB bands. A green marker shows your exact result, with the percentile and sample size underneath. The labelled block scale adjusts to the population; no fabricated players or assumed bell curve.
- Optional attack links, seven-sector comparisons, sender/defender win/loss/draw records, rivalry history, new-result badges and fresh counterattacks. A matching completed first daily is reused when defending, unfinished matching dailies must be finished, and the first defence cannot be replayed. Completed counterattacks appear in the rival’s log.
- Unlimited runs and an archive, excluded from daily statistics.

## Content

`data/curated.json` contains **one researched seven-question playtest set**: forest share, mammal sleep, original Pokémon base Speed, Oscar nominations, state water share, metal melting points and alcohol consumption per person. See [QUESTION-SET.md](QUESTION-SET.md) for sources, precise scopes, calibration examples and rebuild instructions.

`data/rotation.json` adds ten prompts: Pokémon HP, Attack, height and weight; Minecraft default hitbox height (Java 1.21.4); country area/borders; state area; element atomic number; and film runtime. The 17-prompt rotation starts for dailies on 29 September 2026; Unlimited uses it immediately. Seven distinct families are selected, including Pokémon and Minecraft in ordinary new runs. Counterattacks prefer questions outside the prior run. This remains a small bank, so repeat questions are expected. Source years and coverage are shown in each question's [?] and in the final report. The old `data/prompts.json` remains loaded for compatibility with saved prototype runs.

Scoring: each question owns 1/7 of 1,024 MB. Fixed numerical anchors interpolate smoothly from weak to exceptional values; the highest earns the full chunk. Equal measurements earn equal shares. A miss leaves the original clock running; expiry ends the round at zero. Scores do not depend on answer popularity or how many weak entries exist in the catalogue. The [?] explains the source and scope. Published prompt IDs retain their original measurements and scales, and daily population comparisons exclude runs with different prompt sets. Displayed gains sum to the final MB total, and percentile ties use that same displayed total.

The approved mockups are kept intact as local image atlases in `public/assets`; canvas/SVG viewports display the selected sprite regions. `public/world.js` owns the fixed map, palettes, discoveries and travel animation. `public/app.js` handles game states and API calls. Friend results and profile data live in SQLite. Themed packs and public deployment remain future work. The IT guy’s comments are triggered by damage/discoveries, separated by at least one round, limited to three appearances, and never repeated within a run. Misses do not trigger troubleshooting comments.

## Hosting

The intended host is **Cloudflare Workers with a separate Germillion D1 database** in the existing account. `app.mjs` contains the shared request handler, `worker.mjs` adapts D1 and static assets, and `server.mjs` retains the local Node/SQLite option. The approved interface and scoring code are shared. GitHub Pages alone cannot run the scoring API or shared results.

Cloudflare setup: `npm ci`, authorize Wrangler, create the `germillion` D1 database, and replace the local-only zero UUID in `wrangler.jsonc` with the returned database ID before publishing. Run `npx wrangler d1 migrations apply DB --remote`, then `npm run deploy`. No Seasons database or Worker is used. Configure the custom domain after testing the generated workers.dev URL. No paid plan upgrade is required by this configuration; account quotas still apply.

For the emulator, run `npx wrangler d1 migrations apply DB --local`, then `npm run dev:cloudflare`. `npm run smoke -- http://127.0.0.1:8787` checks practice scoring, invalid-answer retries, attacks/counterattacks and cross-device recovery. It creates isolated QA practice profiles and matches, never ranked daily results. Use the actual HTTPS origin to run the same check after deployment.

Cloudflare rate-limit bindings allow 240 API requests/minute/IP and 10 recovery attempts/minute/IP. These are per-location safeguards, not global identity enforcement. Database constraints and conditional updates prevent simultaneous requests creating duplicate dailies/defences or overwriting accepted answers. Worker logs are sampled; database recovery uses D1 Time Travel plus exports. Configure and verify recovery before streamer traffic.

Alternatively, the included Dockerfile runs on a Node/container host with a persistent volume mounted at `/app/var`.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` on a host/container |
| `DB_PATH` | `var/germillion.sqlite` | Persistent SQLite file |
| `PUBLIC_ORIGIN` | request origin | Set to the deployed HTTPS origin, e.g. `https://germillion.example` |

Use HTTPS and a persistent disk, and back up the SQLite database. The app only serves an explicit public-file allowlist; the answer catalogue and database stay server-side. Shared links expose the optional chosen name and completed challenge comparison, not browser identifiers.

The intended public domain is **germillion.io**. Configure the host's health check as `GET /healthz`; it checks the database connection without creating a player or cookie. Until DNS is connected, set `PUBLIC_ORIGIN` to the host's actual preview HTTPS origin for testing, then change it to `https://germillion.io` for launch.

`germillion` is an HttpOnly browser cookie. Optional recovery codes map new device sessions to the same player; users without a saved code cannot recover a lost anonymous profile. Creating a replacement code invalidates the previous code (existing signed-in devices remain connected). Clearing the cookie without recovering permits a new profile. The leaderboard is suitable for a prototype, **not tamper-proof competition**. Before a broad streamer launch, add edge rate limiting and stronger player identity if competitive integrity matters. No payment system or analytics tracking is included.

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

## Feedback and local verification

`npm run feedback` reads the latest 100 feedback submissions from the configured database. It prints report IDs, dates, text and question/answer context, without browser identity or recovery credentials. Answer reports never alter a live score. The HTTP endpoint enforces ownership for attached run context and limits submissions per profile.

`npm test` runs the scoring, movement, profile, friend-flow and persistence checks, including concurrent requests against the shared async handler. The Cloudflare emulator smoke test covers the deployed runtime and D1 adapter separately. QA fixture data is isolated under ignored `var/qa-features.sqlite`; never use it as the live database.

History shows the latest 100 runs; the attack view shows the latest 200 matches. All stored records remain in SQLite. Rivalry totals include all matches, and archive completion markers use the full history. Profile statistics and streaks include all completed dailies. The new pages support direct links and browser Back, and settings include sound, fullscreen, reduced motion/flash and higher contrast.

Minecraft measurements are factual extracts from PrismarineJS minecraft-data; attribution is retained in `data/MINECRAFT-DATA-SOURCE.txt`. Its versioned extract and SHA-256 are recorded in `rotation.json`. The builder freezes published IDs. Mob hitbox size is deliberately named in the prompt: it is not visual sprite height. Minecraft names are factual references; no Minecraft artwork is used.

Deployment was subsequently authorized on 28 September 2026 using the user's existing Cloudflare account and Porkbun-registered germillion.io. The Cloudflare bundle and local emulator are verified; live provisioning and DNS are still pending. Do not present localhost links as publicly playable.
