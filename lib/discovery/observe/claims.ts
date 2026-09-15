/**
 * Cards, in English that someone would actually say.
 *
 * Every sentence names the people the music came from and what the listener
 * already has that makes it theirs to hear. The counts are counts and the
 * names are names; nothing here describes taste, predicts it, or says
 * "because you listen to".
 *
 * Two rules about what a title is. It names the music — a record, an artist, a
 * lane — and never a person: the people are the avatars and the caption, and
 * putting them in the title as well made the heading read "Grateful Dead  30
 * tracks from Chris, Ethan and Sahaj". And a lane title is sentence case, not
 * Title Case: "Psychedelic rock", never "Psychedelic Rock". Artist, album and
 * track names are passed through exactly as Spotify gave them.
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
import { laneInline, laneTitle } from "../display";
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

/**
 * Names come from the card's holders and from nowhere else.
 *
 * Three templates used to read a user id out of `facts` and look it up
 * separately, which is how a card could say "Chris is the only person here
 * with Common" while rendering Chris's avatar and Sahaj's: the sentence was
 * built from one rule and the avatars from another. There is now one list, it
 * is the card's evidence, and a caption that wants a person has to take them
 * from it.
 */
export function render(c: Candidate, nameOf: (id: string) => string): Rendered {
  const f = c.facts as Record<string, never> & Record<string, number & string>;
  const n = (k: string) => Number(f[k]);
  const s = (k: string) => String(f[k]);
  const who = nameList(c.holders.map((h) => h.uid), nameOf);
  const nFriends = c.holders.length;
  const top = c.holders[0];
  const topName = top ? shortName(nameOf(top.uid)) : "someone here";
  /**
   * What the friends actually have, and what the page can show.
   *
   * The caption states the real number; the page shows the best of them when
   * there are more than it can hold. Saying "thirty" when a friend has four
   * hundred is not a rounding, it is the wrong fact.
   */
  /** The one person this card is about, where it is about one. */
  const solo = c.holders.length === 1 ? shortName(nameOf(c.holders[0].uid)) : who;
  const count = c.available;
  const shown = c.tracks.length;
  const trimmed = count > shown ? ` The ${shown} strongest are here.` : "";
  const has = verb(nFriends, "has", "have");

  /**
   * Who carries most of it — but only when that is news. With one friend it
   * is the whole card, and when the leader holds everything it says nothing.
   */
  const leader = (nFriends > 1 && top && count === shown && top.count < count)
    ? `, most of them ${topName}'s`
    : "";
  const between = nFriends > 1 ? " between them" : "";

  switch (c.family) {
    case "FINISH_THE_RECORD":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${plural(n("yours"), "track")} from this record. ${who} ${has} ${count} more.`,
        detail: `${s("album")} runs to ${plural(n("total"), "track")}, and ${n("yours")} of them ${is(n("yours"))} already yours. ${who} ${has} ${count} of the rest${between}${leader}.${trimmed} This is the remainder of a record you have already started.`,
      };

    case "DEEPER_ON_AN_ARTIST":
      return {
        title: s("artist"),
        byline: "",
        caption: `You have ${plural(n("yours"), "track")} by ${s("artist")}. ${who} ${has} ${count} more.`,
        detail: `Your library holds ${plural(n("yours"), "track")} by ${s("artist")}. ${who} ${has}${between} ${plural(count, "other recording")} of theirs${leader}.${trimmed} Across the ${plural(n("records"), "record")} of theirs anyone here owns, this is what has not reached you.`,
      };

    case "THE_RECORD_YOU_SKIPPED":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${plural(n("yoursByArtist"), "track")} by ${s("artist")} and none from this record. ${who} ${has} ${count} of it.`,
        detail: `Your library holds ${plural(n("yoursByArtist"), "track")} by ${s("artist")}, and not one of them comes from ${s("album")}${n("year") ? `, released in ${n("year")}` : ""}. ${who} ${has} ${plural(count, "track")} from it${leader}.${trimmed} A whole record by someone you already listen to, still unopened.`,
      };

    case "NEW_IN_YOUR_LANE":
      return {
        title: s("artist"),
        byline: laneInline(s("lane")),
        caption: `${who} ${verb(nFriends, "has", "each have")} ${s("artist")}. You have ${plural(n("yoursInLane"), "track")} of ${laneInline(s("lane"))} and nothing of theirs.`,
        detail: `${who} arrived at ${s("artist")} separately, and ${has} ${plural(count, "recording")} you do not${leader}.${trimmed} That work sits in ${laneInline(s("lane"))}, where your own library runs to ${plural(n("yoursInLane"), "track")} — deep enough that this is a name you might have expected to meet by now, and have not.`,
      };

    case "WHAT_THEY_HAVE": {
      const them = solo;
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `Of ${them}'s ${plural(n("theirs"), "track")} of ${laneInline(s("lane"))}, you share ${n("shared")}. ${plural(count, "other")} never reached you.`,
        detail: `You have ${plural(n("yours"), "track")} of ${laneInline(s("lane"))} and ${them} has ${n("theirs")}; ${n("shared")} of them ${is(n("shared"))} the same recording. The same corner of music, found twice over without either of you comparing notes — and ${plural(count, "track")} of ${them}'s that never reached you.${trimmed}`,
      };
    }

    case "THEY_ALL_KEEP_IT":
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `${who} each saved these ${plural(count, "track")} of ${laneInline(s("lane"))} on their own. You have none of them.`,
        detail: `Every one of these ${plural(count, "recording")} sits in ${plural(nFriends, "library")} here — ${who} — and in none of yours. You already have ${plural(n("yours"), "track")} of ${laneInline(s("lane"))}. Nobody compared notes; this is where several people landed independently.`,
      };

    case "SINCE_YOU_STOPPED":
      return {
        title: s("artist"),
        byline: `since ${n("lastYear")}`,
        caption: `You have nothing by ${s("artist")} after ${n("lastYear")}. ${who} ${has} ${plural(count, "track")} released since.`,
        detail: `The most recent recording by ${s("artist")} in your library came out in ${n("lastYear")}, out of ${plural(n("yours"), "you have", "you have")} in all. ${who} ${has} ${plural(count, "track")} released after that, the latest in ${n("latestYear")}${leader}.${trimmed} Release dates rather than save dates — this is where their catalogue stops in your library, not when you stopped listening.`,
      };

    case "YOU_HAVE_THE_HITS":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `The ${plural(n("yours"), "track")} you have from this record ${is(n("yours"))} the ${n("yours") === 1 ? "one" : "ones"} everybody keeps. ${who} ${has} the other ${count}.`,
        detail: `Rank the ${plural(n("total"), "track")} on ${s("album")} by how many people here keep them, and everything in your library sits at the top of that list — the ${n("yours")} that reached everyone. ${who} ${has} ${plural(count, "of the rest")}.${trimmed} This is the record behind the singles.`,
      };

    case "BEFORE_YOU_ARRIVED":
      return {
        title: s("artist"),
        byline: `before ${n("arrived")}`,
        caption: `Your ${s("artist")} starts at ${n("arrived")}. ${who} ${has} ${plural(count, "track")} from before that, going back to ${n("earliest")}.`,
        detail: `Nothing by ${s("artist")} in your library predates ${n("arrived")}, though their work here runs back to ${n("earliest")}. ${who} ${has} ${plural(count, "recording")} from those earlier years${leader}.${trimmed} You came in partway through.`,
      };

    case "ONE_RECORD_LEFT":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have every record by ${s("artist")} except this one. ${who} ${has} ${count} of it.`,
        detail: `Of the ${plural(n("records"), "record")} by ${s("artist")} anyone here holds, yours is the only library missing ${s("album")}${n("year") ? `, from ${n("year")}` : ""} — you have ${plural(n("yours"), "track")} by them and not one from it. ${who} ${has} ${plural(count, "track")} from the record.${trimmed}`,
      };

    case "GUEST_ON_YOUR_RECORDS":
      return {
        title: s("artist"),
        byline: `already on ${plural(n("appearances"), "track")} of yours`,
        caption: `${s("artist")} is on ${plural(n("appearances"), "track")} you already have. You have nothing else by them. ${who} ${has} ${count}.`,
        detail: `${s("artist")} appears on ${plural(n("appearances"), "recording")} you already keep — ${s("example")} among them — and nothing else of theirs is in your library. ${who} ${has} ${plural(count, "track")} of it${leader}.${trimmed}`,
      };

    case "ONLY_ONE_FRIEND_HAS_IT": {
      const them = solo;
      return {
        title: s("artist"),
        byline: laneInline(s("lane")),
        caption: `${them} is the only person here with ${s("artist")} — ${plural(n("theirDepth"), "track")}. You have ${plural(n("yoursInLane"), "track")} of ${laneInline(s("lane"))}.`,
        detail: `Nobody else here holds ${s("artist")} at all. ${them} has ${plural(n("theirDepth"), "recording")}, which is not a passing interest, and their work sits in ${laneInline(s("lane"))} where your own library runs to ${plural(n("yoursInLane"), "track")}.${trimmed} One person went a long way into this and you have never been.`,
      };
    }

    case "EVERYONE_BUT_YOU":
      return {
        title: s("artist"),
        byline: laneInline(s("lane")),
        caption: `${who} all have ${s("artist")}. You are the only one here who does not.`,
        detail: `${who} — every other library here — keep ${s("artist")}, and yours does not. ${count} of their recordings are ones you do not have${leader}.${trimmed} Their work sits in ${laneInline(s("lane"))}.`,
      };

    case "A_SCENE_YOU_TOUCHED": {
      const them = solo;
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `You have ${plural(n("yours"), "track")} of ${laneInline(s("lane"))}. ${them} has ${n("theirDepth")}.`,
        detail: `${laneInline(s("lane"))} is a door your library has open by ${plural(n("yours"), "track")} and no further. ${them} keeps ${n("theirDepth")} of it.${trimmed} You have been in the room; nobody has shown you round it.`,
      };
    }

    case "A_YEAR_IN_YOUR_LANE":
      return {
        title: `${laneTitle(s("lane"))}, ${n("year")}`,
        byline: "",   // the title already carries the lane and the year
        caption: `You keep ${plural(n("yours"), "track")} of ${laneInline(s("lane"))} and ${n("mine") === 0 ? "nothing at all" : "one track"} from ${n("year")}. ${who} ${has} ${count}.`,
        detail: `Your ${laneInline(s("lane"))} runs to ${plural(n("yours"), "track")}, and ${n("mine") === 0 ? "none of them comes" : "one of them comes"} from ${n("year")}. ${who} between them ${has} ${plural(count, "recording")} from that year in the lane${leader}.${trimmed} A single year of something you otherwise live in.`,
      };

    default:
      return { title: c.subject.label, byline: "", caption: "", detail: "" };
  }
}
