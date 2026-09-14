/**
 * Cards, in English.
 *
 * Every sentence names the people whose libraries the music came from, says
 * what the viewer already has that makes it relevant, and stops. The counts
 * are counts; nothing here describes what anyone likes, predicts what they
 * will like, or says "because you listen to". There is no template that could.
 *
 * Two surfaces from one set of facts — the feed line and the longer page text
 * are two functions over the same object, never two authors, so they cannot
 * disagree about a number.
 */
import type { Candidate } from "./candidates";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Chris", "Chris and Sahaj", "Chris, Sahaj and two others". */
function nameList(ids: string[], nameOf: (id: string) => string): string {
  const names = ids.map(nameOf);
  if (names.length === 0) return "someone here";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest === 1 ? "one other" : `${rest} others`}`;
}

export interface Rendered {
  title: string;
  byline: string;
  caption: string;
  detail: string;
}

export function render(c: Candidate, nameOf: (id: string) => string): Rendered {
  const f = c.facts as Record<string, never> & Record<string, number & string>;
  const n = (k: string) => Number(f[k]);
  const s = (k: string) => String(f[k]);
  const who = nameList(c.holders.slice(0, 3).map((h) => h.uid), nameOf);
  const top = c.holders[0];
  const topName = top ? nameOf(top.uid) : "someone here";
  const count = c.tracks.length;

  switch (c.family) {
    case "FINISH_THE_RECORD":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${plural(n("yours"), "track")} from this record. ${who} ${c.holders.length === 1 ? "has" : "have"} ${count} more.`,
        detail: `${s("album")} runs to ${n("total")} tracks and ${plural(n("yours"), "of them")} ${n("yours") === 1 ? "is" : "are"} already in your library. ${who} between them keep ${plural(count, "other track")} from it — ${topName} the most, with ${top?.count ?? 0}. This is the rest of a record you have already started.`,
      };

    case "DEEPER_ON_AN_ARTIST":
      return {
        title: s("artist"),
        byline: `${plural(count, "track")} from ${who}`,
        caption: `You have ${plural(n("yours"), "track")} by them. ${who} keep ${count} you don't.`,
        detail: `${plural(n("yours"), "track")} by ${s("artist")} ${n("yours") === 1 ? "is" : "are"} in your library, out of the ${n("records")} of their records anybody here holds. ${who} keep ${plural(count, "recording")} of theirs that you do not, ${topName} carrying ${top?.count ?? 0} of them.`,
      };

    case "THE_RECORD_YOU_SKIPPED":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${plural(n("yoursByArtist"), "track")} by ${s("artist")} and none from this one. ${who} ${c.holders.length === 1 ? "keeps" : "keep"} ${count} of it.`,
        detail: `You already hold ${plural(n("yoursByArtist"), "track")} by ${s("artist")}, but nothing at all from ${s("album")}${n("year") ? ` (${n("year")})` : ""}. ${who} keep ${plural(count, "track")} from it — ${topName} ${top?.count ?? 0} of them. A whole record by somebody already in your library that you have never opened.`,
      };

    case "NEW_IN_YOUR_LANE":
      return {
        title: s("artist"),
        byline: `kept by ${who}`,
        caption: `${n("friends")} of your friends keep ${s("artist")} and you have none. You have ${plural(n("yoursInLane"), "track")} of ${s("lane")}.`,
        detail: `${who} each keep ${s("artist")} independently — ${count} of their recordings are ones you do not have, ${topName} holding ${top?.count ?? 0}. You keep ${plural(n("yoursInLane"), "track")} of ${s("lane")}, which is where their work sits. Given how much of that lane each of your friends holds, you would expect about ${n("expected")} of them to have run into this artist at all.`,
      };

    case "WHAT_THEY_HAVE":
      return {
        title: s("lane"),
        byline: `from ${nameOf(s("other"))}`,
        caption: `You and ${nameOf(s("other"))} both live in ${s("lane")} — ${n("yours")} tracks and ${n("theirs")} — and share only ${n("shared")}.`,
        detail: `You keep ${plural(n("yours"), "track")} of ${s("lane")}; ${nameOf(s("other"))} keeps ${n("theirs")}. Between you, ${plural(n("shared"), "recording")} ${n("shared") === 1 ? "is" : "are"} the same. The same corner of music, found separately — these are ${plural(count, "track")} of theirs you have never had.`,
      };

    case "THEY_ALL_KEEP_IT":
      return {
        title: s("lane"),
        byline: `agreed on by ${who}`,
        caption: `${plural(count, "track")} of ${s("lane")} that ${n("minFriends")} of your friends all keep separately. You have none of them.`,
        detail: `Each of these ${plural(count, "recording")} sits in at least ${n("minFriends")} of your friends' libraries and in none of yours. You keep ${plural(n("yours"), "track")} of ${s("lane")} already. Nobody compared notes — this is what several people arrived at on their own.`,
      };

    case "SINCE_YOU_STOPPED":
      return {
        title: s("artist"),
        byline: `${n("lastYear")} onwards, from ${who}`,
        caption: `Your ${s("artist")} stops at ${n("lastYear")}. ${who} ${c.holders.length === 1 ? "has" : "have"} ${count} from after it.`,
        detail: `You keep ${plural(n("yours"), "track")} by ${s("artist")}, and the most recent was released in ${n("lastYear")}. ${who} hold ${plural(count, "recording")} of theirs that came out later, the latest in ${n("latestYear")} — ${topName} has ${top?.count ?? 0}. Release dates rather than save dates: this is where their catalogue stops in your library.`,
      };

    default:
      return { title: c.subject.label, byline: "", caption: "", detail: "" };
  }
}
