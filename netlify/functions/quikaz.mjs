// QuikAz server: login check, real credits, department duplicate check, AI call.
// Settings (Netlify): QUIKAZ_PROVIDER (gemini|claude), QUIKAZ_GEMINI_KEY, QUIKAZ_CLAUDE_KEY, SUPABASE_SERVICE_ROLE_KEY
const MODELS = { '1': 'claude-haiku-4-5-20251001', '1.5': 'claude-sonnet-5-5', '2.5': 'claude-opus-5-5' };
const GEMINI = {
  '1': ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'],
  '1.5': ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'],
  '2.5': ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']
};
const SB = process.env.SUPABASE_URL || 'https://qhcponrxumfnomkgverb.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoY3BvbnJ4dW1mbm9ta2d2ZXJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDMyNzUsImV4cCI6MjEwNTc3OTI3NX0.PWiYx_f-yPLgdCQRz12cU4IazliOhb6W7klWTnGqT_U';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const KIND = {
  quick: 'Answer in 2 to 5 sentences. No headings or lists unless truly needed.',
  teach: 'Teach the student so they truly understand. Explain simply from the basics, build step by step with everyday examples, then end with 3 short questions to test understanding, with the answers listed after.',
  essay: 'Write a well-structured essay in flowing paragraphs: introduction, body and conclusion. No bullet points or tables.',
  research: 'Use short headings (background, key ideas, debates, suggested sources) with mostly prose. Only name real, well-known sources and say when unsure.',
  science: 'Explain the science clearly in plain steps. Show formulas only if the question truly needs them.',
  calc: 'Solve step by step and show the working.',
  case: 'Analyse the case: context, issues, options and a recommendation.',
  report: 'Write in a clear academic report style with headings that fit the topic.',
  summary: 'Summarise the text accurately and briefly.',
  image: 'The text was read from a student\'s image of notes or a diagram. Interpret it and answer.'
};
const KCOST = { quick: 0, summary: 1, calc: 2, teach: 3, science: 3, image: 3, essay: 4, case: 4, report: 5, research: 6 };
const TASK = {
  brainstorm: 'Give topic outlines, thesis ideas and literature angles.',
  audit: 'Review the text for logical flow and citation problems. List the issues, then suggest fixes.',
  expand: 'Expand the answer in much more depth.',
  translate: 'Translate the text faithfully into the target language, keeping headings, lists, tables and formulas. Do not add or remove content.'
};
const TONES = {
  '9ja': 'Write in simple, clear and correct English with easy everyday words and short sentences, for a student who finds English hard. Explain any difficult word.',
  foreign: 'Write in sophisticated, highly grammatical, well-structured academic English with precise vocabulary.'
};
const LANGS = ["English", "Yoruba", "Igbo", "Hausa", "Nigerian Pidgin", "Mandarin Chinese", "Spanish", "French", "German", "Portuguese", "Arabic", "Hebrew", "Greek", "Hindi", "Russian", "Japanese", "Korean", "Swahili", "Italian", "Turkish"];
const STYLES = ['Open with a real-life example.', 'Start from the core idea, then build outward.', 'Use an analogy to explain the main point.', 'Organise it as problem, method, then result.', 'Begin with a common misunderstanding and correct it.'];
const json = (o, s = 200) => Response.json(o, { status: s });
// Same fingerprint method as the page
const words = t => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
const hash = w => { let h = 5381; for (const c of w) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h; };
const sig = t => [...new Set(words(t).map(hash))];
function cost(p, text) {
  const w = text.trim().split(/\s+/).filter(Boolean).length;
  if (!w) return 0;
  return Math.max(1, Math.ceil((Math.ceil(w / 40) + (p.mode === 'advanced' ? 6 : 2) + (p.img ? 3 : 0) + (KCOST[p.kind] || 0)) * (parseFloat(p.model) || 1.5)));
}
const rest = (path, o = {}) => fetch(SB + '/rest/v1/' + path, { ...o, headers: { apikey: SVC, ...(SVC.startsWith('eyJ') ? { Authorization: 'Bearer ' + SVC } : {}), 'content-type': 'application/json', ...(o.headers || {}) } });
async function wallet(uid) {
  const get = async () => { const a = await (await rest('quikaz_wallets?user_id=eq.' + uid + '&select=credits,cad_units')).json(); return Array.isArray(a) ? a[0] : null; };
  let w = await get();
  if (!w) { await rest('quikaz_wallets', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ user_id: uid }) }); w = await get(); }
  return w;
}
async function callAI(p, text, system, maxTokens) {
  if ((process.env.QUIKAZ_PROVIDER || 'gemini').toLowerCase() === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.QUIKAZ_CLAUDE_KEY || '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELS[p.model] || MODELS['1.5'], max_tokens: maxTokens, temperature: 1, system, messages: [{ role: 'user', content: text }] })
    });
    if (!r.ok) throw new Error('The AI is not available (claude ' + r.status + ')');
    return ((await r.json()).content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  let last = '';
  for (const m of GEMINI[p.model] || GEMINI['1.5']) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.QUIKAZ_GEMINI_KEY || '' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 1 } })
    });
    if (r.status === 429) throw Object.assign(new Error('QuikAz is busy right now. Wait a minute and try again.'), { code: 429 });
    if (r.ok) { const d = await r.json(); return (((d.candidates || [])[0] || {}).content || { parts: [] }).parts.map(x => x.text || '').join('\n'); }
    const e = await r.json().catch(() => ({}));
    last = r.status + ': ' + String((e.error || {}).message || '').slice(0, 140);
    if (/key/i.test(last)) break;
  }
  throw new Error('The AI is not available (Google said ' + last + ')');
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Not allowed.' }, 405);
  if (!SVC) return json({ error: 'QuikAz is not fully set up yet (server key missing).' }, 500);
  const tok = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const u = tok && await fetch(SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + tok } }).catch(() => null);
  if (!u || !u.ok) return json({ error: 'Please log in again to use QuikAz.' }, 401);
  const uid = (await u.json()).id;
  let p; try { p = await req.json(); } catch (e) { return json({ error: 'Bad request.' }, 400); }
  const w = await wallet(uid);
  if (!w) return json({ error: 'Could not load your credits. Try again.' }, 500);
  if (p.task === 'wallet') return json({ credits: w.credits, cad: w.cad_units });

  const text = String(p.text || '').slice(0, 12000);
  if (!text.trim()) return json({ error: 'Type a question first.' }, 400);
  const price = cost(p, text);
  if (w.credits < price) return json({ error: 'Not enough credits. This needs ' + price + '.', credits: w.credits }, 402);

  // Similar question from another student in the same department and level?
  const dept = String(p.dept || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  const q = String(p.q || text).slice(0, 4000), mine = sig(q), level = String(p.level || '');
  if (p.task === 'answer' && dept && !p.force && mine.length >= 3) {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const rows = await (await rest('quikaz_queries?department=eq.' + encodeURIComponent(dept) + '&level=eq.' + encodeURIComponent(level) + '&user_id=neq.' + uid + '&created_at=gte.' + since + '&select=sig&order=created_at.desc&limit=500')).json().catch(() => []);
    const a = new Set(mine);
    if (Array.isArray(rows) && rows.some(r => { const s = new Set(r.sig || []), i = [...a].filter(x => s.has(x)).length; return i / (a.size + s.size - i) >= 0.7; }))
      return json({ duplicate: true, error: 'Similar question detected within your department.' }, 409);
  }

  const lang = LANGS.includes(p.lang) ? p.lang : 'English';
  const langLine = lang === 'English' ? (p.task === 'translate' ? ' The target language is English.' : '') : ' Write the whole answer in ' + lang + ' using its proper script' + (['Yoruba', 'Igbo'].includes(lang) ? ' and correct tone marks' : '') + '. Keep formulas and technical terms accurate and give the English term in brackets the first time. ';
  const system = 'You are QuikAz, an academic assistant for university students. ' + (KIND[p.kind] || KIND.quick) + ' ' + (TASK[p.task] || '') +
    (p.mode === 'advanced' ? ' Be in-depth with background context.' : ' Be concise and direct.') +
    ' The student is in ' + (p.level || '100') + ' level, so match the depth and vocabulary. ' + (TONES[p.tone] ? TONES[p.tone] + ' ' : '') + langLine + STYLES[Math.floor(Math.random() * STYLES.length)] +
    ' Use your own wording, structure and examples so no two students get the same text. Match the length and format to the type of work; if the question is easy, keep the answer simple. Use Markdown only when it helps: headings for long answers, tables only for real comparisons. Only use maths notation when the question is mathematical; otherwise include no formulas or equations. When you do use maths, write it in LaTeX between $ signs. Never invent citations. Help the student understand.';
  let answer = '';
  try { answer = await callAI(p, text, system, Math.round((p.mode === 'advanced' || p.task === 'expand' ? 3000 : 1500) * (lang !== 'English' ? 1.5 : 1))); }
  catch (e) { return json({ error: e.message || 'The AI is not available right now.' }, e.code === 429 ? 429 : 502); }
  if (!answer.trim()) return json({ error: 'The AI gave no answer. Try rephrasing.' }, 502);

  // Charge only after a successful answer, then remember the question
  const left = w.credits - price;
  await rest('quikaz_wallets?user_id=eq.' + uid, { method: 'PATCH', body: JSON.stringify({ credits: left, updated_at: new Date().toISOString() }) });
  if (p.task === 'answer' && dept && mine.length) await rest('quikaz_queries', { method: 'POST', body: JSON.stringify({ user_id: uid, department: dept, level, sig: mine }) });
  return json({ answer, credits: left, cost: price });
};
