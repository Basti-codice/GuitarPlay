import { PageHead } from '../ui/kit';
import { navigate } from '../core/router';

const FAQ: { q: string; a: string }[] = [
  { q: 'Correct notes are marked as missed.', a: 'Check Settings → Live detection monitor: the level must clearly pass the white gate line. Raise the input gain, move the microphone closer (20–40 cm to the soundhole), or lower the noise gate. Make sure the guitar is in tune – the tuner is in the sidebar. You can also set the strictness to Easy.' },
  { q: 'Wrong notes or noise are accepted / extra notes appear.', a: 'Lower the attack sensitivity (Settings → Judging), raise the note threshold, or use Strict. Quiet rooms work best. If you use the backing band or click, wear headphones – the microphone otherwise hears the speakers.' },
  { q: 'Everything is judged early or late.', a: 'Run the timing measurement in Settings → Setup wizard (step “Timing”), or adjust “Latency compensation” manually. The result screen tells you whether you tend to be early or late.' },
  { q: 'Chords are only partly recognised.', a: 'Strum all strings evenly and let the chord ring for a moment. Use the Chord checker to see which strings are heard; a dim string usually means it was muted by a finger or not hit by the pick. “Easy” mode accepts a chord when about 60 % of its strings are heard.' },
  { q: 'Can I play with an electric guitar or an audio interface?', a: 'Yes – pick the interface under Settings → Microphone. A clean (no distortion) signal works best. Interfaces give much lower latency than a laptop microphone.' },
  { q: 'Why does the browser need microphone access?', a: 'The audio is analysed live inside the browser to judge your playing. Nothing is recorded or uploaded unless you use the Recorder, and recordings stay on your computer.' },
  { q: 'Where are my songs, recordings and progress stored?', a: 'In this browser (IndexedDB and local storage). Use Settings → Export backup to keep a copy or move to another computer.' },
  { q: 'How do I add songs?', a: 'Songs → Add song, or Import & Create: Guitar Pro / MusicXML / MIDI / ABC / text tabs, or write one in the Editor. The Jam builder creates chord songs in any key.' },
];

export function Help() {
  return (
    <div className="page narrow">
      <PageHead title="Help" sub="Quick start and troubleshooting." />
      <div className="card prose">
        <h3>Quick start</h3>
        <ul>
          <li>Run the <a href="#/setup">setup wizard</a> once (microphone, level, noise, timing).</li>
          <li>Tune with the <a href="#/tuner">tuner</a>.</li>
          <li>Pick a piece in <a href="#/library">Songs</a>, choose an arrangement (Melody / Chords / Picking) and press Play.</li>
          <li>Notes fall towards the glowing line – play them when they reach it. Numbers are frets; 0 = open string.</li>
          <li>New to the app’s level? Follow the <a href="#/learn">Learn</a> path.</li>
        </ul>
        <h3>Shortcuts in the play screen</h3>
        <ul>
          <li><kbd>Space</kbd> start / pause · <kbd>R</kbd> restart · <kbd>Esc</kbd> leave</li>
        </ul>
        <h3>Wait-for-me vs. real-time</h3>
        <p>Wait-for-me stops the song at each note until you play it correctly – ideal for learning a new part. Real-time keeps the beat and scores your timing.</p>
      </div>
      <div className="col">
        {FAQ.map((f) => (
          <details key={f.q} className="card" style={{ padding: '14px 18px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{f.q}</summary>
            <p style={{ marginTop: 10 }}>{f.a}</p>
          </details>
        ))}
      </div>
      <div className="row"><button className="btn" onClick={() => navigate('/settings')}>Open settings</button></div>
    </div>
  );
}
