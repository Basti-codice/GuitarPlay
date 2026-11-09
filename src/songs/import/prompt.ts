/** The prompt that is handed to an AI assistant together with a photo/scan of sheet music or tab. */
export interface KnownSettings {
  title?: string;
  artist?: string;
  tempo?: string;
  meter?: string;
  grid?: string;
  tuning?: string;
  capo?: string;
  key?: string;
  difficulty?: string;
  style?: string;
  extra?: string;
}

const SPEC = `You convert a picture of guitar music (tablature and/or standard notation) into plain text in the "GuitarPlay Tab Format". A practice app will parse your answer automatically, so the format must be followed exactly.

OUTPUT RULES
- Answer with ONE code block and nothing else (no explanations before or after).
- Inside the block: first the header lines, then the tab. Write every header line, even if you have to guess – a wrong guess can be corrected later, a missing line cannot.

HEADER (one "Key: value" per line, English keys exactly as written)
Title: song title (from the image; otherwise your best description)
Artist: artist or composer (or "Unknown")
Tempo: beats per minute counted in QUARTER notes, number only. Use the marking in the image (convert if it is not a quarter note, e.g. dotted quarter = 60 means Tempo 90). If there is none, estimate a sensible practice tempo.
Meter: time signature, e.g. 4/4, 3/4, 6/8
Grid: the length of ONE character column, as 1/N of a whole note: 1/8 = every column is an eighth note, 1/16 = a sixteenth note. Pick the coarsest grid in which every note of the piece falls exactly on a column (1/8 for simple music, 1/16 if sixteenth notes occur). Use the same grid for the whole piece.
Spacing: (optional) 1 or 2 – characters per column. Use 2 if two notes on the same string sit in neighbouring columns (so that fret 1 followed by fret 2 is not read as fret 12). Default is 1.
Tuning: "standard" unless the image says otherwise. Allowed: standard, Drop D, DADGAD, Half step down, Full step down, Open D, Open G, Drop C – or six note names from the LOWEST string to the highest, e.g. D A D G B E
Capo: fret number of the capo, 0 if none. Fret numbers in the tab are always written relative to the capo (exactly as printed).
Key: e.g. G, Em (best guess is fine)
Difficulty: 1 (very easy) to 5 (very hard)
Genre: one word, e.g. Folk, Pop, Rock, Blues, Classical
Style: strumming feel for the backing band – one of: folk, rock, ballad, waltz, shuffle, reggae, quarter, march

TAB LAYOUT
- Each system (line of music) is exactly SIX lines, top to bottom: e B G D A E (high string first). Start each line with its letter and a bar line "|".
- Bar lines "|" must be at the same character position on all six lines.
- ONE CHARACTER COLUMN = ONE GRID STEP. Every bar must contain exactly (columns per bar) characters between its bar lines:
    4/4 with Grid 1/8 -> 8 columns       4/4 with Grid 1/16 -> 16 columns
    3/4 with Grid 1/8 -> 6 columns       3/4 with Grid 1/16 -> 12 columns
    6/8 with Grid 1/8 -> 6 columns       2/4 with Grid 1/8 -> 4 columns
  (with Spacing 2 double these numbers)
- A note starts in the column where its fret number is written. There are no duration symbols: a note rings until the next note. Use "-" for empty columns. A rest is simply empty columns.
- Notes played together (chords, strums) are written in the SAME column on their strings.
- Two-digit frets (10, 12, ...) use two characters. Put a "-" in the same position on the other five lines so everything stays aligned. This extra character is not counted as time. Never put two different notes of one string directly next to each other in a way that could be read as one two-digit number.
- Optional symbols after a fret number: h (hammer-on), p (pull-off), / or \\ (slide), b (bend), ~ (vibrato). Write x for a muted/dead note. Example: 5h7 means fret 5 then hammer to 7.
- Write repeats out in full (copy the bars). Only if a section is long may you use |: and :| around it.
- Write ALL bars of the piece in order, from the first page to the last. Do not summarise, skip or shorten anything.

CHORDS (strongly recommended)
- If chord symbols are printed above the music, add a line directly ABOVE the six tab lines of each system:
    Chords: Em | G | D A | C
  One entry per bar, separated by "|". Several chords inside one bar are separated by spaces and share the bar equally. Use "-" for a bar without a chord. Chord names like Am7, F#m, Cadd9, Dsus4, G/B.
- If no chords are printed, leave the Chords line out.

IF THE IMAGE IS STANDARD NOTATION (no tab)
- Choose playable guitar positions: stay in first position (frets 0-4) when possible, otherwise the position with the fewest hand jumps. Guitar music is written one octave higher than it sounds, so the open low E string is the E below the staff.
- Use the printed key signature and accidentals.

IF SOMETHING IS UNREADABLE
- Make your best guess; never leave a bar out. Add a "?" instead of a fret number only if you really cannot tell (the app will warn about it).

BEFORE YOU ANSWER, CHECK
1. Every system has exactly 6 lines. 2. All bars have the same number of columns (as in the table). 3. Bar lines line up. 4. Header contains Title, Artist, Tempo, Meter, Grid, Tuning, Capo, Key, Difficulty, Genre, Style. 5. Nothing outside the single code block.

EXAMPLE (4/4, Grid 1/8, 8 columns per bar)
\`\`\`
Title: Example
Artist: Unknown
Tempo: 96
Meter: 4/4
Grid: 1/8
Tuning: standard
Capo: 0
Key: Em
Difficulty: 2
Genre: Folk
Style: folk

Chords: Em | G | D | Em
e|-0---0--|-3---3--|-2---2--|-0---0--|
B|-0---0--|-0---0--|-3---3--|-0---0--|
G|-0---0--|-0---0--|-2---2--|-0---0--|
D|-2---2--|-0---0--|-0---0--|-2---2--|
A|-2---2--|-2---2--|--------|-2---2--|
E|-0---0--|-3---3--|--------|-0---0--|
\`\`\``;

export function buildAiPrompt(known: KnownSettings = {}, hasImage = true): string {
  const lines: string[] = [];
  const add = (k: string, v?: string) => v && v.trim() && lines.push(`- ${k}: ${v.trim()}`);
  add('Title', known.title);
  add('Artist', known.artist);
  add('Tempo', known.tempo);
  add('Meter', known.meter);
  add('Grid', known.grid);
  add('Tuning', known.tuning);
  add('Capo', known.capo);
  add('Key', known.key);
  add('Difficulty', known.difficulty);
  add('Style', known.style);
  const knownBlock = lines.length || known.extra?.trim()
    ? `\n\nKNOWN SETTINGS FROM THE USER – use these values exactly in the header instead of guessing them:\n${lines.join('\n')}${known.extra?.trim() ? `\n- Additional notes from the user: ${known.extra.trim()}` : ''}`
    : '';
  const intro = hasImage ? 'The attached image shows the music to convert.' : 'The music to convert is pasted below the prompt.';
  return `${intro}\n\n${SPEC}${knownBlock}`;
}

/** Short follow-up the user can send when the AI got something wrong. */
export const FIX_PROMPT = `Your answer did not parse. Please output the complete piece again in the GuitarPlay Tab Format, in ONE code block: six tab lines per system (e B G D A E), bar lines aligned, and every bar with exactly the same number of characters (columns per bar = Grid x Meter). Keep the header lines (Title, Artist, Tempo, Meter, Grid, Tuning, Capo, Key, Difficulty, Genre, Style).`;
