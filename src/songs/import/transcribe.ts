/** Optional: ask Claude (with the user's own API key) to transcribe a photo of sheet music. */
import { buildAiPrompt, type KnownSettings } from './prompt';

export async function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function transcribeSheet(blob: Blob, apiKey: string, known: KnownSettings = {}): Promise<{ kind: 'abc' | 'tab'; text: string }> {
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
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: await blobToBase64(blob) } }, { type: 'text', text: buildAiPrompt(known, true) }] }],
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
