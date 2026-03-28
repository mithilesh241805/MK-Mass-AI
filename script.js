/* ─── MK MASS AI — script.js ─── */

// ─── CONFIG ───────────────────────────────────────
const AI = {
  groq:    { url: 'https://api.groq.com/openai/v1/chat/completions',     model: 'llama-3.3-70b-versatile' },
  openai:  { url: 'https://api.openai.com/v1/chat/completions',          model: 'gpt-5.4-mini' },
  gemini:  { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' },
  claude:  { url: 'https://api.anthropic.com/v1/messages',               model: 'claude-haiku-4-5-20251001' }
};

// ─── STATE ────────────────────────────────────────
let cookHistory = [];
let eli5History = [];
let statusTimer = null;

const $ = id => document.getElementById(id);
const getKeys = () => JSON.parse(localStorage.getItem('mk_keys') || '{}');
const setKeys = obj => localStorage.setItem('mk_keys', JSON.stringify(obj));

// ─── ROUTER ───────────────────────────────────────
function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('hidden', s.id !== screenId);
  });
  // Auto-close panels on navigate
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
}

// ─── BUILD INGREDIENT GRID ────────────────────────
function buildGrid() {
  const grid = $('ingredientsGrid');
  for (let i = 1; i <= 10; i++) {
    const div = document.createElement('div');
    div.className = 'ing-wrap';
    div.innerHTML = `
      <input type="text" class="ing-field" placeholder="Ingredient ${i}" autocomplete="off">
      <span class="ing-num">${String(i).padStart(2,'0')}</span>`;
    grid.appendChild(div);
  }
}

// ─── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  loadKeys();
  loadCookHistory();
  loadEli5History();
  bindEvents();
  goTo('homeScreen');
});

// ─── BIND ALL EVENTS ──────────────────────────────
function bindEvents() {
  // Home nav
  $('goFridge').onclick  = () => goTo('fridgeScreen');
  $('goEli5').onclick    = () => goTo('eli5Screen');

  // Back buttons
  $('backFromFridge').onclick = () => goTo('homeScreen');
  $('backFromEli5').onclick   = () => goTo('homeScreen');

  // Settings toggles (one per screen)
  ['fridgeSettings', 'eli5Settings'].forEach(id => {
    const btn = $(id);
    if (!btn) return;
    btn.onclick = () => {
      const panel = btn.closest('.screen').querySelector('.panel');
      panel?.classList.toggle('hidden');
    };
  });

  // History toggle (fridge only)
  $('historyBtn').onclick = () => {
    $('historyPanel').classList.toggle('hidden');
    $('settingsPanel').classList.add('hidden');
  };

  // Close buttons
  $('closeSettings').onclick  = () => $('settingsPanel').classList.add('hidden');
  $('closeHistory').onclick   = () => $('historyPanel').classList.add('hidden');
  $('closeEli5Settings').onclick = () => $('eli5SettingsPanel').classList.add('hidden');

  // Key management
  $('saveKeysBtn').onclick    = saveKeys;
  $('testAllBtn').onclick     = testAll;
  $('saveEli5Keys').onclick   = saveKeys;
  $('testEli5All').onclick    = testAll;

  // Cook
  $('cookBtn').onclick   = cook;
  $('setupBtn').onclick  = () => {
    $('settingsPanel').classList.toggle('hidden');
    $('historyPanel').classList.add('hidden');
  };

  // ELI5 explain
  $('explainBtn').onclick = explainTopic;

  // Auto-grow textarea
  $('eli5Input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
  });

  // Enter key in textarea (Ctrl+Enter / Cmd+Enter)
  $('eli5Input').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') explainTopic();
  });

  // Test buttons for each provider
  document.querySelectorAll('.test-btn').forEach(btn => {
    btn.onclick = async () => {
      const p = btn.dataset.provider;
      const isEli5 = btn.dataset.src === 'eli5';
      const keyMap = isEli5
        ? { groq: 'groqKeyE', openai: 'openaiKeyE', gemini: 'geminiKeyE', claude: 'claudeKeyE' }
        : { groq: 'groqKey',  openai: 'openaiKey',  gemini: 'geminiKey',  claude: 'claudeKey'  };
      const keyInputId = keyMap[p];
      const keyVal = $(keyInputId)?.value.trim() || getKeys()[p] || '';
      if (!keyVal) { flashBtn(btn, 'skip', '— No Key'); return; }
      btn.textContent = '…';
      btn.className = 'test-btn';
      const result = await testKey(p, keyVal);
      if (result === 'pass')   flashBtn(btn, 'pass', 'Pass ✓');
      else if (result === 'format') flashBtn(btn, 'warn', 'Format ✓');
      else                     flashBtn(btn, 'fail', 'Fail ✗');
    };
  });

  // Provider hint on fridge screen
  document.querySelectorAll('input[name="provider"]').forEach(r => {
    r.onchange = updateProviderHint;
  });
}

function flashBtn(btn, cls, text) {
  btn.textContent = text;
  btn.className = `test-btn ${cls}`;
  setTimeout(() => { btn.textContent = 'Test'; btn.className = 'test-btn'; }, 4000);
}

// Key format patterns — fallback when live API test is blocked
const KEY_FORMAT = {
  groq:   /^gsk_[A-Za-z0-9]{20,}$/,
  openai: /^sk-[A-Za-z0-9\-_]{20,}$/,
  gemini: /^AIzaSy[A-Za-z0-9\-_]{25,}$/,
  claude: /^sk-ant-(api|session)[0-9A-Za-z\-_]{2,}-[A-Za-z0-9\-_]{20,}$/
};

function updateProviderHint() {
  const active = document.querySelector('input[name="provider"]:checked')?.value || 'groq';
  const stored = getKeys();
  const keyInputId = { groq: 'groqKey', openai: 'openaiKey', gemini: 'geminiKey', claude: 'claudeKey' }[active];
  const keyVal = ($(keyInputId)?.value.trim()) || stored[active] || '';
  const hint = $('providerHint');
  if (!hint) return;
  hint.textContent = keyVal
    ? `✓ ${active.toUpperCase()} key ready`
    : `⚠ No ${active.toUpperCase()} key — configure in Settings`;
  hint.style.color = keyVal ? 'var(--gold)' : 'var(--text-3)';
}

// ─── KEY MANAGEMENT ───────────────────────────────
function loadKeys() {
  const k = getKeys();
  const map = { groqKey: k.groq, openaiKey: k.openai, geminiKey: k.gemini, claudeKey: k.claude,
                groqKeyE: k.groq, openaiKeyE: k.openai, geminiKeyE: k.gemini, claudeKeyE: k.claude };
  Object.entries(map).forEach(([id, val]) => {
    const el = $(id);
    if (el && val) el.value = val;
  });
}

function saveKeys() {
  // Merge from both fridge and eli5 key inputs
  const stored = getKeys();
  const groq   = ($('groqKey')?.value.trim())   || ($('groqKeyE')?.value.trim())   || stored.groq   || '';
  const openai = ($('openaiKey')?.value.trim())  || ($('openaiKeyE')?.value.trim()) || stored.openai || '';
  const gemini = ($('geminiKey')?.value.trim())  || ($('geminiKeyE')?.value.trim()) || stored.gemini || '';
  const claude = ($('claudeKey')?.value.trim())  || ($('claudeKeyE')?.value.trim()) || stored.claude || '';
  setKeys({ groq, openai, gemini, claude });
  // Sync back
  if ($('groqKey'))     $('groqKey').value     = groq;
  if ($('openaiKey'))   $('openaiKey').value   = openai;
  if ($('geminiKey'))   $('geminiKey').value   = gemini;
  if ($('claudeKey'))   $('claudeKey').value   = claude;
  if ($('groqKeyE'))    $('groqKeyE').value    = groq;
  if ($('openaiKeyE'))  $('openaiKeyE').value  = openai;
  if ($('geminiKeyE'))  $('geminiKeyE').value  = gemini;
  if ($('claudeKeyE'))  $('claudeKeyE').value  = claude;
  updateProviderHint();
  showStatus('Keys saved ✓', 'success');
}

async function testAll() {
  const stored = getKeys();
  const toTest = ['groq','openai','gemini','claude'].filter(p => {
    const v1 = $(`${p}Key`)?.value.trim() || '';
    const v2 = $(`${p}KeyE`)?.value.trim() || '';
    return (v1 || v2 || stored[p] || '').length > 0;
  });
  if (!toTest.length) { showStatus('No keys to test. Enter at least one.', 'error'); return; }
  showStatus(`Testing ${toTest.length} provider(s)…`, 'loading');
  const results = await Promise.all(toTest.map(async p => ({
    p, result: await testKey(p, $(`${p}Key`)?.value.trim() || $(`${p}KeyE`)?.value.trim() || stored[p])
  })));
  const pass   = results.filter(r => r.result === 'pass').length;
  const fmt    = results.filter(r => r.result === 'format').length;
  const fail   = results.filter(r => r.result === 'fail').length;
  const skip   = 4 - toTest.length;
  const total = pass + fmt;
  let msg = `${total}/${toTest.length} passed`;
  if (skip) msg += ` · ${skip} skipped`;
  showStatus(msg, fail > 0 ? 'error' : 'success');
}

// ─── ANIME GIRL VOICE ────────────────────────────
const Voice = (() => {
  let voice = null;

  function pickVoice() {
    if (voice) return voice;
    const voices = speechSynthesis.getVoices();
    // Prefer a high female/child voice
    const preferred = ['Google UK English Female','Microsoft Zira','Samantha','Karen','Moira','Tessa','Victoria','Alice','Fiona'];
    for (const name of preferred) {
      const v = voices.find(v => v.name.includes(name));
      if (v) { voice = v; return v; }
    }
    // Fallback: first female or first available
    return voices.find(v => /female|girl|woman/i.test(v.name)) || voices[0] || null;
  }

  function say(text, opts = {}) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.voice = pickVoice();
    utt.pitch  = opts.pitch  ?? 1.8;   // high kawaii pitch
    utt.rate   = opts.rate   ?? 1.15;  // slightly fast & energetic
    utt.volume = opts.volume ?? 1;
    speechSynthesis.speak(utt);
  }

  // Load voices (Chrome loads them async)
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => { voice = null; pickVoice(); };
  }

  return { say };
})();

// ─── INGREDIENT VALIDATOR ─────────────────────────
// Returns the name of the invalid ingredient, or null if all are fine
function findInvalidIngredient(ingredients) {
  // Common real ingredient words — if it matches these patterns it's valid
  for (const ing of ingredients) {
    const s = ing.trim();
    if (s.length < 2) return s;  // too short

    // Must have at least one vowel (a e i o u) — gibberish usually has none
    if (!/[aeiouAEIOU]/.test(s)) return s;

    // Must not be all consonants with no spaces (like "hfzjxj", "xkcd")
    const noSpaces = s.replace(/\s+/g, '');
    const vowelRatio = (noSpaces.match(/[aeiouAEIOU]/g) || []).length / noSpaces.length;
    if (noSpaces.length > 3 && vowelRatio < 0.1) return s;

    // Must not contain numbers or special chars (except hyphen/apostrophe)
    if (/[0-9@#$%^&*()_+=\[\]{};:"\|<>?/]/.test(s)) return s;

    // Repeated same character (like "aaaa", "zzzz")
    if (/^(.){2,}$/.test(noSpaces)) return s;
  }
  return null;
}

// Returns slot number (1-based) of the invalid ingredient
function findInvalidSlot(ingredients) {
  const allFields = Array.from(document.querySelectorAll('.ing-field'));
  for (let i = 0; i < allFields.length; i++) {
    const val = allFields[i].value.trim();
    if (!val) continue;
    if (findInvalidIngredient([val])) return { slot: i + 1, val, el: allFields[i] };
  }
  return null;
}

function highlightInvalidField(el) {
  const wrap = el.closest('.ing-wrap');
  if (wrap) wrap.classList.add('invalid');
  el.focus();
  setTimeout(() => {
    if (wrap) wrap.classList.remove('invalid');
  }, 3500);
}

// Returns: 'pass' | 'fail' | 'format' (format-valid, live test blocked/failed) | false (no key)
async function testKey(provider, key) {
  if (!key) return false;

  // ── Claude: Anthropic blocks browser test pings — use format validation ──
  if (provider === 'claude') {
    // Format-valid = key is ready (Anthropic CORS blocks live browser pings)
    return KEY_FORMAT.claude.test(key) ? 'pass' : 'fail';
  }

  // ── Other providers ────────────────────────────────────
  try {
    let r;
    if (provider === 'gemini') {
      r = await fetch(`${AI.gemini.url}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
      });
    } else {
      r = await fetch(AI[provider].url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: AI[provider].model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });
    }
    if (r.status === 429) return 'pass';
    return r.ok ? 'pass' : 'fail';
  } catch {
    // CORS / network blocked — fall back to format check
    if (KEY_FORMAT[provider]?.test(key)) return 'format';
    return 'fail';
  }
}

// ─── FRIDGE HERO — COOK ───────────────────────────
async function cook() {
  const ingredients = Array.from(document.querySelectorAll('.ing-field'))
    .map(i => i.value.trim()).filter(Boolean);

  if (!ingredients.length) {
    Voice.say('Oops! Please add at least one ingredient, okay?');
    showStatus('⚠ Add at least one ingredient!', 'error');
    return;
  }

  // Check for gibberish / invalid ingredient names — scan all filled fields
  const allFilled = Array.from(document.querySelectorAll('.ing-field'))
    .map((el, idx) => ({ el, val: el.value.trim(), slot: idx + 1 }))
    .filter(x => x.val);
  for (const { el, val, slot } of allFilled) {
    if (findInvalidIngredient([val])) {
      Voice.say(`Slot ${slot} doesn't look like a real ingredient! Please fix it, okay?`);
      showStatus(`⚠ Slot ${slot} — "${val}" is not a valid ingredient name`, 'error');
      highlightInvalidField(el);
      return;
    }
  }

  const lower = ingredients.map(i => i.toLowerCase());
  if (new Set(lower).size < lower.length) {
    Voice.say('Oops! You have duplicate ingredients! Please remove one, okay?');
    showStatus('⚠ Duplicate ingredients found!', 'error');
    return;
  }

  const provider = document.querySelector('input[name="provider"]:checked').value;
  const language = $('langSelect').value;
  const stored   = getKeys();
  const apiKey   = ($(`${provider}Key`)?.value.trim()) || ($(`${provider}KeyE`)?.value.trim()) || stored[provider] || '';

  if (!apiKey) {
    showStatus(`Enter ${provider.toUpperCase()} key in Settings`, 'error');
    $('settingsPanel').classList.remove('hidden');
    return;
  }

  Voice.say(`Yay! Let me cook something amazing with ${ingredients.slice(0,3).join(', ')}${ingredients.length > 3 ? ' and more' : ''}! Give me a moment!`);
  showStatus(`Calling ${provider.toUpperCase()}…`, 'loading gold-load');
  $('cookBtn').disabled = true;
  $('recipeWrap').classList.add('hidden');

  try {
    const recipe = await fetchRecipe(provider, apiKey, ingredients, language);
    renderRecipe(recipe);
    saveCookHistory(recipe, ingredients);
    Voice.say('Tadaa! Your recipe is ready! It smells so delicious!');
    showStatus('Recipe ready! ✓', 'success');
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('401') || msg.includes('403')) {
      Voice.say('Oh no! The API key is wrong. Please check your settings!');
      showStatus(`${provider.toUpperCase()}: Invalid API key — check Settings`, 'error');
    } else if (msg.includes('429')) {
      Voice.say('The server is too busy right now. Please try again in a moment!');
      showStatus(`${provider.toUpperCase()}: Rate limit hit — try again shortly`, 'error');
    } else if (msg.includes('500') || msg.includes('503')) {
      Voice.say('The server had a little hiccup! Try again please!');
      showStatus(`${provider.toUpperCase()}: Server error — try again`, 'error');
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      Voice.say('I cannot reach the server. Try using Groq instead!');
      showStatus(`${provider.toUpperCase()}: Network blocked — try Groq instead`, 'error');
    } else {
      Voice.say('Something went wrong! Please check your key and try again!');
      showStatus(`${provider.toUpperCase()} error: ${msg || 'check key & network'}`, 'error');
    }
  } finally {
    $('cookBtn').disabled = false;
  }
}

async function fetchRecipe(provider, key, ingredients, language) {
  const prompt = `Act as a world-renowned Michelin Star Chef "MK Chef Supreme". 
LANGUAGE: ${language.toUpperCase()}. TONE: Highly analytical, professional, yet clear.

CORE TASK: Analyze the synergy of these ingredients: ${ingredients.join(', ')}. Craft a "Pro Max Level" masterpiece.

RESEARCH STAGE: Explain the molecular synergy and flavor pairings. Why do they work? What unique chemical reactions (Maillard, caramelization) will elevate this combination?

STRUCTURE:
- # Title: Elegant, high-end restaurant name.
- ## Deep Ingredient Analysis: Transformer-based research on ingredient synergy.
- ## Culinary Metrics:
    * **Protein Level**: Value and quality analysis.
    * **Culinary Complexity**: Required chef expertise level.
    * **Epicurean Time**: Prep, cook, and rest time.
    * **Soul Score**: Creative essence and 'wow' factor.
- ## The Palette (Ingredients): List with high-end descriptors.
- ## The Execution:
    1. **Mise en Place**: Precise prep of every element.
    2. **The Progression**: Line-cook flow — temps, pan management, timing.
    3. **The Final Touch**: Emulsification, resting, finishing salts.
- ## The Presentation (Plating): Step-by-step for a $200 aesthetic.
- ## Signature Chef Tip: One secret "MK Supreme" trick.`;

  if (provider === 'gemini') {
    const r = await fetch(`${AI.gemini.url}?key=${key}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.1} })
    });
    if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(`${r.status}: ${err?.error?.message || 'Gemini error'}`); }
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty response — check quota');
    return text;
  } else if (provider === 'claude') {
    const r = await fetch(AI.claude.url, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: AI.claude.model, max_tokens: 1500, messages:[{role:'user',content:prompt}] })
    });
    if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(`${r.status}: ${err?.error?.message || 'Claude error'}`); }
    const d = await r.json();
    const text = d?.content?.[0]?.text;
    if (!text) throw new Error('Claude returned empty response');
    return text;
  } else {
    const r = await fetch(AI[provider].url, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
      body: JSON.stringify({ model:AI[provider].model, messages:[{role:'user',content:prompt}], temperature:0.1 })
    });
    if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(`${r.status}: ${err?.error?.message || provider + ' error'}`); }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${provider} returned empty response`);
    return text;
  }
}

function renderRecipe(md) {
  let html = md
    .replace(/^# (.*$)/gim, '<div class="pro-header"><h2 class="pro-title">$1</h2><hr class="pro-divider"></div>')
    .replace(/^## (.*$)/gim, '<h3 class="pro-section">$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong class="highlight">$1</strong>')
    .replace(/^\* (.*$)/gim, '<div class="metric-card">$1</div>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/\n\n/gim, '<br><br>');
  html = html.replace(/(<div class="metric-card">[\s\S]*?<\/div>\n?)+/g, m => `<div class="metric-grid">${m}</div>`);
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul class="pro-list">${m}</ul>`);
  $('recipeContent').innerHTML = html;
  $('recipeWrap').classList.remove('hidden');
  setTimeout(() => $('recipeWrap').scrollIntoView({ behavior:'smooth', block:'start' }), 50);
}

// ─── FRIDGE HISTORY ───────────────────────────────
function loadCookHistory() {
  cookHistory = JSON.parse(localStorage.getItem('mk_cook_history') || '[]');
  renderCookHistory();
}

function saveCookHistory(md, ingredients) {
  const item = {
    id: Date.now(),
    title: md.split('\n')[0].replace(/^#\s*/,'').trim() || 'Untitled Dish',
    ingredients, markdown: md,
    date: new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
  };
  cookHistory.unshift(item);
  if (cookHistory.length > 50) cookHistory.pop();
  localStorage.setItem('mk_cook_history', JSON.stringify(cookHistory));
  renderCookHistory();
}

function renderCookHistory() {
  const list = $('historyList');
  if (!cookHistory.length) {
    list.innerHTML = '<p class="empty-msg">No recipes yet — start cooking!</p>';
    return;
  }
  list.innerHTML = cookHistory.map(h => `
    <div class="history-item" onclick="loadCookItem(${h.id})">
      <span class="h-title">${h.title}</span>
      <span class="h-meta">${h.date} · ${h.ingredients.slice(0,3).join(', ')}${h.ingredients.length > 3 ? '…' : ''}</span>
    </div>`).join('');
}

window.loadCookItem = id => {
  const item = cookHistory.find(h => h.id === id);
  if (!item) return;
  renderRecipe(item.markdown);
  $('historyPanel').classList.add('hidden');
  showStatus(`Loaded: ${item.title}`, 'success');
};

// ─── ELI5 EXPLAINER ───────────────────────────────
async function explainTopic() {
  const topic = $('eli5Input').value.trim();
  if (!topic) { showStatus('⚠ Type a topic first!', 'error'); return; }
  if (topic.length < 3) { showStatus('⚠ Topic too short', 'error'); return; }

  // Get selected ELI5 provider
  const provider = document.querySelector('input[name="eli5Provider"]:checked')?.value || 'gemini';
  const stored   = getKeys();
  const apiKey   = ($(`${provider}Key`)?.value.trim()) || stored[provider] || '';

  if (!apiKey) {
    showStatus(`Enter ${provider.toUpperCase()} key in Settings ⚙`, 'error');
    $('eli5SettingsPanel').classList.remove('hidden');
    return;
  }

  showStatus('Thinking like a 5-year-old…', 'loading');
  $('explainBtn').disabled = true;
  $('eli5Result').classList.add('hidden');

  try {
    const explanation = await fetchEli5(provider, apiKey, topic);
    renderEli5(topic, explanation);
    saveEli5History(topic, explanation);
    Voice.say('Here you go! I explained it in the simplest way I can!');
    showStatus('Here you go! ✓', 'success');
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('401') || msg.includes('403')) {
      Voice.say('Oh no! The API key is wrong. Please check your settings!');
      showStatus(`${provider.toUpperCase()}: Invalid API key — check Settings`, 'error');
    } else if (msg.includes('429')) {
      Voice.say('The server is too busy! Try again in a moment!');
      showStatus(`${provider.toUpperCase()}: Rate limit hit — try again shortly`, 'error');
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      Voice.say('I cannot reach the server. Try Groq instead!');
      showStatus(`${provider.toUpperCase()}: Network blocked — try Groq instead`, 'error');
    } else {
      Voice.say('Something went wrong! Please check your key and try again!');
      showStatus(`${provider.toUpperCase()} error: ${msg || 'check key & network'}`, 'error');
    }
  } finally {
    $('explainBtn').disabled = false;
  }
}

async function fetchEli5(provider, key, topic) {
  const prompt = `You are an incredibly kind and patient teacher explaining things to a curious 5-year-old child.
  
TOPIC: "${topic}"

Explain this topic in the simplest language possible — as if you are talking to a 5-year-old child.

Rules:
- Use very short, simple sentences. No jargon.
- Use fun analogies and comparisons to things a child knows (toys, food, animals, playgrounds).
- Be warm, enthusiastic, and encouraging.
- Use 2-4 short paragraphs maximum.
- Start one paragraph with "Imagine..." to give a fun analogy.
- Bold the single most important key idea.
- End with a fun "Wow fact!" the child can tell their friends.

Do not use technical terms. Keep it delightful and easy.`;

  if (provider === 'gemini') {
    const r = await fetch(`${AI.gemini.url}?key=${key}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{temperature:0.7, maxOutputTokens:600}
      })
    });
    if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(`${r.status}: ${err?.error?.message || 'Gemini error'}`); }
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty response — check quota');
    return text;
  } else if (provider === 'claude') {
    const r = await fetch(AI.claude.url, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: AI.claude.model, max_tokens: 600, messages:[{role:'user',content:prompt}] })
    });
    if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(`${r.status}: ${err?.error?.message || 'Claude error'}`); }
    const d = await r.json();
    const text = d?.content?.[0]?.text;
    if (!text) throw new Error('Claude returned empty response');
    return text;
  } else {
    const r = await fetch(AI[provider].url, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
      body: JSON.stringify({
        model: AI[provider].model,
        messages:[{role:'user',content:prompt}],
        temperature: 0.7, max_tokens: 600
      })
    });
    if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(`${r.status}: ${err?.error?.message || provider + ' error'}`); }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${provider} returned empty response`);
    return text;
  }
}

function renderEli5(topic, text) {
  $('eli5TopicDisplay').textContent = topic;

  // Pick a random cheerful emoji based on topic
  const emojis = ['🧠','💡','🌟','🎈','🔬','🌍','🚀','🎯','🦋','🌈','⚡','🎪'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  $('eli5Emoji').textContent = emoji;

  // Format the text
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^Imagine.*$/gm, m => `<div class="eli5-analogy">${m}</div>`)
    .replace(/^Wow fact!.*$/gim, m => `<div class="eli5-analogy">🌟 ${m}</div>`)
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`)
    .join('');

  $('eli5Body').innerHTML = html;
  $('eli5Result').classList.remove('hidden');
  setTimeout(() => $('eli5Result').scrollIntoView({ behavior:'smooth', block:'start' }), 50);
}

// ─── ELI5 HISTORY ─────────────────────────────────
function loadEli5History() {
  eli5History = JSON.parse(localStorage.getItem('mk_eli5_history') || '[]');
}

function saveEli5History(topic, explanation) {
  eli5History.unshift({ id:Date.now(), topic, explanation,
    date: new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'}) });
  if (eli5History.length > 30) eli5History.pop();
  localStorage.setItem('mk_eli5_history', JSON.stringify(eli5History));
}

// ─── STATUS BAR ───────────────────────────────────
function showStatus(msg, type = 'info') {
  clearTimeout(statusTimer);
  const bar = $('statusBar');
  bar.textContent = msg;
  bar.className = `status-bar ${type}`;
  if (type !== 'loading') statusTimer = setTimeout(() => bar.classList.add('hidden'), 5000);
}
