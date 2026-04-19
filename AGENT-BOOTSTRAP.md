# AGENT BOOTSTRAP — Kör detta FÖRST varje schemalagd körning

> Detta är den operativa checklistan. Varje schemalagd körning startar en
> tom konversation — denna fil är hur du återupptar arbetet deterministiskt.

---

## Steg 0 — Arbetskatalog + git-sync

Alla paths nedan är relativa till workspace-roten `payflow/`.
`cd` dit först: `cd /sessions/confident-focused-cannon/mnt/payflow`.

Innan du läser state: `git pull --ff-only origin main` för att hämta eventuella
manuella commits från Zivar. Om pull misslyckas pga konflikt → stoppa, skapa
`/STATUS-GIT-CONFLICT.md`, avsluta körningen.

Om `/PAUSE.md` finns → skriv status-fil, avsluta körningen direkt.

## Steg 1 — Sanity check (snabb)

Verifiera att setup finns. Om något saknas → skapa `/STOP-SETUP-INCOMPLETE.md`
med lista över saknade filer, skriv status-fil, avsluta körningen.

Krav:
- `COWORK-CHARTER.md` finns
- `docs/FlowPay-Master-v2.md` finns
- `docs/mock-strategy.md` finns
- `briefs/README.md` finns
- Minst en `briefs/BRIEF-*.md` finns

Första körningen varje dag: läs `COWORK-CHARTER.md` i sin helhet.

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

---

## Steg 4 — Kör briefen

För vald brief:

1. Läs HELA briefen (inte bara Steg-listan).
2. Dubbelkolla att alla `Beror på:`-briefs är i `/briefs/done/`.
3. Implementera enligt Steg-listan i briefen.
4. Kör ALLA Verifiering-checks. Inte valfritt. Om en check fel: försök laga.
   Om >30 min försök utan framsteg → se "Fastnat mitt i brief" nedan.
5. `git add . && git commit -m "<meddelandet från briefen>"`
6. `git push origin main` — push efter varje klar brief. Vid fel
   (auth, non-fast-forward): logga felet i status-filen, fortsätt arbetet.
   Nästa körning försöker pull+push igen.
7. Skapa `briefs/done/BRIEF-XXX-NNN.done.md` med:

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

---

## Steg 5 — Loopa

Schemat är **varje timme**. En hel brief per körning är realistisk för 🟢
och 🟡 briefs. 🔴/⚫ briefs (SC-001, POS-001, KI-003, API-004, KI-004,
API-005, POS-002, SA-001) får ta flera körningar — använd `.done.md` som
checkpoint bara när verifiering passerar, annars lämna brief i pågående
läge och dokumentera framsteg i status-filen.

Tumregel:
- Fortfarande >50% context + brief klar med verifiering grön → ta nästa brief.
- <50% context eller brief halv-klar → avsluta körning snyggt (Steg 6).

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
| Alla 28 briefs `.done.md` | `/SPRINT-COMPLETE.md` + status + avsluta |
| Alla kvarvarande blocked/beror på blocked | `/STATUS-ALL-BLOCKED.md` + status + avsluta |
| Setup-filer saknas | `/STOP-SETUP-INCOMPLETE.md` + status + avsluta |
| Context < 20% | Snyggt avslut (Steg 6), låt nästa körning ta vid |
| Zivar skapar `/PAUSE.md` | Status + avsluta, starta inte förrän filen är borta |

---

## Bakom kulisserna (varför det här designen)

- `.done.md` i filsystemet = enda statusen mellan körningar. Ingen
  konversationshistorik överlever.
- Blocked + questions är separata så Zivar ser skillnad på "kritisk" och
  "nice to answer".
- Progress gates ersätter klocktider — scheduler kan inte garantera timing.
- `USE_MOCK_*` env-flaggor låter Zivar byta till prod när credentials kommer
  utan att vi rör kod.
