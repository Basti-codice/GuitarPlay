import type { Song } from '../core/types';
import { buildChordDrill, buildJam, buildScaleSong } from '../songs/generators';

export type Block = { t: 'p'; text: string } | { t: 'tip'; text: string } | { t: 'ul'; items: string[] } | { t: 'h'; text: string } | { t: 'chords'; names: string[] };

export interface Exercise {
  label: string;
  /** built-in song id, or `make` to generate one */
  songId?: string;
  make?: () => Song;
  track?: string;
  speed?: number;
  mode?: 'realtime' | 'wait';
  /** accuracy (0..1) needed to pass */
  need: number;
  link?: { to: string; label: string };
}

export interface Lesson {
  id: string;
  module: number;
  title: string;
  goal: string;
  minutes: number;
  body: Block[];
  exercises: Exercise[];
}

export const MODULES = [
  { id: 1, title: 'Foundations Check', blurb: 'Tune up, warm up and make sure the basics are clean.', color: '#3ec9ff' },
  { id: 2, title: 'Chords & Barre', blurb: 'Smooth changes, barre chords and richer harmony.', color: '#ffb347' },
  { id: 3, title: 'Rhythm & Strumming', blurb: 'Groove, syncopation and different time feels.', color: '#4be08c' },
  { id: 4, title: 'Fingerstyle', blurb: 'Arpeggios, Travis picking and melody with bass.', color: '#a98bff' },
  { id: 5, title: 'Lead & Scales', blurb: 'Pentatonics, blues, legato and speed.', color: '#ff5d73' },
  { id: 6, title: 'Songcraft', blurb: 'Blues form, capo, transposing and performing.', color: '#ffd93d' },
] as const;

const p = (text: string): Block => ({ t: 'p', text });
const tip = (text: string): Block => ({ t: 'tip', text });
const ul = (...items: string[]): Block => ({ t: 'ul', items });
const h = (text: string): Block => ({ t: 'h', text });
const chords = (...names: string[]): Block => ({ t: 'chords', names });

export const LESSONS: Lesson[] = [
  // ---------------- Module 1 ----------------
  {
    id: 'm1-tune-warmup', module: 1, title: 'Tuning & warm-up', goal: 'Get in tune and wake up your hands.', minutes: 5,
    body: [
      p('Everything in this app depends on your guitar being in tune – the detector compares what you play to exact pitches. Tune every string before every session, and re-check after bending or big temperature changes.'),
      tip('Tune up to the note, never down: if you overshoot, drop below the pitch and come up again. It keeps the string stable.'),
      p('Then warm up with the open-string exercise. Pick each string cleanly with alternate (down-up) strokes and let it ring for the full beat.'),
    ],
    exercises: [
      { label: 'Open the tuner', need: 0, link: { to: '/tuner', label: 'Open tuner' } },
      { label: 'Open string warm-up', songId: 'open-strings', speed: 0.85, need: 0.8 },
    ],
  },
  {
    id: 'm1-spider', module: 1, title: 'Clean fretting: the spider', goal: 'One finger per fret, no buzz, no extra noise.', minutes: 8,
    body: [
      p('The chromatic “spider” drill assigns one finger to each of the first four frets and walks across all strings. It trains finger independence and shows weak fingers immediately.'),
      ul('Keep the thumb behind the neck, roughly opposite your index finger.', 'Press right behind the fret wire, not in the middle of the fret.', 'Lift fingers only as far as needed – hover close to the strings.'),
      tip('If notes are missed, use “Wait for me” mode first: the song pauses until you play the note right.'),
    ],
    exercises: [
      { label: 'Spider – wait mode at 70 %', songId: 'chromatic-spider', speed: 0.7, mode: 'wait', need: 0.7 },
      { label: 'Spider – real-time at 85 %', songId: 'chromatic-spider', speed: 0.85, need: 0.75 },
    ],
  },
  {
    id: 'm1-read-tab', module: 1, title: 'Reading the waterfall', goal: 'Read tab quickly and play in time with the falling notes.', minutes: 8,
    body: [
      p('Each of the six lanes is a string: low E on the left to high e on the right. The number inside a note is the fret to press – 0 means play the string open. A chord appears as several notes joined by a bar, with its name above.'),
      p('Look ahead rather than at the hit line: your eyes should be a beat or two in front of your hands.'),
    ],
    exercises: [
      { label: 'C major scale – wait mode', songId: 'c-major-scale', speed: 0.8, mode: 'wait', need: 0.8 },
      { label: 'C major scale – real-time', songId: 'c-major-scale', speed: 1, need: 0.8 },
    ],
  },
  {
    id: 'm1-counting', module: 1, title: 'Counting & steady rhythm', goal: 'Strum evenly in quarter notes and feel the bar.', minutes: 8,
    body: [
      p('Count “1 2 3 4” out loud while you play. The count-in gives you one bar; keep that pulse in your foot. Your hand should keep moving even when a note is not played.'),
      tip('Turn on the click and the backing band (with headphones!) to lock your timing to a real groove.'),
    ],
    exercises: [{ label: 'Hold a G chord for 4 bars', make: () => buildChordDrill(['G'], 70, 'quarter', 'Steady G', 4), track: 'chords', need: 0.8 }],
  },
  {
    id: 'm1-open-changes', module: 1, title: 'Open chord changes', goal: 'Switch between G, C, D, Em and Am in time.', minutes: 10,
    body: [
      p('Smooth changes come from planning the move before the beat. Look at the next chord while you strum the current one, and move all fingers together as one shape.'),
      chords('G', 'C', 'D', 'Em', 'Am'),
      tip('Find anchor fingers: G → Em keeps fingers 2 and 3 on the same strings. C → Am only moves one finger.'),
    ],
    exercises: [
      { label: 'Open chord changes – 70 %', songId: 'open-chord-changes-drill', speed: 0.7, need: 0.7 },
      { label: 'Open chord changes – full speed', songId: 'open-chord-changes-drill', speed: 1, need: 0.75 },
    ],
  },
  // ---------------- Module 2 ----------------
  {
    id: 'm2-pop-loop', module: 2, title: 'Four-chord songs', goal: 'Play the most common progression in pop music.', minutes: 10,
    body: [
      p('Hundreds of songs are built on I–V–vi–IV. In C that is C – G – Am – F. Once you can play this loop, you can accompany a huge amount of music.'),
      chords('C', 'G', 'Am', 'F'),
      p('The F chord is the hurdle: it is a mini-barre. Start with the easier voicing (xx3211) if the full barre buzzes – the app accepts the barre version, so practise that when you can.'),
    ],
    exercises: [{ label: 'Four-chord pop loop', songId: 'four-chord-pop-loop', track: 'chords', speed: 0.8, need: 0.7 }],
  },
  {
    id: 'm2-barre-f', module: 2, title: 'Barre chords: the F shape', goal: 'Press all six strings with the index finger.', minutes: 12,
    body: [
      p('A barre chord uses your index finger like a movable capo. Roll the finger slightly onto its bony side, keep the wrist relaxed, and use arm weight – not thumb squeeze.'),
      ul('Place the barre just behind the fret wire.', 'Let the other fingers form an E-chord shape.', 'Check each string: use the Chord checker to see which strings ring.'),
      tip('Practise short: 30 seconds on, 30 seconds rest. Finger strength builds fast but fatigue ruins form.'),
    ],
    exercises: [
      { label: 'Check your F chord', need: 0, link: { to: '/chords', label: 'Open chord checker' } },
      { label: 'F – Bb – C – Dm workout', songId: 'barre-chord-workout-in-f', track: 'chords', speed: 0.7, mode: 'wait', need: 0.6 },
    ],
  },
  {
    id: 'm2-movable', module: 2, title: 'Moving the E and A shapes', goal: 'Play any major chord anywhere on the neck.', minutes: 12,
    body: [
      p('Slide an E-shape barre up the neck and the chord name follows the fret: fret 1 = F, fret 2 = F#, fret 3 = G… The same works for the A shape rooted on the 5th string.'),
      chords('F', 'F#', 'Ab', 'Bb'),
    ],
    exercises: [{ label: 'F – F# – Ab – Bb', make: () => buildChordDrill(['F', 'F#', 'Ab', 'Bb'], 60, 'quarter', 'Moving barre chords'), track: 'chords', speed: 0.8, mode: 'wait', need: 0.6 }],
  },
  {
    id: 'm2-minor-barre', module: 2, title: 'Minor barre chords: Bm & friends', goal: 'Play Bm, F#m and C#m confidently.', minutes: 10,
    body: [
      p('Bm (x24432) is the classic A-shape minor barre. F#m (244222) is the E-shape minor barre at fret 2. Both appear in countless songs.'),
      chords('Bm', 'F#m', 'C#m', 'G#m'),
    ],
    exercises: [{ label: 'Canon-style progression (Bm, F#m)', songId: 'canon-style-progression-in-d', track: 'chords', speed: 0.75, need: 0.65 }],
  },
  {
    id: 'm2-sevenths', module: 2, title: 'Seventh chords', goal: 'Add dominant and minor sevenths for bluesier colour.', minutes: 10,
    body: [
      p('Dominant 7th chords (G7, C7, D7, A7, E7) add tension that wants to resolve. They are the backbone of blues. Minor 7ths (Am7, Dm7, Em7) feel smoother and more modern.'),
      chords('G7', 'C7', 'D7', 'A7', 'E7', 'Am7'),
    ],
    exercises: [
      { label: 'Seventh chord drill', make: () => buildChordDrill(['G7', 'C7', 'D7', 'G7', 'E7', 'A7', 'D7', 'E7'], 72, 'quarter', 'Seventh chords'), track: 'chords', speed: 0.8, need: 0.65 },
      { label: 'ii–V–I jazz changes', songId: 'ii-v-i-jazz-changes-in-c', track: 'chords', speed: 0.75, need: 0.6 },
    ],
  },
  {
    id: 'm2-sus-add9', module: 2, title: 'Sus & add9 colours', goal: 'Make simple progressions sound open and modern.', minutes: 8,
    body: [
      p('Replace the third of a chord with a 2nd or 4th (sus2/sus4) or add a 9th on top (add9). These chords are leaning rather than happy or sad – perfect for atmospheric strumming.'),
      chords('Asus2', 'Asus4', 'Dsus4', 'Cadd9', 'Em7'),
    ],
    exercises: [{ label: 'Shimmer: sus & add9', songId: 'shimmer-sus-add9', track: 'chords', speed: 0.85, need: 0.65 }],
  },
  // ---------------- Module 3 ----------------
  {
    id: 'm3-folk-pattern', module: 3, title: 'The universal strumming pattern', goal: 'Down, down-up, up-down-up – the groove behind countless songs.', minutes: 10,
    body: [
      p('Keep your hand moving down-up-down-up in steady eighth notes. Skip the strings on some strokes (“ghost strums”) rather than stopping the motion. The pattern is D · D U · U D U.'),
      tip('Waterfall arrows show the stroke direction: ↓ down, ↑ up. Up-strokes only hit the top strings.'),
    ],
    exercises: [{ label: 'Folk pattern in E', songId: 'rhythm-workout-folk-pattern-in-e', track: 'chords', speed: 0.75, need: 0.65 }, { label: 'Campfire strum in G', songId: 'campfire-strum-in-g-capo-2', track: 'chords', speed: 0.85, need: 0.65 }],
  },
  {
    id: 'm3-offbeat', module: 3, title: 'Offbeats & reggae skank', goal: 'Play on the “and” of every beat.', minutes: 8,
    body: [
      p('Syncopation means emphasising weak beats. In reggae the guitar plays short chops on the offbeats – only upstrokes on the top strings – while the drums and bass hold the beat.'),
    ],
    exercises: [{ label: 'Reggae one-drop in C', songId: 'reggae-one-drop-in-c', track: 'chords', speed: 0.8, need: 0.6 }],
  },
  {
    id: 'm3-meters', module: 3, title: 'Waltz and 6/8 feel', goal: 'Feel three and six instead of four.', minutes: 10,
    body: [
      p('3/4 gives you a waltz: strong-weak-weak. 6/8 feels like two big beats, each split into three: ONE-two-three FOUR-five-six. Count the second one aloud until it becomes natural.'),
    ],
    exercises: [{ label: 'Waltz in C', songId: 'waltz-in-c', track: 'chords', speed: 0.9, need: 0.65 }, { label: 'Ballad in 6/8', songId: 'ballad-in-6-8-d', track: 'chords', speed: 0.8, need: 0.6 }],
  },
  {
    id: 'm3-power-mute', module: 3, title: 'Power chords & palm muting', goal: 'Tight rock rhythm.', minutes: 10,
    body: [
      p('Power chords use only the root and fifth, so they stay clear even with heavy gain. Rest the edge of your picking palm lightly on the strings right at the bridge to get the chunky palm-mute sound.'),
      tip('The detector cannot hear whether you mute – it just checks pitch and timing – so listen to your tone yourself!'),
      chords('E5', 'G5', 'A5', 'D5'),
    ],
    exercises: [{ label: 'Power chord anthem', songId: 'power-chord-anthem-in-e', track: 'chords', speed: 0.85, need: 0.65 }, { label: 'Rock riff in Em', songId: 'rock-riff-em', speed: 0.8, need: 0.7 }],
  },
  // ---------------- Module 4 ----------------
  {
    id: 'm4-arpeggio', module: 4, title: 'Fingerpicking arpeggios', goal: 'Thumb plays the bass, fingers take the top three strings.', minutes: 12,
    body: [
      p('Assign your thumb (p) to the three bass strings and index, middle and ring (i, m, a) to the G, B and high-e strings. Keep the hand still and let the fingers do the work.'),
      tip('Rest your thumb on the lowest string in the pattern before it plays – it gives you a reference point.'),
    ],
    exercises: [{ label: 'Fingerpicking in Am', songId: 'fingerpicking-pattern-in-am', track: 'picking', speed: 0.75, need: 0.65 }],
  },
  {
    id: 'm4-six-eight', module: 4, title: 'Flowing 6/8 arpeggios', goal: 'Long, smooth arpeggio lines.', minutes: 10,
    body: [p('In 6/8 the arpeggio becomes a rolling wave: bass, then up and back down the treble strings. Let each note ring into the next.')],
    exercises: [{ label: 'Slow 6/8 arpeggio in C', songId: 'slow-6-8-arpeggio-in-c', track: 'picking', speed: 0.8, need: 0.65 }, { label: 'House of the Rising Sun (arpeggio)', songId: 'house-of-the-rising-sun-chords', track: 'picking', speed: 0.8, need: 0.6 }],
  },
  {
    id: 'm4-travis', module: 4, title: 'Travis picking', goal: 'Alternating thumb with melody notes on top.', minutes: 15,
    body: [
      p('Travis picking keeps the thumb steady, alternating between two bass strings like a heartbeat, while the fingers pluck the higher strings in between. Get the thumb on autopilot first, then add the fingers.'),
    ],
    exercises: [{ label: 'Travis picking – slow', songId: 'travis-picking-in-c', track: 'picking', speed: 0.6, mode: 'wait', need: 0.6 }, { label: 'Travis picking – tempo', songId: 'travis-picking-in-c', track: 'picking', speed: 0.85, need: 0.65 }],
  },
  {
    id: 'm4-melody-bass', module: 4, title: 'Spanish study: melody over bass', goal: 'Arpeggio study in the classical-guitar style.', minutes: 12,
    body: [p('A classic arpeggio pattern: bass note, then three treble strings, then back down. Notice how the harmony moves Em – Am – B7 – Em.')],
    exercises: [{ label: 'Spanish study in Em', songId: 'spanish-study-em', speed: 0.75, need: 0.65 }],
  },
  {
    id: 'm4-elise', module: 4, title: 'Für Elise (theme)', goal: 'Play a famous classical melody cleanly.', minutes: 15,
    body: [p('This trills-and-leaps theme is perfect for legato control. Keep the hand relaxed, let notes ring, and listen for even volume across the quick sixteenths.')],
    exercises: [{ label: 'Für Elise – wait mode', songId: 'fur-elise', track: 'melody', speed: 0.7, mode: 'wait', need: 0.65 }, { label: 'Für Elise – real-time', songId: 'fur-elise', track: 'melody', speed: 0.85, need: 0.65 }],
  },
  // ---------------- Module 5 ----------------
  {
    id: 'm5-major-scale', module: 5, title: 'Major scale in two octaves', goal: 'The map behind every melody.', minutes: 10,
    body: [p('The major scale is the pattern of whole and half steps W-W-H-W-W-W-H. Play it slowly and sing the note names. Knowing it lets you pick out melodies by ear.')],
    exercises: [{ label: 'G major scale', songId: 'g-major-scale-2oct', speed: 0.75, need: 0.7 }],
  },
  {
    id: 'm5-pentatonic', module: 5, title: 'Minor pentatonic box 1', goal: 'The most important lead-guitar shape.', minutes: 12,
    body: [p('Five notes per octave, two per string. Root notes (A at the 5th fret on both outer strings) are your landing points. Learn to see the box as a shape on the neck, not as numbers.')],
    exercises: [{ label: 'A minor pentatonic', songId: 'a-minor-pentatonic-1', speed: 0.8, need: 0.7 }, { label: 'E minor pentatonic (open)', songId: 'e-minor-pentatonic-1', speed: 0.9, need: 0.7 }],
  },
  {
    id: 'm5-blues', module: 5, title: 'The blues scale & blue note', goal: 'Add the b5 for that crying sound.', minutes: 10,
    body: [p('Add one note – the flat fifth – to the minor pentatonic and you get the blues scale. Treat it as a passing tone: bend or slide through it and resolve to a chord tone.')],
    exercises: [{ label: 'A blues scale', songId: 'a-blues-scale', speed: 0.85, need: 0.7 }],
  },
  {
    id: 'm5-legato', module: 5, title: 'Hammer-ons & pull-offs', goal: 'Make notes sound without picking them.', minutes: 12,
    body: [
      p('Pick the first note, then hammer a finger down hard and fast to sound the next. For a pull-off, snap the finger slightly sideways as you lift. The dashed outline on a note means “play it legato”.'),
      tip('Legato notes are judged by pitch only (no pick attack needed) – the volume still has to be loud enough!'),
    ],
    exercises: [{ label: 'Hammer-on / pull-off drill', songId: 'hammer-pull-drill', speed: 0.7, need: 0.65 }],
  },
  {
    id: 'm5-speed', module: 5, title: 'Alternate picking speed', goal: 'Even sixteenth notes with strict down-up.', minutes: 12,
    body: [
      p('Start at 50 % speed until every note is clean, then add 5 % at a time. Small wrist motions are faster and more efficient than big arm swings.'),
    ],
    exercises: [{ label: 'Sixteenths – 50 %', songId: 'alt-picking-16ths', speed: 0.5, need: 0.8 }, { label: 'Sixteenths – 75 %', songId: 'alt-picking-16ths', speed: 0.75, need: 0.75 }],
  },
  {
    id: 'm5-lick', module: 5, title: 'Your first blues lick', goal: 'Phrase like a lead player.', minutes: 12,
    body: [p('A lick is a short melodic idea. This two-bar phrase combines the pentatonic notes with a held ending: leave space between phrases – silence is part of the music.')],
    exercises: [{ label: 'Pentatonic lick in A', songId: 'pentatonic-lick-a', speed: 0.85, need: 0.7 }],
  },
  // ---------------- Module 6 ----------------
  {
    id: 'm6-twelve-bar', module: 6, title: 'The twelve-bar blues', goal: 'Know the most important form in popular music.', minutes: 15,
    body: [
      p('Twelve bars, three chords: I – IV – V. In E: E7 (4 bars), A7 (2 bars), E7 (2 bars), B7, A7, E7, B7. Once you hear the form, you can follow along in any blues.'),
      chords('E7', 'A7', 'B7'),
    ],
    exercises: [{ label: '12-bar blues – chords', songId: '12-bar-blues-in-e', track: 'chords', speed: 0.85, need: 0.65 }, { label: 'Blues boogie bass line', songId: 'blues-boogie-e', speed: 0.85, need: 0.65 }],
  },
  {
    id: 'm6-capo', module: 6, title: 'Capo & transposing', goal: 'Change key without learning new shapes.', minutes: 8,
    body: [p('A capo raises every open string by the number of frets. Play the same G-C-D-Em shapes with a capo on fret 2 and the song sounds in A. Singers use it to find a comfortable key.')],
    exercises: [{ label: 'Campfire strum, capo 2', songId: 'campfire-strum-in-g-capo-2', track: 'chords', speed: 1, need: 0.7 }],
  },
  {
    id: 'm6-keys', module: 6, title: 'Progressions in any key', goal: 'Think in numbers: I, IV, V.', minutes: 10,
    body: [p('Chord progressions are written in Roman numerals so they work in every key. Try the same I–V–vi–IV in G, then D. The Jam builder in the Songs section generates any progression for you.')],
    exercises: [
      { label: 'I–V–vi–IV in G', make: () => buildJam({ key: 'G', minor: false, numerals: ['I', 'V', 'vi', 'IV'], bpm: 96, style: 'folk', loops: 3 }), track: 'chords', speed: 0.9, need: 0.65 },
      { label: 'I–V–vi–IV in D', make: () => buildJam({ key: 'D', minor: false, numerals: ['I', 'V', 'vi', 'IV'], bpm: 96, style: 'folk', loops: 3 }), track: 'chords', speed: 0.9, need: 0.65 },
    ],
  },
  {
    id: 'm6-scale-position', module: 6, title: 'Scales in new positions', goal: 'See the neck beyond the first five frets.', minutes: 10,
    body: [p('The same scale lives in several positions. Practise A minor pentatonic at fret 5, then at fret 8 and 12. Always find the root notes first.')],
    exercises: [
      { label: 'A minor pentatonic, fret 8', make: () => buildScaleSong({ root: 9, scale: 'minpent', position: 7, bpm: 80, pattern: 'updown' }), track: 'main', speed: 0.85, need: 0.65 },
    ],
  },
  {
    id: 'm6-performance', module: 6, title: 'Performance: play it through', goal: 'Perform a full piece without stopping.', minutes: 15,
    body: [
      p('Pick a piece and play it from start to finish without stopping – even if you make mistakes. Performance skill is mostly about recovering gracefully.'),
      tip('Turn the backing band on (headphones!) and aim for 85 % accuracy at full speed.'),
    ],
    exercises: [
      { label: 'Canon-style progression – fingerpicking', songId: 'canon-style-progression-in-d', track: 'picking', speed: 1, need: 0.75 },
      { label: 'Andalusian cadence – strumming', songId: 'andalusian-cadence', track: 'chords', speed: 1, need: 0.75 },
    ],
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
export const exKey = (lessonId: string, i: number) => `ex:${lessonId}#${i}`;
