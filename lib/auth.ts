import type { NextAuthOptions } from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { collectSignals } from "@/lib/spotify-signals";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      /**
       * The two behavioural scopes are new, and a token issued before them
       * does not have them. An account keeps whatever it was granted until
       * its owner signs in again — and see the signIn event below for why
       * signing in again is not, on its own, enough.
       *
       * user-top-read           /me/top/artists, /me/top/tracks
       * user-read-recently-played  /me/player/recently-played
       */
      authorization:
        "https://accounts.spotify.com/authorize?scope=user-library-read%20user-read-email%20streaming%20user-read-private%20user-modify-playback-state%20playlist-read-private%20playlist-read-collaborative%20playlist-modify-private%20playlist-modify-public%20user-top-read%20user-read-recently-played",
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    // Expose the database user id on the client-side session object so
    // components can compare session.user.id against a viewed userId prop.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    /**
     * Keep the stored Spotify credential in step with the newest grant.
     *
     * NextAuth links an account exactly once. On every sign-in after the
     * first, callback-handler finds the existing Account row, mints a fresh
     * session and returns — linkAccount is never called again, and the
     * adapter's getUserByAccount is a pure read. So the row keeps the tokens
     * and the scope string from the day the account was first linked, and a
     * grant made later is discarded.
     *
     * That is invisible until the scopes change, which is what adding
     * user-top-read and user-read-recently-played did: somebody could sign
     * out, sign in, approve the new consent screen, and still be stored with
     * the old token and the old scope string, so nothing could read the new
     * endpoints.
     *
     * This writes the new grant onto the row that already exists. Keyed on
     * the provider account, so it can only ever touch the Spotify account
     * that just signed in. updateMany rather than update because a first
     * sign-in has already been written by linkAccount and there is nothing
     * here to correct — that case is a no-op, not an error. Nothing else on
     * the row, the user, their sessions or their library is read or written.
     */
    async signIn({ user, account }) {
      if (account?.provider !== "spotify") return;
      try {
        await prisma.account.updateMany({
          where: {
            provider: "spotify",
            providerAccountId: account.providerAccountId,
          },
          data: {
            access_token: account.access_token ?? undefined,
            refresh_token: account.refresh_token ?? undefined,
            expires_at:
              typeof account.expires_at === "number" ? account.expires_at : undefined,
            token_type: account.token_type ?? undefined,
            scope: account.scope ?? undefined,
          },
        });
      } catch (e) {
        // A sign-in that has otherwise succeeded must not fail here.
        console.error("[auth] could not refresh the stored Spotify grant:", e);
      }

      /**
       * Collect what they have been listening to, now that the grant is stored.
       *
       * These signals only ever ran as the last stage of a full library import,
       * so granting the scopes did nothing on its own: two people approved the
       * consent screen and still had no play history weeks later, because
       * signing in deliberately does not resync a library and nothing else ever
       * called the collector.
       *
       * It runs here instead, after the row above has the new token on it and
       * before anything reads it. collectSignals writes TopArtist, TopTrack and
       * PlayEvent and nothing else — it cannot reach Track, an import, or
       * reconciliation — and it never throws, so a Spotify outage costs the
       * signals and not the sign-in.
       */
      try {
        const scopes = (account.scope ?? "").split(/\s+/).filter(Boolean);
        const wanted = scopes.includes("user-top-read")
          || scopes.includes("user-read-recently-played");
        if (!wanted || !user?.id) return;

        // One collection per sign-in, not one per callback. The lists are
        // keyed by the day so a repeat would overwrite rather than duplicate,
        // but there is no reason to spend seven requests saying the same thing.
        const last = await prisma.topArtist.findFirst({
          where: { userId: user.id },
          orderBy: { fetchedAt: "desc" },
          select: { fetchedAt: true },
        });
        if (last && Date.now() - last.fetchedAt.getTime() < 10 * 60_000) return;

        const r = await collectSignals(user.id);
        console.log(`[auth] signals for ${user.id}: `
          + `${r.topArtists} top artists, ${r.topTracks} top tracks, `
          + `${r.plays} new plays${r.skipped ? ` — ${r.skipped}` : ""}`);
      } catch (e) {
        // Same rule: the sign-in has succeeded and stands.
        console.error("[auth] could not collect behavioural signals:", e);
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
