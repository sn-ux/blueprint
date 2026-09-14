/**
 * Cards, in English that someone would actually say.
 *
 * Every sentence names the people the music came from and what the listener
 * already has that makes it theirs to hear. The counts are counts and the
 * names are names; nothing here describes taste, predicts it, or says
 * "because you listen to".
 *
 * Three habits, learned by reading the output rather than by writing it:
 *
 * A pluralising helper must never be handed a phrase. `plural(14, "more")`
 * produced "14 mores" and `plural(3, "of them")` produced "3 of thems",
 * because the helper appends to whatever it is given. It takes bare nouns now.
 *
 * Artist names carry their own articles. "Your The Beatles stops in 1973" is
 * what happens when a name is dropped into a possessive slot, so the sentences
 * are built to put names where names go.
 *
 * And a detail that does not discriminate should not be there: "Chris the most
 * of anyone with 6" is noise when the card holds 6 and Chris has all of them.
 * The clause appears only when somebody's share is genuinely worth singling
 * out.
 */
import type { Candidate } from "./candidates";

/** Pluralise a bare noun. Never hand this a phrase — see the note above. */
const pluralise = (one: string) =>
  (/[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies`
    : /(s|x|z|ch|sh)$/.test(one) ? `${one}es`
    : `${one}s`);
const plural = (n: number, one: string, many = pluralise(one)) =>
  `${n} ${n === 1 ? one : many}`;
const verb = (n: number, singular: string, plural_: string) => (n === 1 ? singular : plural_);
const is = (n: number) => (n === 1 ? "is" : "are");
/** Two people both do a thing; three or more all do it. */
const bothOrAll = (n: number) => (n === 2 ? "both" : "all");

/** First names, because these are the listener's friends and not a directory. */
const shortName = (full: string) => (full.includes(" ") ? full.split(" ")[0] : full);

/** "Chris", "Chris and Sahaj", "Chris, Sahaj and Ethan", "… and 2 others". */
function nameList(ids: string[], nameOf: (id: string) => string): string {
  const names = ids.map((id) => shortName(nameOf(id)));
  if (names.length === 0) return "someone here";
  if (names.length === 1) return names[0];
  if (names.length <= 4) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
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
  const who = nameList(c.holders.map((h) => h.uid), nameOf);
  const nFriends = c.holders.length;
  const top = c.holders[0];
  const topName = top ? shortName(nameOf(top.uid)) : "someone here";
  const count = c.tracks.length;
  const has = verb(nFriends, "has", "have");

  /**
   * Who carries most of it — but only when that is news. With one friend it
   * is the whole card, and when the leader holds everything it says nothing.
   */
  const leader = (nFriends > 1 && top && top.count < count)
    ? `, most of them ${topName}'s`
    : "";
  const between = nFriends > 1 ? " between them" : "";

  switch (c.family) {
    case "FINISH_THE_RECORD":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${plural(n("yours"), "track")} from this record. ${who} ${has} ${count} more.`,
        detail: `${s("album")} runs to ${plural(n("total"), "track")}, and ${n("yours")} of them ${is(n("yours"))} already yours. ${who} ${has} ${count} of the rest${between}${leader}. This is the remainder of a record you have already started.`,
      };

    case "DEEPER_ON_AN_ARTIST":
      return {
        title: s("artist"),
        byline: `${plural(count, "track")} from ${who}`,
        caption: `You have ${plural(n("yours"), "track")} by ${s("artist")}. ${who} ${has} ${count} more.`,
        detail: `Your library holds ${plural(n("yours"), "track")} by ${s("artist")}. ${who} ${has}${between} ${plural(count, "other recording")} of theirs${leader}. Across the ${plural(n("records"), "record")} of theirs anyone here owns, this is what has not reached you.`,
      };

    case "THE_RECORD_YOU_SKIPPED":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${plural(n("yoursByArtist"), "track")} by ${s("artist")} and none from this record. ${who} ${has} ${count} of it.`,
        detail: `Your library holds ${plural(n("yoursByArtist"), "track")} by ${s("artist")}, and not one of them comes from ${s("album")}${n("year") ? `, released in ${n("year")}` : ""}. ${who} ${has} ${plural(count, "track")} from it${leader}. A whole record by someone you already listen to, still unopened.`,
      };

    case "NEW_IN_YOUR_LANE":
      return {
        title: s("artist"),
        byline: `from ${who}`,
        caption: `${who} ${bothOrAll(nFriends)} ${verb(nFriends, "has", "have")} ${s("artist")}. You have ${plural(n("yoursInLane"), "track")} of ${s("lane")} and nothing of theirs.`,
        detail: `${who} arrived at ${s("artist")} separately, and ${has} ${plural(count, "recording")} you do not${leader}. That work sits in ${s("lane")}, where your own library runs to ${plural(n("yoursInLane"), "track")} — deep enough that this is a name you might have expected to meet by now, and have not.`,
      };

    case "WHAT_THEY_HAVE": {
      const them = shortName(nameOf(s("other")));
      return {
        title: s("lane"),
        byline: `from ${them}`,
        caption: `Of ${them}'s ${plural(n("theirs"), "track")} of ${s("lane")}, you share ${n("shared")}. These ${count} never reached you.`,
        detail: `You have ${plural(n("yours"), "track")} of ${s("lane")} and ${them} has ${n("theirs")}; ${n("shared")} of them ${is(n("shared"))} the same recording. The same corner of music, found twice over without either of you comparing notes — and ${plural(count, "track")} of ${them}'s that never reached you.`,
      };
    }

    case "THEY_ALL_KEEP_IT":
      return {
        title: s("lane"),
        byline: `agreed on by ${who}`,
        caption: `${who} ${bothOrAll(nFriends)} saved these ${plural(count, "track")} of ${s("lane")} on their own. You have none of them.`,
        detail: `Every one of these ${plural(count, "recording")} sits in ${plural(nFriends, "library")} here — ${who} — and in none of yours. You already have ${plural(n("yours"), "track")} of ${s("lane")}. Nobody compared notes; this is where several people landed independently.`,
      };

    case "SINCE_YOU_STOPPED":
      return {
        title: s("artist"),
        byline: `${n("lastYear")} onwards, from ${who}`,
        caption: `You have nothing by ${s("artist")} after ${n("lastYear")}. ${who} ${has} ${plural(count, "track")} released since.`,
        detail: `The most recent recording by ${s("artist")} in your library came out in ${n("lastYear")}, out of ${plural(n("yours"), "you have", "you have")} in all. ${who} ${has} ${plural(count, "track")} released after that, the latest in ${n("latestYear")}${leader}. Release dates rather than save dates — this is where their catalogue stops in your library, not when you stopped listening.`,
      };

    default:
      return { title: c.subject.label, byline: "", caption: "", detail: "" };
  }
}
