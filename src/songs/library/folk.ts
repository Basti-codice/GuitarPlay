import type { LibraryEntry } from '../arrange';

/**
 * Public-domain tunes written out as ABC with simple chord symbols.
 * Melodies are transcribed from memory – if something sounds off, correct it in the editor.
 */
export const FOLK: LibraryEntry[] = [
  {
    genre: 'Children', difficulty: 1, style: 'folk', tags: ['easy', 'open chords'],
    abc: `T:Twinkle, Twinkle, Little Star
C:Traditional
M:4/4
L:1/4
Q:1/4=96
K:C
"C"C C G G | "F"A A "C"G2 | "F"F F "C"E E | "G"D D "C"C2 |
"G"G G "F"F F | "C"E E "G"D2 | "G"G G "F"F F | "C"E E "G"D2 |
"C"C C G G | "F"A A "C"G2 | "F"F F "C"E E | "G"D D "C"C2 |]`,
  },
  {
    genre: 'Children', difficulty: 1, style: 'quarter', tags: ['easy', 'three notes'],
    abc: `T:Mary Had a Little Lamb
C:Traditional
M:4/4
L:1/4
Q:1/4=100
K:C
"C"E D C D | E E E2 | "G"D D D2 | "C"E G G2 |
"C"E D C D | E E E E | "G"D D "C"E D | "C"C4 |]`,
  },
  {
    genre: 'Children', difficulty: 1, style: 'waltz', tags: ['easy', '6/8'],
    abc: `T:Row, Row, Row Your Boat
C:Traditional
M:6/8
L:1/8
Q:3/8=64
K:C
"C"C3 C3 | C2 D E3 | E2 D E2 F | "G"G6 |
"C"c c c G G G | E E E C C C | "G"G2 F E2 D | "C"C6 |]`,
  },
  {
    genre: 'Children', difficulty: 1, style: 'quarter', tags: ['easy', 'round'],
    abc: `T:Frère Jacques
C:Traditional
M:4/4
L:1/4
Q:1/4=100
K:C
"C"C D E C | C D E C | E F "G"G2 | "C"E F G2 |
"G"G/A/G/F/ "C"E C | "G"G/A/G/F/ "C"E C | "C"C G, C2 | C G, C2 |]`,
  },
  {
    genre: 'Children', difficulty: 1, style: 'quarter', tags: ['easy'],
    abc: `T:London Bridge
C:Traditional
M:4/4
L:1/4
Q:1/4=104
K:C
"C"G3/2A/ G F | E F G2 | "G"D E F2 | "C"E F G2 |
G3/2A/ G F | E F G2 | "G"D G "C"E C |]`,
  },
  {
    genre: 'German', difficulty: 1, style: 'quarter', tags: ['easy', 'kinderlied'], id: 'alle-meine-entchen',
    abc: `T:Alle meine Entchen
C:Traditional
M:4/4
L:1/4
Q:1/4=100
K:C
"C"C D E F | G2 G2 | "F"A A A A | "C"G4 |
"F"A A A A | "C"G4 | "F"F F F F | "C"E2 E2 | "G"D D D D | "C"C4 |]`,
  },
  {
    genre: 'German', difficulty: 1, style: 'quarter', tags: ['easy', 'kinderlied'], id: 'haenschen-klein',
    abc: `T:Hänschen klein
C:Traditional
M:4/4
L:1/4
Q:1/4=104
K:C
"C"G E E2 | "G"F D D2 | "C"C D E F | G G G2 |
"C"G E E2 | "G"F D D2 | "C"C E G G | C4 |]`,
  },
  {
    genre: 'Children', difficulty: 1, style: 'waltz', tags: ['easy', 'waltz'],
    abc: `T:Happy Birthday to You
C:Traditional
M:3/4
L:1/4
Q:1/4=100
K:C
G3/4 G/4 | "C"A G c | "G"B2 G3/4 G/4 | "G"A G d | "C"c2 G3/4 G/4 | "C"g e c | "G"B A "F"f3/4 f/4 | "C"e c "G"d | "C"c3 |]`,
  },
  {
    genre: 'Classical', difficulty: 2, style: 'quarter', tags: ['beethoven', 'melody'],
    abc: `T:Ode to Joy
C:Ludwig van Beethoven
M:4/4
L:1/4
Q:1/4=100
K:C
"C"E E F G | G F E D | "C"C C D E | "G"E3/2 D/ D2 |
"C"E E F G | G F E D | "C"C C D E | "G"D3/2 C/ "C"C2 |
"G"D D E C | D E/F/ E C | "G"D E/F/ E D | "C"C D "G"G,2 |
"C"E E F G | G F E D | "C"C C D E | "G"D3/2 C/ "C"C2 |]`,
  },
  {
    genre: 'Folk', difficulty: 1, style: 'march', tags: ['easy', 'american'],
    abc: `T:Yankee Doodle
C:Traditional
M:4/4
L:1/4
Q:1/4=112
K:C
"C"C C D E | C E D G, | "C"C C D E | C2 "G"B,2 |
"C"C C D E | "F"F E D C | "G"B, G, A, B, | "C"C2 C2 |]`,
  },
  {
    genre: 'Folk', difficulty: 1, style: 'folk', tags: ['easy', 'banjo'],
    abc: `T:Oh! Susanna
C:Stephen Foster
M:4/4
L:1/4
Q:1/4=116
K:C
"C"C D E G | G A G E | C D E E | "G"D C D2 |
"C"C D E G | G A G E | "G"C D E D | "C"C4 |]`,
  },
  {
    genre: 'Christmas', difficulty: 2, style: 'folk', tags: ['christmas', 'chorus'],
    abc: `T:Jingle Bells (Chorus)
C:James Lord Pierpont
M:4/4
L:1/4
Q:1/4=120
K:C
"C"E E E2 | E E E2 | E G C3/2 D/ | E4 |
"F"F F F3/2 F/ | F E E E/E/ | "G"E D D E | D2 G2 |
"C"E E E2 | E E E2 | E G C3/2 D/ | E4 |
"F"F F F3/2 F/ | F E E E/E/ | "G"G G F D | "C"C4 |]`,
  },
  {
    genre: 'Folk', difficulty: 2, style: 'waltz', tags: ['hymn', 'waltz'],
    abc: `T:Amazing Grace
C:Traditional
M:3/4
L:1/4
Q:1/4=76
K:G
D | "G"G2 B/G/ | B2 "C"A | "G"G2 "Em"E | "D"D2 D | "G"G2 B/G/ | B2 "C"A | "G"d2 B | d2 B/d/ | "G"B2 G | "D"D2 D | "G"G2 B/G/ | B2 "C"A | "G"G3 |]`,
  },
  {
    genre: 'Christmas', difficulty: 2, style: 'ballad', tags: ['christmas', '6/8'], description: 'Simplified rhythm of the carol.',
    abc: `T:Silent Night
C:Franz Xaver Gruber
M:6/8
L:1/8
Q:3/8=56
K:C
"C"G3 A G2 | E6 | G3 A G2 | E6 | "G"d3 d B2 | B6 | "C"c3 c G2 | G6 |
"F"A3 A c2 | "C"c3 B A2 | "C"G3 A G2 | E6 | "F"A3 A c2 | "C"c3 B A2 | "C"G3 A G2 | E6 |
"G"d3 d f2 | f3 d B2 | "C"c6 | e6 | "C"c3 G E2 | "G"G3 F D2 | "C"C6 |]`,
  },
  {
    genre: 'Classical', difficulty: 3, style: 'ballad', tags: ['beethoven', 'a minor', 'iconic'], id: 'fur-elise',
    abc: `T:Für Elise (Theme)
C:Ludwig van Beethoven
M:3/8
L:1/16
Q:1/4=66
K:Am
"Am"e^d | "Am"e^d e B d c | A2 z C E A | "E"B2 z E ^G B | "Am"c2 z E e ^d | "Am"e ^d e B d c | A2 z C E A | "E"B2 z E c B | "Am"A4 z2 |]`,
  },
  {
    genre: 'Folk', difficulty: 3, style: 'ballad', tags: ['a minor', 'english'],
    description: 'First strain only. Melody transcribed from memory.',
    abc: `T:Greensleeves
C:Traditional
M:6/8
L:1/8
Q:3/8=60
K:Am
A | "Am"c2 d e2 f | "G"e2 d B2 G | "G"A2 B "Am"c2 A | "Am"A2 ^G "E"A2 B | "E"^G2 E E2 A | "Am"c2 d e2 f | "G"e2 d B2 G | "G"A2 B "Am"c B A | "E"^G2 F "E"^G2 A | "Am"A6 |]`,
  },
  {
    genre: 'World', difficulty: 2, style: 'ballad', tags: ['japanese', 'a minor'],
    abc: `T:Sakura Sakura
C:Traditional (Japan)
M:4/4
L:1/4
Q:1/4=76
K:Am
"Am"A A B2 | A A B2 | "Am"A B c B | "E"A B A F | "E"E4 |
"Am"A A B2 | A A B2 | "Am"A B c B | "E"A B A F | "E"E2 "Am"A2 |]`,
  },
  {
    genre: 'World', difficulty: 1, style: 'ballad', tags: ['french', 'easy'], id: 'au-clair-de-la-lune',
    abc: `T:Au clair de la lune
C:Traditional (France)
M:4/4
L:1/4
Q:1/4=96
K:C
"C"C C C D | E2 D2 | "G"C E D D | "C"C4 |
"C"C C C D | E2 D2 | "G"C E D D | "C"C4 |]`,
  },
  {
    genre: 'Children', difficulty: 1, style: 'quarter', tags: ['easy', 'three notes'],
    abc: `T:Hot Cross Buns
C:Traditional
M:4/4
L:1/4
Q:1/4=104
K:C
"C"E D C2 | E D C2 | C C C C | D D D D | E D C2 |]`,
  },
  {
    genre: 'Children', difficulty: 1, style: 'folk', tags: ['easy', 'kids'],
    abc: `T:Old MacDonald (Theme)
C:Traditional
M:4/4
L:1/4
Q:1/4=108
K:G
"G"G G G D | "Em"E E "D"D2 | "G"B B A A | "G"G4 |
"G"G G G D | "Em"E E "D"D2 | "G"B B A A | "G"G4 |]`,
  },
];
