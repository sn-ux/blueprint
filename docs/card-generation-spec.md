# Blueprint — Master Card Generation Spec

Recovered from the Manish design material, classified against what the data can
compute, and scored for product value. **No engine code has been written against
this yet.**

---

## 0. Sources

Recovered by decoding the IWA archives inside the iWork bundles in
`~/Desktop/Blueprint-Manish` (Snappy + Apple chunk framing), plus an
ASCII85+Flate decode for the one PDF. 15,417 lines across 17 documents.

| document | contribution |
|---|---|
| `Feed_Features_Normalized.pdf` | the ten insight patterns, *"distilled from 127 ranked permutations and badges"* |
| `FeedValuePermutations.numbers` | the 127-cell permutation grid |
| `FeedValueBadges.numbers` | ~60 named detectors with formula, caption, rationale, required data |
| `Feed_Features_Cards.numbers` | worked cards with faces / community / notes / caption |
| `FeedValueRanked.numbers` | per-permutation critical mass and compliance risk |
| `Discovery_Moments.pages` | 20 narrative user moments |
| `Blueprint_10_Core_Discovery_Features_Matrix.numbers` | ten core features, value ratings, data needs |
| `BlueprintWowFeatures.numbers` | data-category master sheet |
| + 9 further flow / persona / provenance documents | context |

---

## 1. The generative grammar

The 127 permutations are **one expression**, not 127 ideas:

```
UNIT YOU LACK  ×  SOCIAL SCOPE  ×  CONTEXT YOU HOLD
```

The badges are a **second, orthogonal axis** the grid does not contain:
detectors that fire on the *shape* of a holding rather than its membership.
Crossing them is where the expressiveness lives.

```
DETECTOR  ×  SUBJECT  ×  SCOPE  ×  PARTITION  ×  ZOOM
```

### The real dimension matrix

| axis | values |
|---|---|
| **SUBJECT** (what the card is about) | song · album · artist · subgenre · genre · person · group · *concert (unsupported)* |
| **DETECTOR** (the pattern) | completion · omission · concentration · consensus · rarity · asymmetry · release-chronology · behaviour-chronology · standing · movement · overlap · uniformity · catalogue-position · lineage · annotation |
| **SCOPE** (whose evidence) | self · one named person · k of n friends · community · comparison of two parties |
| **PARTITION** (the set it runs over) | artist · album · subgenre · genre · era / release year · catalogue segment · social group |
| **ZOOM** | one item · the aggregate |

The source states the zoom rule explicitly: *"most features have a zoom level
(one item vs the aggregate), chosen per card by how exceptional the single item
is."* The current engine has **no aggregate-zoom card at all**.

Not every cell is valid. Detector-specific rules decide which combinations mean
anything — see §3.

---

## 2. What the data holds

**Fully populated** (40,730 rows): `spotifyId, name, artist, artistId, album,
albumId, albumTotalTracks, albumType, trackNumber, discNumber, durationMs,
releaseDate (100%), releaseDatePrecision, blueprintWorld, blueprintSubgenre,
rawGenre, imageUrl, artistImageUrl`. Plus `Note` and `RecommendationExposure`.

**Barely populated**: `savedAt` — **1,589 of 40,730 (3.9%)**, one user. The
column exists in the database but is absent from `schema.prisma` and the import,
both reverted. See §8.

**Absent**: audio features, Spotify popularity, play counts, scrub positions,
credits, sample/cover lineage, ticket data, real communities, note positions,
note→save attribution, cross-community rates, age cohorts.

> **Audio features are blocked, not deferred.** The entire *revealed rule*
> family (patterns 4 and 5 of the ten) rests on Spotify's audio-features
> endpoint, closed to new applications since November 2024. The source material
> already lists *"essentia"* rather than Spotify for several of these badges.

---

## 3. The fourteen detectors

Each: condition · example · why interesting · data · subjects · scopes ·
computable · **adjacency risk** (how easily it degrades into "because you like
X, here is Y").

---

### D1 · COMPLETION
**Condition** `|held ∩ S| / |S| ≥ θ` and `0 < |S \ held| ≤ k`, for a defined set S.
**Example** *"You have saved every song on Blonde except this one."*
**Why interesting** Very high *subject* relevance — they demonstrably care about the object. The source calls the remainder *"the clerical remainder"*, and calls the taste risk zero; **that is too strong.** Subject relevance does not transfer to the missing item: somebody holding 10 of 11 tracks has most likely played the record through, which makes a deliberate exclusion at least as plausible as a gap. Completion may be non-monotonic — a partly-held record can carry a better opportunity than an almost-complete one. Treat **subject relevance** and **missing-item opportunity** as separate variables.
**Data** `albumId`, `albumTotalTracks`, `trackNumber` — all present.
**Subjects** album · artist catalogue · era-slice of a catalogue · community top-N.
**Scopes** self (the set is yours) · any scope supplies the remainder.
**Computable** ✅ today.
**Adjacency risk** **None.** The subject is already in the library.

### D2 · CONSENSUS
**Condition** `k` independent holders of the same object, `k ≥ θ`, each holding ≥2 items of it.
**Example** *"Nine of your twelve friends have saved this. You haven't."*
**Why interesting** Independent agreement beats any single opinion, and it is the **only legitimate route to an artist with no prior relationship to the user**.
**Data** holder sets — present.
**Subjects** track · album · artist · subgenre.
**Scopes** k of n · community.
**Computable** ✅ today.
**Adjacency risk** **Low** when k ≥ 3 and the scope is the evidence. **High** if a taxonomy context is allowed to substitute for holders — that is exactly how `ARTIST_ABSENT_IN_LANE` degenerated.

### D3 · OMISSION (absence)
**Condition** zero holdings in a partition the population occupies heavily.
**Example** *"You have nothing at all from the 1980s."*
**Why interesting** A total absence is felt; a thin patch is not.
**Data** partition membership — present for era/genre/subgenre.
**Subjects** decade · subgenre · genre.
**Scopes** self, vs community.
**Computable** ✅ for era and taxonomy; ❌ for attribute absences (needs audio features).
**Adjacency risk** **High.** "You have no X, here is X" is adjacency unless the absence itself is remarkable and the entry point is chosen by consensus (D2).

### D4 · STANDING
**Condition** viewer's rank within a population on a partition.
**Example** *"You have more shoegaze saved than anyone here, and this still isn't in your library."*
**Why interesting** The most flattering framing available attached to the shortest to-do list.
**Data** depth counts — present.
**Subjects** genre · subgenre.
**Scopes** community.
**Computable** ✅ today (scope = whole corpus until real communities exist).
**Adjacency risk** None — it is a statement about the user.

### D5 · MOVEMENT
**Condition** Δ rank or Δ save-count over a window.
**Example** *"Two weeks ago it was the 50th most-saved song here. Now it's 2nd."*
**Why interesting** Being late is a feeling.
**Data** needs `savedAt` **and** historical snapshots.
**Computable** ❌ — see §8.
**Adjacency risk** None.

### D6 · OVERLAP (the taste twin)
**Condition** pairwise library similarity scoped to a partition, unusually high.
**Example** *"The person whose rap library is 97% the same as yours saved this. You didn't."*
**Why interesting** The source's claim: their non-overlapping saves are the highest-precision recommendations available.
**Data** library sets — present.
**Subjects** person.
**Scopes** one named person.
**Computable** ✅ today.
**Adjacency risk** **Medium.** It is nearest-neighbour by construction — but the neighbour is a *named human with a measured overlap*, not a latent vector, and the evidence is their actual save. Keep the person and the number visible or it becomes collaborative filtering with a face painted on.

### D7 · UNIFORMITY (the revealed rule)
**Condition** every held item in a partition shares a property; a candidate complies or breaks it.
**Example** *"All 22 of your soul saves were recorded before 1975. So was this."*
**Why interesting** A rule the user follows without knowing, stated back to them.
**Data** era → ✅ present. Tempo / duration / structure / vocals → ❌ audio features.
**Subjects** genre × any attribute.
**Computable** ⚠️ **era and duration only.**
**Adjacency risk** Low — the observation is about the user, not about similarity.

### D8 · RELEASE CHRONOLOGY
**Condition** distribution of holdings over *release* time: holes, bounds, concentration.
**Example** *"You have saved something from every year of Jamie xx's career except 2021."*
**Why interesting** Reframes a library as a project with one hole left in it.
**Data** `releaseDate`, 100% coverage.
**Subjects** artist catalogue · subgenre · genre.
**Computable** ✅ today.
**Adjacency risk** **Low for holes, high for "eras".** See §5 — release order is data; musical lineage is interpretation.

### D9 · BEHAVIOUR CHRONOLOGY
**Condition** distribution of holdings over *save* time.
**Example** *"Caleb saved it, then Maya, then Dev. You still haven't."*
**Why interesting** Order makes visible that something moved through the group and stopped before you.
**Data** `savedAt` — **3.9% populated**.
**Computable** ❌ today, ✅ after §8.
**Adjacency risk** None.

### D10 · CATALOGUE POSITION
**Condition** ordinal position of a release within an artist's sequence, relative to the viewer's holdings.
**Example** *"He has released two records since the last time you saved anything of his."*
**Why interesting** Regret about an artist already loved needs no argument.
**Data** `releaseDate` + artist holdings — present.
**Subjects** artist.
**Computable** ✅ today.
**Adjacency risk** None — the artist is already held.

### D11 · LINEAGE
**Condition** an external edge: sample, cover, credit, label, membership.
**Example** *"The hook in a song you have already saved was sampled from this record."*
**Why interesting** Recognition on first listen; works at cold start with no social graph; motivates through curiosity rather than conformity.
**Data** ❌ external (MusicBrainz / WhoSampled / Discogs).
**Computable** ❌.
**Adjacency risk** None — the catalogue vouches, not a taste model.

### D12 · ANNOTATION
**Condition** notes as first-class objects: count, length, author standing, position.
**Example** *"More people here have written notes about this than about any other song."*
**Why interesting** The one thing library data cannot generate. Blueprint's actual differentiator.
**Data** `Note` — present but sparse; positions absent.
**Computable** ⚠️ counts and authors yes; positions and attribution no.
**Adjacency risk** None.

### D13 · RARITY
**Condition** very few holders, in a partition the viewer occupies.
**Example** *"Only four people here have saved this. You could be the fifth."*
**Why interesting** Rarity plus a countable position.
**Data** holder counts — present.
**Computable** ✅ but **needs a real scarcity threshold** — at 2 holders it fires on thousands of tracks per user and means nothing.
**Adjacency risk** Medium — rarity alone is not relevance; must be paired with an occupied partition.

### D14 · ASYMMETRY
**Condition** your coverage vs a party's coverage of the same partition.
**Example** *"88 songs are in most of your friends' libraries and missing from yours."*
**Why interesting** The aggregate zoom — the size of the diff is the story.
**Data** present.
**Subjects** any partition.
**Scopes** k of n · community · one person.
**Computable** ✅ today.
**Adjacency risk** Low.

---

## 4. Card-family classification

**A** observation · **B** completion · **C** social discovery · **D** chronological/structural · **E** exploration · **F** recommendation-like.

| family | class | interest | what the user realises |
|---|---|---|---|
| D1 completion | **B** | **HIGH** | "I skipped part of something I already own" |
| D2 consensus (k≥3) | **C** | **HIGH** | "Everyone around me knew this" |
| D14 asymmetry, aggregate | **C** | **HIGH** | "There is a measurable hole between me and my circle" |
| D7 era rule | **A** | **HIGH** | "My taste in this genre is era-bound and I never knew" |
| D8 missing year / period | **D** | **HIGH** | "My library is a project with one hole in it" |
| D10 releases since | **B** | **HIGH** | "I stopped following someone I love" |
| D4 standing + gap | **A** | MEDIUM | "I lead this and still don't have this" |
| D6 taste twin | **F** ⚠️ | MEDIUM | "One person is effectively me" |
| D12 annotation | **A/C** | MEDIUM | "Someone explained this" |
| D13 rarity | **C** | MEDIUM | "Almost nobody here has this" |
| D3 omission | **F** ⚠️ | LOW–MED | "A whole region is missing" |
| D5 movement | **C** | MEDIUM | "I'm late" |
| D9 save order | **C** | **HIGH** | "It moved through my group and stopped at me" |
| D11 lineage | **D** | **HIGH** | "This is where that came from" |

### Category F — closest to reverting into a recommendation engine

1. **D6 taste twin** — nearest-neighbour by construction. Defensible *only* while the person and the overlap number stay on the card.
2. **D3 omission** — "you have none of X, here is X" is adjacency wearing a gap's clothing. Needs D2 to choose the entry point.
3. **Any detector whose evidence is a taxonomy context rather than holders** — the failure mode that produced 2,079 useless `ARTIST_ABSENT_IN_LANE` candidates.

---

## 5. Chronology: two concepts, never blurred

### A · Release chronology — when the music came out
Computable today at 100% coverage. Holes, bounds, concentration, ordinal position.

### B · Behaviour chronology — when the *user* saved
Needs `savedAt`. Save order through a group, dormancy, acceleration, shifts.

### Lineage classification — what release order does and does not prove

| claim | status |
|---|---|
| *"This album came immediately before that one"* | **COMPUTABLE** from `releaseDate` |
| *"You have every year of their career except 2021"* | **COMPUTABLE** |
| *"All your soul is pre-1975"* | **COMPUTABLE** |
| *"Two records since you last saved them"* | **COMPUTABLE** |
| *"This is where the band's sound changed"* | **REQUIRES EXTERNAL MUSIC KNOWLEDGE** |
| *"This subgenre evolved into that one"* | **REQUIRES EXTERNAL MUSIC KNOWLEDGE** |
| *"The original behind this cover"* / *"the sample source"* | **REQUIRES TRACK RELATIONSHIP DATA** |
| *"Their last record before they broke up"* | **REQUIRES EXTERNAL MUSIC KNOWLEDGE** |
| *"The session that produced two albums"* | **REQUIRES TRACK RELATIONSHIP DATA** |
| *"This is the entry point to that era"* | **REQUIRES HUMAN CURATION** |

> **Hard rule.** Release dates may state *position*. They may never imply
> *influence, causation or evolution*. "The record before" is a fact. "Where
> their sound changed" is a claim we cannot support and must not make.

---

## 6. Measured frequency — how often each detector actually fires

Run against all seven real libraries. This is what makes the priority scoring
honest rather than guessed.

| detector | SahajDole 5,023 | Surya 4,890 | Amanda 1,623 | Manish 476 | SN 29 | ChrisJ 17,991 | Ethan 10,698 |
|---|---|---|---|---|---|---|---|
| **D1** completion (authoritative albums) | 19 | 55 | 4 | 2 | **0** | **243** | 42 |
| **D2** consensus, ≥3 independent holders | 95 | 79 | 265 | 372 | **400** | **6** | 98 |
| **D7×D8** era rule (lane ≥8 items, span ≤12y) | 13 | 11 | 10 | 7 | 0 | 30 | 20 |
| **D8** sole missing year in a catalogue | 20 | 14 | 2 | 0 | 0 | 6 | 13 |
| **D10** releases since you stopped | 66 | 20 | 70 | 20 | 0 | 3 | 52 |
| **D3** decade absent entirely | 0 | 0 | 0 | 0 | 3 | 0 | 0 |
| **D13** rarity at 2 holders | 3,697 | 1,391 | 2,563 | 934 | 5 | 265 | 2,397 |

### Three findings that change prioritisation

1. **D1 and D2 are anti-correlated with library size and cover opposite ends of
   the user spectrum.** D2 is the cold-start detector (SN, 29 tracks → 400
   candidates; Chris Jordan, 17,991 → 6). D1 is the power-user detector
   (Chris Jordan → 243; SN → 0). **Building both covers every user.** Neither
   alone does.
2. **Chronology fires consistently but modestly (0–30), and zero on the smallest
   library.** It is a mid-to-large-library detector. It should *not* be built
   first merely because `releaseDate` is complete — which was my earlier
   recommendation and was wrong.
3. **D3 decade-absence is effectively dead** (0 for six of seven users). Large
   libraries touch every decade. It is a small-library card only.
4. **D13 rarity at 2 holders fires thousands of times** — the threshold is
   meaningless. Real rarity needs a share-of-population definition.

---

## 7. Priority

`PRIORITY = INTEREST × DISTINCTIVENESS × DATA READINESS × FREQUENCY × CONFIDENCE`

| detector | interest | distinct | data | freq | conf | priority |
|---|---|---|---|---|---|---|
| **D2 consensus** | HIGH | HIGH | ✅ | HIGH | HIGH | **1** |
| **D1 completion** | HIGH | HIGH | ✅ | HIGH* | HIGH | **2** |
| **D14 asymmetry (aggregate zoom)** | HIGH | HIGH | ✅ | HIGH | HIGH | **3** |
| **D10 catalogue position** | HIGH | MED | ✅ | MED-HIGH | HIGH | **4** |
| **D7 era rule** | HIGH | **HIGHEST** | ✅ | MED | HIGH | **5** |
| **D8 release chronology holes** | HIGH | HIGH | ✅ | MED | HIGH | **6** |
| **D4 standing** | MED | MED | ✅ | HIGH | HIGH | **7** |
| **D13 rarity** | MED | MED | ✅ | needs threshold | MED | **8** |
| **D6 taste twin** | MED | MED | ✅ | MED | MED (F-risk) | **9** |
| **D12 annotation** | MED | **HIGHEST** | ⚠️ sparse | LOW now | HIGH | **10** |
| D9 behaviour chronology | HIGH | HIGH | ❌ | — | — | after §8 |
| D5 movement | MED | MED | ❌ | — | — | later |
| D3 omission | LOW-MED | LOW | ✅ | ~0 | LOW | skip |
| D11 lineage | HIGH | **HIGHEST** | ❌ external | — | — | future |

\* per-user, not per-library-size — zero for the smallest.

---

## 8. What restoring `savedAt` unlocks

Four distinct clocks, not one:

| clock | source | status |
|---|---|---|
| **Release date** | Spotify album metadata | ✅ 100% |
| **User save time** | Spotify `added_at` on `/me/tracks` | ⚠️ 3.9% |
| **Friend save order** | the same field, across users | ⚠️ same |
| **Group trend timing** | save times aggregated + snapshots | ❌ needs both |

Restoring it is: one `schema.prisma` line, one line in `lib/spotify-import.ts`,
and `scripts/backfill-saved-at.mjs`, which already exists and works (it produced
the 1,589 rows).

**Unlocked immediately:** D9 save order through a group · dormancy (*"nothing by
them since 2019"*) · acceleration into a subgenre · a dormant area returning ·
your own discovery timeline · *"three friends saved this the same day"* ·
*"written before anyone saved it"* · recent-saves lift in ranking.

**Unlocked with snapshots as well:** D5 rank movement · track velocity ·
post-event spikes.

---

## 9. The 127 permutations, mapped back

| permutation cell | verdict |
|---|---|
| song × any scope × **album you partly have** | **compelling** — this is D1 + D2 together, the strongest cell in the grid |
| song/album × any × **artist you save** | **compelling** — D2 on a directly-held subject |
| album × friends × **artist you save** | **compelling** — the album is the unit, several people chose it whole |
| artist × **k of n friends** × any context | **compelling only via D2** — the holders are the evidence; the context is grouping |
| artist × **one friend** × subgenre/genre you save | **invalid** — one holder plus a taxonomy edge is the `ARTIST_ABSENT_IN_LANE` failure |
| subgenre × any × genre you save | **invalid** — parent occupancy → child adjacency |
| genre × any × (nothing) | **weak** — "you have no amapiano" is category F unless D2 picks the entry point |
| song/album × community × subgenre/genre | **repetitive** with the friends-scope cells; same proposition at a different n |
| all 12 concert cells | **unsupported** — no ticket data |
| 3 "people with depth" cells | **valid, different product** — these are person cards, not music cards |

**The grid alone is too generic.** `song × friends × genre you hold` collapses
into "because you like this genre, here is a song". What rescues a cell is a
detector: the same cell with D1 becomes *"the one track you're missing from a
record you already own"*, and with D2 at k≥3 becomes *"nine of your twelve
friends kept this"*. **The detector is what makes the proposition interesting;
the permutation only says where to look.**

---

## 10. Thirty cards the grammar should produce

Each as `DETECTOR × SUBJECT × SCOPE × PARTITION`.

**Completion**
1. D1 × album × self — *"You have saved every song on this record except one."*
2. D1 × album × k-of-n — *"Two songs short of the whole record; five friends have both."*
3. D1 × artist × self — *"You have every record they have made except this one."*
4. D1 × artist × self, aggregate — *"You are one song short of completing four of their records."*
5. D1 × community-top-N × community — *"You have 19 of the 20 most-saved songs here. This is the one."*
6. D1+D2 × album × community — *"The most-saved song here from a record you only half own."*

**Social consensus**
7. D2 × artist × k-of-n — *"Nine of your twelve friends save him. You have nothing."*
8. D2 × track × k-of-n — *"All twelve of your friends have this. You don't."*
9. D2 × album × k-of-n — *"Seven friends kept this record whole."*
10. D2+D6 × track × two people — *"Caleb and Maya's libraries barely overlap, and both kept this."*
11. D13+D2 × track × community — *"Only four people here have this. You could be the fifth."*
12. D14 × any × k-of-n, aggregate — *"88 songs are in most of your friends' libraries and none of yours."*
13. D14 × subgenre × community, aggregate — *"31 shoegaze songs are in over half the shoegaze libraries here and none of yours."*

**Observation about the user**
14. D7 × genre × era — *"All 22 of your soul saves were recorded before 1975. So was this."*
15. D7 × genre × duration — *"You have never saved a rap song over four minutes. This one is 3:12."*
16. D4+D3 × subgenre × community — *"You have more shoegaze than anyone here, and this still isn't in your library."*
17. D7 × album-position × self — *"You save the closing track on almost every album you keep. This is one."*
18. D4 × genre × community — *"Save twelve more jazz songs and you'll be one of the ten deepest here."*

**Release chronology**
19. D8 × artist × year — *"You have something from every year of their career except 2021."*
20. D8 × subgenre × era — *"Your entire interest in this style sits in an eleven-year window."*
21. D8 × artist × era — *"You have their first four records and nothing after 2016."*
22. D10 × artist × self — *"Two records since the last time you saved anything of theirs."*
23. D10 × artist × self — *"The record they made immediately before the one you hold most of."*
24. D8 × artist × era, aggregate — *"You have the beginning and the end of this catalogue and none of the middle."*
25. D8+D2 × subgenre × era × community — *"Your holdings in this style stop in 1979. Here is what this group keeps from the decade after."*

**Structural / relational**
26. D14 × artist × one person — *"You and Caleb hold the same artist and share only three songs."*
27. D6 × person × genre — *"The person whose rap library is 97% yours saved this. You didn't."*
28. D7 × artist × genre — *"This is the only jazz record this artist ever made, and you have their other work."*
29. D12 × track × community — *"More people here have written about this than about any other song."*
30. D12+D4 × track × self — *"You have more of this style than anyone here and nobody has written a note on this yet."*

Cards 15 and 17 depend on data: 15 needs duration only (**computable**), 17 needs
`trackNumber`/`albumTotalTracks` (**computable**). No card above depends on
audio features.

---

## 11. Subgenre × Era — the detailed treatment

The card family the current engine misses entirely. Seven structures:

| # | observation | why interesting | what it opens | computable |
|---|---|---|---|---|
| 1 | **Narrow window** — all holdings in a lane fall inside a short span | Their taste in a genre is era-bound, which no genre page can express | Other music from that same window in that lane, chosen by consensus | ✅ |
| 2 | **The bounded edge** — holdings stop hard at a year | The boundary is a fact about them they have never seen stated | What the same lane contains immediately either side of the boundary — *presented as position, never as "the next evolution"* | ✅ |
| 3 | **Complete except one period** | A library as a project with one hole | That period's most-held material in the lane | ✅ |
| 4 | **Bimodal** — early and late, nothing between | The shape is strange enough to be worth showing | The middle | ✅ |
| 5 | **Group is elsewhere in time** — your holdings centre on one era, the group's on another, same lane | A measurable asymmetry between you and people you know, inside territory you share | What they keep from their period | ✅ |
| 6 | **Artist migration** — an artist you hold moved through the lane over time | Reveals that a catalogue has a shape | The part of that catalogue outside your window | ✅ |
| 7 | **Era concentration vs the lane's own span** — you hold 11 of 40 years | Puts a number on how much of a territory's history you have touched | The unheld years, entry chosen by consensus | ✅ |

**All seven are computable today.** Every one is an *observation about the
user's own holdings* — the interesting fact is structural, and the music follows
from it. None of them says "you like 1970s soul, therefore try 1980s soul": #2
and #5 come closest, and both are framed as *position* and *asymmetry* rather
than as succession.

Frequency measured: structure #1 fires 7–30 times per mid-to-large library,
**0 on a 29-track library**.

---

## 12. What the current engine cannot express

| missing | detectors |
|---|---|
| Anything about **when music was released** | D7 (era), D8, D10 |
| Anything about **when the user saved** | D9, D5 |
| **Aggregate zoom** — the size of a diff as the card | D14 |
| **Standing and rarity** framings | D4, D13 |
| **Notes** in generation | D12 |
| **Completion at community scale** | D1 × community-top-N |

The six mechanisms agreed earlier are D1, D2, D6 and D14 on album/artist/track
partitions. Everything in the table above is genuinely new capability.
