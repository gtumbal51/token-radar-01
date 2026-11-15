// Token Radar's model, version radar-3: one sealed snapshot in, one ranked board out.
//
// The board ranks protocols that record no token, strongest implied value first. It ranks every
// rankable protocol in the snapshot (198 of them: all 40 watchlist slugs plus every other pre-token
// protocol that passes the watchlist's own exclusion rules). Protocols whose token already trades
// are kept apart: the dashboard shows them with the market cap the market itself sets, never with
// a modelled number. Centralised exchanges are kept apart from the fit as well as the board: a
// CEX token is not a protocol launch, so the 119 traded protocols the curve is fitted on are the
// live-token protocols outside the CEX category.
//
// Implied value is a size curve, fitted and tested, not asserted. The snapshot's own traded
// protocols tell us what the market pays for a dollar of TVL, and the relationship is a curve,
// not a flat ratio: log(market cap) against log(TVL) — the multiple a token trades at falls as
// the protocol grows. The curve is fitted by ordinary least squares on the 119 traded protocols
// (all of them, so the fit is the snapshot's own), and it is tested two ways before it is trusted:
// a time split (fit the older half by listing date, predict the younger half) and a leave-one-out
// ablation (does each extra factor — category, growth, maturity — earn its place?). The ablation
// is the model's discipline: on this snapshot the curve alone beats the curve plus any of those
// factors, so the model is the curve alone. The dashboard shows the validation, not just the
// claim, and the page refits the curve from the traded protocols itself.
//
// A launch is priced as a range, not a point. The band around each implied value is the model's
// own measured error: the time-split median error factor, so the low end is the mid divided by
// that factor and the high end is the mid times it. Half of the tokens the curve was tested on
// landed inside a band that wide.
//
// The farm plan is a $1,000 plan, the same size for every protocol so the rows can be compared.
// What a wallet's allocation is worth is the low end of the band shared by 40,000 farming
// wallets. What the plan costs is what it burns: the gas its steps spend, plus the yield the
// $1,000 forgoes while it sits in the protocol at 4% a year. The $1,000 itself is a deposit,
// returned when the farmer exits; it is at risk only if the protocol fails, and that risk is not
// in the net number. Net is gross minus cost, and the verdict follows it: FARM when the net
// clears $100, THIN when it is positive but under $100, SKIP when it is zero or negative. No
// protocol name is ever special-cased: one function scores every row.

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

/** The model's version label: the dashboard names it, the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** The farm plan's size, in dollars, the same for every protocol so the rows can be compared. */
export const PLAN_CAPITAL_USD = 1000;

/** One wallet's share of a launch: the low-end value shared by this many farming wallets. */
export const ALLOCATION_WALLETS = 40000;

/** The yield the plan's capital forgoes while it sits in the protocol, per year, as a fraction. */
export const FORGONE_YIELD_RATE = 0.04;

/** The net a plan must clear, in dollars, for the verdict to be FARM. */
export const FARM_NET_USD = 100;

/** The model's constants: every number the dashboard prints, none of them a name. */
export interface ModelConstants {
  /** The gas, in dollars, of opening a wallet and funding it. */
  setup_gas_usd: number;
  /** The gas, in dollars, of the deposit step. */
  deposit_gas_usd: number;
  /** The gas, in dollars, of one week's qualifying action. */
  weekly_gas_usd: number;
  /** The gas, in dollars, of unwinding and claiming. */
  exit_gas_usd: number;
  /** Bootstrap resamples for the curve's slope interval. */
  bootstrap_resamples: number;
  /** The seed that makes the bootstrap deterministic. */
  bootstrap_seed: number;
}

export const MODEL: ModelConstants = {
  setup_gas_usd: 10,
  deposit_gas_usd: 5,
  weekly_gas_usd: 2,
  exit_gas_usd: 3,
  bootstrap_resamples: 400,
  bootstrap_seed: 20261114,
};

/** A size curve: log(market cap) = intercept + slope × log(TVL), fitted on the traded protocols. */
export interface CurveFit {
  intercept: number;
  slope: number;
  /** How many traded protocols the fit ran on. */
  n: number;
}

/** One validation number set: a median error factor and the shares within 2×, 3× and 10×. */
export interface ErrorStats {
  n: number;
  median_factor: number;
  within_2x: number;
  within_3x: number;
  within_10x: number;
}

/** One row of the factor-ablation table: a candidate model and its leave-one-out error. */
export interface AblationRow {
  name: string;
  median_factor: number;
  within_2x: number;
  within_3x: number;
}

/** Everything the dashboard's validation view shows: the curve, tested two ways. */
export interface Validation {
  curve: CurveFit;
  /** Log-space R² of the curve on the fit set. */
  r2: number;
  /** The slope's 5th–95th percentile over the bootstrap resamples. */
  slope_ci: [number, number];
  /** The intercept's 5th–95th percentile over the bootstrap resamples. */
  intercept_ci: [number, number];
  /** The time split: fit the older half by listing date, predict the younger half. */
  time_split: ErrorStats & {
    fit_n: number;
    fit_last_listed: string;
    test_first_listed: string;
  };
  /** The leave-one-out error of the curve alone, over the whole fit set. */
  loo: ErrorStats;
  /** The ablation: every candidate, leave-one-out, so each factor can earn its place or not. */
  ablation: AblationRow[];
  /** The band factor: the time-split median error factor. The band is mid ÷ factor … mid × factor. */
  band_factor: number;
}

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A row's farm economics on the $1,000 plan: what the allocation is worth, what it costs. */
export interface FarmEconomics {
  /** The plan's capital, deposited and returned on exit. */
  capital_usd: number;
  /** The wallet's allocation: the low end of the band, shared by ALLOCATION_WALLETS wallets. */
  gross_usd: number;
  /** The gas the steps spend, in dollars. */
  gas_usd: number;
  /** The yield the capital forgoes while it sits in the protocol, in dollars. */
  forgone_yield_usd: number;
  /** What the plan burns: gas plus forgone yield. The capital is a deposit, not a cost. */
  cost_usd: number;
  /** Gross minus cost, in whole dollars. */
  net_usd: number;
  /** FARM when net clears FARM_NET_USD, THIN when it is positive but under it, SKIP when not. */
  verdict: 'FARM' | 'THIN' | 'SKIP';
  /** How long the position is held, in days. */
  hold_days: number;
  /** Whole weeks in the hold, for the weekly gas. */
  weeks: number;
  /** The hands-on hours the plan takes: setup, weekly actions and monthly checks. */
  hours: number;
  /** Net per hands-on hour, in dollars. */
  net_per_hour: number;
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
  band_low_usd: number;
  band_high_usd: number;
  model: {
    /** The fitted curve's intercept: log(market cap) = intercept + slope × log(TVL). */
    curve_intercept: number;
    curve_slope: number;
    band_factor: number;
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** One board row, as the dashboard receives it: the board row plus its nearest traded tokens. */
export interface RadarRow extends BoardRow {
  /** The three traded protocols nearest in TVL, with their market cap and multiple. */
  nearest: { slug: string; name: string; tvl_usd: number; mcap_usd: number; ratio: number }[];
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

/** A traded protocol the curve is fitted on, as the dashboard receives it for its own refit. */
export interface CompPoint {
  tvl_usd: number;
  mcap_usd: number;
  listed_at: string | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  validation: Validation;
  /** The audit: every protocol tracked, the pre-token ones examined, the ranked ones, the watchlist. */
  audit: { tracked: number; pre_token: number; ranked: number; watchlist: number };
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  /** The best net per hands-on hour on the board. */
  best_per_hour: { slug: string; name: string; net_per_hour: number };
  watchlist_size: number;
  board_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  comps: CompPoint[];
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

/** A deterministic pseudo-random stream from a seed (mulberry32). */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ordinary least squares on (log TVL, log market cap): the size curve. */
export function fitCurve(points: [number, number][]): CurveFit {
  const n = points.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of points) {
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { intercept, slope, n };
}

/** The curve's prediction for a TVL, in dollars. */
export function curveValue(fit: CurveFit, tvl: number): number {
  return Math.exp(fit.intercept + fit.slope * Math.log(tvl));
}

/** The median error factor and the shares within 2×, 3× and 10× of a prediction set. */
export function errorStats(predicted: number[], actual: number[]): ErrorStats {
  const factors = predicted
    .map((p, i) => Math.max(p, actual[i]!) / Math.min(p, actual[i]!))
    .sort((a, b) => a - b);
  const median = medianOf(factors) ?? 1;
  const share = (f: number): number => factors.filter((x) => x <= f).length / factors.length;
  return { n: factors.length, median_factor: median, within_2x: share(2), within_3x: share(3), within_10x: share(10) };
}

/** The traded protocols the curve is fitted on: live-token protocols outside the CEX category. */
export function fitSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** The growth multiplier v1 used, kept only so the ablation can test it and drop it. */
function growthMultiplier(p: SnapshotProtocol): number {
  const growth = Math.min(100, Math.max(-50, finite(p.change_7d, 0)));
  return 1 + (growth / 100) * 0.4;
}

/** The maturity multiplier v1 used, kept only so the ablation can test it and drop it. */
function maturityMultiplier(p: SnapshotProtocol, asOf: string): number {
  const age = ageDays(asOf, p.listed_at) ?? 365;
  if (age <= 730) return 0.7 + 0.3 * (age / 730);
  return Math.max(0.8, 1 - 0.2 * (Math.min(age - 730, 1095) / 1095));
}

/** The chain multiplier v1 used, kept only so the ablation can test it and drop it. */
function chainsMultiplier(p: SnapshotProtocol): number {
  return 1 + 0.03 * Math.min(Math.max(p.chains.length - 1, 0), 5);
}

/** The median log-residual per category on a fit set, for the ablation's category tilt. */
function categoryShifts(set: SnapshotProtocol[], fit: CurveFit): Map<string, number> {
  const byCategory = new Map<string, number[]>();
  for (const p of set) {
    const residual = Math.log(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log(p.tvl_usd));
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(residual);
    byCategory.set(key, list);
  }
  return new Map(
    [...byCategory.entries()].map(([k, v]) => [k, medianOf(v.sort((a, b) => a - b)) ?? 0]),
  );
}

/** Leave-one-out error of a predictor: each protocol predicted from a fit that never saw it. */
function looError(
  set: SnapshotProtocol[],
  predict: (fitSet: SnapshotProtocol[], p: SnapshotProtocol) => number,
): ErrorStats {
  const predicted: number[] = [];
  const actual: number[] = [];
  for (let i = 0; i < set.length; i++) {
    const rest = set.filter((_, j) => j !== i);
    predicted.push(predict(rest, set[i]!));
    actual.push(set[i]!.mcap_usd!);
  }
  return errorStats(predicted, actual);
}

/** The curve, tested two ways, with the ablation that shows what earns its place. */
export function validate(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const set = fitSet(snapshot);
  const points = set.map((p): [number, number] => [Math.log(p.tvl_usd), Math.log(p.mcap_usd!)]);
  const curve = fitCurve(points);
  // Log-space R² of the curve on the fit set.
  const meanY = points.reduce((s, [, y]) => s + y, 0) / points.length;
  let ssTotal = 0, ssResid = 0;
  for (const [x, y] of points) {
    ssTotal += (y - meanY) ** 2;
    ssResid += (y - (curve.intercept + curve.slope * x)) ** 2;
  }
  const r2 = 1 - ssResid / ssTotal;
  // The bootstrap: refit on resamples, so the slope and intercept carry their own interval.
  const rnd = seededRandom(model.bootstrap_seed);
  const slopes: number[] = [];
  const intercepts: number[] = [];
  for (let k = 0; k < model.bootstrap_resamples; k++) {
    const sample: [number, number][] = [];
    for (let i = 0; i < points.length; i++) sample.push(points[Math.floor(rnd() * points.length)]!);
    const refit = fitCurve(sample);
    slopes.push(refit.slope);
    intercepts.push(refit.intercept);
  }
  slopes.sort((a, b) => a - b);
  intercepts.sort((a, b) => a - b);
  const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  // The time split: fit the older half by listing date, predict the younger half.
  const dated = set
    .filter((p) => p.listed_at !== null)
    .sort((a, b) =>
      a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1,
    );
  const half = Math.floor(dated.length / 2);
  const older = dated.slice(0, half);
  const younger = dated.slice(half);
  const splitFit = fitCurve(older.map((p): [number, number] => [Math.log(p.tvl_usd), Math.log(p.mcap_usd!)]));
  const splitStats = errorStats(
    younger.map((p) => curveValue(splitFit, p.tvl_usd)),
    younger.map((p) => p.mcap_usd!),
  );
  const bandFactor = splitStats.median_factor;
  // The ablation: each candidate leave-one-out, on the same fit set.
  const curveOnly = (rest: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const f = fitCurve(rest.map((q): [number, number] => [Math.log(q.tvl_usd), Math.log(q.mcap_usd!)]));
    return curveValue(f, p.tvl_usd);
  };
  const flatMedian = (rest: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const ratios = rest.map((q) => q.mcap_usd! / q.tvl_usd).sort((a, b) => a - b);
    return p.tvl_usd * (medianOf(ratios) ?? 0.25);
  };
  const withCategory = (rest: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const f = fitCurve(rest.map((q): [number, number] => [Math.log(q.tvl_usd), Math.log(q.mcap_usd!)]));
    const shifts = categoryShifts(rest, f);
    return curveValue(f, p.tvl_usd) * Math.exp(shifts.get(p.category ?? 'Other') ?? 0);
  };
  const withGrowth = (rest: SnapshotProtocol[], p: SnapshotProtocol): number =>
    curveOnly(rest, p) * growthMultiplier(p);
  const withMaturity = (rest: SnapshotProtocol[], p: SnapshotProtocol): number =>
    curveOnly(rest, p) * maturityMultiplier(p, snapshot.as_of);
  const withGrowthMaturity = (rest: SnapshotProtocol[], p: SnapshotProtocol): number =>
    curveOnly(rest, p) * growthMultiplier(p) * maturityMultiplier(p, snapshot.as_of);
  const withAll = (rest: SnapshotProtocol[], p: SnapshotProtocol): number =>
    withCategory(rest, p) * growthMultiplier(p) * maturityMultiplier(p, snapshot.as_of) * chainsMultiplier(p);
  const ablation: AblationRow[] = [
    ['Flat median multiple', looError(set, flatMedian)],
    ['Size curve', looError(set, curveOnly)],
    ['Size curve + category tilt', looError(set, withCategory)],
    ['Size curve + growth tilt', looError(set, withGrowth)],
    ['Size curve + maturity tilt', looError(set, withMaturity)],
    ['Size curve + growth + maturity', looError(set, withGrowthMaturity)],
    ['Size curve + all tilts', looError(set, withAll)],
  ].map(([name, stats]) => ({
    name: name as string,
    median_factor: (stats as ErrorStats).median_factor,
    within_2x: (stats as ErrorStats).within_2x,
    within_3x: (stats as ErrorStats).within_3x,
  }));
  return {
    curve,
    r2,
    slope_ci: [pct(slopes, 0.05), pct(slopes, 0.95)],
    intercept_ci: [pct(intercepts, 0.05), pct(intercepts, 0.95)],
    time_split: {
      ...splitStats,
      fit_n: older.length,
      fit_last_listed: older[older.length - 1]!.listed_at!,
      test_first_listed: younger[0]!.listed_at!,
    },
    loo: looError(set, curveOnly),
    ablation,
    band_factor: bandFactor,
  };
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

/** How long to hold, from the protocol's age: younger protocols need a longer track record. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The whole weeks in a hold, for the weekly gas. */
function weeksFor(holdDays: number): number {
  return Math.ceil(holdDays / 7);
}

/** A row's farm economics on the $1,000 plan: the allocation, the cost, the net, the verdict. */
export function farmEconomics(
  mid: number,
  bandFactor: number,
  age: number | null,
  model: ModelConstants = MODEL,
): FarmEconomics {
  const hold = holdDaysFor(age);
  const weeks = weeksFor(hold);
  const gas = model.setup_gas_usd + model.deposit_gas_usd + model.weekly_gas_usd * weeks + model.exit_gas_usd;
  const forgone = Math.round(PLAN_CAPITAL_USD * FORGONE_YIELD_RATE * (hold / 365) * 100) / 100;
  const cost = gas + forgone;
  const low = mid / bandFactor;
  const gross = low / ALLOCATION_WALLETS;
  const net = Math.round(gross - cost);
  const verdict: FarmEconomics['verdict'] = net >= FARM_NET_USD ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  const months = Math.ceil(hold / 30);
  const hours = (30 + 10 * weeks + 10 * months) / 60;
  return {
    capital_usd: PLAN_CAPITAL_USD,
    gross_usd: Math.round(gross * 100) / 100,
    gas_usd: gas,
    forgone_yield_usd: forgone,
    cost_usd: Math.round(cost * 100) / 100,
    net_usd: net,
    verdict,
    hold_days: hold,
    weeks,
    hours: Math.round(hours * 10) / 10,
    net_per_hour: Math.round((net / hours) * 100) / 100,
  };
}

/** The implied value and its band for one protocol, from the fitted curve. */
export function impliedValue(
  protocol: SnapshotProtocol,
  validation: Validation,
): { mid: number; low: number; high: number } {
  const tvl = Math.max(1, protocol.tvl_usd);
  const mid = Math.max(1, Math.round(curveValue(validation.curve, tvl)));
  return {
    mid,
    low: Math.max(1, Math.round(mid / validation.band_factor)),
    high: Math.round(mid * validation.band_factor),
  };
}

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
 * A protocol's farm plan: six steps on the $1,000 plan, each an action with a cost and a time.
 * The costs add up to the economics: the setup gas, the deposit gas, the weekly gas, the forgone
 * yield of the hold, and the exit gas. The $1,000 is a deposit, returned on exit; the plan's cost
 * is what it burns. Derived from the protocol's own record (category, chains, TVL, age), never
 * from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics, model: ModelConstants = MODEL): FarmStep[] {
  const chain = chainOf(p);
  const capital = PLAN_CAPITAL_USD;
  const hold = econ.hold_days;
  return [
    {
      text: `Open a fresh wallet for this farm alone, fund it with exactly $${capital} plus about $${model.setup_gas_usd} for gas on ${chain}, and store its seed phrase offline.`,
      cost: `about $${model.setup_gas_usd} of gas to fund and set up`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital, returned on exit, and about $${model.deposit_gas_usd} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: `about $${model.weekly_gas_usd} of gas a week, for ${econ.weeks} weeks`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, so the activity spans more than one snapshot of the protocol's users. The $${capital} is a deposit, returned when you exit; what it costs to leave it there is the yield it forgoes, about $${econ.forgone_yield_usd.toFixed(2)} at 4% a year.`,
      cost: `about $${econ.forgone_yield_usd.toFixed(2)} of forgone yield`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, open the protocol's own points or rewards page and check the wallet's standing; only ever claim from a link that page itself publishes, and never pay a fee to claim.`,
      cost: 'nothing to check, and no fee to claim',
      time: '10 minutes a month',
    },
    {
      text: `Keep a farm log — wallet, dates, every transaction hash — and decide the exit in advance: unwind in two halves, and keep the log for a year.`,
      cost: `about $${model.exit_gas_usd} of gas to exit`,
      time: '15 minutes',
    },
  ];
}

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The three traded protocols nearest in TVL, with their market cap and multiple. */
function nearestComps(p: SnapshotProtocol, set: SnapshotProtocol[]): RadarRow['nearest'] {
  const target = Math.log(Math.max(1, p.tvl_usd));
  return set
    .map((c) => ({ c, d: Math.abs(Math.log(Math.max(1, c.tvl_usd)) - target) }))
    .sort((a, b) => a.d - b.d || (a.c.slug < b.c.slug ? -1 : a.c.slug > b.c.slug ? 1 : 0))
    .slice(0, 3)
    .map(({ c }) => ({
      slug: c.slug,
      name: c.name,
      tvl_usd: c.tvl_usd,
      mcap_usd: c.mcap_usd!,
      ratio: Math.round((c.mcap_usd! / c.tvl_usd) * 100) / 100,
    }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest implied value first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, validation: Validation, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, with the snapshot's own record behind it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar: every other rankable protocol, no floor and no cap. A chosen protocol stays
  // chosen; nothing here replaces a watchlist row.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const value = impliedValue(p, validation);
    const econ = farmEconomics(value.mid, validation.band_factor, age, model);
    return { p, age, value, econ };
  });
  // Ties on implied value fall to the bigger TVL, then to the slug: the order is fixed either way.
  scored.sort((a, b) => b.value.mid - a.value.mid || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    implied_value_usd: s.value.mid,
    band_low_usd: s.value.low,
    band_high_usd: s.value.high,
    model: {
      curve_intercept: round4(validation.curve.intercept),
      curve_slope: round4(validation.curve.slope),
      band_factor: round4(validation.band_factor),
    },
    farm: s.econ,
    farm_steps: farmSteps(s.p, s.age, s.econ, model).map(stepText),
  }));
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

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const validation = validate(snapshot, model);
  const board = buildBoard(snapshot, validation, model);
  const live = liveRows(snapshot);
  const comps = fitSet(snapshot);
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) counts[r.farm.verdict] += 1;
  let best = board[0]!;
  for (const r of board) if (r.farm.net_per_hour > best.farm.net_per_hour) best = r;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    validation,
    audit: {
      tracked: snapshot.protocols.length,
      pre_token: snapshot.protocols.filter(isPreToken).length,
      ranked: board.length,
      watchlist: snapshot.watchlist.length,
    },
    verdict_counts: counts,
    best_per_hour: { slug: best.slug, name: best.name, net_per_hour: best.farm.net_per_hour },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board.map((r) => ({ ...r, nearest: nearestComps(snapshot.protocols.find((p) => p.slug === r.slug)!, comps) })),
    live,
    comps: comps.map((p) => ({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, listed_at: p.listed_at })),
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
