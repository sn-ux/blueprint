/**
 * THE PEOPLE SHOWN ON A CARD MUST BE EXACTLY THE PEOPLE IT CLAIMS AS EVIDENCE.
 *
 *   node --import ./scripts/register.mjs scripts/validate-card-evidence.mjs
 *
 * Run on the FeedCard the phone actually receives, so it covers the adapter as
 * well as the generator. It exists because a card once read "Chris is the only
 * person here with Common" while showing Chris's avatar and Sahaj's: the
 * sentence was built from one rule and the avatars recomputed from another,
 * and the sentence was the one that was wrong — Sahaj has a Common track.
 */
import { loadCorpus } from "../lib/discovery/corpus.ts";
import { observe, buildReference, buildProfile } from "../lib/discovery/observe/observe.ts";
import { toFeedCard } from "../lib/discovery/observe/cards.ts";
import { prisma } from "../lib/prisma.ts";
const { people, tracks } = await loadCorpus();
const byId = new Map(people.map(p=>[p.id,p]));
const nameOf=id=>byId.get(id)?.name??id.slice(0,6);
const short=n=>n.includes(" ")?n.split(" ")[0]:n;
const ref = buildReference(tracks);
const fails={}; const note=(k,e)=>{(fails[k]??={n:0,ex:[]}).n++; if(fails[k].ex.length<3)fails[k].ex.push(e);};
let total=0;

for (const uid of [...new Set(tracks.map(t=>t.userId))]) {
  const r = observe(ref, buildProfile(uid,tracks,ref), {});
  r.candidates.forEach((c,i)=>{
    total++;
    const card = toFeedCard(ref, c, uid, byId, i+1);
    const evidence = new Set(c.holders.map(h=>h.uid));
    const text = `${card.caption} ${card.detailExplanation} ${card.byline}`;

    // 1. sources are exactly the evidence set
    const src = new Set(card.sources.map(s=>s.id));
    if (src.size !== evidence.size || [...evidence].some(u=>!src.has(u)))
      note("card.sources != evidence set", `${c.family}: sources[${[...src].map(nameOf)}] evidence[${[...evidence].map(nameOf)}]`);

    // 2. nobody on a track row who is not evidence
    for (const t of card.previewTracks) for (const f of t.friends)
      if (!evidence.has(f.id)) note("a track row shows a non-evidence person", `${c.family}: ${nameOf(f.id)} on "${t.name}"`);

    // 3. the viewer never appears as their own friend
    if (evidence.has(uid) || src.has(uid)) note("viewer listed as their own source", c.family);
    for (const t of card.previewTracks) for (const f of t.friends)
      if (f.id === uid) note("viewer on their own track row", c.family);

    // 4. every person named in the sentence is evidence
    for (const [pid, p] of byId) {
      if (pid === uid) continue;
      const nm = short(p.name ?? "");
      if (!nm || nm.length < 3) continue;
      if (new RegExp(`\\b${nm}\\b`).test(text) && !evidence.has(pid))
        note("caption names a non-evidence person", `${c.family}: names ${nm}, evidence[${[...evidence].map(nameOf)}] — "${card.caption}"`);
    }

    // 5. an exclusivity claim requires exactly one holder
    if (/\bis the only (person|one) here with\b/i.test(text) && evidence.size !== 1)
      note("claims exclusivity with several holders", `${c.family}: ${evidence.size} holders — "${card.caption}"`);

    // 6. "every one of your friends" must mean every one
    if (/every other library/i.test(text) && evidence.size !== ref.users.length - 1)
      note("claims unanimity without everyone", `${c.family}: ${evidence.size} of ${ref.users.length-1}`);
  });
}
console.log(`checked ${total} cards end to end\n`);
const ks=Object.keys(fails);
if (!ks.length) console.log("INVARIANT HOLDS — every card shows exactly the people it claims");
for (const k of ks) { console.log(`✗ ${fails[k].n}  ${k}`); for(const e of fails[k].ex) console.log(`      ${e}`); }
await prisma.$disconnect();
