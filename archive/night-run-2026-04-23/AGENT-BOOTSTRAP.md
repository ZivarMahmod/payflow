# AGENT BOOTSTRAP — Kör detta FÖRST varje schemalagd körning

> Detta är den operativa checklistan. Varje schemalagd körning startar en
> tom konversation — denna fil är hur du återupptar arbetet deterministiskt.

---

## Steg 0 — Arbetskatalog + git-sync

Alla paths nedan är relativa till workspace-roten `payflow/`.
`cd` dit först: `cd /sessions/confident-focused-cannon/mnt/payflow`.

**Viktigt:** Windows-mount har begränsningar. Git-metadata ligger utanför
mount-punkten. Sandbox-sessioner persisterar inte mellan schemalagda körningar
så GIT_DIR reinitialiseras från `origin` varje körning.

Obligatorisk start varje körning:
```bash
cd /sessions/confident-focused-cannon/mnt/payflow
source .agent/env.sh          # GIT_DIR, GIT_WORK_TREE, PAT
bash .agent/setup-git.sh      # init/update GIT_DIR, pull origin/main
```
Om `setup-git.sh` rapporterar att `GITHUB_PAT` saknas eller pull misslyckas
pga konflikt → stoppa, skapa `STATUS-GIT-CONFLICT.md`, avsluta körningen.

Om `PAUSE.md` finns → skriv status-fil, avsluta körningen direkt.

## Steg 1 — Sanity check (snabb)

Verifiera att setup finns. Om något saknas → skapa `/STOP-SETUP-INCOMPLETE.md`
med lista över saknade filer, skriv status-fil, avsluta körningen.

Krav:
- `COWORK-CHARTER.md` finns
- `docs/FlowPay-Master-v2.md` finns
- `docs/mock-strategy.md` finns
- `briefs/README.md` finns
- Minst en `briefs/BRIEF-*.md` finns
- `.agent/CONTEXT.md` finns
- `SKIP-CONDITIONS.md` finns
- `NIGHT-RUN.md` finns

Första körningen varje dag: läs `COWORK-CHARTER.md` OCH `.agent/CONTEXT.md` i sin helhet.

---

## Steg 2 — Läs state

1. Lista `/briefs/done/` → samla alla BRIEF-IDs som är klara.
2. Lista `/briefs/blocked/` → samla aktiva block (`*.blocked.md` utan motsvarande
   `*.unblocked.md` eller flyttad från `blocked/` av Zivar).
3. Lista `/questions/` → om det finns `*.answer.md` från Zivar, läs, processa
   svaret enligt vad det gäller, flytta frågan till `/questions/done/`.
4. Läs `/briefs/README.md` → hämta kör-ordning + beroendeschema.

---

## Steg 3 — Välj nästa brief

**Nästa brief** = första i kör-ordning där:
- Inte finns i `/briefs/done/`
- Inte finns aktivt i `/briefs/blocked/`
- Alla `Beror på:`-briefs finns i `/briefs/done/`

**Specialfall:**

- **Inga eligible briefs, några blocked:** hoppa till nästa brief senare i
  ordningen som inte beror på blockad. Om ingen sådan finns → se nedan.
- **Alla kvarvarande blocked eller beror på blocked:** skapa
  `/STATUS-ALL-BLOCKED.md` med lista över block + vad du behöver. Skriv
  status-fil. Avsluta.
- **Alla 28 briefs klara:** skapa `/SPRINT-COMPLETE.md` med sammanfattning
  (antal briefs, antal avvikelser, öppna frågor, testresultat). Skriv
  sista status-fil. Avsluta.

### Skip-check (nytt)

Innan du väljer en brief som eligible, kör skip-check:

1. Öppna `SKIP-CONDITIONS.md` och kolla om den aktuella briefen matchar
   någon skip-regel.
2. Om ja: skapa `.skipped.md` enligt formatet i SKIP-CONDITIONS.md,
   appenda till `NIGHT-RUN.md`, hoppa direkt till nästa eligible brief
   (återupprepa skip-check).
3. Om nej: fortsätt till Steg 4 och kör briefen normalt.

Skippade briefs räknas som "processade" för loopens syfte — körningen
fortsätter.

---

## Steg 4 — Kör briefen

För vald brief:

1. Läs HELA briefen (inte bara Steg-listan). Notera tier-emojin.
2. Dubbelkolla att alla `Beror på:`-briefs är i `/briefs/done/`.
3. Implementera enligt Steg-listan i briefen.

4. **Obligatoriska kvalitetsgrindar innan commit** (minska errors på riktigt):
   a. **Typecheck:** `pnpm typecheck` om TS-kod finns. Måste vara 0 fel.
   b. **Lint:** `pnpm lint` om apps/packages finns. Inga errors. Warnings OK.
   c. **Tester:** `pnpm test` om briefen har skrivit/ändrat tester. Grön.
   d. **Manuell verifiering:** ALLA checkboxes i briefens `Verifiering`-sektion.
      Inte valfritt. Om en check fallerar: laga. Om >30 min utan framsteg →
      "Fastnat mitt i brief" nedan.

**Undantag: egress-blockerade verifs.** Om en checkbox i briefens Verifiering
kräver nätverk till `*.supabase.co` eller annan extern tjänst OCH
egress-blocket finns (se `STATUS-EGRESS-BLOCKED.md`):
- Hoppa över just den checken.
- Dokumentera den som "manual step for Zivar" i `.prepared.md`.
- Briefen räknas som PREPARED, inte DONE.
- Alla lokala verifs (typecheck, lint, unit tests) måste fortfarande vara
  gröna — de är inte undantag.

PREPARED räknas som processad. Körningen fortsätter till nästa brief.

5. **För 🔴/⚫-briefs även:** invokera `engineering:code-review` skill på
   staged diff innan commit. Åtgärda alla "critical" och "high"-fynd. Övriga
   kommentarer → notera i `.done.md` under "Kodgranskning".

6. **Stora briefs som spänner över flera körningar:**
   - Gör inkrementella WIP-commits under arbetet:
     `bash .agent/commit-push.sh "WIP: BRIEF-XXX-NNN — <delsteg>"`.
   - Kod får INTE vara trasig i dessa WIP-commits (ska åtminstone typechecka).
   - Den slutliga commiten använder briefens exakta commit-meddelande.
   - Skapa `.done.md` ENDAST när alla verifieringar är gröna. Annars lämnar du
     brief pågående och status-filen förklarar vad som återstår.

7. `bash .agent/commit-push.sh "<meddelandet från briefen>"` — final commit
   efter att alla grindar passerat. Vid push-fel (auth, non-fast-forward):
   logga i status-filen, fortsätt arbetet — nästa körning försöker pull+push igen.

8. Skapa `briefs/done/BRIEF-XXX-NNN.done.md` med:

```markdown
# BRIEF-XXX-NNN — <titel> — DONE

- **Start:** <ISO-timestamp från `date -Iseconds`>
- **Slut:**  <ISO-timestamp>
- **Commit:** <git rev-parse HEAD>

## Verifiering
- [x] Check 1: PASS — <kort notering>
- [x] Check 2: PASS
- [ ] Check 3: FAIL — flyttad till <ny brief / block / frågelista>

## Avvikelser från briefen
<Ingen, eller beskrivning + motivering>

## Frågor till Zivar
<Ingen, eller länk till `/questions/BRIEF-XXX-NNN.question.md`>

## Filer skapade/ändrade
- `apps/api/src/...`
- ...
```

**Alternativt för egress-blockerade briefs:** Skapa
`briefs/done/BRIEF-XXX-NNN.prepared.md` istället för `.done.md`. Se
`SKIP-CONDITIONS.md` för mall.

9. Uppdatera `NIGHT-RUN.md`:
   - Lägg till raden `- BRIEF-XXX-NNN — <titel> — <commit-hash>` under
     "Done".
   - Committa `NIGHT-RUN.md` som del av briefens slutcommit, INTE en
     separat commit.

---

## Steg 5 — Loopa

Schemat är **varje timme**. En hel brief per körning är realistisk för 🟢
och 🟡 briefs. 🔴/⚫ briefs (SC-001, POS-001, KI-003, API-004, KI-004,
API-005, POS-002, SA-001) får ta flera körningar — använd `.done.md` som
checkpoint bara när verifiering passerar, annars lämna brief i pågående
läge och dokumentera framsteg i status-filen.

**Kontext-tumregler för night-run:**
- Vid >60% context kvar + brief klar → ta nästa oavsett tier (🟢🟡🔴).
  ⚫ Ultrathink skippas enligt SKIP-CONDITIONS.md.
- Vid 30–60% context → ta nästa brief bara om den är 🟢 eller 🟡. 🔴
  väntar till nästa körning med fresh context.
- Vid <30% context → WIP-commit om mitt i brief, skriv `NIGHT-RUN.md`-
  uppdatering, avsluta körning. Nästa schemalagda körning tar vid.
- Aldrig: pressa igenom en 🔴 brief på slutet av en körning med lite
  context kvar.

**Metodisk mindset (från Zivar direkt):**
Det är OK att schemat tar sin tid. Fel i tidiga briefs kaskaderar nedåt.
Använd vilka skills/tools som helper (engineering:debug när du fastnar,
engineering:testing-strategy för test-design, data:sql-queries för komplex SQL).
Finish big jobs properly även om det tar 3-4 körningar. Pausa hellre än att
rusha.

**Context-disciplin (OBLIGATORISKT för 🔴/⚫ briefs):**
Läs `CONTEXT-DISCIPLINE.md` innan stora briefs. Kort version:
- Skriv ett script som emitar svaret istället för att läsa 10 filer manuellt.
- Pipa tung output (pnpm install, test-runs) till fil, läs bara tail/grep.
- Använd Glob/Grep/Read med offset för targeted reads, inte full-fil-läsning.
- Vid context-bloat: WIP-committa, skriv status, avsluta körning, låt nästa
  fortsätta fresh.

---

## Steg 6 — Avsluta körning

Skapa `/status/$(date +%Y-%m-%d-%H).md` med:

```markdown
# Status <datum timme>

## Briefs klara denna körning
- BRIEF-XXX-NNN — <titel>
- ...

## Blocked denna körning
- BRIEF-XXX-NNN — <kort orsak> (se `/briefs/blocked/BRIEF-XXX-NNN.blocked.md`)

## Öppna frågor
- BRIEF-XXX-NNN — <rubrik> (se `/questions/...`)

## Nästa brief i ordning
BRIEF-XXX-NNN (eligible nu, inga block)

## Progress
<antal done>/<total> briefs. Nästa gate: G<N> — <vad som saknas>.

## ETA till nästa gate (best guess)
<X körningar till / blockerat tills Zivar svarar på Y>
```

Avsluta körningen.

---

## Fastnat mitt i brief (>30 min försök utan framsteg)

1. `git reset --hard HEAD` — rulla tillbaka ofullständig kod.
2. Skapa `/briefs/blocked/BRIEF-XXX-NNN.blocked.md`:

```markdown
# BRIEF-XXX-NNN — BLOCKED

- **Tid:** <ISO>
- **Status:** blocked, väntar på Zivar

## Vad jag försökte
<konkret — vilka kommandon, vilken kod, vilka alternativ>

## Exakt symptom
<felmeddelande, stack trace, eller beteende som avviker från förväntat>

## Min bästa gissning om orsak
<hypotes>

## Vad jag behöver från Zivar
<credentials / beslut / klargörande av brief / ny brief>
```

3. Gå till Steg 3 och ta nästa icke-beroende brief.

---

## Frågor vs Blocks — skillnaden

| Situation | Vad du gör |
|---|---|
| Kan inte fortsätta alls | **Block** — `blocked/*.blocked.md` |
| Kan fortsätta med en rimlig default men vill ha Zivars input | **Fråga** — `questions/*.question.md`, använd default, nämn valet i `.done.md` |
| Brief är mångtydig men Master-brief har pattern | Följ pattern, ingen fråga behövs |

---

## Stop-conditions (sammanfattning)

| Trigger | Action |
|---|---|
| Alla 28 briefs processade (done + prepared + skipped) | `/SPRINT-COMPLETE.md` + NIGHT-RUN summary + avsluta |
| Alla kvarvarande blocked (ej skipped) | `/STATUS-ALL-BLOCKED.md` + NIGHT-RUN + avsluta |
| Setup-filer saknas | `/STOP-SETUP-INCOMPLETE.md` + avsluta |
| `.agent/secrets.env` saknas/ofullständig | `/STOP-SETUP-INCOMPLETE.md` + avsluta |
| Context < 20% | Snyggt avslut, NIGHT-RUN-update, nästa körning fortsätter |
| `/PAUSE.md` finns | Avsluta direkt |

---

## Bakom kulisserna (varför det här designen)

- `.done.md` i filsystemet = enda statusen mellan körningar. Ingen
  konversationshistorik överlever.
- Blocked + questions är separata så Zivar ser skillnad på "kritisk" och
  "nice to answer".
- Progress gates ersätter klocktider — scheduler kan inte garantera timing.
- `USE_MOCK_*` env-flaggor låter Zivar byta till prod när credentials kommer
  utan att vi rör kod.
