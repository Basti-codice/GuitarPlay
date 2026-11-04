import { useMemo, useState } from 'react';
import { PageHead, SongCard, Seg, Modal, Slider, Setting } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useSongs, saveUserSong } from '../core/songs-store';
import { useProgress } from '../core/progress';
import { navigate } from '../core/router';
import { buildJam } from '../songs/generators';
import { NOTE_NAMES } from '../core/music';

const PRESETS: { label: string; numerals: string; minor: boolean }[] = [
  { label: 'I – V – vi – IV (pop)', numerals: 'I V vi IV', minor: false },
  { label: 'vi – IV – I – V (ballad)', numerals: 'vi IV I V', minor: false },
  { label: 'I – vi – IV – V (50s)', numerals: 'I vi IV V', minor: false },
  { label: 'I – IV – V – IV (rock)', numerals: 'I IV V IV', minor: false },
  { label: 'ii – V – I – vi (jazz)', numerals: 'ii7 V7 Imaj7 vi7', minor: false },
  { label: '12-bar blues', numerals: 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', minor: false },
  { label: 'i – VII – VI – VII (minor rock)', numerals: 'i VII VI VII', minor: true },
  { label: 'i – VI – III – VII', numerals: 'i VI III VII', minor: true },
  { label: 'i – iv – v – i (minor folk)', numerals: 'i iv v i', minor: true },
  { label: 'Andalusian: i – VII – VI – V', numerals: 'i VII VI V', minor: true },
];

export function Library() {
  const songs = useSongs();
  const prog = useProgress();
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('All');
  const [kind, setKind] = useState<'all' | 'melody' | 'chords' | 'picking'>('all');
  const [diff, setDiff] = useState(0);
  const [sort, setSort] = useState<'title' | 'diff' | 'recent'>('title');
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [jam, setJam] = useState(false);

  const genres = useMemo(() => ['All', ...Array.from(new Set(songs.map((s) => s.genre))).sort()], [songs]);
  const list = useMemo(() => {
    let r = songs.filter((s) => {
      if (genre !== 'All' && s.genre !== genre) return false;
      if (diff && s.difficulty !== diff) return false;
      if (kind !== 'all' && !s.tracks.some((t) => t.kind === kind)) return false;
      if (onlyFav && !prog.favorites.includes(s.id)) return false;
      if (onlyMine && s.source !== 'user') return false;
      if (q) {
        const hay = `${s.title} ${s.artist} ${s.genre} ${(s.tags ?? []).join(' ')} ${s.key ?? ''}`.toLowerCase();
        if (!q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) => {
      if (sort === 'diff') return a.difficulty - b.difficulty || a.title.localeCompare(b.title);
      if (sort === 'recent') return (prog.recents.indexOf(a.id) + 1 || 99) - (prog.recents.indexOf(b.id) + 1 || 99) || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });
    return r;
  }, [songs, q, genre, diff, kind, sort, onlyFav, onlyMine, prog.favorites, prog.recents]);

  return (
    <div className="page">
      <PageHead
        title="Songs"
        sub={`${songs.length} pieces · melodies, chord songs, fingerpicking and exercises. Add your own in Import & Create.`}
        actions={
          <>
            <button className="btn" onClick={() => setJam(true)}>
              <Icon name="sparkles" size={17} /> Jam builder
            </button>
            <button className="btn primary" onClick={() => navigate('/import')}>
              <Icon name="plus" size={17} /> Add song
            </button>
          </>
        }
      />
      <div className="card" style={{ padding: 14 }}>
        <div className="row wrap">
          <div className="row" style={{ position: 'relative', flex: '1 1 260px' }}>
            <span style={{ position: 'absolute', left: 12, color: 'var(--faint)' }}>
              <Icon name="search" size={17} />
            </span>
            <input type="search" placeholder="Search title, genre, tag…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', paddingLeft: 38 }} />
          </div>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <Seg value={kind} onChange={setKind} options={[{ v: 'all', label: 'All' }, { v: 'melody', label: 'Melody' }, { v: 'chords', label: 'Chords' }, { v: 'picking', label: 'Picking' }]} />
          <select value={diff} onChange={(e) => setDiff(parseInt(e.target.value))} aria-label="Difficulty">
            <option value={0}>Any level</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                Level {d}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'title')} aria-label="Sort">
            <option value="title">A–Z</option>
            <option value="diff">Easiest first</option>
            <option value="recent">Recently played</option>
          </select>
          <button className={`btn sm ${onlyFav ? 'primary' : ''}`} onClick={() => setOnlyFav(!onlyFav)}>
            <Icon name="heart" size={15} /> Favourites
          </button>
          <button className={`btn sm ${onlyMine ? 'primary' : ''}`} onClick={() => setOnlyMine(!onlyMine)}>
            Mine
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card center muted" style={{ padding: 40 }}>
          Nothing found. Try another filter – or build your own with the Jam builder.
        </div>
      ) : (
        <div className="grid auto" id="song-grid">
          {list.map((s) => (
            <SongCard key={s.id} song={s} />
          ))}
        </div>
      )}
      {jam && <JamBuilder onClose={() => setJam(false)} />}
    </div>
  );
}

function JamBuilder({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('C');
  const [preset, setPreset] = useState(0);
  const [custom, setCustom] = useState('');
  const [style, setStyle] = useState<'rock' | 'folk' | 'ballad' | 'waltz' | 'shuffle' | 'reggae' | 'quarter'>('folk');
  const [bpm, setBpm] = useState(96);
  const [meter, setMeter] = useState<'4/4' | '3/4' | '6/8'>('4/4');
  const [picking, setPicking] = useState<'arp' | 'travis'>('arp');
  const [loops, setLoops] = useState(4);
  const pr = PRESETS[preset];
  const numerals = (custom.trim() || pr.numerals).split(/\s+/);
  const minor = custom.trim() ? /^[a-z]/.test(numerals[0]) : pr.minor;
  const [num, den] = meter.split('/').map(Number);

  const create = async () => {
    const song = buildJam({ key, minor, numerals, bpm, style: meter === '3/4' ? 'waltz' : style, loops, num, den, picking });
    await saveUserSong(song);
    onClose();
    navigate(`/song/${encodeURIComponent(song.id)}`);
  };
  return (
    <Modal onClose={onClose}>
      <h2>Jam builder</h2>
      <p>Pick a key and a chord progression – GuitarPlay generates strumming and fingerpicking tracks plus a backing band you can play along with.</p>
      <div className="grid c2" style={{ marginTop: 14 }}>
        <label className="field">
          Key
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {NOTE_NAMES.map((n) => (
              <option key={n}>{n}</option>
            ))}
            {['Db', 'Eb', 'Gb', 'Ab', 'Bb'].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Progression
          <select value={preset} onChange={(e) => setPreset(parseInt(e.target.value))}>
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          …or type your own (Roman numerals)
          <input type="text" placeholder="e.g. I IV vi V7" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
        <label className="field">
          Style
          <select value={style} onChange={(e) => setStyle(e.target.value as 'rock')}>
            <option value="folk">Folk strum</option>
            <option value="rock">Rock (8ths)</option>
            <option value="ballad">Ballad</option>
            <option value="shuffle">Blues / shuffle</option>
            <option value="reggae">Reggae offbeat</option>
            <option value="quarter">Simple quarter notes</option>
          </select>
        </label>
        <label className="field">
          Meter
          <Seg value={meter} onChange={setMeter} options={[{ v: '4/4', label: '4/4' }, { v: '3/4', label: '3/4' }, { v: '6/8', label: '6/8' }]} />
        </label>
        <label className="field">
          Picking pattern
          <Seg value={picking} onChange={setPicking} options={[{ v: 'arp', label: 'Arpeggio' }, { v: 'travis', label: 'Travis' }]} />
        </label>
      </div>
      <Setting label={`Tempo: ${bpm} BPM`}>
        <Slider value={bpm} min={50} max={160} step={1} onChange={setBpm} width={220} />
      </Setting>
      <Setting label={`Repeats: ${loops}×`}>
        <Slider value={loops} min={1} max={12} step={1} onChange={setLoops} width={220} />
      </Setting>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => void create()}>
          Create song
        </button>
      </div>
    </Modal>
  );
}
