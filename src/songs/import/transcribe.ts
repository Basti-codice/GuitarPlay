/** Optional: ask Claude (with the user's own API key) to transcribe a photo of sheet music. */
const PROMPT = `You are transcribing a photo of guitar music for a practice app.
- If the image shows standard music notation (a lead sheet or melody), output it as ABC notation: X:1, T: (title), M: (meter), L: (unit length), Q: (tempo as 1/4=BPM, guess if absent), K: (key), then the music. Put printed chord symbols in double quotes before the note they belong to. Write the melody exactly as printed, bar by bar, and make every bar add up to the meter.
- If the image shows guitar tablature, output ASCII tab instead: six lines per system labelled e| B| G| D| A| E|, with fret numbers in columns, left to right in time order.
Return ONLY the notation inside a single fenced code block. No commentary.`;

export async function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function transcribeSheet(blob: Blob, apiKey: string): Promise<{ kind: 'abc' | 'tab'; text: string }> {
  const media = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg';
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: await blobToBase64(blob) } }, { type: 'text', text: PROMPT }] }],
    }),
  });
  if (!resp.ok) {
    let msg = `${resp.status}`;
    try {
      msg = (await resp.json()).error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(`Claude API error: ${msg}`);
  }
  const data = await resp.json();
  const text: string = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n');
  const m = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(text);
  const body = (m ? m[1] : text).trim();
  const kind = /^\s*X:/m.test(body) || /^\s*K:/m.test(body) ? 'abc' : 'tab';
  return { kind, text: body };
}
