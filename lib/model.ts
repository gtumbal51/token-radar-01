// Token Radar's model, version radar-2: one sealed snapshot in, one ranked board out.
//
// The board ranks protocols that record no token, strongest implied value first. Two groups feed it:
// every slug on the snapshot's watchlist (the floor, never the ceiling) and the early radar, the
// pre-token protocols below the watchlist floor that pass the watchlist's own exclusion rules
// (no wrapped or staked product of a token that already trades, no exchange-name prefix, no
// versioned pool, no bridge, liquid-staking, restaking or CEX record). Protocols whose token already
// trades are kept apart: the dashboard shows them with the market cap the market itself sets, never
// with a modelled number.
//
// Implied value is calibrated, not asserted. The snapshot's own live-token protocols tell us what
// the market pays for a dollar of TVL: for each category, the median market-cap-to-TVL ratio of the
// protocols in that category whose token trades (at least three of them, else the global median).
// A protocol's implied value is then its TVL at that ratio, adjusted for three things the snapshot
// also records: its seven-day TVL growth, how long it has run with no token on record, and how many
// chains it runs on. No protocol name is ever special-cased: one function scores every row.

/** One protocol record: exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: every number the dashboard prints, none of them a name. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_peak_days: number;
  maturity_decay_days: number;
  maturity_late_floor: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max: number;
  ratio_min: number;
  ratio_max: number;
  category_min_live: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 100,
  // Maturity is a hump, not a ramp: value builds while a protocol proves it lasts, then eases
  // once it has run years with no token on record, because a launch that never came gets dearer
  // to wait for. The floor keeps an old protocol's TVL worth something real.
  maturity_floor: 0.7,
  maturity_peak_days: 730,
  maturity_decay_days: 1095,
  maturity_late_floor: 0.8,
  unknown_age_days: 365,
  chain_step: 0.03,
  chain_max: 5,
  ratio_min: 0.02,
  ratio_max: 1.5,
  category_min_live: 3,
};

/** The model's version label: the dashboard names it, the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many early protocols below the watchlist floor the board carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** What the market pays for a dollar of TVL, category by category, from the snapshot itself. */
export interface Calibration {
  /** The median market-cap-to-TVL ratio over every live-token protocol in the snapshot. */
  global_ratio: number;
  /** Per-category medians, only for categories with enough live protocols to trust. */
  by_category: { category: string; ratio: number; live_protocols: number }[];
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    ratio: number;
    ratio_source: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chains_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One board row, as the dashboard receives it (farm steps included, so the page shows exactly
 *  what board.json carries). */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  ratio: number;
  ratio_source: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  chains_multiplier: number;
  farm_steps: string[];
}

/** A protocol whose token already trades: the market's own value, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted list, or null when it is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The market's price for a dollar of TVL, by category, from the live protocols in the snapshot. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const all = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const global = medianOf(all) ?? 0.25;
  const clamp = (r: number): number => Math.min(model.ratio_max, Math.max(model.ratio_min, r));
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const rows = [...byCategory.entries()]
    .map(([category, ratios]) => ({ category, ratios: ratios.sort((a, b) => a - b) }))
    .filter((e) => e.ratios.length >= model.category_min_live)
    .map((e) => ({ category: e.category, ratio: clamp(medianOf(e.ratios)!), live_protocols: e.ratios.length }))
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { global_ratio: clamp(global), by_category: rows };
}

/** The ratio one protocol is valued at: its category's median, else the global median. */
export function ratioFor(p: SnapshotProtocol, calibration: Calibration, model: ModelConstants = MODEL): { ratio: number; source: string } {
  const hit = calibration.by_category.find((c) => c.category === (p.category ?? 'Other'));
  if (hit !== undefined) return { ratio: hit.ratio, source: `${hit.category} median (${hit.live_protocols} live)` };
  return { ratio: calibration.global_ratio, source: `global median` };
}

/** The maturity multiplier for an age in days: 0.70 at listing, 1.00 at two years, easing to 0.80. */
export function maturityFor(age: number | null, model: ModelConstants = MODEL): number {
  const a = age ?? model.unknown_age_days;
  if (a <= model.maturity_peak_days) {
    return model.maturity_floor + (1 - model.maturity_floor) * (a / model.maturity_peak_days);
  }
  const past = Math.min(a - model.maturity_peak_days, model.maturity_decay_days);
  return Math.max(model.maturity_late_floor, 1 - (1 - model.maturity_late_floor) * (past / model.maturity_decay_days));
}

/** The four multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; ratio: number; ratioSource: string; growthPct: number; growthMult: number; maturityMult: number; chainsMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { ratio, source } = ratioFor(protocol, calibration, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = maturityFor(age, model);
  const chainsMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * ratio * growthMult * maturityMult * chainsMult));
  return { implied, ratio, ratioSource: source, growthPct, growthMult, maturityMult, chainsMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a product of a token that already trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
/** The exchanges whose own products are never launch candidates. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that are a wrapped, bridged or staked product by definition, or an exchange. */
const EXCLUDED_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank as a launch candidate: it records no token and it
 * passes the watchlist's own exclusion rules, so no wrapped or staked product of a token that
 * already trades is ever presented as a protocol still to come.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORY.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest implied value first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, with the snapshot's own record behind it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable protocols below the watchlist floor, by TVL, capped. A chosen
  // protocol stays chosen; nothing here replaces a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, calibration, model) }));
  // Ties on implied value fall to the bigger TVL, then to the slug: the order is fixed either way.
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // The ratio stays full-precision here: the page recomputes the row from it, and a rounded
      // ratio would recompute to a different dollar and the page would call the data stale.
      ratio: s.ratio,
      ratio_source: s.ratioSource,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chains_multiplier: round4(s.chainsMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page before you move it.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols need a longer track record. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The core action for one protocol, from its category, capital and chain. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Lend $${capital} of USDC on ${name} (${chain}) and leave the deposit earning for the full hold.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep both sides of the position.`;
  }
  if (c.includes('yield') && !c.includes('aggregator')) {
    return `Deposit $${capital} into ${name}'s highest-yield vault on ${chain} and let the yield compound.`;
  }
  if (c.includes('yield aggregator') || c.includes('aggregator')) {
    return `Route $${capital} through ${name} on ${chain} into its top vault and hold the receipt tokens.`;
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return `Post $${capital} of USDC as margin on ${name} (${chain}), open one small hedged position, and do not over-leverage it.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} (${chain}) and take one position in its longest-running market.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return `Allocate $${capital} to a ${name} vault on ${chain} and hold the vault shares for the full hold.`;
  }
  if (c.includes('stable')) {
    return `Mint $${capital} of the stable asset through ${name} on ${chain} and keep it minted for the full hold.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it for the full hold.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full hold.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} into ${name}'s basis trade on ${chain} and hold the position for the full hold.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the full hold.`;
}

/** The weekly qualifying action, from the protocol's category. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'Borrow a small sum against the deposit and repay it the same week, so the record shows two-sided use.';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'Swap a small amount through the pool once a week, so the record shows repeat use rather than one deposit.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Close and reopen the hedge once a week with a small size, so the record shows repeat use.';
  if (c.includes('prediction')) return 'Settle one small market position each week and open the next, so the record shows steady activity.';
  return 'Do one small on-chain action each week — a deposit, a swap, a vote or a claim — so the record shows repeat use.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. It is derived from the
 * protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Open a fresh wallet for this farm alone, fund it with exactly $${capital} plus about $10 for gas on ${chain}, and store its seed phrase offline.`,
      cost: 'about $10 of gas to fund and set up',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 200 ? 6 : 3} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, so the activity spans more than one snapshot of the protocol's users.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, open the protocol's own points or rewards page and check the wallet's standing; only ever claim from a link that page itself publishes, and never pay a fee to claim.`,
      cost: 'nothing to check, and no fee to claim',
      time: '10 minutes a month',
    },
    {
      text: `Keep a farm log — wallet, dates, every transaction hash — and decide the exit in advance: unwind in two halves, and keep the log for a year.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, farm steps included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    ratio: row.model.ratio,
    ratio_source: row.model.ratio_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chains_multiplier: row.model.chains_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100-row floor`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
