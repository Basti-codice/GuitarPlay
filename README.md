# 🎸 GuitarPlay

Play-along-Trainer für **akustische Gitarre** im Browser (Chrome, Windows 11). Das Mikrofon hört mit, vergleicht jeden gespielten Ton/Akkord mit dem Wasserfall und sagt dir sofort, ob es richtig war – wie ein Rhythmus-Spiel, nur mit echter Gitarre. Alles läuft **lokal** im Browser, nichts wird hochgeladen.

## Starten (Windows)

1. [Node.js 20+](https://nodejs.org) installieren (einmalig).
2. **`start.bat`** doppelklicken → baut die App und öffnet <http://localhost:4173>.
3. Chrome fragt nach dem Mikrofon → erlauben. Danach in der App: *Settings → Setup wizard* (2 Minuten, einmalig).

Entwickeln: `npm install` · `npm run dev` · Tests: `npm test` · Produktions-Build: `npm run build`.

> Mikrofonzugriff funktioniert nur über `localhost` oder `https`, nicht über eine `file://`-Datei.

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Play (Wasserfall)** | 6 Saiten-Lanes mit Bundzahlen, Akkord-Balken mit Namen, Anschlagrichtung ↓↑, Hammer-on/Pull-off-Markierung, Treffer-Feedback (Perfect/Good/OK/Wrong/Miss), Combo & Multiplikator, Score, Sterne, Timing-Histogramm („du bist 30 ms zu spät“), Problemtakte mit Ein-Klick-Loop |
| **Modi** | Real-time · *Wait for me* (stoppt bis du richtig spielst) · *Watch & listen* · Tempo 40–125 % · Loop-Abschnitte · Count-in · Metronom |
| **Begleitung** | Synthetisierte Backing-Band (Drums, Bass, Pad je nach Stil/Takt) und Referenz-Gitarre – direkt aus den Akkorden des Songs erzeugt |
| **Songs** | 78 Stücke (157 spielbare Spuren): Melodien (gemeinfrei), Akkord-Songs, Fingerpicking-/Travis-Arrangements, Blues-/Rock-/Folk-Progressionen, Technik-Übungen. Pro Stück bis zu drei Spuren: Melody · Chords (Strumming) · Picking |
| **Jam builder** | Beliebige Tonart + Akkordfolge in römischen Ziffern (z. B. `I V vi IV`) → Song mit Strumming, Picking und Backing |
| **Learn** | Mittelstufen-Kurs: 31 Lektionen in 6 Modulen (Barré, Rhythmik, Fingerstyle, Skalen/Lead, Songcraft) mit messbaren Zielen |
| **Chords** | Akkordbibliothek (alle Grundtöne × 14 Qualitäten), Mikrofon-Check **pro Saite**, Akkord-Trainer, Wechsel-Drills |
| **Fretboard** | Skalen & Modi auf dem Griffbrett, Skalen-Übungen im Wasserfall, Noten-Finder-Spiel |
| **Ear training** | Intervalle, Notennamen, „Spiel die Phrase nach“ |
| **Tuner · Metronom · Recorder** | Stimmgerät (8 Stimmungen, A4 einstellbar), Metronom mit Speed-Trainer & Tap-Tempo, Aufnahme mit Wiedergabe |
| **Import** | Guitar Pro (.gp3–.gp, .gpx), MusicXML, MIDI, ABC, Text-Tabs → Tab-Editor. Foto-Archiv für Notenblätter (Anzeige neben dem Editor) |
| **Editor** | Tab-Raster (1/4, 1/8, 1/16) oder ABC-Text, Akkordnamen, Stimmungen, Capo, Vorhören |
| **Progress** | XP/Level, Streak, Tagesziel, Übungskalender, Genauigkeits-Trend, Schwachstellen-Griffbrett, 19 Achievements |
| **Menü-Musik** | Ruhige, generative Ambient-Musik (pausiert automatisch wo das Mikrofon aktiv ist) |

## Wie die Erkennung funktioniert

```
Mikrofon ─► AudioWorklet ─► Analyzer ─┬─ Onset-Erkennung (Spektralfluss)
 (ohne AGC/Echo-Cancel)               ├─ Pitch (McLeod/NSDF) für Tuner & Anzeige
                                      └─ „Ist der erwartete Ton da?“ (Obertonkamm in 8192/4096-FFT)
                                                       │
Wasserfall-Ereignis ─► Judge (Zeitfenster, Akkord-Vollständigkeit, Wait-Mode) ─► Perfect/Good/OK/Wrong/Miss
```

Statt Töne blind zu „transkribieren“ (bei Akkorden unzuverlässig) prüft die App gezielt, ob **die erwarteten Töne** samt Obertönen im Spektrum vorkommen. Das ist deutlich robuster. Grenzen: Ein einzelner falscher Ton in einem 6-Saiten-Akkord fällt nicht immer auf; Techniken (Bending, Palm-Mute, Slides) werden nur über Tonhöhe/Timing bewertet.

**Tipps für beste Ergebnisse:** Mikrofon 20–40 cm vor dem Schallloch · ruhiger Raum · **Kopfhörer**, sobald Backing/Referenz/Click an sind (sonst hört das Mikrofon die Lautsprecher) · erst stimmen · Setup wizard ausführen (Pegel, Rauschpegel, Latenz).

## Songs & Rechtliches

Die eingebauten Stücke sind **gemeinfrei** (Volkslieder, Klassik) bzw. eigene Übungen und Progressionen; die Melodien wurden aus dem Gedächtnis als Noten aufgeschrieben und die Griffe automatisch gesetzt – bei Abweichungen im **Editor** korrigieren. Urheberrechtlich geschützte Tabs (aktuelle Pop-/Rocksongs) werden bewusst nicht mitgeliefert und nicht aus dem Netz gezogen; eigene Dateien (Guitar Pro, MusicXML, MIDI, ABC) importierst du unter *Import & Create*.

### Notenblatt-Foto → Tabs
Echte Notenerkennung (OMR) ist im Browser nicht zuverlässig möglich. Du kannst Fotos im Archiv ablegen und beim Abtippen im Editor daneben anzeigen, oder (optional, eigener Anthropic-API-Key unter *Settings*) Claude das Foto in ABC/Tab umwandeln lassen. Das Ergebnis immer prüfen.

## Projektstruktur

```
src/audio/      fft · pitch (MPM) · analyzer · ksynth · synth · backing · ambient · metronome · mic · recorder
src/game/       judge · session · waterfall · listener
src/songs/      abc (Parser) · arrange · chords · fretting · generators · library/ · import/ (GP, MIDI, Tab, ABC)
src/learn/      lessons
src/pages/      Home · Library · SongDetail · Play · Learn · Chords · Fretboard · Ear · Tuner · Metronome · Stats · Recorder · Import · Editor · Settings · Setup
tests/          Analyse-/Judge-Simulationen mit synthetischer Gitarre, Parser-, Import-, Lektions- und Bibliothekstests
scripts/        Playwright-End-to-End-Tests (virtuelle Gitarre & Chrome-Fake-Mikrofon)
```

Tests: `npm test` simuliert u. a. jede Spur jedes eingebauten Songs mit einer virtuellen Gitarre durch die komplette Analyse-Kette. `scripts/e2e-*.cjs` testen im echten Chrome (Playwright) den Ablauf inkl. Mikrofon-Pfad über Chromes Fake-Audio-Gerät.

## Technik
React 19 · TypeScript · Vite · Web Audio / AudioWorklet · Canvas · IndexedDB · [alphaTab](https://www.alphatab.net) (MPL-2.0, nur für den Guitar-Pro/MusicXML-Import, wird erst bei Bedarf geladen).
