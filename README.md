# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gtumbal51/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gtumbal51/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for the [make.fun](https://make.fun) bounty
**"Build the best token launch radar"**
(`token-radar-01`). One program, `main.ts`, Node 22, standard library
only, no network. It reads the sealed snapshot of 758 protocols, ranks
every protocol that records no token by an implied value, and hands in a
dashboard a reader can sort, filter and open row by row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`--input` defaults to `/input/snapshot.json`, the sealed snapshot. Locally,
pass the kit's snapshot instead:
`--input ../token-radar-01-kit/token-radar-01-kit/input/snapshot.json`.

The grader runs `node main.ts` against the sealed `/input/snapshot.json`
and takes `/output`. The run is deterministic: two runs write the same
bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=x5za685e&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## The model (radar-2)

Implied value is calibrated, not asserted. The snapshot's own live-token
protocols tell us what the market pays for a dollar of TVL: for each
category, the median market-cap-to-TVL ratio of the protocols in that
category whose token trades (at least three of them, else the global
median of × 0.2138), clamped to × 0.02 … × 1.5. A protocol's implied value
is its TVL at that ratio, adjusted for its seven-day TVL growth
(dampened, clamped to −50% … +100%), for how long it has run with no
token on record (a hump: × 0.70 at listing, × 1.00 at two years, easing
to × 0.80 after), and for how many chains it runs on (up to × 1.15).

The board covers all 40 watchlist slugs plus 138 early finds — pre-token
protocols below the $50M floor that pass the watchlist's own exclusion
rules, so no wrapped or staked product of a token that already trades is
ever presented as a launch candidate. Protocols whose token already
trades are set aside on a Live tab with the market cap the market
itself sets. Every row carries a six-step farm plan with what it costs
and how long it takes, derived from the protocol's own category, chains,
TVL and age.

## Files

- `main.ts` — the entrypoint: reads the snapshot, writes `board.json`,
  `data.js`, copies `dashboard/` and `screenshots/`, writes `dossier.json`.
- `lib/model.ts` — the model, the farm plans and the snapshot parser.
- `vendor/makefun-board.ts` — make.fun's dossier library (copied as-is).
- `dashboard/` — `index.html`, `app.css`, `app.js`: the page. Sortable
  and filterable board, an inline detail view per protocol with the
  model's breakdown and its farm plan, a Live tab, and the calibration
  table the model runs on.
- `screenshots/` — three renders of the dashboard: the board, a detail
  view and a filtered view.

## License

MIT — see `LICENSE`.
