/**
 * Maps a single Spotify genre string to a Blueprint main genre.
 * Returns the Blueprint world category and preserves the original
 * Spotify genre string as the subgenre label.
 *
 * Ordering rationale:
 *   - Rap, R&B, Rock, Jazz are checked first — their keywords are specific
 *     and rarely appear inside strings that belong elsewhere.
 *   - Electronic comes before Classical so "synth" doesn't pull orchestral
 *     neo-classical genres the wrong way.
 *   - World is checked BEFORE Pop so that "afropop", "latin pop", "tropical
 *     pop" etc. land in World rather than Pop.
 *   - Pop / Dance is last because "pop" is a very common substring and
 *     should only win once every more-specific check has failed.
 */
export function mapSpotifyGenre(rawGenre: string): {
  blueprintWorld: string;
  blueprintSubgenre: string;
} {
  const g = rawGenre.toLowerCase();

  // ── Rap / Hip-Hop ───────────────────────────────────────────────────────────
  if (
    g.includes("hip hop")            ||
    g.includes("hip-hop")            ||
    g.includes("rap")                ||
    g.includes("drill")              ||
    g.includes("trap")               ||
    g.includes("phonk")              ||
    g.includes("grime")              ||
    g.includes("boom bap")           ||
    g.includes("crunk")              ||
    g.includes("gangsta")            ||
    g.includes("bounce")             ||
    g.includes("chopped and screwed")||
    g.includes("pluggnb")            ||
    g.includes("mumble rap")         ||
    g.includes("melodic rap")        ||
    g.includes("cloud rap")          ||
    g.includes("sad rap")            ||
    g.includes("rage rap")
  ) {
    return { blueprintWorld: "Rap / Hip-Hop", blueprintSubgenre: rawGenre };
  }

  // ── R&B / Soul / Funk ───────────────────────────────────────────────────────
  // "new jack swing" is explicit here so it isn't caught by "swing" in Jazz.
  if (
    g.includes("r&b")                ||
    g.includes("rnb")                ||
    g.includes("soul")               ||
    g.includes("motown")             ||
    g.includes("funk")               ||
    g.includes("doo-wop")            ||
    g.includes("gospel")             ||
    g.includes("new jack swing")     ||
    g.includes("quiet storm")        ||
    g.includes("urban contemporary") ||
    g.includes("rhythm and blues")
  ) {
    return { blueprintWorld: "R&B / Soul / Funk", blueprintSubgenre: rawGenre };
  }

  // ── Rock / Indie / Alternative ──────────────────────────────────────────────
  // "post-hardcore" is explicit before bare "hardcore" to keep it in Rock
  // rather than being over-caught by broader terms elsewhere.
  if (
    g.includes("rock")               ||
    g.includes("alternative")        ||
    g.includes("indie")              ||
    g.includes("grunge")             ||
    g.includes("new wave")           ||
    g.includes("psychedelic")        ||
    g.includes("progressive")        ||
    g.includes("metal")              ||
    g.includes("punk")               ||
    g.includes("emo")                ||
    g.includes("shoegaze")           ||
    g.includes("screamo")            ||
    g.includes("post-hardcore")      ||
    g.includes("metalcore")          ||
    g.includes("deathcore")          ||
    g.includes("glam")               ||
    g.includes("noise")
  ) {
    return { blueprintWorld: "Rock / Indie / Alternative", blueprintSubgenre: rawGenre };
  }

  // ── Jazz / Blues ────────────────────────────────────────────────────────────
  // "swing" is here; "new jack swing" was already caught above in R&B.
  if (
    g.includes("jazz")               ||
    g.includes("blues")              ||
    g.includes("bossa nova")         ||
    g.includes("swing")              ||
    g.includes("bebop")              ||
    g.includes("big band")
  ) {
    return { blueprintWorld: "Jazz / Blues", blueprintSubgenre: rawGenre };
  }

  // ── Electronic / Ambient ────────────────────────────────────────────────────
  // "garage" catches "uk garage" / "speed garage"; "garage rock" never reaches
  // this block because "rock" is matched in the Rock check above.
  // "dub" is NOT here — "dub reggae" / bare "dub" should land in World.
  // "dubstep" IS here explicitly, so it wins before World's "dub" check.
  if (
    g.includes("electronic")         ||
    g.includes("ambient")            ||
    g.includes("house")              ||
    g.includes("edm")                ||
    g.includes("idm")                ||
    g.includes("drum and bass")      ||
    g.includes("dnb")                ||
    g.includes("lo-fi")              ||
    g.includes("lofi")               ||
    g.includes("lo fi")              ||
    g.includes("disco")              ||
    g.includes("techno")             ||
    g.includes("synth")              ||
    g.includes("trance")             ||
    g.includes("dubstep")            ||
    g.includes("future bass")        ||
    g.includes("vaporwave")          ||
    g.includes("chillhop")           ||
    g.includes("trip hop")           ||
    g.includes("downtempo")          ||
    g.includes("jungle")             ||
    g.includes("garage")             ||
    g.includes("rave")               ||
    g.includes("breakbeat")          ||
    g.includes("big beat")
  ) {
    return { blueprintWorld: "Electronic / Ambient", blueprintSubgenre: rawGenre };
  }

  // ── Classical / Score / Soundtrack ─────────────────────────────────────────
  // "neoclassical metal" is caught by "metal" above; this only sees things
  // that have no heavier-category keyword.
  if (
    g.includes("classical")          ||
    g.includes("piano")              ||
    g.includes("score")              ||
    g.includes("soundtrack")         ||
    g.includes("orchestral")         ||
    g.includes("baroque")            ||
    g.includes("impressionism")      ||
    g.includes("opera")              ||
    g.includes("chamber")            ||
    g.includes("neoclassical")       ||
    g.includes("minimalism")
  ) {
    return { blueprintWorld: "Classical / Score / Soundtrack", blueprintSubgenre: rawGenre };
  }

  // ── World / Folk / Regional ─────────────────────────────────────────────────
  // Placed BEFORE Pop so "afropop", "latin pop", "dancehall" etc. land here
  // rather than in Pop / Dance.
  if (
    g.includes("afro")               ||
    g.includes("highlife")           ||
    g.includes("reggae")             ||
    g.includes("reggaeton")          ||
    g.includes("salsa")              ||
    g.includes("merengue")           ||
    g.includes("bolero")             ||
    g.includes("kizomba")            ||
    g.includes("celtic")             ||
    g.includes("country")            ||
    g.includes("americana")          ||
    g.includes("folk")               ||
    g.includes("tamil")              ||
    g.includes("kannada")            ||
    g.includes("malayalam")          ||
    g.includes("indian")             ||
    g.includes("vietnamese")         ||
    g.includes("arabic")             ||
    g.includes("egyptian")           ||
    g.includes("corrido")            ||
    g.includes("sierreño")           ||
    g.includes("latin")              ||  // covers latin pop, latin trap, latin urban, etc.
    g.includes("tropical")           ||
    g.includes("dancehall")          ||
    g.includes("bachata")            ||
    g.includes("cumbia")             ||
    g.includes("banda")              ||
    g.includes("norteño")            ||
    g.includes("tejano")             ||
    g.includes("vallenato")          ||
    g.includes("flamenco")           ||
    g.includes("ska")                ||
    g.includes("dub")                ||  // dub reggae, roots dub; "dubstep" is caught above
    g.includes("mpb")                ||
    g.includes("samba")              ||
    g.includes("fado")               ||
    g.includes("bluegrass")          ||
    g.includes("zouk")               ||
    g.includes("mande")              ||
    g.includes("soukous")            ||
    g.includes("regional")           ||  // regional mexican, regional pop
    g.includes("brazilian funk")     ||
    g.includes("forró")              ||
    g.includes("axé")                ||
    g.includes("mbalax")             ||
    g.includes("bongo")              ||
    g.includes("benga")              ||
    g.includes("gqom")               ||
    g.includes("amapiano")           ||
    g.includes("maskandi")           ||
    g.includes("fuji")               ||
    g.includes("juju")               ||
    g.includes("compas")             ||
    g.includes("turkish")            ||
    g.includes("greek")              ||
    g.includes("persian")            ||
    g.includes("chinese")            ||
    g.includes("japanese")           ||
    g.includes("korean")             ||
    g.includes("traditional")
  ) {
    return { blueprintWorld: "World / Folk / Regional", blueprintSubgenre: rawGenre };
  }

  // ── Pop / Dance ─────────────────────────────────────────────────────────────
  // Last resort for anything containing "pop" or "dance" that hasn't already
  // been caught by a more specific category above.
  if (
    g.includes("pop")                ||
    g.includes("dance")
  ) {
    return { blueprintWorld: "Pop / Dance", blueprintSubgenre: rawGenre };
  }

  return { blueprintWorld: "Other", blueprintSubgenre: rawGenre };
}

/**
 * Classify a track using every Spotify genre string from every artist.
 *
 * Strategy: iterate all genres in the provided array and return the first
 * result that maps to a non-Other blueprint world. If every genre maps to
 * Other, fall back to classifying the very first genre (which will still be
 * Other, but preserves the raw genre string for diagnostics).
 *
 * The winning genre string is returned as `rawGenre` so it can be stored
 * in the database and used as the subgenre label in the UI.
 */
export function classifyGenres(genres: string[]): {
  rawGenre: string;
  blueprintWorld: string;
  blueprintSubgenre: string;
} {
  for (const genre of genres) {
    const result = mapSpotifyGenre(genre);
    if (result.blueprintWorld !== "Other") {
      return { rawGenre: genre, ...result };
    }
  }
  const fallback = genres[0] ?? "unknown";
  return { rawGenre: fallback, ...mapSpotifyGenre(fallback) };
}
