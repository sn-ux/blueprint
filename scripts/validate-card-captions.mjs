/**
 * Every number and every verb on a card has to describe that card.
 *
 *   node --import ./scripts/register.mjs scripts/validate-card-captions.mjs
 *
 * Assertions rather than reading, because reading missed three real defects
 * across a quarter of the cards.
 */
import { loadCorpus } from "../lib/discovery/corpus.ts";
import { observe, buildReference, buildProfile } from "../lib/discovery/observe/observe.ts";
import { render } from "../lib/discovery/observe/claims.ts";
import { prisma } from "../lib/prisma.ts";
const { people, tracks } = await loadCorpus();
const nameOf=id=>people.find(p=>p.id===id)?.name??id.slice(0,6);
const short=(x)=>x.includes(' ')?x.split(' ')[0]:x;
const ref = buildReference(tracks);
const uids=[...new Set(tracks.map(t=>t.userId))];
const fails={};
const note=(k,ex)=>{ (fails[k] ??= {n:0,ex:[]}).n++; if(fails[k].ex.length<2) fails[k].ex.push(ex); };
let total=0;
for (const uid of uids) {
  const r = observe(ref, buildProfile(uid,tracks,ref), {});
  for (const c of r.candidates) {
    total++;
    const t = render(c, nameOf);
    const text = `${t.caption} ${t.detail}`;
    const names = c.holders.map(h=>short(nameOf(h.uid)));

    // 1. "one other"/"N others" must only appear when names are genuinely hidden
    if (/\bone other\b/.test(text) && c.holders.length <= 3) note("says 'one other' with <=3 holders", t.caption);
    const m = /and (\d+) others/.exec(text);
    if (m && c.holders.length - 2 !== Number(m[1])) note("'N others' disagrees with holder count", t.caption);

    // 2. every named holder must actually be a holder
    const ONE_PERSON = new Set(["WHAT_THEY_HAVE","ONLY_ONE_FRIEND_HAS_IT","A_SCENE_YOU_TOUCHED"]);
    if (!ONE_PERSON.has(c.family))
      for (const nm of names.slice(0,3)) if (!text.includes(nm)) note(`holder not named — ${c.family}`, `${t.caption} [${names.join("|")}]`);

    // 3. verb agreement, checked only where a holder name governs the verb
    for (const nm of names) {
      const re = new RegExp(`${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(keep|have)\\b`);
      if (c.holders.length === 1 && re.test(text)) note("plural verb after a single holder", t.caption);
    }
    if (c.holders.length > 1 && !ONE_PERSON.has(c.family)) {
      const re = new RegExp(`${names[names.length-1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(keeps|has)\\b`);
      if (re.test(text)) note("singular verb after several holders", t.caption);
    }

    // 4. the count the caption promises must equal what the card opens
    const opens = c.tracks.length;
    const nums = [...t.caption.matchAll(/(\d+)\s+(?:more|you don't|of it|from after it|tracks? of)/g)].map(x=>Number(x[1]));
    const ok = new Set([opens, c.connection.yours, ...Object.values(c.facts).filter(v=>typeof v==="number")]);
    for (const v of nums) if (!ok.has(v)) note("caption number traces to no fact on the card", `${t.caption} [opens=${opens}]`);

    // 5. holder depth quoted in detail must not exceed the payload
    const d = /with (\d+)\./.exec(t.detail) ?? /has (\d+)\./.exec(t.detail);
    if (d && Number(d[1]) > opens) note("a holder is quoted holding more than the card contains", t.detail.slice(0,160));

    // 6. a share can never exceed the set it is a share of
    if (c.family === "WHAT_THEY_HAVE") {
      if (Number(c.facts.shared) > Number(c.facts.theirs))
        note("shares more than the other person has", t.caption);
      if (Number(c.facts.available) + Number(c.facts.shared) !== Number(c.facts.theirs))
        note("shared + available does not equal their holdings", `${t.caption} [${c.facts.shared}+${c.facts.available}!=${c.facts.theirs}]`);
    }
    if (c.family === "FINISH_THE_RECORD" && Number(c.facts.yours) > Number(c.facts.total))
      note("holds more of a record than it has tracks", t.caption);

    // 7. friend-count claims must match the holders actually listed
    const f = /^(\d+) of your friends/.exec(t.caption);
    if (f && Number(f[1]) !== c.holders.length) note("'N of your friends' disagrees with the holders", `${t.caption} [holders=${c.holders.length}]`);
  }
}
console.log(`audited ${total} cards\n`);
const keys=Object.keys(fails);
if (!keys.length) console.log("no caption defects found");
for (const k of keys) { console.log(`✗ ${fails[k].n}  ${k}`); for(const e of fails[k].ex) console.log(`      ${e}`); }
await prisma.$disconnect();
