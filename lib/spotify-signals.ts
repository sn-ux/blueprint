// Behavioural signals: what somebody listens to, as distinct from what they own.
//
//   GET /v1/me/top/artists?time_range=…   — top 50 per range, ranked
//   GET /v1/me/top/tracks?time_range=…    — top 50 per range, ranked
//   GET /v1/me/player/recently-played     — the last 50 plays, rolling
//
// Deliberately not here: anything that writes Track. A play is not a save and
// a top artist is not an owned record. These land in their own tables, the
// recommendation corpus still reads Track and only Track, and nothing in this
// file can change what is in somebody's library.
//
// Called at the end of the ordinary sync. Every failure is contained: a person
// who has not granted the new scopes yet gets a 403, which is recorded as a
// skip and nothing else — their library import has already succeeded by then
// and must not be undone by this.

import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getSpotifyToken } from "@/lib/spotify-token";

const RANGES = ["short_term", "medium_term", "long_term"] as const;

export interface SignalResult {
  granted: boolean;
  topArtists: number;
  topTracks: number;
  plays: number;
  /** Plays already on record, so a rolling window that repeats says so. */
  playsAlreadyKnown: number;
  skipped?: string;
}

/** UTC midnight of the day a snapshot was taken. One list per range per day. */
function dayOf(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
}

type Fetched<T> = { ok: true; items: T[] } | { ok: false; status?: number; message: string };

async function fetchItems<T>(token: string, url: string): Promise<Fetched<T>> {
  try {
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    return { ok: true, items: (r.data?.items ?? []) as T[] };
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } } };
    return {
      ok: false,
      status: err.response?.status,
      message: err.response?.data?.error?.message ?? "request failed",
    };
  }
}

type RawArtist = {
  id: string; name: string; genres?: string[]; popularity?: number;
  images?: { url: string }[];
};
type RawTrack = {
  id: string; name: string; popularity?: number;
  artists?: { id: string; name: string }[];
  album?: { id?: string; name?: string; images?: { url: string }[] };
};
type RawPlay = {
  track: RawTrack | null;
  played_at: string;
  context?: { uri?: string; type?: string } | null;
};

/**
 * Collect the three behavioural signals for one person.
 *
 * Never throws. A missing scope, a revoked token or a Spotify outage returns a
 * result saying so, because this runs after a library import that has already
 * written its rows and must not be able to fail it.
 */
export async function collectSignals(userId: string): Promise<SignalResult> {
  const out: SignalResult = {
    granted: false, topArtists: 0, topTracks: 0, plays: 0, playsAlreadyKnown: 0,
  };

  const got = await getSpotifyToken(userId).catch(() => null);
  if (!got?.accessToken) return { ...out, skipped: "no usable token" };

  const scopes = (got.scope ?? "").split(/\s+/).filter(Boolean);
  const canTop = scopes.includes("user-top-read");
  const canPlays = scopes.includes("user-read-recently-played");
  out.granted = canTop || canPlays;
  if (!canTop && !canPlays) {
    return { ...out, skipped: "scopes not granted — the account has not signed in since they were added" };
  }

  const token = got.accessToken;
  const capturedOn = dayOf(new Date());

  // ── Top artists and tracks, every range ───────────────────────────────────
  if (canTop) {
    for (const timeRange of RANGES) {
      const artists = await fetchItems<RawArtist>(
        token, `https://api.spotify.com/v1/me/top/artists?limit=50&time_range=${timeRange}`);
      if (artists.ok) {
        for (const [i, a] of artists.items.entries()) {
          if (!a?.id) continue;
          const data = {
            name: a.name, rank: i + 1, genres: a.genres ?? [],
            popularity: a.popularity ?? null, imageUrl: a.images?.[0]?.url ?? null,
          };
          await prisma.topArtist.upsert({
            where: { userId_spotifyArtistId_timeRange_capturedOn: {
              userId, spotifyArtistId: a.id, timeRange, capturedOn } },
            update: data,
            create: { userId, spotifyArtistId: a.id, timeRange, capturedOn, ...data },
          });
          out.topArtists++;
        }
      } else if (artists.status === 403) {
        out.skipped = "top lists: scope refused";
      }

      const tracks = await fetchItems<RawTrack>(
        token, `https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=${timeRange}`);
      if (tracks.ok) {
        for (const [i, t] of tracks.items.entries()) {
          if (!t?.id) continue;
          const data = {
            name: t.name, artist: t.artists?.[0]?.name ?? "",
            spotifyArtistId: t.artists?.[0]?.id ?? null,
            albumId: t.album?.id ?? null, album: t.album?.name ?? null,
            rank: i + 1, popularity: t.popularity ?? null,
            imageUrl: t.album?.images?.[0]?.url ?? null,
          };
          await prisma.topTrack.upsert({
            where: { userId_spotifyId_timeRange_capturedOn: {
              userId, spotifyId: t.id, timeRange, capturedOn } },
            update: data,
            create: { userId, spotifyId: t.id, timeRange, capturedOn, ...data },
          });
          out.topTracks++;
        }
      }
    }
  }

  // ── Recently played, as individual events ────────────────────────────────
  //
  // The window is the last fifty plays and nothing older, so this is only ever
  // a record if it is read often. Each play is keyed on the instant it
  // happened: reading the same window twice adds nothing, and what has already
  // been seen is reported rather than silently dropped.
  if (canPlays) {
    const plays = await fetchItems<RawPlay>(
      token, "https://api.spotify.com/v1/me/player/recently-played?limit=50");
    if (plays.ok) {
      const rows = plays.items
        .filter((p) => p?.track?.id && p.played_at)
        .map((p) => ({
          userId,
          spotifyId: p.track!.id,
          name: p.track!.name,
          artist: p.track!.artists?.[0]?.name ?? "",
          spotifyArtistId: p.track!.artists?.[0]?.id ?? null,
          albumId: p.track!.album?.id ?? null,
          album: p.track!.album?.name ?? null,
          imageUrl: p.track!.album?.images?.[0]?.url ?? null,
          playedAt: new Date(p.played_at),
          contextUri: p.context?.uri ?? null,
          contextType: p.context?.type ?? null,
        }))
        .filter((r) => !Number.isNaN(r.playedAt.getTime()));

      const written = await prisma.playEvent.createMany({ data: rows, skipDuplicates: true });
      out.plays = written.count;
      out.playsAlreadyKnown = rows.length - written.count;
    } else if (plays.status === 403) {
      out.skipped = [out.skipped, "recently played: scope refused"].filter(Boolean).join("; ");
    }
  }

  return out;
}
