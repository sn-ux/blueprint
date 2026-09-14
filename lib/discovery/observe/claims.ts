/**
 * Observations, in English.
 *
 * Every sentence here is assembled from counts the observation already
 * carries. Nothing is rounded into a claim the numbers do not support, nothing
 * describes what the listener likes, and there is deliberately no template
 * that could say "because you like X" — the facts are what they are, and the
 * reader is left to draw the conclusion.
 *
 * Two surfaces, one set of facts: the feed line and the longer page text are
 * rendered by two functions from the same object, never written separately, so
 * they cannot disagree about a number.
 */
import type { Observation } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (x: number) => (x >= 10 ? `${Math.round(x)}%` : `${x}%`);
const ord = (d: number) => `${d}s`;

export interface Rendered {
  /** What the card is about, shown as its heading. */
  title: string;
  /** The observation itself, in one line. */
  caption: string;
  /** The same fact told at length, for the detail page. */
  detail: string;
  /** What opening it gives you. */
  payloadLabel: string;
}

export function render(ob: Observation, nameOf: (id: string) => string): Rendered {
  const f = ob.facts as Record<string, never> & Record<string, number & string>;
  const n = (k: string) => Number(f[k]);
  const s = (k: string) => String(f[k]);
  const opened = ob.payload.works.length;
  const discover = ob.payload.kind === "DISCOVER";
  const openLabel = discover
    ? `${plural(opened, "track")} to hear`
    : `${plural(opened, "track")} of yours`;

  switch (ob.family) {
    case "ALBUM_DEVOTION": {
      const whole = n("missing") === 0;
      const title = s("album");
      const caption = whole
        ? `You have all ${n("total")} tracks on this record.`
        : `You have ${n("held")} of its ${n("total")} tracks — ${n("missing")} short of the whole thing.`;
      const detail = whole
        ? `Every one of the ${n("total")} tracks on ${s("album")} is in your library. Across the other ${n("albumsHeld")} records you have touched, you keep ${pct(100 * n("medianCoverage"))} of a record on average — this is one of the few you took whole.`
        : `You hold ${n("held")} of the ${n("total")} tracks on ${s("album")}. Across your other ${n("albumsHeld")} records you average ${pct(100 * n("medianCoverage"))} of a tracklist, which is what makes this one unusual.`;
      return { title, caption, detail, payloadLabel: whole ? `More from ${s("artist")}` : "The rest of the record" };
    }
    case "ARTIST_SIGNATURE":
      return {
        title: s("artist"),
        caption: `${plural(n("yours"), "track")} — ${pct(n("libraryShare"))} of your whole library, where your next artist has ${n("nextDown")}.`,
        detail: `${s("artist")} accounts for ${plural(n("yours"), "track")} in your library, ${pct(n("libraryShare"))} of everything you have kept. The artist ranked below has ${n("nextDown")}. Across the ${plural(n("albumSpread"), "record")} anyone here holds of theirs, ${n("otherHolders") === 0 ? "nobody else here has any" : `the next deepest collection is ${plural(n("deepestOther"), "track")}`}.`,
        payloadLabel: discover ? `More ${s("artist")}` : `Your ${s("artist")}`,
      };
    case "ARTIST_TRUNCATION":
      return {
        title: s("artist"),
        caption: `${plural(n("yours"), "track")}, and none after ${n("lastYear")}. There are ${n("sinceThen")} more since.`,
        detail: `You have ${plural(n("yours"), "track")} by ${s("artist")}, and the most recent was released in ${n("lastYear")}. ${n("sinceThen")} recordings people here keep came out after that, the latest in ${n("latestYear")}. Release dates, not save dates — this says where their catalogue stops in your library, not when you stopped listening.`,
        payloadLabel: `${s("artist")} since ${n("lastYear")}`,
      };
    case "ARTIST_LOYALTY":
      return {
        title: s("artist"),
        caption: `You have picked them up in ${plural(n("years"), "separate release year")}, ${n("from")} to ${n("to")}.`,
        detail: `Your ${plural(n("yours"), "track")} by ${s("artist")} span ${n("years")} different release years, from ${n("from")} to ${n("to")}. The same number of tracks drawn at random from their catalogue would touch about ${n("expected")}. You did not find them once; you kept going back.`,
        payloadLabel: "The years you skipped",
      };
    case "ONE_ALBUM_ARTIST":
      return {
        title: s("artist"),
        caption: `All ${plural(n("yours"), "track")} you have of theirs are from ${s("album")}.`,
        detail: `Every one of your ${plural(n("yours"), "track")} by ${s("artist")} comes from ${s("album")}. There are ${plural(n("otherAlbums"), "other record")} of theirs on the shelf here, and you have nothing from any of them.`,
        payloadLabel: "Everything else they made",
      };
    case "LANE_SIGNATURE":
      return {
        title: s("lane"),
        caption: `${pct(n("yourShare"))} of your ${s("world")} is ${s("lane")} — ${pct(n("othersShare"))} for everyone else here.`,
        detail: `Of the ${s("world")} in your library, ${pct(n("yourShare"))} is ${s("lane")}: ${plural(n("yours"), "track")} across ${plural(n("artists"), "artist")}. For everyone else here the same lane is ${pct(n("othersShare"))} of their ${s("world")}. It is not one act — ${s("topArtist")} is the largest single source and the rest is spread.`,
        payloadLabel: discover ? `More ${s("lane")}` : `Your ${s("lane")}`,
      };
    case "LANE_BREADTH":
      return {
        title: s("lane"),
        caption: `Your ${plural(n("yours"), "track")} here come from ${plural(n("artists"), "different artist")} — about ${n("expected")} would be usual.`,
        detail: `You hold ${plural(n("yours"), "track")} of ${s("lane")}, spread across ${plural(n("artists"), "artist")}. Drawing that many tracks from the lane as everyone else holds it would land on about ${n("expected")} artists. You collect the lane rather than an act inside it.`,
        payloadLabel: `${s("lane")} artists you have none of`,
      };
    case "ERA_DISPLACEMENT":
      return {
        title: s("lane"),
        caption: `${pct(n("yourShare"))} of your ${s("lane")} comes from the ${ord(n("decade"))} — ${n("lift")}× the shelf around you.`,
        detail: `${n("inDecade")} of your ${plural(n("yours"), s("lane") + " track")} were released in the ${ord(n("decade"))}, ${pct(n("yourShare"))} of what you keep in that lane against ${pct(n("othersShare"))} for everyone else. Spread across ${plural(n("artists"), "artist")}, so it is a period rather than a record.`,
        payloadLabel: `${ord(n("decade"))} ${s("lane")}`,
      };
    case "LIBRARY_ERA":
      return {
        title: `The ${ord(n("decade"))}`,
        caption: `${pct(n("yourShare"))} of everything you keep was released in the ${ord(n("decade"))} — ${n("lift")}× the shelf around you.`,
        detail: `${n("yours")} of the ${n("total")} tracks in your library that carry a release date came out in the ${ord(n("decade"))}: ${pct(n("yourShare"))} of your library against ${pct(n("othersShare"))} of everyone else's. It runs across ${plural(n("lanes"), "different lane")}, most of it in ${s("topLane")}, so it is a decade you keep rather than one kind of music that happens to live there.`,
        payloadLabel: `${ord(n("decade"))} you have not kept`,
      };
    case "DEEP_CUTS":
      return {
        title: s("lane"),
        caption: `Of the ${n("universe")} ${s("lane")} tracks other people here keep, your ${n("yours")} are the ones fewest of them hold.`,
        detail: `Take the ${n("universe")} ${s("lane")} recordings somebody other than you keeps. You have ${n("yours")} of them, and they average ${n("yourMean")} other holders where the lane as a whole averages ${n("laneMean")}. Out of the same shelf, you reach for what almost nobody else does.`,
        payloadLabel: `The quietest ${s("lane")} here`,
      };
    case "LIBRARY_SHAPE": {
      const more = s("direction") === "more";
      return {
        title: "How you keep music",
        caption: more
          ? `You take half a record or more ${pct(n("yourRate"))} of the time. Everyone else here: ${pct(n("othersRate"))}.`
          : `You almost never take a whole record — ${pct(n("yourRate"))} of the time, against ${pct(n("othersRate"))} for everyone else.`,
        detail: `Of the ${n("albums")} records you have touched, ${n("deep")} are ones you kept at least half of — ${pct(n("yourRate"))}. For everyone else here that figure is ${pct(n("othersRate"))}. ${more ? "You collect records." : "You collect songs, and the record they came from is mostly incidental."}`,
        payloadLabel: more ? "Records you nearly have" : "The records you came closest to",
      };
    }
    case "PAIR_ALIGNMENT":
      return {
        title: s("lane"),
        caption: `You and ${nameOf(s("other"))} share ${n("shared")} of your ${plural(n("yours"), s("lane") + " track")} — about ${n("expected")} would be chance.`,
        detail: `Inside ${s("lane")}, ${n("shared")} of the ${n("yours")} tracks you keep are also kept by ${nameOf(s("other"))}, who has ${n("theirs")} in the lane. Drawing two collections that size from the ${n("laneWorks")} recordings here would put about ${n("expected")} in common.`,
        payloadLabel: `${nameOf(s("other"))}'s ${s("lane")}`,
      };
    case "CONVERGENCE":
      return {
        title: s("artist"),
        caption: `${plural(n("holders"), "person")} here keep them and you have none — about ${n("expected")} would be expected.`,
        detail: `${plural(n("holders"), "separate library")} here hold ${s("artist")}. Given how much ${s("lane")} each of those people keeps, and how much of the lane this artist is, you would expect about ${n("expected")}. You have ${plural(n("yourLaneWorks"), "track")} of ${s("lane")} and none of theirs.`,
        payloadLabel: `${s("artist")}, where people agree`,
      };
    case "ARTIST_CONCENTRATION":
      return {
        title: s("artist"),
        caption: `${n("onHome")} of your ${plural(n("yours"), "track")} by them sit on one record — you usually spread that many over ${n("expected")}.`,
        detail: `Your ${plural(n("yours"), "track")} by ${s("artist")} sit on ${plural(n("records"), "record")}, ${n("onHome")} of them on ${s("album")} alone. Across the ${n("artistsCompared")} artists in your library, that many tracks by one act usually spread over about ${n("expected")} records. There are ${n("catalogue")} of theirs on the shelf here.`,
        payloadLabel: `${s("artist")} beyond that record`,
      };
    case "ARTIST_SPREAD":
      return {
        title: s("artist"),
        caption: `Your ${plural(n("yours"), "track")} by them come from ${plural(n("records"), "different record")} — about ${n("expected")} would be usual.`,
        detail: `You hold ${plural(n("yours"), "track")} by ${s("artist")}, taken from ${plural(n("records"), "separate record")} of the ${n("catalogue")} the shelf here knows. The same number drawn at random across that catalogue would touch about ${n("expected")}. You have gone through the work rather than found a song.`,
        payloadLabel: "The records you have not touched",
      };
    case "ALBUM_POSITION": {
      const front = s("side") === "front";
      return {
        title: s("album"),
        caption: front
          ? `Your ${plural(n("held"), "track")} from this record are all in its first ${n("reach")}, of ${n("total")}.`
          : `Your ${plural(n("held"), "track")} from this record all sit from number ${n("reach")} on.`,
        detail: front
          ? `Of the ${n("total")} tracks on ${s("album")}, you kept ${n("held")} — and every one of them falls inside the first ${n("reach")}. ${n("untouched")} tracks past that point are on the shelf here and none is in your library. Whatever happened, you did not reach the end of this record.`
          : `Of the ${n("total")} tracks on ${s("album")}, the ${n("held")} you kept all sit at position ${n("reach")} or later. The front of the record is the part you do not have.`,
        payloadLabel: front ? "The rest of the record" : "The start of the record",
      };
    }
    case "ALBUM_ODD_CHOICE":
      return {
        title: s("album"),
        caption: `The ${n("held") === 1 ? "one track" : `${n("held")} tracks`} you keep from this record ${n("held") === 1 ? "is" : "are"} among the least-kept on it.`,
        detail: `${s("album")} has ${n("total")} tracks the shelf here knows, and the most widely held of them is in ${plural(n("topHolders"), "library")}. What you kept — ${s("yourTrack")} — sits at number ${n("rank")} of ${n("total")} by that measure, in ${plural(n("yourHolders"), "library")}. Out of a whole record, you took the quiet one.`,
        payloadLabel: "What everyone else took",
      };
    case "ARTIST_INTERIOR_GAP":
      return {
        title: s("artist"),
        caption: `You have them from ${n("firstYear")} to ${n("lastYear")}, and nothing at all from ${n("from")}–${n("to")}.`,
        detail: `Your ${plural(n("yours"), "track")} by ${s("artist")} run from ${n("firstYear")} to ${n("lastYear")}, but the stretch between ${n("from")} and ${n("to")} is empty — ${n("inGap")} recordings from those years are on the shelf here and you have none of them. You were following before it and after it.`,
        payloadLabel: `${s("artist")}, ${n("from")}–${n("to")}`,
      };
    case "PAIR_DIVERGENCE":
      return {
        title: s("lane"),
        caption: `You and ${nameOf(s("other"))} both keep ${s("lane")} deeply and share only ${n("shared")} of it — about ${n("expected")} would be chance.`,
        detail: `You hold ${plural(n("yours"), "track")} of ${s("lane")} that somebody else here also holds; ${nameOf(s("other"))} holds ${n("theirs")}. Two collections that size, drawn from the ${n("laneWorks")} shared recordings in the lane, would have about ${n("expected")} in common. You have ${n("shared")}. The same territory, almost none of the same music.`,
        payloadLabel: `${nameOf(s("other"))}'s ${s("lane")}`,
      };
    default:
      return { title: ob.subject.label, caption: "", detail: "", payloadLabel: "Tracks" };
  }
}
