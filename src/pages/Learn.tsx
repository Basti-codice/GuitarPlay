import { ChordDiagram, PageHead, Stars, Bar } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { LESSONS, MODULES, exKey, lessonById, type Exercise } from '../learn/lessons';
import { getProgress, useProgress } from '../core/progress';
import { navigate } from '../core/router';
import { registerTempSong, getSong } from '../core/songs-store';
import { chordInfo } from '../songs/chords';
import { getCtx } from '../audio/engine';
import { mic } from '../audio/mic';
import { toast } from '../ui/toast';

export function startExercise(lessonId: string, i: number, ex: Exercise) {
  if (ex.link) {
    navigate(ex.link.to);
    return;
  }
  getCtx();
  void mic.start();
  const song = ex.songId ? getSong(ex.songId) : ex.make?.();
  if (!song) {
    toast('Exercise not found');
    return;
  }
  if (!ex.songId) registerTempSong(song);
  const track = ex.track ?? song.tracks.find((t) => t.kind === 'melody')?.id ?? song.tracks[0].id;
  const q = new URLSearchParams({ track, speed: String(ex.speed ?? 1), mode: ex.mode ?? 'realtime', lesson: lessonId, ex: String(i), need: String(ex.need) });
  navigate(`/play/${encodeURIComponent(song.id)}?${q}`);
}

export function Learn() {
  const p = useProgress();
  const done = (id: string) => !!p.lessons[id]?.done;
  const total = LESSONS.length;
  const completed = LESSONS.filter((l) => done(l.id)).length;
  const nextLesson = LESSONS.find((l) => !done(l.id));
  return (
    <div className="page">
      <PageHead title="Learn" sub="An intermediate course – skip the beginner basics, work on what makes you sound like a real player." />
      <div className="hero">
        <div className="row between wrap">
          <div style={{ maxWidth: 520 }}>
            <h2>{completed === total ? 'Course complete! 🎓' : `${completed} of ${total} lessons done`}</h2>
            <div style={{ margin: '12px 0', maxWidth: 360 }}><Bar value={completed / total} /></div>
            {nextLesson && <button className="btn primary lg" onClick={() => navigate(`/learn/${nextLesson.id}`)}><Icon name="play" size={18} /> {completed ? 'Continue' : 'Start'}: {nextLesson.title}</button>}
          </div>
        </div>
      </div>
      {MODULES.map((m) => {
        const ls = LESSONS.filter((l) => l.module === m.id);
        const dn = ls.filter((l) => done(l.id)).length;
        return (
          <section key={m.id}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="row">
                <div style={{ width: 8, height: 34, background: m.color, borderRadius: 4 }} />
                <div>
                  <h2>Module {m.id}: {m.title}</h2>
                  <div className="small muted">{m.blurb}</div>
                </div>
              </div>
              <span className="pill">{dn}/{ls.length}</span>
            </div>
            <div className="grid auto">
              {ls.map((l) => (
                <div key={l.id} className="card hover" onClick={() => navigate(`/learn/${l.id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/learn/${l.id}`)}>
                  <div className="row between">
                    <h3>{l.title}</h3>
                    {done(l.id) ? <span style={{ color: 'var(--good)' }}><Icon name="check" size={20} /></span> : <span className="tiny faint">{l.minutes} min</span>}
                  </div>
                  <p className="small" style={{ margin: '6px 0 8px' }}>{l.goal}</p>
                  <Stars n={p.lessons[l.id]?.stars ?? 0} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Lesson({ id }: { id: string }) {
  const p = useProgress();
  const lesson = lessonById(id);
  if (!lesson) return <div className="page"><h1>Lesson not found</h1><button className="btn" onClick={() => navigate('/learn')}>Back</button></div>;
  const idx = LESSONS.indexOf(lesson);
  const mod = MODULES.find((m) => m.id === lesson.module)!;
  const next = LESSONS[idx + 1];
  const prev = LESSONS[idx - 1];
  const exDone = (i: number) => (getProgress().counters[exKey(lesson.id, i)] ?? 0) > 0;
  void p;
  return (
    <div className="page narrow">
      <div className="row between">
        <button className="btn ghost sm" onClick={() => navigate('/learn')}><Icon name="left" size={16} /> Learn</button>
        <span className="pill" style={{ background: mod.color + '22', color: mod.color }}>Module {mod.id}: {mod.title}</span>
      </div>
      <div>
        <h1>{lesson.title}</h1>
        <p style={{ marginTop: 6, fontSize: 17 }}>{lesson.goal}</p>
        <div className="row small muted"><Icon name="clock" size={14} /> about {lesson.minutes} minutes</div>
      </div>
      <div className="card prose">
        {lesson.body.map((b, i) => {
          if (b.t === 'p') return <p key={i}>{b.text}</p>;
          if (b.t === 'tip') return <div key={i} className="tip">💡 {b.text}</div>;
          if (b.t === 'h') return <h3 key={i}>{b.text}</h3>;
          if (b.t === 'ul') return <ul key={i}>{b.items.map((x) => <li key={x}>{x}</li>)}</ul>;
          return (
            <div key={i} className="row wrap" style={{ gap: 16, margin: '12px 0' }}>
              {b.names.map((n) => { const c = chordInfo(n); return c ? <ChordDiagram key={n} shape={c.shape} name={n} size={92} /> : null; })}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Practice</h2>
        <div className="col">
          {lesson.exercises.map((ex, i) => {
            const ok = ex.link ? false : exDone(i);
            return (
              <div key={i} className="card" style={{ padding: 14, background: 'var(--card2)', borderColor: ok ? 'var(--good)' : undefined }}>
                <div className="row between wrap">
                  <div>
                    <b>{ex.label}</b>
                    <div className="small muted">
                      {ex.link ? 'Open the tool, then come back' : `Reach ${Math.round(ex.need * 100)}% accuracy${ex.speed && ex.speed < 1 ? ` at ${Math.round(ex.speed * 100)}% speed` : ''}${ex.mode === 'wait' ? ' · wait-for-me mode' : ''}`}
                    </div>
                  </div>
                  <div className="row">
                    {ok && <span className="pill good"><Icon name="check" size={13} /> done</span>}
                    <button className="btn primary" onClick={() => startExercise(lesson.id, i, ex)}>{ex.link ? ex.link.label : ok ? 'Play again' : 'Start'}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {lesson.exercises.every((e) => e.link) && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={async () => { const { setLesson } = await import('../core/progress'); setLesson(lesson.id, 1, 1, true); }}>Mark lesson as done</button>
          </div>
        )}
      </div>
      <div className="row between">
        {prev ? <button className="btn" onClick={() => navigate(`/learn/${prev.id}`)}><Icon name="left" size={15} /> {prev.title}</button> : <span />}
        {next ? <button className="btn" onClick={() => navigate(`/learn/${next.id}`)}>{next.title} <Icon name="right" size={15} /></button> : <span />}
      </div>
    </div>
  );
}
