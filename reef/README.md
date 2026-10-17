# Reef Academy

A gamified learning site in which every ETF is a species on a coral reef.

- **Biodiversity is diversification.** The score is a Gini-Simpson index over asset classes, so three tech funds count as one species: a monoculture that looks lush until a storm hits. More biodiversity also brings more ambient reef fish.
- **Fees are pollution.** The weighted expense ratio clouds the water. The Fee Lab fast-forwards 30 calm years at 7% next to a zero-fee twin.
- **Storms are real market events:** 2008 (calendar 2008, then 2009), the 2020 COVID crash (Feb 19 – Mar 23, then the rest of 2020) and the 2022 rate shock (calendar 2022, then 2023). Each species bleaches by its approximate return during the storm. Then you choose to ride the current or abandon the reef for cash.
- **Dr. Octavia Inkwell**, the AI marine biologist, explains each result in plain words and answers questions about your reef.
- **Game layer:** up to 3 stars per storm (survive, beat the market's damage, regrow to 90%+), XP and levels, 10 badges, presets, and a boss "Gauntlet" that runs all three storms back to back. Progress is kept in `localStorage`.

## Run

```bash
make reef
```

Open http://127.0.0.1:5600. The server uses only the standard library. It serves the static files and `POST /api/biologist`, which calls OpenRouter using `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` from the repo `.env`. With no key, the route returns 503 and the page falls back to offline "field notes" built from the same facts. Set `PORT` or `REEF_PORT` to change the port.

## Files

```text
data.js       species (ETFs), storms (returns), presets, badges
sim.js        pure math: biodiversity, fees, storm results, stars, gauntlet
render.js     procedural canvas reef: corals, fish, bleaching, murk, storms
biologist.js  LLM call with offline fallback narration
app.js        UI, game flow, XP, badges
server.py     static server and LLM proxy
```

Returns are rounded, approximate historical total returns for teaching. ARKK and VXUS did not exist in 2008, so they use index proxies. This is not investment advice.
