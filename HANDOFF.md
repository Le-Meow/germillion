# Germillion handoff

The playable game already exists in this repository. Continue this implementation and preserve its approved artwork, horizontal movement, DOS/VGA styling and game rules. Content expansion is being handled separately in Claude.

## Run and verify

- Node.js 24 or newer; no dependencies or frontend build step.
- `npm start` starts the game on localhost:3000. `npm test` runs the regression checks.
- `README.md` covers features and configuration; `QUESTION-SET.md` covers validation, scoring and frozen question versions.
- `public/world.js` controls movement and discoveries; `public/app.js` controls screens; `server.mjs` owns player state and friend attacks.
- Existing SQLite saves, feedback, raw source downloads and private recovery codes are intentionally not shipped in Git.

## Hosting next

The user owns **germillion.io**, registered at Porkbun, and subsequently chose their existing Cloudflare account. Cloudflare Workers/D1 support is implemented and emulator-tested. Wrangler login authorization, live database provisioning and DNS connection remain pending. Do not buy hosting or change an account plan without approval.

Read the Cloudflare section of README.md first. The Node/Docker instructions below are an alternative retained for local development and other hosts. `app.mjs` is now the shared async request handler. `worker.mjs` provides the D1 adapter. New database writes protect accepted answers against concurrent requests.

Deploy the existing Node server or Dockerfile to a host with persistent storage. GitHub Pages alone cannot run this application.

- Set `HOST=0.0.0.0`, the host-required `PORT`, and `PUBLIC_ORIGIN=https://germillion.io`.
- Mount a writable persistent volume at `/app/var` for Docker, or set `DB_PATH` to a persistent SQLite location.
- Start with a single application instance sharing its local SQLite volume. Do not use ephemeral storage or independent databases behind multiple replicas.
- Connect the domain, enable HTTPS, and configure database backups with a tested restore procedure.
- The Docker image uses committed question catalogues; source-data rebuilding is not required to start the game.

## Remaining verification

- Final human playtest of weak/medium/strong hit timing, camera movement, reveals and sparse sounds.
- Actual mobile keyboard/layout and Chrome fullscreen testing. Prior browser viewport emulation did not successfully produce a phone-sized viewport.
- Hosted two-device attack, defence, result notification, counterattack and recovery-code testing. Local API and desktop flow checks already exist; public links are not yet verified.
- Backend traffic hardening and local load tests are complete; see `TRAFFIC.md` for exact evidence and limits. Apply both migrations to D1. A live staging load rehearsal, paid upgrade, operational alerts and verified restore remain required before streamer promotion. Analytics, payments and themed packs are not implemented.
- Integrate separately researched content as new immutable question IDs; retain old IDs for saved runs and attacks. Never invent player distributions or silently accept fuzzy suggestions.

Keep the scope focused on finishing and deploying this game, not rebuilding it in another stack.
