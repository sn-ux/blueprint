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
      authorization:
        "https://accounts.spotify.com/authorize?scope=user-library-read%20user-read-email%20streaming%20user-read-private%20user-modify-playback-state%20playlist-read-private%20playlist-read-collaborative",
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
