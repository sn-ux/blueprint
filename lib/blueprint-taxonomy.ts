export function mapSpotifyGenre(rawGenre: string) {
  const g = rawGenre.toLowerCase();

  if (
    g.includes("rap") ||
    g.includes("hip hop") ||
    g.includes("drill") ||
    g.includes("trap") ||
    g.includes("phonk") ||
    g.includes("grime")
  ) {
    return {
      blueprintWorld: "Rap / Hip-Hop",
      blueprintSubgenre: rawGenre,
    };
  }

  if (
    g.includes("r&b") ||
    g.includes("soul") ||
    g.includes("motown") ||
    g.includes("funk") ||
    g.includes("doo-wop")
  ) {
    return {
      blueprintWorld: "R&B / Soul / Funk",
      blueprintSubgenre: rawGenre,
    };
  }

  if (
    g.includes("rock") ||
    g.includes("indie") ||
    g.includes("grunge") ||
    g.includes("new wave") ||
    g.includes("psychedelic") ||
    g.includes("progressive")
  ) {
    return {
      blueprintWorld: "Rock / Indie / Alternative",
      blueprintSubgenre: rawGenre,
    };
  }

  if (
    g.includes("pop") ||
    g.includes("bedroom pop") ||
    g.includes("dream pop") ||
    g.includes("mandopop") ||
    g.includes("french pop") ||
    g.includes("norwegian pop")
  ) {
    return {
      blueprintWorld: "Pop / Dance",
      blueprintSubgenre: rawGenre,
    };
  }

  if (
    g.includes("jazz") ||
    g.includes("bossa nova") ||
    g.includes("hard bop") ||
    g.includes("blues")
  ) {
    return {
      blueprintWorld: "Jazz / Blues",
      blueprintSubgenre: rawGenre,
    };
  }

  if (
    g.includes("electronic") ||
    g.includes("house") ||
    g.includes("edm") ||
    g.includes("idm") ||
    g.includes("drum and bass") ||
    g.includes("lo-fi") ||
    g.includes("disco")
  ) {
    return {
      blueprintWorld: "Electronic / Ambient",
      blueprintSubgenre: rawGenre,
    };
  }

  if (
    g.includes("classical") ||
    g.includes("piano") ||
    g.includes("score") ||
    g.includes("soundtrack") ||
    g.includes("orchestral") ||
    g.includes("baroque") ||
    g.includes("impressionism")
  ) {
    return {
      blueprintWorld: "Classical / Score / Soundtrack",
      blueprintSubgenre: rawGenre,
    };
  }

  if (
    g.includes("afro") ||
    g.includes("highlife") ||
    g.includes("reggae") ||
    g.includes("reggaeton") ||
    g.includes("salsa") ||
    g.includes("merengue") ||
    g.includes("bolero") ||
    g.includes("kizomba") ||
    g.includes("celtic") ||
    g.includes("country") ||
    g.includes("americana") ||
    g.includes("folk") ||
    g.includes("tamil") ||
    g.includes("kannada") ||
    g.includes("malayalam") ||
    g.includes("indian") ||
    g.includes("vietnamese") ||
    g.includes("arabic") ||
    g.includes("egyptian") ||
    g.includes("brazilian funk") ||
    g.includes("corrido") ||
    g.includes("corridos tumbados") ||
    g.includes("sierreño")
  ) {
    return {
      blueprintWorld: "World / Folk / Regional",
      blueprintSubgenre: rawGenre,
    };
  }

  return {
    blueprintWorld: "Other",
    blueprintSubgenre: rawGenre,
  };
}
