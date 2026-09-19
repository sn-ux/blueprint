import type { NextAuthOptions } from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

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
    async signIn({ account }) {
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
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
