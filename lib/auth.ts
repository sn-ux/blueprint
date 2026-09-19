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
       * does not have them — an account keeps whatever it was granted until
       * its owner signs in again, at which point the adapter updates the same
       * Account row in place. The User, their Sessions, their notes and every
       * Track they own are untouched by that; only the tokens and the scope
       * string change.
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
  secret: process.env.NEXTAUTH_SECRET,
};
