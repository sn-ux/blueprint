/**
 * The captions, written by a model that already knows the music.
 *
 * Everything else in this directory tries to assemble a description of a record
 * out of stored facts. That works for identity and dates and stops well short
 * of what a caption needs: knowing that Peter Green's Fleetwood Mac is a
 * different band from Stevie Nicks's, or that Hôtel Costes was a hotel bar.
 * A model carries that already. What it cannot know is the listener, so that is
 * the only thing this file is careful about — what they keep, what they play,
 * and which of it actually sits near the card.
 *
 * The house style is carried by ten captions written by hand. They are the
 * specification, not a template, and they go in the system prompt once per
 * batch rather than once per card.
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

/** Per-page, so one batch of cards is one request. */
const MODEL = process.env.BLUEPRINT_CAPTION_MODEL ?? "claude-sonnet-5";
/**
 * A ceiling for a deliberate test, not a working limit.
 *
 * This used to trim the card list on the way in, so a page of twenty-four went
 * to the writer as four and the other twenty vanished without a word. Nothing
 * is dropped quietly now: whatever is skipped is named in the log and handed
 * back to the caller as a failure.
 */
const MAX_CARDS = Number(process.env.BLUEPRINT_CAPTION_LIMIT ?? 0) || null;
/**
 * How many captions one request may carry.
 *
 * One. Latency tracks output tokens almost exactly — fourteen to sixteen
 * milliseconds each, on top of about a quarter second of fixed cost — so four
 * captions in a reply meant seven hundred tokens and ten to twelve seconds,
 * and the page waited on whichever group drew the longest straw. A single
 * caption is a hundred and ninety tokens and three seconds, and the cards are
 * written alongside each other rather than in queues of four.
 */
const BATCH = 1;

/**
 * How many of those may be in flight at once.
 *
 * A page of twenty-four could open twenty-four connections at the same moment,
 * which is a good way to meet a rate limit. Twelve runs the page as two waves
 * and still costs a fraction of what four-card groups did.
 */
const CONCURRENCY = 12;

/** Run tasks with a ceiling on how many are in flight, keeping each outcome. */
async function inWaves<T>(
  tasks: (() => Promise<T>)[], width: number,
): Promise<PromiseSettledResult<T>[]> {
  const out = new Array<PromiseSettledResult<T>>(tasks.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(width, tasks.length) }, async () => {
    for (let i = next++; i < tasks.length; i = next++) {
      try { out[i] = { status: "fulfilled", value: await tasks[i]() }; }
      catch (reason) { out[i] = { status: "rejected", reason }; }
    }
  });
  await Promise.all(runners);
  return out;
}

export interface ListenerContext {
  /** Their commonest Spotify genres, commonest first. */
  genres: string[];
  /** Artist name → how much of them they keep. Used to pick what to mention. */
  holdings: Map<string, number>;
  /** Which Spotify genres each artist of theirs belongs to. */
  genresOfArtist: Map<string, Set<string>>;
  /** Present only for listeners who granted the extra scopes. */
  topArtists: string[];
  recentArtists: string[];
}

export interface CaptionCard {
  id: string;
  type: "ARTIST" | "ALBUM" | "GENRE";
  subject: string;
  artist: string | null;
  lane: string | null;
  /** How the card's own subject is filed. Empty for a genre card, whose
   * subject is the genre itself. */
  cardGenres: string[];
  /**
   * The listener's existing lane that put this card in front of them.
   *
   * On a genre card this is emphatically not what the card is about: the card
   * "you like afrobeat, so here is anti-folk" carries anti-folk as its subject
   * and afrobeat as its anchor, and describing the anchor gets you a caption
   * about Afrobeat sitting under a heading that says Anti-folk.
   *
   * Null when there is no anchor distinct from the subject — a card headed Rap
   * whose lane is also rap has none, and telling the writer not to describe rap
   * on a card about rap left it nothing to write about at all.
   */
  anchor: string | null;
  /**
   * What is actually on the card.
   *
   * A genre card used to arrive as a bare heading, so a Rap card built from
   * Kanye, Travis Scott, Drake and J. Cole was described as Pusha T — true of
   * the listener, true of rap, and not on the card. The records here are what
   * the caption is about; everything below them is only for connecting that
   * music to the person reading.
   */
  contents?: { artists: string[]; tracks: string[] };
  /** Years of the card's tracks, for a rough sense of period. */
  years: number[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const SYSTEM = `You write the one-paragraph caption that appears under a music recommendation card in Blueprint, a music discovery app. You are writing to one specific listener about one specific artist, album or genre.

Use your own knowledge of music. The card data tells you what the subject is and what this listener already keeps; the facts about the music itself come from you.

These ten captions are the standard. Match their voice, density and level of explanation. Do not copy their sentence structure.

1. "Atomic Forest were a psychedelic rock band from Bombay in the 1970s, playing heavy psych and funk in India's tiny rock scene. If you like Jimi Hendrix, Cream and the psychedelic side of The Beatles alongside Indian artists in your library, Atomic Forest sit right at that intersection. It's '70s psych from a scene you've barely touched."
2. "Richard Wright was Pink Floyd's keyboardist from 1965 through their major '70s albums, and released his first solo record, Wet Dream, in 1978. If you like Pink Floyd, King Crimson and the more atmospheric side of progressive rock, Wright strips that sound down to piano, organ and long instrumental passages. Wet Dream feels less like another prog record and more like following one part of that sound to its source."
3. "Peter Cat Recording Co. formed in Delhi in 2009, mixing psychedelic rock with jazz, soul and Indian indie. If you like Mac DeMarco and Khruangbin alongside the Indian artists in your library, Peter Cat sits somewhere between those worlds. There isn't much else in your library that combines them in the same record."
4. "John Roseboro is a contemporary Haitian-American songwriter making bossa nova around nylon-string guitar and jazz harmony. If you like João Gilberto, Antônio Carlos Jobim and the softer jazz records in your library, Roseboro starts from the same musical language but writes from the present. It's bossa nova without going back to another Brazilian record from the '60s."
5. "Orlando Julius was a Nigerian saxophonist who began mixing highlife with jazz, soul and funk in the 1960s, just before Afrobeat emerged as its own sound. If you like Fela Kuti and Tony Allen alongside American funk and jazz artists in your library, Julius is one of the musicians who connects those histories. You can hear Afrobeat before its ingredients had fully settled into Afrobeat."
6. "Luiz Bonfá was a Brazilian guitarist and composer who became one of the major figures in early bossa nova during the 1950s and '60s. If you like João Gilberto, Antônio Carlos Jobim and Stan Getz, Bonfá comes from the same generation but puts much more of the weight on the guitar itself. It's a different way into a Brazilian scene you already spend a lot of time in."
7. "Shigeo Sekito made his Special Sound Series in Japan in the 1970s around the Electone, an early electronic organ. If you like Herbie Hancock and other keyboard-heavy jazz alongside the stranger instrumental records in your library, Sekito has familiar jazz harmony underneath a completely different set of sounds. The Electone makes the whole thing feel slightly alien."
8. "Colomach were a West African group making psychedelic music in the 1970s, combining regional rhythms with funk and heavy electric guitar. If you like Fela Kuti and Tony Allen alongside Hendrix and the funkier psychedelic records in your library, Colomach fall between those camps. The connection is there, but the music comes out of a West African psych scene you haven't explored much."
9. "Mamie Smith became one of the first major Black recording stars with 'Crazy Blues' in 1920. If you like Muddy Waters, Howlin' Wolf and the later blues artists in your library, Smith lets you hear the music decades before the electric styles they became known for. It's the same family tree much closer to the trunk."
10. "Grizzly Bear formed in Brooklyn in 2002, making indie rock out of vocal harmonies, acoustic instruments and dense psychedelic production. If you like Radiohead and Fleet Foxes alongside the more psychedelic artists in your library, Grizzly Bear occupy the space between them. Their songs are approachable; the arrangements are where they get strange."

Rules:
- Open by saying plainly what the artist, album or genre is, and work in a year, decade or period naturally. Never omit the date.
- Connect it to specific music this listener actually has. Name their artists.
- Keep the musical relationship accurate and restrained. Never manufacture an influence, a lineage, a causal claim or a technical mechanism to make the connection sound stronger. "Comes from the same scene", "sits between those two", "shares that starting point" are all fine when that is the truth. Do not write that one artist made another possible.
- End on something genuinely interesting about the music when there is such a thing — a detail about the record that would make someone curious. If there is no worthwhile third thought, stop after two sentences. Never invent a payoff to fill the shape.
- Roughly 45-65 words. Plain English, short sentences, understandable on one read.
- Never mention counts, numbers of tracks, scores, rankings, other users, databases, algorithms or Blueprint itself.
- No generic endings like "this fills a gap in your library".
- Do not use the same sentence pattern across captions in a batch. Vary the openings.
- If you are not confident a fact is true, leave it out. A shorter accurate caption beats a richer uncertain one.
- When the listener already owns the subject, do not pretend it is new to them. Write about where to go next within it.

Return a JSON array, one object per card, in the order given: [{"id": "<the card's id>", "caption": "<the caption>"}]. Return only the JSON.`;

/** The listener facts that actually bear on one card. Exported so the
 * exact model input can be inspected without making a request. */
export function contextFor(card: CaptionCard, who: ListenerContext): string {
  const related = new Set([...card.cardGenres, card.anchor ?? "", card.lane ?? ""]
    .filter(Boolean).map((g) => g.toLowerCase()));
  const near: string[] = [];
  for (const [artist, n] of [...who.holdings].sort((a, b) => b[1] - a[1])) {
    if (norm(artist) === norm(card.artist ?? card.subject)) continue;
    const gs = who.genresOfArtist.get(norm(artist));
    if (gs && [...gs].some((g) => related.has(g.toLowerCase()))) near.push(artist);
    if (near.length >= 8) break;
  }
  const ownsKey = norm(card.artist ?? card.subject);
  const owns = (who.holdings.get([...who.holdings.keys()]
    .find((k) => norm(k) === ownsKey) ?? "") ?? 0) > 0;

  const years = card.years.length
    ? `${card.years[0]}–${card.years[card.years.length - 1]}`
    : null;

  const lines = [
    `id: ${card.id}`,
    `WRITE ABOUT — ${card.type}: ${card.subject}` +
      `${card.artist && card.type === "ALBUM" ? ` by ${card.artist}` : ""}`,
    card.cardGenres.length ? `filed as: ${card.cardGenres.slice(0, 4).join(", ")}` : null,
    // What the card holds, which is the authority on what the caption is about.
    card.contents?.artists.length
      ? `the music on this card: ${card.contents.artists.join(", ")}` : null,
    card.contents?.tracks.length
      ? `for example: ${card.contents.tracks.join(" · ")}` : null,
    /**
     * The level of abstraction, which a genre card gets wrong on its own.
     *
     * Every one of the ten benchmarks is about a single act, so the pull is
     * always toward writing about one — and the earlier wording only forbade
     * an artist who was *not* on the card, which left "write the whole of old
     * school hip hop as a 2Pac caption" expressly permitted. Naming the genre
     * as the subject is what stops that.
     */
    card.contents?.artists.length
      ? `The subject is ${card.subject} itself — the music gathered on this card taken `
        + `together, not any one of these artists or records. Use two or three of them `
        + `as examples where that helps, and say what actually links them: a period, a `
        + `place, a scene, a way the records were made. Never let a single artist or `
        + `album become what the caption is about, and never write about an artist who `
        + `is not on this card. The listener notes below are only for connecting this `
        + `music to them.`
      : null,
    card.anchor ? `they already like: ${card.anchor} — this is the reason the card ` +
      `was raised, not its subject. Do not describe ${card.anchor}.` : null,
    years ? `recordings here span: ${years}` : null,
    near.length ? `their artists in this area: ${near.join(", ")}` : null,
    `their listening overall: ${who.genres.slice(0, 8).join(", ")}`,
    who.topArtists.length ? `they play most: ${who.topArtists.slice(0, 8).join(", ")}` : null,
    who.recentArtists.length ? `recently played: ${who.recentArtists.slice(0, 6).join(", ")}` : null,
    owns ? `NOTE: they already own music by this subject.` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * A caption has to put the music somewhere in time. This is how people write
 * that down.
 *
 * The old pattern wanted a bare four-digit year or a standalone "90s" and
 * nothing else, so "the 1990s", "the mid-2000s" and "the '90s" were all read as
 * undated — a word boundary cannot fall between the 0 and the s of 2000s, nor
 * before the apostrophe of '90s. The requirement is unchanged; what changed is
 * that the validator now recognises the English for it.
 */
const DATED = /(?<!\d)(?:1[89]\d{2}|20\d{2})s?\b|(?<!\w)'?\d{2}s\b/;

/**
 * Talking like a recommender system, which a caption must never do.
 *
 * Narrowed from single words to the phrasings that actually give the machinery
 * away. "score" on its own threw out every caption about a film composer, which
 * is most of what we can say about Hans Zimmer or Thomas Newman, and "ranked"
 * caught "ranked among Atlanta's best". A match score is still banned; a film
 * score is a film score.
 */
const MACHINE = new RegExp([
  String.raw`\b(?:algorithm(?:ic|s)?|database|Blueprint)\b`,
  String.raw`\b(?:match|similarity|confidence|relevance|compatibility)\s+scores?\b`,
  String.raw`\brank(?:ed|ing)\s+(?:by|according\s+to)\b`,
  String.raw`\byour\s+library\s+has\s+\d`,
  String.raw`\bbased\s+on\s+your\s+(?:listening|library|taste|history)\b`,
  String.raw`\bwe\s+recommend\b`,
  String.raw`\brecommended\s+for\s+you\b`,
  String.raw`\bthis\s+recommendation\b`,
].join("|"), "i");

/**
 * Why a caption was refused, or null when it stands.
 *
 * Every condition here is the one acceptable() already applied, in the same
 * order — this only gives each of them a name. A caption without a date is
 * still refused: the standard asks for one and a caption that cannot say when
 * is not the caption we approved. What was wrong was losing it in silence.
 */
export function rejection(text: string): string | null {
  if (!text) return "empty";
  const words = text.trim().split(/\s+/).length;
  if (words < 25) return `too short (${words} words)`;
  if (words > 95) return `too long (${words} words)`;
  if (!DATED.test(text)) return "no date in it";
  if (MACHINE.test(text)) return "algorithm or database language";
  if (/fills? (a|the) gap|missing from your library|something your library/i.test(text)) {
    return "generic library-gap ending";
  }
  return null;
}

/** Anything that reads like the failures we have already been through. */
function acceptable(text: string): boolean {
  return rejection(text) === null;
}

/** One request: a handful of cards, parsed on its own. */
async function writeGroup(
  client: Anthropic, group: CaptionCard[], who: ListenerContext,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const user = group.map((c) => contextFor(c, who)).join("\n\n---\n\n");
  const t0 = Date.now();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    /**
     * No reasoning. Writing a caption is a short constrained job, and the model
     * was spending the whole four thousand token budget deliberating about four
     * of them: one call came back as a single thinking block, no captions in it
     * at all, forty-eight seconds gone. Thinking counts against max_tokens, so
     * turning it off is both the truncation fix and the latency fix.
     */
    thinking: { type: "disabled" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Write a caption for each card.\n\n${user}` }],
  });
  const ms = Date.now() - t0;
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const open = text.indexOf("[");
  const close = text.lastIndexOf("]");

  /**
   * What the call actually did, rather than what we assume it did.
   *
   * A group of four captions is about 350 tokens of JSON and was still coming
   * back with an unterminated array after fifty seconds, so the interesting
   * number is whatever else the model spent the budget on. The whole usage
   * object is printed rather than picked over, because a field we do not know
   * to look for is exactly the one that would explain this.
   */
  console.log(`[caption:probe] ${group.length} cards · ${ms}ms`
    + ` · asked for "${MODEL}" · served by "${res.model}"`
    + ` · stop_reason=${res.stop_reason}`
    + ` · blocks=[${res.content.map((b) => b.type).join(", ")}]`
    + ` · usage=${JSON.stringify(res.usage)}`
    + ` · textChars=${text.length}`
    + ` · charsBeforeArray=${open < 0 ? "no array at all" : open}`
    + ` · closed=${close > open}`
    + ` · preamble=${JSON.stringify(text.slice(0, open < 0 ? 220 : Math.min(open, 220)))}`
    + ` · tail=${JSON.stringify(text.slice(-160))}`);

  if (open < 0 || close <= open) throw new Error("the reply held no complete array");
  /**
   * Every card handed to this group leaves it either written or explained.
   *
   * Six conditions could drop a caption and none of them used to say so, which
   * is how a page came back fifteen of twenty-four with no record of the other
   * nine anywhere — not in the log, not in the response, not in the database.
   */
  const asked = new Set(group.map((c) => c.id));
  const seen = new Set<string>();
  const dropped: string[] = [];

  for (const row of JSON.parse(text.slice(open, close + 1)) as { id: string; caption: string }[]) {
    if (!row?.id) { dropped.push("(row with no id)"); continue; }
    seen.add(row.id);
    if (!asked.has(row.id)) { dropped.push(`${row.id}: not a card we asked for`); continue; }
    if (typeof row.caption !== "string") { dropped.push(`${row.id}: caption was not text`); continue; }
    const why = rejection(row.caption);
    if (why) { dropped.push(`${row.id}: ${why} — ${JSON.stringify(row.caption.slice(0, 90))}`); continue; }
    out.set(row.id, row.caption.trim());
  }
  for (const c of group) {
    if (!seen.has(c.id)) dropped.push(`${c.id}: the model left it out of the reply`);
  }
  if (dropped.length) console.warn(`[caption] unwritten — ${dropped.join(" | ")}`);
  return out;
}

/**
 * Captions for one page of cards, or null for any the model declined or
 * fumbled. A null means the caller keeps whatever caption the card arrived
 * with, so a bad batch degrades to the built-in prose rather than to nothing.
 *
 * The groups run together and are kept or lost one at a time: a reply that
 * arrives truncated costs its own four captions and none of the others.
 */
export async function writeCaptions(
  cards: CaptionCard[], who: ListenerContext,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!process.env.ANTHROPIC_API_KEY || !cards.length) return out;

  // Every card given is a card written, unless a test cap says otherwise — and
  // then it says so out loud.
  const batch = MAX_CARDS ? cards.slice(0, MAX_CARDS) : cards;
  if (batch.length < cards.length) {
    console.warn(`[caption] BLUEPRINT_CAPTION_LIMIT=${MAX_CARDS} is holding back `
      + `${cards.length - batch.length} of ${cards.length} cards: `
      + cards.slice(batch.length).map((c) => c.id).join(", "));
  }

  const client = new Anthropic();
  const groups: CaptionCard[][] = [];
  for (let i = 0; i < batch.length; i += BATCH) groups.push(batch.slice(i, i + BATCH));

  const settled = await inWaves(groups.map((g) => () => writeGroup(client, g, who)), CONCURRENCY);
  for (const [i, r] of settled.entries()) {
    if (r.status === "fulfilled") { for (const [k, v] of r.value) out.set(k, v); }
    else {
      console.error(`[caption] group ${i + 1}/${groups.length} lost `
        + `(${groups[i].map((c) => c.id).join(", ")}):`, r.reason);
    }
  }
  return out;
}


/**
 * What this listener keeps, plays and has played lately.
 *
 * Read once per page of cards rather than once per card. Top artists and
 * recent plays are simply absent for anyone who has not granted those scopes,
 * which is the normal case and not an error — the caption then leans on the
 * library alone.
 */
export async function loadListener(userId: string): Promise<ListenerContext> {
  const [rows, top, plays] = await Promise.all([
    prisma.track.findMany({ where: { userId }, select: { artist: true, rawGenre: true } }),
    prisma.topArtist.findMany({ where: { userId }, orderBy: { rank: "asc" }, take: 20, select: { name: true } })
      .catch(() => [] as { name: string }[]),
    prisma.playEvent.findMany({ where: { userId }, orderBy: { playedAt: "desc" }, take: 25, select: { artist: true } })
      .catch(() => [] as { artist: string }[]),
  ]);

  const holdings = new Map<string, number>();
  const genresOfArtist = new Map<string, Set<string>>();
  const genreCount = new Map<string, number>();
  for (const t of rows) {
    if (!t.artist) continue;
    holdings.set(t.artist, (holdings.get(t.artist) ?? 0) + 1);
    if (t.rawGenre && t.rawGenre !== "unknown") {
      genreCount.set(t.rawGenre, (genreCount.get(t.rawGenre) ?? 0) + 1);
      const k = norm(t.artist);
      if (!genresOfArtist.has(k)) genresOfArtist.set(k, new Set());
      genresOfArtist.get(k)!.add(t.rawGenre);
    }
  }
  return {
    genres: [...genreCount].sort((a, b) => b[1] - a[1]).map(([g]) => g),
    holdings, genresOfArtist,
    topArtists: [...new Set(top.map((a) => a.name))],
    recentArtists: [...new Set(plays.map((p) => p.artist))],
  };
}
