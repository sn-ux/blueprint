# Blueprint — The Card Generation Algorithm

**STATUS: CANONICAL GENERATION ARCHITECTURE — NOT YET EMPIRICALLY CALIBRATED**

Canonical explanation of **how** Blueprint generates cards.
`card-generation-spec.md` remains the design-space and detector reference.
`detector-evaluation.md` is a disposable sample.

Ranking is out of scope. This document ends at *"here is a set of admissible
candidates."*

---

## 0. Results of the pressure test

Twelve prior claims, challenged. Eight survive (several sharpened); four are
materially amended. Every amendment makes the system **smaller**, not larger.

| # | claim | verdict |
|---|---|---|
| 1 | `⟨SET, STATISTIC, BASELINE, DEVIATION⟩` is minimal and complete | **HOLDS**, with two clarifications — sets may be *ordered*; partitions may be defined by *external relations* |
| 2 | 127 permutations and ~60 badges are one addressing system | **HOLDS** |
| 3 | Interest is boolean gates, not a weighted score | **HOLDS, STRENGTHENED** — seven gates reduce to **five** |
| 4 | Deviation percentile is the retained cross-detector value | **AMENDED** — percentile is one null among several; carry *normalized extremeness* plus *its kind* |
| 5 | SR and OC are separate | **AMENDED** — OC is not a probability. Renamed **NEP**, emitted as an ordered class |
| 6 | Absence is ambiguous | **HOLDS, SHARPENED** — one new computable signal (§9) |
| 7 | Baselines are essential | **AMENDED** — what looked like several kinds of baseline is **one null plus correct set construction**. The NON-ARTIFACT gate dissolves |
| 8 | Consolidate before openable resolution | **HOLDS, AMENDED** — identity needs *claim shape*, not evidence containment alone |
| 9 | Verifiable statements, not preference prediction | **HOLDS, STRENGTHENED** — becomes a *type constraint*, not a policy |
| 10 | CF / embeddings / taxonomy / LLMs support but never trigger | **HOLDS** |
| 11 | A portfolio is necessary; frequency is coverage | **HOLDS, STRENGTHENED** — the necessity is structural (§13) |
| 12 | Two unresolved uncertainties | **AMENDED** — there are **three**. The third is the most serious (§16) |

---

## 1. The representation, tested against everything recovered

> **OBSERVATION = ⟨ SET , STATISTIC , NULL , DEVIATION ⟩**
> **SET = PARTITION × SCOPE**, where a PARTITION may carry an intrinsic order.
> A **detector** is a `(STATISTIC, NULL, CONDITION)` triple — never a primitive
> card type.

Every recovered idea, tested:

| idea | SET | STATISTIC | fits? |
|---|---|---|---|
| Completion | album tracklist × self | coverage + residue | ✓ |
| Consensus | subject × population | weighted holder aggregate | ✓ |
| Standing | partition × community | rank, adjacent-rank gap | ✓ |
| Taste twin | partition × one named person | overlap coefficient | ✓ |
| Era concentration | lane holdings × self (**ordered by year**) | entropy / divergence | ✓ |
| Chronology holes | artist release years × self (**ordered**) | interior run length | ✓ |
| Catalogue position | catalogue × self (**ordered**) | ordinal adjacency | ✓ — but see §7 |
| Rarity | subject × eligible population | holder share | ✓ |
| Aggregate asymmetry | coherent partition × k-of-n | diff cardinality | ✓ |
| Annotation | notes on subject × community | count / existence | ✓ — see §7 |
| Cross-person patterns | partition × A-vs-B | divergence between two holdings | ✓ |
| Structural gaps | partition × self | absence | ✓ |
| Sequence / run patterns | **ordered** partition × self | run, boundary, modality | ✓ |
| Lineage | partition defined by an **external relation** | any of the above | ✓ representationally; ✗ on data |

**Two clarifications, no new dimensions.**

**(a) Sets may be ordered.** Run, gap, boundary, position and modality
statistics are not expressible over unordered sets. Order is a property of the
partition (release year, track number, `savedAt`), not a fifth axis. This is
what lets the entire chronological and catalogue-position family live in the
same grammar as coverage and holder counts.

**(b) Partitions may be defined by external relations.** "Musicians who played
on this record" is a partition like any other; it simply requires data we do
not have. **Lineage is blocked by missing data, not by the representation.**
This matters for the Manish conversation: the architecture does not need to
change when credits data arrives.

**One genuine addition, in §7:** DEVIATION is not always statistical. That is
the only place the four-part object proved insufficient.

**ZOOM remains rejected** as an axis — it is already determined by PARTITION,
and treating it as independent is precisely what causes one fact to be emitted
four times.

---

## 2. BASELINE is not too broad — it was hiding a set-construction bug

Seven candidate baseline concepts were tested. Six of them — expected value,
reference population, null model, historical self, catalogue, peer — are the
same primitive: **the distribution the statistic takes when nothing notable is
happening**. They differ only in *which comparison class it is estimated over*,
which is a parameter, not a concept.

The seventh, **structural possibility**, is different in kind. It does not say
what is *likely*; it says what is **possible**. And that turns out not to be a
baseline at all:

> **Structural possibility is the correct construction of SET.**

- A "hole" in a year the artist released nothing → the set was built from
  calendar years instead of the artist's release years.
- Era concentration that is really the lane's lifetime → the set was built from
  all time instead of the lane's actual year support.
- Rarity in a tiny population → the population was built from all users instead
  of eligible users.
- Completion on a compilation → the set was built from a pressing rather than
  an authored album.
- A "missing" remaster of a record already held → the set was built from
  Spotify ids instead of work keys.

Every one of these was previously a *threshold* problem. All five are **set
construction**. This yields the single most useful engineering rule in the
document:

> **If a statement can be false for structural reasons, fix the SET. Never fix
> the threshold.**

**Consequence:** the NON-ARTIFACT gate dissolves. Its work is done by set
construction (above) and by *effective* sample size (§3). What remains —
remaster dates, duplicate accounts — is input **data quality**, which is a
property of the corpus and cannot be gated at candidate time. Saying so is more
honest than keeping a gate that does not actually catch it.

---

## 3. Seven gates reduce to five

| gate | prevents | universal? | when | verdict |
|---|---|---|---|---|
| **SAMPLE** (effective) | statistics on sets too small — or too *dependent* — to mean anything | universal | pre-statistic | **KEEP** |
| **STAKE** | true but irrelevant to this person | universal, detector-specific floors | pre-statistic | **KEEP** |
| **DEVIATION or SALIENCE** | unremarkable | universal, two routes (§7) | post-statistic | **KEEP** |
| **EVIDENCE LOCALITY** | adjacency-triggered cards | universal | post-statistic | **KEEP**, renamed |
| **OPENABLE** | a fact that leads to no music | universal | post-resolution | **KEEP** |
| ~~NON-ARTIFACT~~ | structural false positives | — | — | **DISSOLVED** → §2 |
| ~~DISTINCT~~ | duplicate facts | — | — | **NOT A GATE** — consolidation *rewrites* the candidate set rather than filtering it. It is a pipeline step (§10) |

Two refinements earned by the reduction:

**SAMPLE must count independent units, not rows.** Forty tracks from one album
is `n = 1` for the claim *"your taste in this lane is concentrated."* Effective
sample size — distinct albums, distinct artists, distinct people — is what the
old NON-ARTIFACT diversity guards were really measuring.

**EVIDENCE LOCALITY is a type constraint, not a policy.**

> The card's **subject** must be an element of the SET the statistic was
> computed on, or be that SET itself.

This converts "no recommendations by similarity" from a rule we promise to
follow into a property the pipeline cannot violate. *Coltrane → Pharoah
Sanders* fails because Pharoah Sanders is not in the set (the viewer's Coltrane
holdings) that produced the statistic. D2 consensus passes because the subject
**is** the set the holder statistic was computed on. D1 passes because the
residue lies inside the album set. The same constraint reappears at the other
end of the pipeline in §11, which is a good sign the formalization is right.

**Dependencies.** STAKE and SAMPLE are independent and both precede the
statistic — they are the cheap eliminating pair. DEVIATION depends on both
(it needs a well-formed set). EVIDENCE LOCALITY depends on none. OPENABLE
depends on resolution and therefore runs last.

---

## 4. STAKE, defined

> **STAKE:** the SET is materially connected either to what this user has
> invested in, or — for population-evidenced detectors only — to evidence
> strong enough to stand without them.

Two admissible sources, and only two:

**SELF-STAKE** — satisfied if **either** floor is met (a disjunction, not a
blend):
- *absolute support*: `|H(viewer) ∩ S| ≥ θ_abs` — this is a real amount of music
- *share of world*: `|H(viewer) ∩ S| / |H(viewer)| ≥ θ_share` — this is a real
  part of **their** music

**SOCIAL-STAKE** — for D2 only: `|hold(s,P)| ≥ 2` independent holders, each with
real depth in the territory, in an eligible population `|P| ≥ θ_pop`.

Testing the examples given:

| statement | verdict |
|---|---|
| "1 of your 2 jazz tracks is from 1973" | fails **both** floors — 1 track absolute, and one-track partitions are noise. Also fails SAMPLE. Correctly killed twice |
| "241 of your 241 melodic rap tracks are from one decade" | passes absolute and share. Clear stake |
| "3 of your 4 closest friends hold this album" | fails self-stake, passes **social**-stake. Correctly admitted — this is why a small library is not a dead user |

The disjunction is load-bearing across the real library range. A user with
17,991 tracks holding 12 in a lane has a genuine relationship (absolute); a
user with 29 tracks holding 12 in the same lane has a genuine relationship
(share). Neither floor alone admits both. Neither requires a weight.

Stake is a property of the SET and is evaluated **before any statistic is
computed** — it is the cheapest and most eliminating operation in the pipeline.

---

## 5. DEVIATION, defined without false comparability

Percentile is **not** always the right measure. The correct definition:

> **DEVIATION = the normalized extremeness of the statistic under the
> detector's own null — the probability that a null-generated instance would be
> at least this extreme — expressed on `[0,1]`, and carried together with the
> *kind* of null that produced it.**

What makes detectors comparable is not shared units. It is that each is mapped
to the same question: *how unlikely is this under a world where nothing
notable is happening?* Every listed measure answers it in its own idiom:

| null idiom | used by |
|---|---|
| binomial tail | consensus (holders vs territorial base rate) |
| hypergeometric | taste twin (overlap controlling both library sizes) |
| run probability | chronology holes (gap vs the user's own sampling rate) |
| entropy / KL divergence | era concentration (viewer's years vs the lane's years) |
| rank + gap statistic | standing |
| empirical percentile | rarity, asymmetry, completion |
| — none — | catalogue position, annotation (§7) |

Each candidate carries:

```
deviation        ∈ [0,1]
deviation_kind   ∈ { ANALYTIC , EMPIRICAL , STRUCTURAL }
```

`deviation_kind` exists to prevent the specific dishonesty of treating an
empirical percentile drawn from a **7-user corpus** as though it were a
p-value. It is not. It is a rank among seven. Labelling it keeps the
architecture from silently over-claiming as the corpus grows or shrinks — and
it is the reason §16 lists corpus size as the third major uncertainty.

---

## 6. Nulls, per detector family

| detector | SET (support) — *what is possible* | NULL — *what is expected* | kind |
|---|---|---|---|
| **Completion** | the authoritative tracklist, albumType-filtered, work-keyed | the viewer's **own** coverage distribution over albums they hold any of. 8/10 is interesting because their median album coverage is far lower | EMPIRICAL |
| **Consensus** | subjects of the same type in the same territory | binomial: more holders than expected if holders were drawn at the territory's base rate | ANALYTIC |
| **Era concentration** | the lane's **actual** release-year support | divergence of the viewer's year distribution from the **lane's available** year distribution — not from uniform, which would flag every skewed genre | ANALYTIC |
| **Chronology hole** | the artist's **actual** release years | run probability under random selection at the **user's own observed sampling rate**. A 3-year gap in a catalogue they hold 18% of is *expected*; the same gap at 80% is not. This is the precise answer to "meaningful hole vs ordinary selective listening" | ANALYTIC |
| **Standing** | eligible population within the partition | distribution of **adjacent-rank gaps**. Rank alone is not the statistic — rank-1 by one track is noise. Ranked on absolute holdings, because standing is a claim about the territory; the gap requirement is what stops a large library winning on noise | EMPIRICAL |
| **Rarity** | people holding the **partition**, not all users | holder-share distribution within that partition, with a hard minimum population | EMPIRICAL |
| **Asymmetry** | one coherent partition | distribution of diff sizes across members of the population for the same partition | EMPIRICAL |
| **Taste twin** | the partition's available material | hypergeometric expectation given both library sizes, with each shared item weighted by inverse holder share so agreeing on famous records counts for little | ANALYTIC |
| **Catalogue position** | the artist's ordered catalogue | **none exists and none is needed** — see §7 | STRUCTURAL |

The table's real value is the last column: it shows exactly where we have a
**true statistical baseline** and where we have a **structural** one. Four of
nine are analytic. Four are empirical and therefore corpus-size-limited today.
One is structural and is not a statistical claim at all.

---

## 7. Two admissible routes — statistical deviation and structural salience

This is the critical question, and the answer is **yes, two routes are
required.** Forcing every card through a significance framework would reject
the most legible cards in the system.

*"You have every track on this record except one"* is not statistically rare —
many users have partial albums. It is **structurally salient**: it names the
single boundary element of a closed set the user themselves nearly completed.
*"The record immediately after the last one you saved"* is not anomalous
either. Both are compelling. Both would die under a p-value gate.

> **STRUCTURAL SALIENCE:** the observation names a **distinguished element of a
> closed set defined by the user's own holdings**, where *distinguished* means
> identified by **position, adjacency, or boundary** — not by magnitude.

Three conditions, all necessary, which is what stops this being a loophole:

1. the set is **closed** (an album, a catalogue, a year span — enumerable and
   bounded), not open-ended like a genre;
2. the set is **defined by the user's own holdings**, not by taxonomy;
3. the element is distinguished **positionally** — first, last, only, adjacent,
   sole-missing — not because it is big.

*"Here is an artist in the same subgenre"* cannot pass: a subgenre is neither
closed nor bounded by the user's holdings, so no element of it is
distinguished. The two routes admit exactly the compelling structural cards and
nothing else.

A candidate must satisfy **at least one** route. Both are recorded, since a
card that is *both* salient and improbable is a different object from one that
is merely salient — but that distinction is ranking's to use, not
generation's.

---

## 8. Completion, without fake precision

The relationship is **not a product.** SR and NEP are not commensurable, and
multiplying them would manufacture a number with no meaning.

```
SR(S)   = evidence the subject matters       — monotone increasing in coverage
NEP(x)  = plausibility that x was never met  — may fall as coverage → 1
```

The correct treatment, given that we have no labels:

- **SR is a gate.** It must clear a floor. It is monotone, so this is simple.
- **NEP is a class**, not a number: `LIKELY-UNENCOUNTERED | AMBIGUOUS |
  LIKELY-ENCOUNTERED`.
- Generation requires `SR ≥ floor` **and** `NEP ≠ LIKELY-ENCOUNTERED`.
- Coverage and the NEP class are both **emitted on the candidate**. Whether
  there is an admissible coverage *window* — and where it sits — is not
  derivable today.

**We deliberately do not define a coverage window.** The non-monotonicity
hypothesis is real and testable, but it is a hypothesis. Inventing a window now
would be exactly the fake precision this pass exists to remove.
→ **NEEDS HUMAN-LABEL VALIDATION.**

---

## 9. NEP — non-encounter plausibility

Renamed from "opportunity confidence." **It is not a probability.** We observe
no exposure, hold no play history, and have no ground truth against which to
calibrate one. Calling `1 − P(encountered)` a probability would be a claim we
cannot support. It is an **ordered class** derived from signals that are all
computable today:

| signal | direction |
|---|---|
| Missing item **postdates** the user's latest holding in the subject | **INCREASES** — strongest available |
| Omission spans an entire album by an artist they otherwise hold | **INCREASES** |
| Missing item is rare in the corpus (low ambient exposure) | **INCREASES** |
| Missing item is a bonus / deluxe / regional-edition track | **INCREASES** |
| Missing item is the **most-held track of its own set** | **DECREASES** — strongly. Holding the record but not its single is a choice, not a gap |
| Album coverage is very high and the omission is **isolated** | **DECREASES** |
| Item is widely held / globally popular | **DECREASES** |
| The user's collecting looks **exhaustive** elsewhere | **DECREASES** |
| Social corroboration among friends | **AMBIGUOUS** — evidence of quality *and* evidence of likely exposure. It genuinely points both ways, and we will not resolve it by assertion |
| The user's collecting looks **selective** elsewhere | **AMBIGUOUS** — "hasn't reached it" and "chose against it" are indistinguishable |

The fifth row is new and is the most useful signal recovered in this pass:
**the popularity rank of the missing item *within its own set*.** It is
directly computable from holder counts, and it discriminates a gap from a
judgement better than coverage does.

---

## 10. Observation identity

```
identity = ⟨ subject_key , evidence_signature , claim_shape ⟩

evidence_signature = the work-keys of the tracks the statistic was computed on
claim_shape        = (statistic_family, direction)
```

| relation | test | action |
|---|---|---|
| **SAME** | signatures equal, or one contains the other at ≥ τ, **AND** `claim_shape` matches | keep the **tightest subject containing the evidence**; suppress the rest |
| **RELATED** | signatures overlap substantially, `claim_shape` differs | keep both, mark related |
| **DISTINCT** | otherwise | keep both |

The amendment to the prior version: **claim shape is required.** Evidence
containment alone would wrongly collapse *"you have 10 of 11 tracks on this
album"* into *"you rank first in this artist's territory"* — same evidence,
entirely different fact. Containment identifies the same **evidence**; only
claim shape identifies the same **statement**.

The tightest-subject rule is what collapses an album gap, the artist gap it
causes, the lane gap and the genre gap into one card: the album is the tightest
set containing the evidence, and the other three are re-expressions.

Consolidation runs **before** discovery-object resolution, which is the
expensive stage.

---

## 11. Observation → discovery object

> **The opened music must be drawn from the SET the statistic was computed on,
> or from the catalogue of the subject that SET names.**

```
allowed(O) = residue(SET)  ∪  catalogue(SUBJECT)
residue(SET) = SET \ H(viewer)
```

Nothing else is admissible. This makes *"interesting fact about A → generic
recommendation B"* a **type error** rather than a policy violation — the same
constraint as EVIDENCE LOCALITY (§3), now applied at the output end.

| observation | discovery object |
|---|---|
| Completion | the residue of that album |
| Consensus | the subject's corroborated material |
| Chronology hole | corroborated material inside the gap, from that artist |
| Catalogue position | the adjacent catalogue segment |
| Era concentration | in-lane, in-window material — **position**, never succession |
| Standing | material in the territory the user does not hold |
| Taste twin | the named person's holdings in that partition that the viewer lacks |
| Rarity / asymmetry | the diff itself; for asymmetry the **aggregate is the card** |

Observation-first cards (era, standing, overlap) state a fact about what the
user **has**; risk attaches only to what they open, so insight and discovery
are judged separately and a weak opening does not condemn the detector.

---

## 12. True statements that must not become cards

Twenty-five, each with the gate that kills it. This is the strongest test of
the architecture.

| # | true statement | killed by |
|---|---|---|
| 1 | "You have 1 of the 1 tracks on this single." | SAMPLE — and the residue is empty |
| 2 | "1 of your 2 jazz tracks is from 1973." | STAKE (both floors), SAMPLE |
| 3 | "You own no music from 1924." | STAKE — no relationship to the partition |
| 4 | "You and 400 others hold this global top-10 single." | DEVIATION — at or below the territorial base rate |
| 5 | "You are the #1 holder of this artist, with 2 tracks, among 3 users." | SAMPLE (population), DEVIATION (no rank gap) |
| 6 | "You're missing 1987 for this artist" — who released nothing in 1987. | **SET** — the year is not in the artist's release-year support |
| 7 | "All 40 of your tracks in this lane are 2019–2021" — all from one album. | SAMPLE — effective *n* = 1 album |
| 8 | "All your bossa nova is 1963–65" — the lane barely exists outside it. | **SET** — support is the lane's actual range; deviation vanishes |
| 9 | "You have 9 of 10 on this album" — the missing track is a 12-second interlude. | OPENABLE |
| 10 | "You have 9 of 10 on this album" — the missing track is its biggest hit. | NEP = LIKELY-ENCOUNTERED |
| 11 | "You're missing the 2024 remaster of a record you hold." | **SET** — work-key identity |
| 12 | "You have a 1998–2001 gap" — from 4 of the artist's 22 years. | DEVIATION — run probability; gaps are expected at an 18% sampling rate |
| 13 | "You and this friend share 62% of your metal" — 8 famous tracks each. | SAMPLE, DEVIATION (hypergeometric expects it) |
| 14 | "You have nothing from this subgenre, adjacent to one you like." | **EVIDENCE LOCALITY** |
| 15 | "You hold 3 tracks on this album." | DEVIATION — 3 is the modal coverage |
| 16 | "This track has only 2 holders." | DEVIATION, SAMPLE — 2 is the corpus mode; measured to fire thousands of times |
| 17 | "This artist released an album last year" — which you already hold. | OPENABLE — empty residue |
| 18 | "You have 241 melodic rap tracks." | DEVIATION — a number with no comparison is not an observation |
| 19 | "80 songs your friends have that you don't" — across 60 unrelated artists. | **SET** (not a coherent partition), STAKE |
| 20 | "You and this user both hold this album." | SAMPLE — one shared item |
| 21 | "You saved more music in March than February." | OPENABLE — opens nothing. Also blocked: no `savedAt` |
| 22 | "This artist is in the same genre as one you hold deeply." | **EVIDENCE LOCALITY** |
| 23 | "You have every track on this compilation but one." | **SET** — albumType; a compilation has no authored completeness |
| 24 | "Two friends hold this album" — the same person's two accounts. | SAMPLE (independence) — **known partial hole** |
| 25 | "You hold 100% of this artist's catalogue." | OPENABLE — empty residue |

Five gates plus correct set construction kill all twenty-five. No case required
a sixth gate, which is the evidence that five is minimal rather than merely
tidy.

---

## 13. Why there is no best detector

The portfolio is necessary for a **structural** reason, not a stylistic one.
Detectors divide on two independent axes: *does it need catalogue depth?* and
*does it need a population?*

|  | **needs no population** | **needs a population** |
|---|---|---|
| **needs no depth** | — | D2 consensus, D6 overlap, D14 asymmetry |
| **needs depth** | D1 completion, D7 era, D8 chronology, D10 position | D4 standing, D13 rarity |

Every user state falls into a cell that at least one quadrant serves:

| user state | contributing families | why |
|---|---|---|
| **Cold start** (<50 tracks) | D2, D14, D6 | measured: D2 fired **400** at 29 tracks; D1 fired **0** |
| **Small** (50–500) | D2, D14, D6, early D1 | catalogue relationships begin to exist |
| **Medium** (500–5,000) | most families live | both axes satisfied |
| **Power user** (>5,000) | D1, D4, D7, D8 | measured: D1 fired **243** at 17,991 tracks; D2 collapsed to **6** — they already hold everything corroborated |
| **Sparse social graph** | D1, D7, D8, D10 | **half the portfolio needs no population at all** — this is the answer to an empty network |
| **Dense social graph** | D2, D4, D6, D13, D14 | population evidence strengthens throughout |

**D1 and D2 are anti-correlated with library size and between them span the
entire user range.** Neither covers it alone. That is the portfolio argument,
and it is measured, not asserted. Frequency here is **coverage of the
opportunity space** — it says nothing about quality and is never used as
though it did.

---

## 14. The algorithm

| step | input | output | why it exists |
|---|---|---|---|
| **0 · PRECOMPUTE NULLS** | corpus | per-`(statistic, partition-type)` null distributions and base rates | makes "interesting" mean *improbable* rather than *large*. Amortised once across all users |
| **1 · CONSTRUCT SETS** | viewer holdings, population holdings, catalogue metadata | well-formed SETs with correct **support** — work-keyed, albumType-filtered, release-year-bounded, eligible-population-scoped | §2. This is where every structural false positive dies. Fixing sets here is why no threshold has to compensate later |
| **2 · STAKE FILTER** | SETs | SETs the viewer or the population has a real relationship with | §4. Cheapest and most eliminating operation; runs before any statistic is computed |
| **3 · EFFECTIVE-SAMPLE FILTER** | surviving SETs | SETs whose *independent* unit count supports a claim | §3. Kills one-album "era rules" and two-track "rankings" |
| **4 · COMPUTE STATISTICS** | surviving SETs | raw statistics, including ordered-set statistics (run, boundary, position) | the observation's content |
| **5 · DEVIATION **or** SALIENCE** | statistics + nulls | `deviation ∈ [0,1]`, `deviation_kind`, `salience` flag | §5, §7. Two routes. A candidate must satisfy at least one |
| **6 · EVIDENCE LOCALITY** | candidate subject + its SET | candidates whose subject lies inside the set that produced their statistic | §3. Makes similarity-triggered cards a type error |
| **7 · FORM OBSERVATIONS** | survivors | `⟨subject, statement, evidence set, identity key⟩` | gives every candidate a canonical identity before anything expensive happens |
| **8 · CONSOLIDATE** | observations | one observation per underlying fact, at the **tightest containing subject** | §10. Before resolution, so track scoring is never spent on candidates about to be collapsed |
| **9 · RESOLVE DISCOVERY OBJECTS** | consolidated observations | `residue(SET) ∪ catalogue(SUBJECT)`, scored and selected | §11. The expensive stage — hence its position |
| **10 · OPENABLE GATE** | discovery objects | observations that open music worth hearing | an interesting fact with no music is a note, not a card. Length is an output, never a target |
| **11 · CLASSIFY NEP** | observation + resolved residue | `LIKELY-UNENCOUNTERED / AMBIGUOUS / LIKELY-ENCOUNTERED` | §9. **After** resolution, because the strongest signals (within-set popularity rank of the missing item) need the residue |
| **12 · EMIT** | all of the above | candidate: observation, evidence, discovery object, `deviation` + kind, `salience`, `SR`, `NEP` | the boundary of this document |
| — | — | — | **RANK — out of scope** |

**Changes from the previous ordering.** Stake and sample move *before* statistic
computation (they were gates applied after); non-artifact checking moves into
step 1 and disappears as a gate; NEP moves after resolution rather than before;
consolidation stays at 8, ahead of the expensive stage.

**Complexity.** Step 0 is `O(corpus)`, once. Steps 1–3 are `O(viewer tracks)`
and eliminate most of the space. Steps 4–7 run only on surviving sets. Step 9,
the expensive one, runs only on **consolidated, admissible** observations. The
combinatorial space is searched without ever being materialised, because every
operation before step 9 is cheap and eliminating.

---

## 15. The claim, and the attacks on it

### A · One sentence

> Blueprint exhaustively searches the classes of verifiable structure its data
> can actually support, rejects unsupported inference before ranking ever runs,
> and expresses every recovered card concept through a small set of reusable
> statistics rather than bespoke recommendation rules.

### B · Thirty seconds

> Most recommenders predict what you'll like and attach an explanation
> afterwards. Blueprint runs the other way. We build a structural picture of
> someone's musical world — what they hold, by whom, from when, and how that
> compares to the people around them — and search it for statements that are
> *true and improbable*: a record they have all of but one, a period their taste
> stops dead at, a hole in a catalogue they otherwise followed year by year, an
> artist several unrelated people each keep deeply and they have none of. Every
> candidate is tested against a baseline built from the same data, so we react
> to structure rather than to size, and every card's subject has to sit inside
> the evidence that produced it — which is what makes similarity-based
> recommendation impossible rather than merely discouraged. Only then do we ask
> what music it opens, and if the answer is nothing worth hearing we throw it
> away. Ranking chooses among things that are already true and already
> interesting; it is never asked to make a weak observation look strong.

### C · Two minutes, technical

Sections 1–14. The load-bearing points, in order: one generative object
(§1); set construction rather than thresholds for structural correctness (§2);
five boolean gates, not a weighted score (§3); normalized extremeness with its
null kind attached (§5); two admissible routes — statistical and structural
(§7); absence carried as an ordered class rather than a fabricated probability
(§9); consolidation before the expensive stage (§10, §14).

### D & E · The attacks

| attack | answer |
|---|---|
| **"Aren't these just recommendations?"** | A recommendation predicts preference for an item. We emit a *statement about structure* and open only music inside the evidence that produced it. The constraint is typed (§3, §11): a card whose subject is not in its own evidence set cannot be constructed. Similarity is not discouraged — it is unrepresentable |
| **"Why is your baseline valid?"** | Four of nine families have analytic nulls — binomial, hypergeometric, run probability, divergence — stated in §6. The rest are empirical and **labelled** as empirical, so we never present a rank-among-seven as a p-value. That labelling is the honest part, and §16 lists corpus size as an open risk rather than hiding it |
| **"How do you know something is interesting?"** | We don't, and we don't claim to. We know it is *true*, *improbable under a stated null* or *structurally distinguished*, and *connected to music*. Whether that maps to human interest is exactly what the labelling exercise is for — and until it returns, no threshold in this document is presented as calibrated |
| **"Aren't you overfitting hand-designed detectors?"** | The opposite. A detector is a `(statistic, null, condition)` triple over a generic addressing scheme, and the same nine statistics express all 127 recovered permutations and ~60 badges. We reduced *from* twelve bespoke generators with 827 duplicate-subject collapses *to* this. Adding a card type means naming a set and a statistic, not writing a generator |
| **"Why not embeddings or collaborative filtering?"** | They answer a different question. Both rank items; neither produces a statement, and the statement is the product. They also cannot be held to the evidence-locality constraint, because proximity in a latent space is not evidence about the far object. Both have legitimate *supporting* roles — co-occurrence into holder weighting, taxonomy into partitioning and tracklist construction — and neither may trigger a card |
| **"How do you know they haven't heard the missing song?"** | We don't, and we say so on the card. That is why it is a plausibility *class* and not a probability (§9). We can rank plausibility from structure — material postdating their last holding is the strongest positive signal; being the most-held track of its own set is the strongest negative — but we cannot resolve it, and pretending otherwise would be the single easiest way to lose credibility |
| **"Tiny library?"** | Measured: D2 fired 400 cards at 29 tracks. Consensus, overlap and asymmetry need population, not depth, and social-stake (§4) admits a user whose own library cannot carry a claim |
| **"Huge library?"** | Measured: D1 fired 243 at 17,991 tracks while D2 collapsed to 6. The two are anti-correlated by construction, which is the portfolio argument (§13) |
| **"What if every statistic is technically true but boring?"** | That is the failure the system is built against, and §12 is the test: twenty-five true statements, each killed by a named gate, none requiring a sixth. Boring is usually *unremarkable* (deviation), *irrelevant* (stake), *impossible* (set construction) or *actionless* (openable) |
| **"Why isn't an LLM better at finding patterns?"** | It is better at *proposing* patterns and worse at *verifying* them. It cannot be held to the four refusals; it will assert lineage and preference it cannot support, and its output is neither reproducible nor auditable. Its correct role is phrasing an observation whose facts are already fixed |
| **"How do you validate without engagement optimization?"** | Human labels on the two questions that matter — *is this true and non-obvious*, and *would I have wanted to be told this* — judged separately for the insight and the music it opens. Engagement would optimize for taps, and a system that maximises taps will eventually learn to state things that are striking rather than true. This is a deliberate cost |

**What we do not claim:** that this is objectively the best possible
card-generation algorithm. That claim is unfalsifiable. The claim is that it is
the most **defensible** architecture we found for the data we have — every card
traces to a statistic on a set with a stated null, which is why it can be
explained, audited and falsified, and why a wrong card is a **bug** rather than
a bad guess.

---

## 16. Architecture vs. open questions

**MATHEMATICALLY DEFINED TODAY** — the generative object (§1); set construction
and support (§2); the five gates (§3); the stake disjunction (§4); the analytic
nulls for consensus, taste twin, chronology and era (§6); structural salience
(§7); observation identity (§10); the discovery-object constraint (§11); the
pipeline and its ordering (§14).

**HEURISTIC BUT DEFENSIBLE** — holder standing weighting (log depth + log
breadth, share-modulated, dominance-capped); the empirical nulls for
completion, standing, rarity and asymmetry; the NEP signal directions (§9);
the containment threshold τ for identity.

**NEEDS HUMAN-LABEL VALIDATION** — every `θ`; the deviation cut per detector;
whether D1 is genuinely non-monotonic in coverage and where any admissible
window sits (§8); whether observation-first cards beat absence-dependent ones
on the *unprompted* question; whether holder standing improves admissibility or
only ranking; whether the NEP classes separate anything real.

**BLOCKED BY MISSING DATA** — behaviour chronology and movement (`savedAt`:
1,589 of 40,730 rows); anything needing play, skip or dislike history; real
communities; ticket data.

**REQUIRES EXTERNAL MUSIC KNOWLEDGE** — lineage, credits and personnel
partitions (representationally supported, §1); authoritative original release
dates to separate reissues from first pressings; canonical album identity
beyond Spotify's pressing-level ids.

---

## 17. The three biggest remaining uncertainties

1. **The empirical nulls rest on a seven-user corpus.** Four of nine detector
   families compare against a distribution estimated from a population too
   small to be a probability, and two users supply ~79% of all weighted holder
   evidence. Everything labelled `EMPIRICAL` in §5–6 is provisional on corpus
   growth. This is the most serious uncertainty in the architecture and it is
   new to this pass.
2. **Deliberate omission is indistinguishable from non-encounter.** We can rank
   plausibility (§9) but not resolve it. No amount of current data closes this;
   it is carried on the card rather than papered over.
3. **Reissue and remaster dates distort chronology.** Work-key normalisation
   handles duplicate recordings but not the fact that a 2011 reissue of a 1974
   record carries 2011, which can fake both chronology holes and era
   boundaries. Unquantified.
