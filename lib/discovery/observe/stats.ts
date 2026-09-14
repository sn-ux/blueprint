/**
 * Tail probabilities, in bits.
 *
 * Everything the observation engine calls "interesting" is one number: how
 * many bits of evidence the data carries against a null model that already
 * knows the obvious things about this listener. So the whole of this file is
 * exact tail probabilities plus a large-deviation fallback for the cases where
 * a tail underflows a double, which for real libraries is most of the good
 * ones.
 *
 * Nothing here knows anything about music.
 */

const LN2 = Math.LN2;

/** Lanczos, g=7, n=9. Accurate to ~1e-15 over the range we use. */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

const logBinom = (n: number, k: number) =>
  logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

/** Continued fraction for the incomplete beta, modified Lentz. */
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-30, EPS = 3e-16, MAXIT = 300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front =
    Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betacf(a, b, x)) / a
    : 1 - (front * betacf(b, a, 1 - x)) / b;
}

/**
 * Kullback–Leibler divergence between two Bernoulli rates, in nats.
 * n·D is the Chernoff exponent, so n·D/ln2 is a valid lower bound on the
 * surprisal of the corresponding binomial tail. That is what keeps a score
 * finite and monotone when the exact tail underflows.
 */
export function klBernoulli(q: number, p: number): number {
  const c = (x: number) => Math.min(1 - 1e-15, Math.max(1e-15, x));
  q = c(q); p = c(p);
  return q * Math.log(q / p) + (1 - q) * Math.log((1 - q) / (1 - p));
}

/** Bits of surprise in P(X ≥ k), X ~ Binomial(n, p). Never negative, never Infinity. */
export function binomUpperBits(k: number, n: number, p: number): number {
  if (n <= 0 || k <= 0) return 0;
  if (k > n) return 0;
  const rate = k / n;
  if (rate <= p) return 0;                       // not extreme in the direction asked
  const bound = (n * klBernoulli(rate, p)) / LN2;
  const tail = betai(k, n - k + 1, p);           // = P(X ≥ k)
  if (tail > 1e-300 && tail <= 1 && Number.isFinite(tail)) {
    return Math.max(bound, -Math.log2(tail));
  }
  return Math.max(0, bound);
}

/** Bits of surprise in P(X ≤ k). */
export function binomLowerBits(k: number, n: number, p: number): number {
  if (n <= 0) return 0;
  if (k >= n) return 0;
  const rate = k / n;
  if (rate >= p) return 0;
  const bound = (n * klBernoulli(rate, p)) / LN2;
  const tail = 1 - betai(k + 1, n - k, p);
  if (tail > 1e-300 && tail <= 1 && Number.isFinite(tail)) {
    return Math.max(bound, -Math.log2(tail));
  }
  return Math.max(0, bound);
}

/**
 * Regularized LOWER incomplete gamma P(a,x).
 *
 * The identity that matters here is P(Poisson(x) ≥ a) = P(a, x) — the lower
 * one, not Q. Getting that backwards silently turns every social observation
 * into its own complement, which is why it is spelled out.
 */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let i = 0; i < 1000; i++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 3e-16) break;
    }
    const lead = -x + a * Math.log(x) - logGamma(a);
    return sum <= 0 ? 0 : Math.exp(lead + Math.log(sum));
  }
  const TINY = 1e-300;
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i <= 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  const q = h * Math.exp(-x + a * Math.log(x) - logGamma(a));
  return 1 - q;
}

/**
 * Bits of surprise in P(X ≥ k) for X ~ Poisson(lambda).
 *
 * The social null: every eligible person carries their own small probability
 * of holding a given thing, lambda is what those probabilities add up to, and
 * this is how startled we should be by the number who actually do. A famous
 * record has a large lambda and so cannot be surprising however many hold it.
 */
export function poissonUpperBits(k: number, lambda: number): number {
  if (k <= 0) return 0;
  if (lambda <= 0) return 64;
  if (k <= lambda) return 0;
  const rate = (k * Math.log(k / lambda) - k + lambda) / LN2;   // Chernoff exponent
  const tail = gammaP(k, lambda);
  if (tail > 1e-300 && tail <= 1 && Number.isFinite(tail)) {
    return Math.max(0, Math.max(-Math.log2(tail), 0));
  }
  return Math.max(0, rate);
}

/**
 * Beta-binomial upper tail, in bits: P(K ≥ k | T draws, Beta(α,β) rate).
 *
 * This is the model for "how much of a record does this person tend to keep".
 * A plain binomial would be wrong because coverage is wildly overdispersed —
 * most albums sit at one track and a few sit at all of them — and fitting the
 * spread per person is exactly what makes the same 9-of-11 ordinary for a
 * collector and astonishing for someone who never keeps more than one.
 */
export function betaBinomUpperBits(k: number, T: number, alpha: number, beta: number): number {
  if (T <= 0 || k <= 0 || k > T) return 0;
  const lb = logGamma(alpha + beta) - logGamma(alpha) - logGamma(beta);
  let sum = 0;
  for (let j = k; j <= T; j++) {
    const lp =
      logBinom(T, j) + lb + logGamma(j + alpha) + logGamma(T - j + beta) -
      logGamma(T + alpha + beta);
    sum += Math.exp(lp);
  }
  if (sum > 1e-300 && sum <= 1) return Math.max(0, -Math.log2(sum));
  if (sum > 1) return 0;
  // Underflow: use the single most likely term as an upper bound on the tail.
  const lp =
    logBinom(T, k) + lb + logGamma(k + alpha) + logGamma(T - k + beta) -
    logGamma(T + alpha + beta);
  return Math.max(0, (-lp / LN2) - Math.log2(Math.max(1, T - k + 1)));
}

/**
 * Method-of-moments Beta fit to a set of rates, with the option to leave one
 * out. Leaving the subject out matters for small libraries, where a single
 * complete album would otherwise help set the very prior it is being tested
 * against.
 */
export function fitBeta(
  sumX: number, sumX2: number, n: number,
  omit?: { x: number },
): { alpha: number; beta: number } {
  let s = sumX, s2 = sumX2, m = n;
  if (omit) { s -= omit.x; s2 -= omit.x * omit.x; m -= 1; }
  if (m < 3) return { alpha: 1, beta: 1 };
  const mean = s / m;
  const varc = Math.max(1e-6, s2 / m - mean * mean);
  const mu = Math.min(1 - 1e-4, Math.max(1e-4, mean));
  const maxVar = mu * (1 - mu);
  if (varc >= maxVar * 0.999) return { alpha: 0.5, beta: 0.5 };
  const k = (mu * (1 - mu)) / varc - 1;
  return { alpha: Math.max(0.02, mu * k), beta: Math.max(0.02, (1 - mu) * k) };
}

/**
 * The bar a finding has to clear to be worth more than the search that found it.
 *
 * Ask a library N questions and the most extreme answer will carry about
 * log2(N) bits even when nothing whatever is going on — that is just the
 * expected maximum of N draws. So the honest bar is that bar plus a margin,
 * and it sets itself: a thirty-track library that supports forty questions
 * earns a lower one than a twenty-thousand-track library that supports four
 * thousand, without anybody choosing either number.
 *
 * This replaced a Benjamini–Hochberg cut, which had a pathology here. Some of
 * these nulls are fitted to the listener's own library, so the surprisal they
 * can express is capped near log2(albums held); BH asks for p ≤ q/N, which is
 * below that floor, and the whole family went silent. The expected-maximum bar
 * is on the same scale as the statistic it filters, so it cannot.
 */
export function searchBar(asked: number, strictness: number): number {
  if (asked <= 0) return Infinity;
  return Math.log2(asked) + Math.log2(1 / Math.max(1e-6, strictness));
}

/**
 * The bar actually used, which is the search bar with two corrections.
 *
 * The search bar assumes the questions are independent, and within a family
 * they are emphatically not — five thousand album coverages from one listener
 * are five thousand readings of the same habit. Correcting as though they were
 * independent demands more bits than a null fitted to that same listener can
 * ever express, and the largest library in the corpus lost its largest family
 * entirely: twelve hundred and fifty-seven questions asked, a bar of 12.3
 * bits, a ceiling of 10.5, nothing shown.
 *
 * So the bar is capped by the family's own upper quantile — the observations
 * are mostly null, which makes their own distribution the empirical null — and
 * floored at an absolute minimum so a quiet family cannot promote its best
 * unremarkable answer. Search correction where it is meaningful, the data's
 * own shape where it is not, and a floor under both.
 */
export function familyBar(
  bits: number[], strictness: number, tau: number, floor: number,
): number {
  if (bits.length === 0) return Infinity;
  const search = searchBar(bits.length, strictness);
  const sorted = [...bits].sort((a, b) => b - a);
  const idx = Math.min(sorted.length - 1, Math.floor(tau * sorted.length));
  const empirical = sorted[idx];
  return Math.max(floor, Math.min(search, empirical));
}

/** Bits in the upper tail of a standard normal. Abramowitz–Stegun 26.2.17. */
export function normalUpperBits(z: number): number {
  if (z <= 0) return 0;
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
               t * (-1.821255978 + t * 1.330274429))));
  const tail = d * poly;
  if (tail > 1e-300) return Math.max(0, -Math.log2(tail));
  return Math.max(0, (0.5 * z * z) / LN2 - Math.log2(z * 2.5066) );
}

/**
 * How far one member sticks out of the distribution it belongs to.
 *
 * A library's artists follow a long tail: a handful with many tracks, a great
 * many with one. The interesting fact is never "this artist has a lot", which
 * is true of whoever happens to be first — it is "this artist has more than
 * the artists immediately below them in your own library say anyone of yours
 * should".
 *
 * The fit is deliberately local — the forty ranks below the one being tested,
 * never the whole tail. A global fit has to extrapolate across the tail's
 * curvature to reach rank one, and it was wrong by enough to score a man with
 * nine hundred and seventy Grateful Dead tracks at zero. Forty neighbours
 * carry no curvature worth the name.
 *
 * Being fitted to the listener alone, this says the same thing whether the
 * corpus holds seven libraries or seven million.
 */
export function tailOutlierBits(
  countsDesc: number[], rank: number, band = 40,
): number {
  const n = countsDesc.length;
  const lo = rank;                       // zero-based index of rank+1
  const hi = Math.min(n, rank + band);
  if (hi - lo < 12) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (let i = lo; i < hi; i++) {
    const x = Math.log(i + 1), y = Math.log(Math.max(1, countsDesc[i]));
    sx += x; sy += y; sxx += x * x; sxy += x * y; m++;
  }
  const denom = m * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return 0;
  const b = (m * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / m;
  const res: number[] = [];
  for (let i = lo; i < hi; i++) {
    const x = Math.log(i + 1), y = Math.log(Math.max(1, countsDesc[i]));
    res.push(y - (a + b * x));
  }
  const med = (arr: number[]) => {
    const t = [...arr].sort((u, v) => u - v);
    const h = t.length >> 1;
    return t.length % 2 ? t[h] : (t[h - 1] + t[h]) / 2;
  };
  const c = med(res);
  // Robust scale: a least-squares sigma is inflated by exactly the outlier
  // being tested, so the spread comes from the median absolute deviation of
  // the band's own residuals, which the tested rank is not part of.
  const sigma = Math.max(0.05, 1.4826 * med(res.map((r) => Math.abs(r - c))));
  const pred = a + b * Math.log(rank);
  const z = (Math.log(Math.max(1, countsDesc[rank - 1])) - pred) / sigma;
  return normalUpperBits(z);
}

/**
 * Hypergeometric upper tail, in bits: two people drawing from one shelf.
 *
 * Overlap between libraries is sampling without replacement, and the binomial
 * gets it badly wrong at the top end. If two listeners each hold two hundred
 * and forty-one of a lane's two hundred and fifty recordings they are obliged
 * to share at least two hundred and thirty-two of them; a binomial treats the
 * same numbers as independent coin flips and reports the forced agreement as a
 * startling affinity. The hypergeometric knows the shelf is finite.
 */
export function hyperUpperBits(k: number, M: number, a: number, b: number): number {
  if (M <= 0 || a <= 0 || b <= 0) return 0;
  const hi = Math.min(a, b);
  if (k > hi) return 0;
  const mean = (a * b) / M;
  if (k <= mean) return 0;
  const lc = (n: number, r: number) =>
    r < 0 || r > n ? -Infinity : logGamma(n + 1) - logGamma(r + 1) - logGamma(n - r + 1);
  const denom = lc(M, b);
  let sum = 0;
  for (let j = k; j <= hi; j++) {
    const lp = lc(a, j) + lc(M - a, b - j) - denom;
    if (lp > -745) sum += Math.exp(lp);
  }
  if (sum > 1e-300 && sum <= 1) return Math.max(0, -Math.log2(sum));
  const lp = lc(a, k) + lc(M - a, b - k) - denom;
  return Math.max(0, -lp / LN2);
}

/**
 * Bits in "how many different things did they turn out to have".
 *
 * Draw k recordings from a shelf whose artists (or years) hold known shares,
 * and the number of distinct ones you end up touching has an expectation with
 * a closed form: each is either missed every time or not. Comparing the count
 * actually held against that expectation is what separates a listener who has
 * fifty-six reggae artists from one who has four reggae artists and a lot of
 * reggae — a distinction no amount of counting tracks will make.
 *
 * Both directions are meaningful, so this returns signed bits: positive for
 * broader than expected, negative for narrower.
 */
export function distinctCategoriesBits(
  shares: number[], k: number, observed: number,
): number {
  if (k <= 0 || shares.length === 0) return 0;
  let mean = 0, varc = 0;
  for (const s of shares) {
    if (s <= 0) continue;
    const pHit = 1 - Math.pow(1 - Math.min(1, s), k);
    mean += pHit; varc += pHit * (1 - pHit);
  }
  if (!(varc > 1e-9)) return 0;
  const z = (observed - mean) / Math.sqrt(varc);
  const bits = normalUpperBits(Math.abs(z));
  return z >= 0 ? bits : -bits;
}

/**
 * Signed bits for one point's departure from the relationship the other
 * points trace out, fitted in log-log and scaled robustly.
 *
 * Used where the right reference is the listener's own behaviour elsewhere:
 * how many artists their lanes usually carry for their size, say. The point
 * being tested is left out of its own fit, and the scale is a median absolute
 * deviation so a single strong outlier cannot widen the ruler it is measured
 * against.
 */
export function residualOutlierBits(
  xs: number[], ys: number[], i: number, minPoints = 8,
): number {
  const n = xs.length;
  if (n < minPoints + 1 || i < 0 || i >= n) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (let j = 0; j < n; j++) {
    if (j === i || xs[j] <= 0 || ys[j] <= 0) continue;
    const x = Math.log(xs[j]), y = Math.log(ys[j]);
    sx += x; sy += y; sxx += x * x; sxy += x * y; m++;
  }
  if (m < minPoints) return 0;
  const denom = m * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return 0;
  const b = (m * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / m;
  const res: number[] = [];
  for (let j = 0; j < n; j++) {
    if (j === i || xs[j] <= 0 || ys[j] <= 0) continue;
    res.push(Math.log(ys[j]) - (a + b * Math.log(xs[j])));
  }
  const med = (arr: number[]) => {
    const t = [...arr].sort((u, v) => u - v);
    const h = t.length >> 1;
    return t.length % 2 ? t[h] : (t[h - 1] + t[h]) / 2;
  };
  const c = med(res);
  const sigma = Math.max(0.12, 1.4826 * med(res.map((r) => Math.abs(r - c))));
  if (xs[i] <= 0 || ys[i] <= 0) return 0;
  const z = (Math.log(ys[i]) - (a + b * Math.log(xs[i]) + c)) / sigma;
  const bits = normalUpperBits(Math.abs(z));
  return z >= 0 ? bits : -bits;
}

/** Hypergeometric lower tail, in bits: fewer in common than the shelf forces. */
export function hyperLowerBits(k: number, M: number, a: number, b: number): number {
  if (M <= 0 || a <= 0 || b <= 0) return 0;
  const mean = (a * b) / M;
  if (k >= mean) return 0;
  const lo = Math.max(0, a + b - M);
  if (k < lo) return 0;
  const lc = (n: number, r: number) =>
    r < 0 || r > n ? -Infinity : logGamma(n + 1) - logGamma(r + 1) - logGamma(n - r + 1);
  const denom = lc(M, b);
  let sum = 0;
  for (let j = lo; j <= k; j++) {
    const lp = lc(a, j) + lc(M - a, b - j) - denom;
    if (lp > -745) sum += Math.exp(lp);
  }
  if (sum > 1e-300 && sum <= 1) return Math.max(0, -Math.log2(sum));
  const lp = lc(a, k) + lc(M - a, b - k) - denom;
  return Math.max(0, -lp / LN2);
}
