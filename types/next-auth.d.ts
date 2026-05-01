// Augment the next-auth Session type so session.user.id is available
// after the session callback in lib/auth.ts injects the DB user id.

import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id:     string;
      name?:  string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
