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
/** "38 soundtrack songs" reads; "38 songs of soundtrack" does not. */
const laneSongs = (n: number, lane: string) =>
  `${n} ${laneInline(lane)} ${n === 1 ? "song" : "songs"}`;

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
  const trimmed = count > shown ? ` ${shown} of them are here.` : "";
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
        caption: `You have ${plural(n("yours"), "song")} from this album. ${who} ${has} ${count} more.`,
        detail: `This album has ${plural(n("total"), "song")} and ${n("yours")} of them ${is(n("yours"))} yours. ${who} ${has} ${count} of the rest${between}${leader}.${trimmed}`,
      };

    case "DEEPER_ON_AN_ARTIST":
      return {
        title: s("artist"),
        byline: "",
        caption: `You have ${plural(n("yours"), "song")} by ${s("artist")}. ${who} ${has} ${count} more.`,
        detail: `You have ${plural(n("yours"), "song")} by ${s("artist")}. ${who} ${has} ${plural(count, "song")} of theirs that you do not${leader}.${trimmed}`,
      };

    case "THE_RECORD_YOU_SKIPPED":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${plural(n("yoursByArtist"), "song")} by ${s("artist")} and none from this album. ${who} ${has} ${count} songs from it.`,
        detail: `You have ${plural(n("yoursByArtist"), "song")} by ${s("artist")} and nothing from ${s("album")}${n("year") ? `, from ${n("year")}` : ""}. ${who} ${has} ${plural(count, "song")} of it${leader}.${trimmed}`,
      };

    case "NEW_IN_YOUR_LANE":
      return {
        title: s("artist"),
        byline: "",
        caption: `${who} ${verb(nFriends, "has", "all have")} ${s("artist")}. You have ${laneSongs(n("yoursInLane"), s("lane"))} and nothing by them.`,
        detail: `${who} ${has} ${plural(count, "song")} by ${s("artist")} and you have none. Their music sits in ${laneInline(s("lane"))}, where you have ${plural(n("yoursInLane"), "song")}${leader}.${trimmed}`,
      };

    case "WHAT_THEY_HAVE": {
      const them = solo;
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `${them} has ${laneSongs(n("theirs"), s("lane"))}. You share ${n("shared")} and do not have the other ${count}.`,
        /**
         * The friend's number is their whole library in this scene, not what
         * this card hands over, so the sentence has to say which it is. Left
         * as "and Ethan has 27." it reads as twenty-seven songs on the card,
         * which is the shape of over-claiming the checks look for.
         */
        detail: `You have ${laneSongs(n("yours"), s("lane"))} and ${them} has ${n("theirs")} of their own. ${n("shared")} of them ${is(n("shared"))} the same song, and ${plural(count, "song")} of ${them}'s ${is(count)} not in your library.${trimmed}`,
      };
    }

    case "THEY_ALL_KEEP_IT":
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `${who} each saved these ${laneSongs(count, s("lane"))} separately. You have none of them.`,
        detail: `These ${plural(count, "song")} ${is(count)} in ${plural(nFriends, "library")} here and in none of yours. You already have ${laneSongs(n("yours"), s("lane"))}.`,
      };

    case "SINCE_YOU_STOPPED":
      return {
        title: s("artist"),
        byline: "",
        caption: `You have nothing by ${s("artist")} after ${n("lastYear")}. ${who} ${has} ${plural(count, "song")} released since.`,
        detail: `The newest ${s("artist")} song in your library came out in ${n("lastYear")}. ${who} ${has} ${plural(count, "song")} released after that, the latest in ${n("latestYear")}${leader}.${trimmed} These are release dates, not save dates.`,
      };

    case "YOU_HAVE_THE_HITS":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `The ${plural(n("yours"), "song")} you have from this album ${is(n("yours"))} the ${n("yours") === 1 ? "one" : "ones"} everybody keeps. ${who} ${has} the other ${count}.`,
        detail: `Of the ${plural(n("total"), "song")} on ${s("album")}, the ones in your library are the ones most people here keep. ${who} ${has} ${plural(count, "song")} of the rest.${trimmed}`,
      };

    case "BEFORE_YOU_ARRIVED":
      return {
        title: s("artist"),
        byline: "",
        caption: `Your ${s("artist")} songs all come from ${n("arrived")} on. ${who} ${has} ${plural(count, "song")} from before that, back to ${n("earliest")}.`,
        detail: `Nothing by ${s("artist")} in your library is older than ${n("arrived")}, though their music here goes back to ${n("earliest")}. ${who} ${has} ${plural(count, "song")} from those years${leader}.${trimmed}`,
      };

    /**
     * Where an album sits in a run somebody has followed. The position is the
     * claim, so the sentence states it and the counts follow.
     */
    case "RECORD_BEFORE_YOURS":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `Your ${s("artist")} albums start in ${n("first")}. This one came out in ${n("year")}. ${who} ${has} ${plural(count, "song")} from it.`,
        detail: `You have ${plural(n("records"), "album")} by ${s("artist")}, the earliest from ${n("first")}. This one is older, from ${n("year")}, and you have none of it. ${who} ${has} ${plural(count, "song")}${leader}.${trimmed}`,
      };

    case "RECORD_AFTER_YOURS":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `Your ${s("artist")} albums stop at ${n("last")}. This one came out in ${n("year")}. ${who} ${has} ${plural(count, "song")} from it.`,
        detail: `You have ${plural(n("records"), "album")} by ${s("artist")}, the newest from ${n("last")}. This one came later, in ${n("year")}, and you have none of it. ${who} ${has} ${plural(count, "song")}${leader}.${trimmed}`,
      };

    case "RECORD_BETWEEN_YOURS":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have ${s("artist")} albums from ${n("first")} and ${n("last")}, and nothing from this one in between. ${who} ${has} ${plural(count, "song")} from it.`,
        detail: `Your ${s("artist")} albums run from ${n("first")} to ${n("last")}. This one came out in ${n("year")}, inside that run, and you have none of it. ${who} ${has} ${plural(count, "song")}${leader}.${trimmed}`,
      };

    /**
     * An artist placed in the genre's own run. The card introduces them; the
     * dates say where they sit against the people already on the shelf.
     */
    case "ARTIST_BEFORE_YOURS":
      return {
        title: s("artist"),
        byline: "",
        caption: `The ${laneInline(s("lane"))} artists you have start around ${n("first")}. ${s("artist")} came earlier. ${who} ${has} ${plural(count, "song")}.`,
        detail: `You have ${plural(n("peers"), "artist")} in ${laneInline(s("lane"))}, the earliest working around ${n("first")}. ${s("artist")} was making it around ${n("era")}, before any of them, and you have none of their music. ${who} ${has} ${plural(count, "song")}${leader}.${trimmed}`,
      };

    case "ARTIST_AFTER_YOURS":
      return {
        title: s("artist"),
        byline: "",
        caption: `The ${laneInline(s("lane"))} artists you have stop around ${n("last")}. ${s("artist")} came later. ${who} ${has} ${plural(count, "song")}.`,
        detail: `You have ${plural(n("peers"), "artist")} in ${laneInline(s("lane"))}, the latest working around ${n("last")}. ${s("artist")} was making it around ${n("era")}, after all of them, and you have none of their music. ${who} ${has} ${plural(count, "song")}${leader}.${trimmed}`,
      };

    case "ARTIST_BETWEEN_YOURS":
      return {
        title: s("artist"),
        byline: "",
        caption: `${s("artist")} sits between the ${laneInline(s("lane"))} artists you have, around ${n("era")}, and you have none of their music. ${who} ${has} ${plural(count, "song")}.`,
        detail: `Your ${laneInline(s("lane"))} artists run from about ${n("first")} to ${n("last")}. ${s("artist")} was working around ${n("era")}, inside that, and is not in your library at all. ${who} ${has} ${plural(count, "song")}${leader}.${trimmed}`,
      };

    /**
     * The part of a genre somebody has not been to. A span rather than a year:
     * what the shelf is missing is a stretch, and saying which one is the card.
     */
    case "GENRE_PART_BEFORE":
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `Your ${laneInline(s("lane"))} starts in ${n("first")}. ${who} ${has} ${plural(count, "song")} of it from before that, back to ${n("spanFrom")}.`,
        detail: `You have ${laneSongs(n("yours"), s("lane"))}, none of them older than ${n("first")}. ${who} ${has} ${plural(count, "song")} from ${n("spanFrom")} to ${n("spanTo")}${leader}.${trimmed}`,
      };

    case "GENRE_PART_AFTER":
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `Your ${laneInline(s("lane"))} stops in ${n("last")}. ${who} ${has} ${plural(count, "song")} of it from after that, up to ${n("spanTo")}.`,
        detail: `You have ${laneSongs(n("yours"), s("lane"))}, none of them newer than ${n("last")}. ${who} ${has} ${plural(count, "song")} from ${n("spanFrom")} to ${n("spanTo")}${leader}.${trimmed}`,
      };

    case "GENRE_GAP":
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `You have ${laneInline(s("lane"))} from ${n("first")} to ${n("last")} and nothing from ${n("spanFrom")} to ${n("spanTo")}. ${who} ${has} ${plural(count, "song")} from those years.`,
        detail: `Your ${laneSongs(n("yours"), s("lane"))} run from ${n("first")} to ${n("last")}, with ${plural(n("years"), "year")} inside that you have nothing from. ${who} ${has} ${plural(count, "song")} from ${n("spanFrom")} to ${n("spanTo")}${leader}.${trimmed}`,
      };

    /**
     * A genre next to one you are in, told by the artists the two share. The
     * two versions are opposites, so they say different things.
     */
    case "RELATED_GENRE":
      return {
        title: laneTitle(s("otherLane")),
        byline: "",
        caption: `${plural(n("shared"), "artist")} you have in ${laneInline(s("lane"))} also ${verb(n("shared"), "works", "work")} in ${laneInline(s("otherLane"))}, which you have none of. ${who} ${has} ${plural(count, "song")}.`,
        detail: `${plural(n("shared"), "of the artist")} in your ${laneInline(s("lane"))} ${is(n("shared"))} also filed under ${laneInline(s("otherLane"))}, and nothing of yours sits there. ${who} ${has} ${plural(count, "song")} of it${leader}.${trimmed}`,
      };

    case "RELATED_GENRE_CONSENSUS":
      return {
        title: laneTitle(s("otherLane")),
        byline: "",
        /**
         * Lead with what the reader can act on. "UK R&B shares almost nobody
         * with your funk" is the selection rule talking out loud, and it reads
         * as nonsense; that several people here keep something the reader has
         * never been near is the card.
         */
        caption: `${who} all keep ${laneTitle(s("otherLane"))}, and you have none of it. ${plural(count, "song")} of theirs ${is(count)} not in your library.`,
        detail: `${who} each keep ${laneInline(s("otherLane"))} and you have none of it. It is not the next step along from your ${laneInline(s("lane"))} either — the two share ${n("shared") === 0 ? "no artists at all" : plural(n("shared"), "artist")} — so this is somewhere several people arrived at separately${leader}.${trimmed}`,
      };

    case "ONE_RECORD_LEFT":
      return {
        title: s("album"),
        byline: s("artist"),
        caption: `You have every album by ${s("artist")} except this one. ${who} ${has} ${plural(count, "song")} of it.`,
        detail: `Of the ${plural(n("records"), "album")} by ${s("artist")} anyone here has, this is the only one missing from your library${n("year") ? `. It came out in ${n("year")}` : ""}. You have ${plural(n("yours"), "song")} by them and none from it. ${who} ${has} ${plural(count, "song")}.${trimmed}`,
      };

    case "GUEST_ON_YOUR_RECORDS":
      return {
        title: s("artist"),
        byline: "",
        caption: `${s("artist")} is on ${plural(n("appearances"), "song")} you already have, and you have nothing else by them. ${who} ${has} ${count}.`,
        detail: `${s("artist")} sings on ${plural(n("appearances"), "song")} in your library, ${s("example")} among them, and nothing else of theirs is there. ${who} ${has} ${plural(count, "song")}${leader}.${trimmed}`,
      };

    case "ONLY_ONE_FRIEND_HAS_IT": {
      const them = solo;
      return {
        title: s("artist"),
        byline: "",
        caption: `${them} is the only person here with ${s("artist")}, and has ${plural(n("theirDepth"), "song")}. You have ${laneSongs(n("yoursInLane"), s("lane"))}.`,
        detail: `Nobody else here has ${s("artist")}. ${them} has ${plural(n("theirDepth"), "song")} by them, and their music sits in ${laneInline(s("lane"))}, where you have ${plural(n("yoursInLane"), "song")}.${trimmed}`,
      };
    }

    case "EVERYONE_BUT_YOU":
      return {
        title: s("artist"),
        byline: "",
        caption: `Everyone here has ${s("artist")} except you.`,
        detail: `${who} all have ${s("artist")} and you have none. ${plural(count, "song")} of theirs ${is(count)} not in your library${leader}.${trimmed} Their music sits in ${laneInline(s("lane"))}.`,
      };

    case "A_SCENE_YOU_TOUCHED": {
      const them = solo;
      return {
        title: laneTitle(s("lane")),
        byline: "",
        caption: `You have ${laneSongs(n("yours"), s("lane"))}. ${them} has ${n("theirDepth")}.`,
        detail: `You have ${laneSongs(n("yours"), s("lane"))} and nothing more. ${them} has ${plural(n("theirDepth"), "song")} of it.${trimmed}`,
      };
    }

    case "A_YEAR_IN_YOUR_LANE":
      return {
        title: `${laneTitle(s("lane"))}, ${n("year")}`,
        byline: "",   // the title already carries the lane and the year
        caption: `You have ${laneSongs(n("yours"), s("lane"))} and ${n("mine") === 0 ? "none" : "one"} from ${n("year")}. ${who} ${has} ${count}.`,
        detail: `You have ${laneSongs(n("yours"), s("lane"))}, and ${n("mine") === 0 ? "none of them comes" : "one of them comes"} from ${n("year")}. ${who} ${has} ${plural(count, "song")} from that year${leader}.${trimmed}`,
      };

    default:
      return { title: c.subject.label, byline: "", caption: "", detail: "" };
  }
}
