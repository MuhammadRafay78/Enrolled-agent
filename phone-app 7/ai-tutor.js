(function(){

  // ==== AI TUTOR: behavior (open/close/resize, chat, markdown, LaTeX) ====
  const btn = document.getElementById('ai-tutor-btn');
  const panel = document.getElementById('ai-tutor-panel');
  const closeBtn = document.getElementById('ai-tutor-close');
  const input = document.getElementById('ai-tutor-input');
  const sendBtn = document.getElementById('ai-tutor-send');
  const messages = document.getElementById('ai-tutor-messages');

  function _setAiOpen(open){
    // Only reflow the quiz on wide screens — on mobile the panel takes over the viewport.
    if(window.innerWidth >= 1024) document.body.classList.toggle('ai-open', open);
    else document.body.classList.remove('ai-open');
  }
  // AI access gate — only the account owner (ADMINS list, currently ['rafay']) sees the AI at all.
  // This hides the floating button entirely for other users. NOTE: for full protection the worker
  // itself would need an auth check; this is client-side gating for casual restriction.
  function _aiAllowed(){
    try {
      if (typeof isAdminUser === 'function' && isAdminUser()) return true;
      // Demo users get a small AI quota (see DEMO_AI_LIMIT)
      if (typeof isDemoActive === 'function' && isDemoActive() && typeof demoAiRemaining === 'function' && demoAiRemaining() > 0) return true;
      return false;
    } catch(e) { return false; }
  }
  function _refreshAiVisibility(){
    if (!_aiAllowed()) {
      btn.style.display = 'none';
      panel.style.display = 'none';
      document.body.classList.remove('ai-open');
    } else {
      // Only show floating button if panel isn't already open
      if (panel.style.display !== 'flex') btn.style.display = 'flex';
    }
  }
  // Re-check on account state changes (sign in/out re-fires renderAcct)
  const _origRenderAcct = window.renderAcct;
  if (typeof _origRenderAcct === 'function') {
    window.renderAcct = function(){ _origRenderAcct.apply(this, arguments); _refreshAiVisibility(); };
  }
  // Initial check
  setTimeout(_refreshAiVisibility, 200);
  setTimeout(_refreshAiVisibility, 1500); // in case auth loads later

  btn.onclick = () => {
    if (!_aiAllowed()) { _refreshAiVisibility(); return; }
    panel.style.display = 'flex'; btn.style.display = 'none'; panel.classList.remove('minimized'); _setAiOpen(true);
    setTimeout(()=>input.focus(),100);
  };
  closeBtn.onclick = (e) => { e.stopPropagation(); panel.style.display = 'none'; btn.style.display = 'flex'; _setAiOpen(false); };
  const clearBtn = document.getElementById('ai-tutor-clear-btn');
  clearBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm('Clear this chat? This only clears the conversation, not your saved study list.')) clearAiChat();
  };
  // Click header (but not close button) to minimize/expand
  document.getElementById('ai-tutor-header').onclick = () => {
    panel.classList.toggle('minimized');
    // Minimized = quiz should have its space back
    _setAiOpen(!panel.classList.contains('minimized'));
    if (!panel.classList.contains('minimized')) setTimeout(()=>input.focus(),100);
  };

  // ---- My Study List panel (toggle in place of the chat) ----
  const listBtn = document.getElementById('ai-tutor-list-btn');
  const listView = document.getElementById('ai-tutor-list-view');
  const listBackBtn = document.getElementById('ai-tutor-list-back');
  const quicksEl = document.getElementById('ai-tutor-quicks');
  const inputWrapEl = document.getElementById('ai-tutor-input-wrap');
  function _showStudyList(show){
    listView.style.display = show ? 'flex' : 'none';
    messages.style.display = show ? 'none' : 'block';
    quicksEl.style.display = show ? 'none' : 'flex';
    inputWrapEl.style.display = show ? 'none' : 'flex';
    if (show) renderStudyListView(); else setTimeout(()=>input.focus(),50);
  }
  if (listBtn) listBtn.onclick = (e) => { e.stopPropagation(); _showStudyList(true); };
  if (listBackBtn) listBackBtn.onclick = (e) => { e.stopPropagation(); _showStudyList(false); };
  const listItemsEl = document.getElementById('ai-tutor-list-items');
  if (listItemsEl) listItemsEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.ai-list-remove');
    if (removeBtn) {
      const card = removeBtn.closest('.ai-list-item');
      if (card) removeFromStudyList(card.dataset.id);
      return;
    }
    const head = e.target.closest('.ai-list-item-top');
    if (head) {
      const card = head.closest('.ai-list-item');
      const id = card && card.dataset.id;
      if (!id) return;
      if (_expandedListIds.has(id)) _expandedListIds.delete(id); else _expandedListIds.add(id);
      renderStudyListView();
    }
  });
  window.addEventListener('resize', () => {
    // Re-evaluate reflow when window crosses the 1024px threshold
    if(panel.style.display === 'flex' && !panel.classList.contains('minimized')) _setAiOpen(true);
  });

  // Auto-grow textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  // ---- Per-question chat persistence ----
  // Keyed by a stable hash of the question text so the same conversation reappears
  // even after question re-grouping. Stored under one big object to keep
  // localStorage key count reasonable.
  const CHATS_KEY = 'ea3quiz_v2_ai_chats';
  const CHATS_MAX_QUESTIONS = 200; // LRU cap so localStorage never balloons
  function _currentQuestion(){
    try{
      if (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS) &&
          typeof st === 'object' && st && Array.isArray(st.order) &&
          typeof pos === 'number' && pos >= 0 && pos < st.order.length) {
        return QUESTIONS[st.order[pos]];
      }
    }catch(e){}
    return null;
  }
  function _questionHash(q){
    if (!q || !q.q) return '';
    const s = String(q.q);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function _loadAllChats(){
    try{ return JSON.parse(localStorage.getItem(CHATS_KEY)) || {}; }catch(e){ return {}; }
  }
  function _saveAllChats(all){
    try{
      // Enforce LRU cap by keeping the newest CHATS_MAX_QUESTIONS entries
      const keys = Object.keys(all);
      if (keys.length > CHATS_MAX_QUESTIONS) {
        const sorted = keys.map(k => ({k, t: (all[k].t || 0)})).sort((a,b) => b.t - a.t);
        const keep = new Set(sorted.slice(0, CHATS_MAX_QUESTIONS).map(x => x.k));
        Object.keys(all).forEach(k => { if (!keep.has(k)) delete all[k]; });
      }
      localStorage.setItem(CHATS_KEY, JSON.stringify(all));
    }catch(e){}
  }
  // ---- Continuous chat log (what's actually displayed) ----
  // One flat, chronological list across ALL questions — switching questions no
  // longer clears the pane. Each entry still remembers which question it was
  // asked under (qhash/topic/unit) so saveChatForCurrentQ() below can derive
  // the per-question view that cross-question memory relies on.
  const CHAT_LOG_KEY = 'ea3quiz_v2_ai_chat_log';
  const CHAT_LOG_MAX = 300; // cap so localStorage never balloons
  function _loadChatLog(){
    try{ const v = JSON.parse(localStorage.getItem(CHAT_LOG_KEY)); return Array.isArray(v) ? v : []; }catch(e){ return []; }
  }
  function _appendToChatLog(role, text){
    try{
      const q = _currentQuestion();
      const log = _loadChatLog();
      log.push({ r: role, t: text, ts: Date.now(), qhash: q ? _questionHash(q) : '', topic: (q && q.topic) || '', unit: (q && q.unit) || '' });
      while (log.length > CHAT_LOG_MAX) log.shift();
      localStorage.setItem(CHAT_LOG_KEY, JSON.stringify(log));
    }catch(e){}
  }
  function _replayLogEntry(e){
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (e.r === 'u' ? 'user' : 'bot');
    if (e.r === 'u') div.textContent = e.t;
    else div.innerHTML = e.t;
    messages.appendChild(div);
  }
  function hydrateChatLog(){
    _loadChatLog().forEach(_replayLogEntry);
    messages.scrollTop = messages.scrollHeight;
  }
  const AI_GREETING_HTML = '<div class="ai-msg bot">Hi. Ask me about the current question or any EA exam topic. Tell me to "add this to my list" any time to save the current topic for later review.</div>';
  // Wipes the visible conversation and its persisted log (CHAT_LOG_KEY), back to
  // the original greeting. Does NOT touch CHATS_KEY (the per-question archive
  // saveChatForCurrentQ keeps) or the study list — those are separate, deliberately
  // durable stores. `noteText`, if given, is shown as a small divider instead of
  // silently emptying the pane, so an automatic clear (see below) doesn't read as
  // "my chat vanished" — the reason is right there.
  function clearAiChat(noteText){
    try{ localStorage.removeItem(CHAT_LOG_KEY); }catch(e){}
    messages.innerHTML = AI_GREETING_HTML;
    if (noteText) {
      const div = document.createElement('div');
      div.className = 'ai-msg-divider';
      div.textContent = noteText;
      messages.insertBefore(div, messages.firstChild);
    }
  }
  // ---- Auto-clear on context switch (quiz questions <-> chapter notes <-> flashcards) ----
  // The flat chat log above deliberately survives navigating within one kind of
  // study session (e.g. moving between quiz questions) so nothing gets lost. But
  // it has no idea when you've moved to an unrelated kind of session entirely —
  // asking about a quiz question, then going to read a chapter, kept replaying
  // the old question chat on top of the notes. markView() already tracks every
  // navigation (part/kind/unit) for scroll restoration; wrapping it here — the
  // same "patch the global, call through" idiom account-sync.js uses for
  // localStorage — is the least invasive way to notice a genuine mode change
  // without touching app-boot.js or every screen that calls markView().
  const AI_CONTEXT_CATEGORY = { quiz:'quiz', notes:'notes', flashcards:'flashcards', chapfcbrowse:'flashcards' };
  const AI_CONTEXT_LABEL = { quiz:'quiz questions', notes:'chapter notes', flashcards:'flashcards' };
  let _lastAiContentCategory = null;
  const _origMarkView = window.markView;
  if (typeof _origMarkView === 'function') {
    window.markView = function(kind, extra){
      _origMarkView(kind, extra);
      const cat = AI_CONTEXT_CATEGORY[kind];
      if (!cat) return; // menus/lists/dashboard etc. aren't a "session" — don't clear on those
      if (_lastAiContentCategory && cat !== _lastAiContentCategory) {
        clearAiChat('— switched to ' + AI_CONTEXT_LABEL[cat] + ', started a new chat —');
      }
      _lastAiContentCategory = cat;
    };
  }

  // ---- "My Study List" — topics/concepts saved by saying "add this to my list" ----
  const STUDY_LIST_KEY = 'ea3quiz_v2_study_list';
  const STUDY_LIST_MAX = 300;
  // Matches common phrasings of the save-for-later intent. Deliberately broad —
  // false negatives (not detecting it) are worse than false positives here.
  // Bounded gap (.{0,60}) between the verb and "list" so natural phrasing like
  // "add this question concept into my list" still matches — the old version
  // required "add"/"save"/"put" to be immediately followed by "to/into/on my
  // list" with nothing in between, which real messages rarely are.
  const ADD_TO_LIST_RE = /\b(add|save|put)\b.{0,60}\b(my\s+)?(study\s+)?list\b|\bmaster\s+(this\s+)?later\b|\b(need|have)\s+to\s+(re[- ]?study|master|review)\s+this\s+later\b|\bremember\s+this\s+for\s+later\b/i;
  function _looksLikeAddToList(msg){ return ADD_TO_LIST_RE.test(msg); }
  function _loadStudyList(){
    try{
      const v = JSON.parse(localStorage.getItem(STUDY_LIST_KEY));
      let list = Array.isArray(v) ? v : [];
      // One-time self-heal for entries saved by older versions of addToStudyList:
      // - de-dupe + cap refs to 3 (older code, before that existed, could save the
      //   same section twice back-to-back, or more than 3, including irrelevant
      //   ones pulled in by a too-vague note)
      // - strip a leaked "li"/"o" list-tag token frozen into ref snippets by the
      //   old _sectionText() bug (fixed above) — always a standalone 1-2 letter
      //   lowercase word directly before capitalized text, so safe to target with
      //   a regex on already-saved text.
      // Idempotent: a no-op once an entry is clean.
      let changed = false;
      const cleanSnippet = s => (typeof s === 'string' ? s.replace(/\s+\b(li|o)\b\s+(?=[A-Z])/g, '\n') : s);
      list = list.map(e => {
        if (!Array.isArray(e.refs) || !e.refs.length) return e;
        const seen = new Set();
        const deduped = e.refs.filter(r => {
          const key = r.chNum + '::' + r.sec;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 3);
        const cleanedRefs = deduped.map(r => {
          const cleaned = cleanSnippet(r.snippet);
          return cleaned !== r.snippet ? Object.assign({}, r, { snippet: cleaned }) : r;
        });
        const snippetChanged = cleanedRefs.some((r, i) => r !== deduped[i]);
        if (cleanedRefs.length !== e.refs.length || snippetChanged) {
          changed = true;
          return Object.assign({}, e, { refs: cleanedRefs });
        }
        return e;
      });
      if (changed) _saveStudyList(list);
      return list;
    }catch(e){ return []; }
  }
  function _saveStudyList(list){
    try{
      while (list.length > STUDY_LIST_MAX) list.shift();
      localStorage.setItem(STUDY_LIST_KEY, JSON.stringify(list));
    }catch(e){}
  }
  // Latest substantial bot reply already in THIS chat for this exact question
  // (e.g. from "Explain the concept") — reused instead of writing new content,
  // since it's free and it's exactly what the student already asked about.
  function _extractPriorAiExplanation(qhash){
    try {
      if (!qhash) return '';
      const log = _loadChatLog();
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e.r !== 'b' || e.qhash !== qhash) continue;
        const plain = String(e.t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain.length < 150) continue; // skip short confirmations, e.g. "Added ... to your list"
        if (/to your study list/i.test(plain)) continue; // skip our own confirmation messages
        return plain.slice(0, 2000);
      }
      return '';
    } catch(e) { return ''; }
  }
  // Only called when local keyword search's best match is weak (a vague note like
  // "this question concept" rarely shares enough real words with any ONE section
  // to score well). Asks the AI to pick from an already-matched shortlist — NOT to
  // write new content — so the saved text stays grounded in the book either way.
  // Return contract (three distinct outcomes, handled differently by the caller):
  //   a candidate object -> AI picked a real match, use it
  //   null               -> AI explicitly said none of the candidates are relevant
  //   undefined          -> couldn't reach/parse the AI at all (network, rate limit, etc.)
  async function _aiRerankBestSection(q, note, candidates){
    try {
      if (!candidates.length) return undefined;
      const listText = candidates.map((c, i) => (i + 1) + '. Ch ' + c.chNum + ' — ' + c.chTitle + ' § ' + c.sec).join('\n');
      const prompt = 'A student wants to save ONE study-guide section for later review. Pick the single best match from the ' +
        'numbered list below, based on the current question and the student\'s note. Reply with ONLY the number (e.g. "3"). ' +
        'If none are a good match, reply with exactly: NONE\n\n' +
        'CURRENT QUESTION: ' + ((q && q.q) || '') + '\n' +
        (q && q.topic ? 'TOPIC: ' + q.topic + '\n' : '') +
        'STUDENT NOTE: ' + note + '\n\nCANDIDATE SECTIONS:\n' + listText;
      const res = await fetch('https://ea-ai.tr78601234.workers.dev/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt })
      });
      if (!res.ok || !res.body) return undefined;
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let text = '';
      while (true) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }); }
      text = text.trim();
      if (/^NONE\b/i.test(text)) return null;
      const m = text.match(/\d+/);
      if (!m) return undefined;
      const idx = parseInt(m[0], 10) - 1;
      return (idx >= 0 && idx < candidates.length) ? candidates[idx] : undefined;
    } catch(e) { return undefined; }
  }
  // note: whatever the user typed alongside the trigger phrase (e.g. "I keep messing
  // this up, add it to my list" -> the note is the full message, kept for context).
  async function addToStudyList(q, note){
    const list = _loadStudyList();
    const qhash = q ? _questionHash(q) : '';
    // Don't duplicate the same question — bump it to the top instead.
    const existingIdx = qhash ? list.findIndex(x => x.qhash === qhash) : -1;
    // Ground this in the actual book text. Search the user's own note FIRST and
    // ONLY: that's what names the specific concept (e.g. "NIIT threshold"), and
    // it's often a *different* section than the question currently on screen.
    // Blending in the question's own topic/text here would just bias every result
    // back toward the current section — only fall back to that if the note alone
    // (e.g. a bare "add this to my list") matches nothing.
    const WEAK_SCORE_THRESHOLD = 15;
    let candidates = _ragSearchByText(note || '', 8);
    // Confidence is judged on the NOTE-ONLY result, before any fallback — the
    // fallback query blends in the full current-question text, which is long
    // enough to rack up an artificially high score against totally unrelated
    // sections just from incidental word overlap. A high score there doesn't
    // mean the match is actually good, so it must never skip the AI-rerank step.
    const noteWasConfident = candidates.length && candidates[0].score >= WEAK_SCORE_THRESHOLD;
    if (!candidates.length) {
      const fallbackQuery = [note, q && q.topic, q && q.q].filter(Boolean).join(' ');
      candidates = _ragSearchByText(fallbackQuery, 8);
    }
    // Confident local match on the note itself -> use it directly, no network call.
    // Anything else (vague note, or only the blended fallback found something) ->
    // let the AI disambiguate among the shortlist. Either way what gets saved is
    // verbatim book text, never AI prose.
    let refs;
    if (noteWasConfident) {
      refs = candidates.slice(0, 3);
    } else if (candidates.length && q) {
      const picked = await _aiRerankBestSection(q, note, candidates);
      if (picked === null) refs = []; // AI looked and confirmed none of the candidates are actually relevant
      else if (picked) refs = [picked]; // AI picked the one real match
      else refs = candidates.slice(0, 3); // AI call failed/unreachable — best-effort local fallback
    } else {
      refs = candidates.slice(0, 3);
    }
    const entry = {
      id: existingIdx >= 0 ? list[existingIdx].id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      topic: (q && q.topic) || 'General',
      unit: (q && q.unit) || '',
      part: (typeof PART !== 'undefined') ? PART : null,
      note: (note || '').trim(),
      aiExplanation: _extractPriorAiExplanation(qhash), // already-in-chat explanation, if any
      refs: refs, // verbatim book excerpts — see _ragSearchByText
      qhash: qhash,
      addedAt: Date.now()
    };
    if (existingIdx >= 0) list.splice(existingIdx, 1);
    list.push(entry);
    _saveStudyList(list);
    updateStudyListBadge();
    return entry;
  }
  function removeFromStudyList(id){
    const list = _loadStudyList().filter(x => x.id !== id);
    _saveStudyList(list);
    updateStudyListBadge();
    renderStudyListView();
  }
  function updateStudyListBadge(){
    const n = _loadStudyList().length;
    const badge = document.getElementById('ai-tutor-list-count');
    if (!badge) return;
    badge.textContent = String(n);
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  }
  function _esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  // Which cards are expanded — in-memory only, resets when the panel is reopened.
  const _expandedListIds = new Set();
  function renderStudyListView(){
    const el = document.getElementById('ai-tutor-list-items');
    if (!el) return;
    const list = _loadStudyList().slice().reverse(); // newest first
    if (!list.length) {
      el.innerHTML = '<div class="ai-list-empty">Nothing saved yet. Tell the tutor "add this to my list" on any question to save its topic here.</div>';
      return;
    }
    el.innerHTML = list.map(function(e){
      const d = new Date(e.addedAt);
      const dateStr = isNaN(d) ? '' : d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
      const open = _expandedListIds.has(e.id);
      const refs = Array.isArray(e.refs) ? e.refs : [];
      const refsHtml = refs.length
        ? refs.map(function(r){
            return '<div class="ai-list-ref">' +
              '<div class="ai-list-ref-src">Ch ' + _esc(r.chNum) + ' — ' + _esc(r.chTitle) + ' § ' + _esc(r.sec) + '</div>' +
              '<div class="ai-list-ref-text">' + _esc(r.snippet) + '</div>' +
            '</div>';
          }).join('')
        : '<div class="ai-list-ref-none">No exact passage matched in the book for this — your note is kept below as a reminder of what to look up.</div>';
      const explanationHtml = e.aiExplanation
        ? '<div class="ai-list-explanation"><div class="ai-list-ref-src">From this chat</div>' + _esc(e.aiExplanation) + '</div>'
        : '';
      return '<div class="ai-list-item' + (open ? ' open' : '') + '" data-id="' + _esc(e.id) + '">' +
        '<div class="ai-list-item-top">' +
          '<div class="ai-list-item-head"><strong>' + _esc(e.topic) + '</strong>' +
            (e.unit ? '<span class="ai-list-item-unit">' + _esc(e.unit) + '</span>' : '') + '</div>' +
          '<span class="ai-list-chev">' + (open ? '▾' : '▸') + '</span>' +
          '<button type="button" class="ai-list-remove" title="Mark as mastered / remove">✓</button>' +
        '</div>' +
        '<div class="ai-list-item-body" style="display:' + (open ? 'block' : 'none') + '">' +
          explanationHtml +
          refsHtml +
          (e.note ? '<div class="ai-list-item-note">Your note: ' + _esc(e.note) + '</div>' : '') +
          (dateStr ? '<div class="ai-list-item-date">Added ' + dateStr + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ---- Per-question chat record (derived from the continuous log) ----
  // Still keyed by question hash — this is what cross-question memory
  // (_crossQuestionContext below) searches across, independent of display.
  function saveChatForCurrentQ(){
    const q = _currentQuestion();
    if (!q) return;
    const key = _questionHash(q);
    if (!key) return;
    const bubbles = _loadChatLog().filter(e => e.qhash === key).map(e => ({ r: e.r, t: e.t }));
    const all = _loadAllChats();
    if (bubbles.length === 0) { delete all[key]; }
    else all[key] = { m: bubbles, t: Date.now() };
    _saveAllChats(all);
  }

  // ---- Learning profile + weak areas (computed live from all localStorage state) ----
  // Iterates every mock/mcq/extra key and counts wrong answers per topic + chapter.
  // Cheap enough to run on every send (~1000 questions max).
  function _computeLearningStats(){
    const out = { totalAns: 0, totalRight: 0, byTopic: {}, byChapter: {}, byPart: {} };
    try {
      // Walk all synced keys and inspect anything that looks like question state
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!/^ea3quiz_v2_(?:p[12]_)?(?:mock|mcq|extra|unit)_/.test(key)) continue;
        let s = null;
        try { s = JSON.parse(localStorage.getItem(key)); } catch(e) { continue; }
        if (!s || !Array.isArray(s.answers)) continue;
        // Figure out which part this key belongs to
        const partMatch = key.match(/ea3quiz_v2_(p([12])_)?/);
        const partNum = partMatch && partMatch[2] ? +partMatch[2] : 3;
        // Try to look up the corresponding question array — this is best-effort;
        // if we can't find it we skip the aggregation cleanly.
        // For mcq/extra we need the group index and part; for mock same.
        const m = key.match(/(?:mock|mcq|extra|unit)_(\d+)$/);
        if (!m) continue;
        const gi = +m[1];
        let questions = null;
        try {
          const parts = (typeof PARTS !== 'undefined') ? PARTS : null;
          if (!parts || !parts[partNum]) continue;
          if (/mock_/.test(key)) questions = parts[partNum].exams && parts[partNum].exams[gi] && parts[partNum].exams[gi].questions;
          else if (/mcq_/.test(key)) questions = parts[partNum].mcqs && parts[partNum].mcqs[gi] && parts[partNum].mcqs[gi].questions;
          else if (/extra_/.test(key)) questions = parts[partNum].extra && parts[partNum].extra[gi] && parts[partNum].extra[gi].questions;
          else if (/unit_/.test(key)) continue; // chapter-from-mocks — skip, aggregated via mocks already
        } catch(e){}
        if (!Array.isArray(questions)) continue;
        s.answers.forEach((v, j) => {
          if (v === null || v === undefined) return;
          const q = questions[j];
          if (!q) return;
          const right = (v === q.a);
          out.totalAns++;
          if (right) out.totalRight++;
          const topic = q.topic || 'General';
          if (!out.byTopic[topic]) out.byTopic[topic] = { a: 0, r: 0 };
          out.byTopic[topic].a++; if (right) out.byTopic[topic].r++;
          const chap = q.unit || 'Unknown';
          if (!out.byChapter[chap]) out.byChapter[chap] = { a: 0, r: 0 };
          out.byChapter[chap].a++; if (right) out.byChapter[chap].r++;
          if (!out.byPart[partNum]) out.byPart[partNum] = { a: 0, r: 0 };
          out.byPart[partNum].a++; if (right) out.byPart[partNum].r++;
        });
      }
    } catch(e) {}
    return out;
  }
  // Detect meta questions about the student's own performance — these need the full profile
  // regardless of what the current question is.
  const META_RE = /\b(weak|weakest|worst|struggl\w*|strong|strongest|best|top|lowest|highest|progress|performance|score|scores|accuracy|stat|stats|status|improve|focus|study more|how am i|how am I|which topics|which chapters|which areas|what should i|what should I|what am i (bad|good|weakest|strongest)|my (weakest|strongest|worst|best)|behind|ahead|target|flagged|wrong|missed|got wrong|need to review|which questions)/i;

  // Collect the ACTUAL wrong/flagged questions across all parts, grouped by chapter/topic,
  // so the tutor can point at specific items instead of just aggregate stats.
  function _collectWrongFlagged(){
    const out = { wrongByChap: {}, flagByChap: {}, wrongByTopic: {}, wrongSamples: [], totalWrong: 0, totalFlagged: 0 };
    try {
      const parts = (typeof PARTS !== 'undefined') ? PARTS : null;
      if (!parts) return out;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!/^ea3quiz_v2_(?:p[12]_)?(?:mock|mcq|extra)_/.test(key)) continue;
        let s = null;
        try { s = JSON.parse(localStorage.getItem(key)); } catch(e) { continue; }
        if (!s || !Array.isArray(s.answers)) continue;
        const pm = key.match(/ea3quiz_v2_(p([12])_)?/);
        const partNum = pm && pm[2] ? +pm[2] : 3;
        const m = key.match(/(mock|mcq|extra)_(\d+)$/);
        if (!m) continue;
        const kind = m[1]; const gi = +m[2];
        if (!parts[partNum]) continue;
        let questions = null;
        if (kind === 'mock')  questions = parts[partNum].exams  && parts[partNum].exams[gi]  && parts[partNum].exams[gi].questions;
        else if (kind === 'mcq')   questions = parts[partNum].mcqs   && parts[partNum].mcqs[gi]   && parts[partNum].mcqs[gi].questions;
        else if (kind === 'extra') questions = parts[partNum].extra  && parts[partNum].extra[gi] && parts[partNum].extra[gi].questions;
        if (!Array.isArray(questions)) continue;
        s.answers.forEach((v, j) => {
          const q = questions[j]; if (!q) return;
          const chap = q.unit || 'Unknown';
          const topic = q.topic || 'General';
          if (v !== null && v !== undefined && v !== q.a) {
            out.totalWrong++;
            out.wrongByChap[chap]  = (out.wrongByChap[chap]  || 0) + 1;
            out.wrongByTopic[topic] = (out.wrongByTopic[topic] || 0) + 1;
            if (out.wrongSamples.length < 10) {
              out.wrongSamples.push({ chap, topic, q: String(q.q || '').slice(0, 100) });
            }
          }
          if (s.flags && s.flags[j]) {
            out.totalFlagged++;
            out.flagByChap[chap] = (out.flagByChap[chap] || 0) + 1;
          }
        });
      }
    } catch(e) {}
    return out;
  }

  function _learningProfileContext(currentQ, userQuery){
    try {
      const s = _computeLearningStats();
      if (s.totalAns < 5) return ''; // too little data even for a meta question
      const isMeta = userQuery && META_RE.test(userQuery);

      // Compute rankings once
      const chapters = Object.entries(s.byChapter)
        .filter(([, v]) => v.a >= 3)
        .map(([k, v]) => ({ k, acc: v.r / v.a, a: v.a, r: v.r }))
        .sort((a, b) => a.acc - b.acc);
      const topics = Object.entries(s.byTopic)
        .filter(([, v]) => v.a >= 3)
        .map(([k, v]) => ({ k, acc: v.r / v.a, a: v.a, r: v.r }))
        .sort((a, b) => a.acc - b.acc);

      // Meta questions: send the full, detailed profile so the tutor can answer directly.
      if (isMeta) {
        const acc = Math.round(100 * s.totalRight / s.totalAns);
        const wf = _collectWrongFlagged();
        let out = 'STUDENT\'S FULL PERFORMANCE PROFILE (the student is asking about this — use it directly):\n';
        out += '- Overall: ' + s.totalRight + '/' + s.totalAns + ' correct (' + acc + '%) across all attempted questions.\n';
        out += '- Wrong-answer bank: ' + wf.totalWrong + ' questions currently marked wrong (they are "to retry"). Flagged bank: ' + wf.totalFlagged + ' questions manually flagged for review.\n';
        // By part
        const partNames = { 1: 'Part 1 (Individuals)', 2: 'Part 2 (Businesses)', 3: 'Part 3 (Representation)' };
        const partRows = Object.entries(s.byPart)
          .map(([p, v]) => ({ p: +p, acc: v.r / v.a, a: v.a, r: v.r }))
          .sort((a, b) => a.p - b.p);
        if (partRows.length) {
          out += '- By exam Part: ' + partRows.map(p =>
            partNames[p.p] + ' ' + p.r + '/' + p.a + ' (' + Math.round(100 * p.acc) + '%)'
          ).join('; ') + '.\n';
        }
        // Chapters ranked by wrong count (most concrete signal — actual missed questions)
        const wrongChapRows = Object.entries(wf.wrongByChap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6);
        if (wrongChapRows.length) {
          out += '- Chapters with the MOST wrong answers: ' + wrongChapRows.map(([c, n]) =>
            c + ' (' + n + ' wrong)'
          ).join('; ') + '.\n';
        }
        // Chapters ranked by flag count
        const flagChapRows = Object.entries(wf.flagByChap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        if (flagChapRows.length) {
          out += '- Chapters with the MOST flagged questions: ' + flagChapRows.map(([c, n]) =>
            c + ' (' + n + ' flagged)'
          ).join('; ') + '.\n';
        }
        // Weakest by accuracy (chapters and topics with ≥3 attempts)
        if (chapters.length) {
          out += '- Lowest-accuracy chapters (attempted ≥3): ' + chapters.slice(0, 5).map(c =>
            c.k + ' ' + c.r + '/' + c.a + ' (' + Math.round(100 * c.acc) + '%)'
          ).join('; ') + '.\n';
        }
        if (topics.length) {
          out += '- Lowest-accuracy topics (attempted ≥3): ' + topics.slice(0, 5).map(t =>
            t.k + ' ' + t.r + '/' + t.a + ' (' + Math.round(100 * t.acc) + '%)'
          ).join('; ') + '.\n';
        }
        // Sample of actual missed question snippets so tutor can reference them
        if (wf.wrongSamples.length) {
          out += '- Sample of specific wrong questions:\n';
          wf.wrongSamples.slice(0, 6).forEach((w, i) => {
            out += '  ' + (i + 1) + '. [' + w.chap + ' · ' + w.topic + '] ' + w.q + '\n';
          });
        }
        out += '(Answer the student\'s meta question directly from this data. Name specific chapters/topics and cite the actual numbers. Give concrete study advice tied to their real performance. If they ask "what am I weakest in," lead with the chapters that have the most wrong+flagged questions.)\n\n';
        return out;
      }

      // Non-meta: only include when the current question itself sits in a weak area
      const currentTopic = (currentQ && currentQ.topic) || '';
      const currentUnit  = (currentQ && currentQ.unit)  || '';
      const topicStats = s.byTopic[currentTopic];
      const unitStats  = s.byChapter[currentUnit];
      const topicWeak = topicStats && topicStats.a >= 3 && (topicStats.r / topicStats.a) < 0.7;
      const unitWeak  = unitStats  && unitStats.a  >= 3 && (unitStats.r  / unitStats.a ) < 0.7;
      if (!topicWeak && !unitWeak) return '';
      let out = 'LEARNING PROFILE (this question is in a weak area for the student):\n';
      if (unitWeak)  out += '- Weak chapter: ' + currentUnit  + ' — ' + unitStats.r  + '/' + unitStats.a  + ' correct (' + Math.round(100 * unitStats.r  / unitStats.a)  + '%).\n';
      if (topicWeak) out += '- Weak topic: '   + currentTopic + ' — ' + topicStats.r + '/' + topicStats.a + ' correct (' + Math.round(100 * topicStats.r / topicStats.a) + '%).\n';
      out += '(Name this connection explicitly and teach the underlying rule, not just the answer.)\n\n';
      return out;
    } catch(e) { return ''; }
  }

  // ---- Cross-question memory: find prior chats on the same topic/chapter ----
  function _crossQuestionContext(currentQ){
    try {
      if (!currentQ) return '';
      const currentHash = _questionHash(currentQ);
      const all = _loadAllChats();
      const related = [];
      const topic = (currentQ.topic || '').toLowerCase();
      const unit  = (currentQ.unit  || '').toLowerCase();
      // We stored chats by question-text hash, so to find "same topic" chats we'd need
      // to keep a small side-index. Cheap approach: iterate saved chats and, for each,
      // look up the topic from the message content (bot responses typically mention topic keywords).
      // Better: at save time, also store the question's topic + unit alongside. Do that now
      // by upgrading records lazily as they're read.
      Object.entries(all).forEach(([k, rec]) => {
        if (k === currentHash) return;
        if (!rec || !Array.isArray(rec.m)) return;
        // Prefer the stored topic/unit if we already added it; fall back to scanning first user msg
        const recTopic = (rec.topic || '').toLowerCase();
        const recUnit  = (rec.unit  || '').toLowerCase();
        let match = false;
        if (recTopic && topic && recTopic === topic) match = true;
        else if (recUnit && unit && recUnit === unit) match = true;
        if (!match) return;
        // Extract a compact summary: the LAST bot message truncated
        const lastBot = [...rec.m].reverse().find(b => b.r === 'b');
        if (!lastBot) return;
        const plain = String(lastBot.t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        related.push({ t: rec.t || 0, s: plain.slice(0, 200) });
      });
      related.sort((a, b) => b.t - a.t);
      // Only include when there are 2+ related chats — otherwise it's just noise
      if (related.length < 2) return '';
      const top = related.slice(0, 2);
      let out = 'PRIOR CHATS ON THIS TOPIC (previous discussions with this student on the same topic/chapter):\n';
      top.forEach((r, i) => {
        const s = r.s.slice(0, 150);
        out += (i+1) + '. ' + s + (r.s.length > 150 ? '…' : '') + '\n';
      });
      out += '(If you\'re about to repeat something already covered, acknowledge it and go deeper instead.)\n\n';
      return out;
    } catch(e) { return ''; }
  }
  // Upgrade the saveChatForCurrentQ helper to also stamp topic/unit into each record
  // so cross-question memory can find related chats. Small wrapper on top of the
  // existing function.
  const _origSave = saveChatForCurrentQ;
  saveChatForCurrentQ = function(){
    try {
      const q = _currentQuestion();
      if (!q) return _origSave();
      _origSave();
      // Now annotate the just-saved record with topic + unit
      const key = _questionHash(q);
      if (!key) return;
      const all = _loadAllChats();
      if (all[key]) {
        all[key].topic = q.topic || '';
        all[key].unit  = q.unit  || '';
        _saveAllChats(all);
      }
    } catch(e) { try { _origSave(); } catch(_){} }
  };

  // ---- Client-side RAG: search across ALL chapter notes for keyword-matched sections ----
  // Not real semantic RAG (would need embeddings + a worker) — but a solid keyword-overlap
  // approach that finds relevant sections anywhere in the study guide, not just the current chapter.
  const _STOPWORDS = new Set(('a an the of in on to for and or is are was were be been being ' +
    'this that these those it its as by with from at have has had do does did which what who ' +
    'when where why how not no can may will would should could taxpayer question following').split(' '));
  function _keywords(text){
    return String(text).toLowerCase()
      .replace(/[^a-z0-9§]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !_STOPWORDS.has(w));
  }
  function _sectionText(sec){
    // Sections in CHNOTES have shape { t, l, i: [ [type, content], ... ] }.
    // `type` (e.g. "li", "o") is an internal list-style tag, not text — joining
    // the whole tuple used to leak it straight into the output ("li Line 11: ...
    // li Line 12: ...", "o Jury duty pay ... rule o Deductible ... rule"), which
    // is what showed up as garbage in both the AI's context and saved study-list
    // ref snippets. Drop the tag, keep the content, one item per line (the ref
    // display uses white-space:pre-wrap, so this reads as a real list again).
    if (!sec) return '';
    let out = String(sec.t || '');
    if (Array.isArray(sec.i)) {
      sec.i.forEach(item => {
        if (Array.isArray(item)) {
          const content = item.slice(1).join(' ').trim();
          if (content) out += '\n' + content;
        } else if (typeof item === 'string' && item.trim()) {
          out += '\n' + item.trim();
        }
      });
    }
    return out;
  }
  // Indexes every section of a Part's study-guide notes once (word sets + how many
  // sections each word appears in), cached per Part number for the session.
  const _sectionIndexCache = {};
  function _getSectionIndex(){
    if (typeof CHNOTES === 'undefined' || !CHNOTES || typeof PART === 'undefined') return null;
    const notes = CHNOTES[PART];
    if (!notes) return null;
    if (_sectionIndexCache[PART]) return _sectionIndexCache[PART];
    const sections = [];
    const df = Object.create(null); // word -> number of sections it appears in
    const seenKeys = new Set(); // some chapters have the same section title twice in the source data
    Object.entries(notes).forEach(([chNum, ch]) => {
      if (!ch || !Array.isArray(ch.s)) return;
      ch.s.forEach((sec) => {
        const dedupeKey = chNum + '::' + (sec.t || '');
        if (seenKeys.has(dedupeKey)) return;
        seenKeys.add(dedupeKey);
        const titleWords = new Set(_keywords(sec.t || ''));
        const wordSet = new Set(_keywords(_sectionText(sec)));
        if (!wordSet.size) return;
        wordSet.forEach(w => { df[w] = (df[w] || 0) + 1; });
        // Full text, not a snippet — a saved list item should show everything from
        // the matched section, not a 500-char fragment. Capped only as a safety net.
        sections.push({ chNum, chTitle: ch.t || '', sec: sec.t || '', titleWords, wordSet, fullText: _sectionText(sec).slice(0, 4000) });
      });
    });
    const index = { sections, df, N: sections.length };
    _sectionIndexCache[PART] = index;
    return index;
  }
  // Core grounded search: scores every section of the CURRENT PART's study-guide
  // notes against arbitrary query text, returns verbatim matches (no AI involved,
  // no network call — just keyword overlap against the actual book data).
  // Uses IDF-style weighting so rare, specific words (e.g. "medicare", "niit")
  // dominate the score over words that are common across the whole book (e.g.
  // "tax", "married", "threshold") — otherwise long, generic sections that happen
  // to mention filing statuses win purely on raw hit count over the one section
  // that's actually about the concept asked for. Title matches count 3x a body hit.
  function _ragSearchByText(queryText, maxHits){
    try {
      const index = _getSectionIndex();
      if (!index) return [];
      const qWords = Array.from(new Set(_keywords(queryText)));
      if (!qWords.length) return [];
      const qWordSet = new Set(qWords);
      const scored = [];
      index.sections.forEach(s => {
        let score = 0, hits = 0;
        qWords.forEach(w => {
          const inTitle = s.titleWords.has(w);
          const inBody = s.wordSet.has(w);
          if (!inTitle && !inBody) return;
          hits++;
          const idf = Math.log((index.N + 1) / (1 + (index.df[w] || 0)));
          score += idf * (inTitle ? 3 : 1);
        });
        if (hits < 2) return; // require at least 2 distinct keyword overlaps
        // Title-coverage bonus: if most/all of THIS section's own title words show
        // up in the query, the section is almost certainly the right answer even
        // if its body text is short — e.g. a section titled "Net Investment Income
        // Tax (NIIT)" when the query says "...net investment income tax...". Plain
        // idf-sum alone loses this to longer, only tangentially-related sections.
        if (s.titleWords.size) {
          let titleMatched = 0;
          s.titleWords.forEach(w => { if (qWordSet.has(w)) titleMatched++; });
          const coverage = titleMatched / s.titleWords.size;
          if (coverage >= 0.6) score += 18 * coverage;
        }
        scored.push({ chNum: s.chNum, chTitle: s.chTitle, sec: s.sec, score, snippet: s.fullText });
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, maxHits || 2);
    } catch(e) { return []; }
  }
  function _ragSearch(currentQ, maxHits){
    try {
      // Build the query terms from the question + all answer options + topic
      const queryParts = [currentQ.q || ''];
      (currentQ.opts || []).forEach(o => queryParts.push(o));
      if (currentQ.topic) queryParts.push(currentQ.topic);
      const top = _ragSearchByText(queryParts.join(' '), maxHits);
      if (!top.length) return '';
      let out = 'RETRIEVED STUDY-GUIDE PASSAGES (relevant sections from anywhere in the book, not just the current chapter):\n';
      top.forEach((h, i) => {
        const snip = h.snippet.slice(0, 250);
        out += (i+1) + '. Ch ' + h.chNum + ' (' + h.chTitle + ') § "' + h.sec + '": ' + snip.replace(/\s+/g,' ').trim() + (h.snippet.length > 250 ? '…' : '') + '\n';
      });
      out += '\n';
      return out;
    } catch(e) { return ''; }
  }

  // ---- Chapter notes context builder (grounds tutor in the study guide) ----
  function _chapterNotesContext(q){
    try{
      if (typeof CHNOTES === 'undefined' || !CHNOTES || typeof PART === 'undefined') return '';
      const notes = CHNOTES[PART];
      if (!notes) return '';
      // Extract chapter number from q.unit ("SU 12: ..." or "Chapter 12" or "12")
      const unit = String((q && q.unit) || '');
      const m = unit.match(/(\d+)/);
      if (!m) return '';
      const ch = notes[m[1]];
      if (!ch) return '';
      let out = 'STUDY-GUIDE CHAPTER NOTES (chapter ' + m[1] + ': ' + (ch.t || '') + '):\n';
      // Forms cited in this chapter
      if (Array.isArray(ch.f) && ch.f.length) {
        out += 'Key forms: ' + ch.f.slice(0, 8).map(x => x.f + (x.ttl ? ' (' + x.ttl + ')' : '')).join('; ') + '\n';
      }
      // Key facts (short bullets from the book)
      if (Array.isArray(ch.k) && ch.k.length) {
        const facts = ch.k.slice(0, 6).map(x => (x.t || '').trim()).filter(Boolean);
        if (facts.length) out += 'Key facts: ' + facts.join(' | ') + '\n';
      }
      // Section titles so the tutor knows what topics the chapter covers
      if (Array.isArray(ch.s) && ch.s.length) {
        const secs = ch.s.map(x => (x.t || '').trim()).filter(Boolean).slice(0, 12);
        if (secs.length) out += 'Sections: ' + secs.join(' · ') + '\n';
      }
      // Hard cap — 800 chars is enough for title + forms + a few facts + section names
      if (out.length > 800) out = out.slice(0, 800) + '…\n';
      return out + '\n';
    }catch(e){ return ''; }
  }

  // Self-heal: if the current user is an admin, clear any stale rate-limit counter
  try {
    if (typeof isAdminUser === 'function' && isAdminUser()) {
      localStorage.removeItem('ea3quiz_v2_aiUsage');
    }
  } catch(e) {}

  // Convert common LaTeX command tokens to plain Unicode so the AI's answers don't
  // read like "$\rightarrow$" on the page. Runs BEFORE markdown/HTML processing.

  // ---- LaTeX → Unicode substitution (used before markdown render) ----
  function stripLatex(text){
    // Common arrows and math operators the tutor tends to emit
    const map = {
      'rightarrow':'→','longrightarrow':'→','Rightarrow':'⇒','to':'→',
      'leftarrow':'←','longleftarrow':'←','Leftarrow':'⇐','gets':'←',
      'leftrightarrow':'↔','Leftrightarrow':'⇔','mapsto':'↦',
      'uparrow':'↑','downarrow':'↓','Uparrow':'⇑','Downarrow':'⇓',
      'times':'×','div':'÷','pm':'±','mp':'∓','cdot':'·','ast':'∗',
      'leq':'≤','geq':'≥','neq':'≠','approx':'≈','equiv':'≡','sim':'∼',
      'infty':'∞','partial':'∂','sum':'∑','prod':'∏','int':'∫',
      'alpha':'α','beta':'β','gamma':'γ','delta':'δ','epsilon':'ε',
      'theta':'θ','lambda':'λ','mu':'μ','pi':'π','sigma':'σ','omega':'ω',
      'Delta':'Δ','Sigma':'Σ','Omega':'Ω','Pi':'Π',
      'checkmark':'✓','bullet':'•','dots':'…','ldots':'…','cdots':'⋯'
    };
    // \text{...} / \mathrm{...} etc: keep only the inner content
    text = text.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|textit|operatorname)\{([^{}]*)\}/g, '$1');
    // \frac{a}{b} -> a/b
    text = text.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2');
    // Escaped punctuation the AI emits inside math mode: \% \$ \& \_ \#
    text = text.replace(/\\([%$&_#])/g, '$1');
    // $...$, $$...$$, and \(...\) / \[...\] wrappers around a single command
    text = text.replace(/\${1,2}\\([a-zA-Z]+)\${1,2}/g, (_,cmd) => map[cmd] || cmd);
    text = text.replace(/\\[\(\[]\s*\\([a-zA-Z]+)\s*\\[\)\]]/g, (_,cmd) => map[cmd] || cmd);
    // Bare \rightarrow (no $ wrapping) also gets replaced
    text = text.replace(/\\([a-zA-Z]+)/g, (m,cmd) => map[cmd] !== undefined ? map[cmd] : m);
    // Any remaining $$ block-math delimiters are just noise now that the
    // commands inside are plain text — drop them. Single $ signs are left
    // alone since they're almost always currency (e.g. "$4,800").
    text = text.replace(/\$\$/g, '');
    return text;
  }

  // Minimal markdown → HTML renderer (safe: escapes HTML first)

  // ---- Markdown renderer (used for bot messages) ----
  // Split inline bullet-list runs like "* item1 * item2 * item3" into proper
  // newline-separated markdown so the list parser can render them.
  // Only fires when we see 3+ " * " tokens in a stretch — protects real emphasis.
  function normalizeInlineLists(text){
    return text.replace(/(^|\n)([^\n]*?(?: \* [^\n]+){2,}[^\n]*)/g, (m, pre, run) => {
      // Split on " * " but keep the leading text before the first " * " as-is
      const idx = run.indexOf(' * ');
      if (idx < 0) return m;
      const head = run.slice(0, idx).trim();
      const rest = run.slice(idx + 3);
      const items = rest.split(/ \* /);
      const bullets = items.map(x => '* ' + x.trim()).join('\n');
      return pre + (head ? head + '\n' : '') + bullets;
    });
  }

  // Turns a run of "| a | b |" lines (with a "| :--- | :--- |" separator
  // row second) into a <table>. Runs after bold/italic so cell text like
  // "**Form 8938**" has already become "<strong>Form 8938</strong>".
  function splitTableRow(row) {
    let r = row.trim();
    if (r.startsWith('|')) r = r.slice(1);
    if (r.endsWith('|')) r = r.slice(0, -1);
    return r.split('|').map(c => c.trim());
  }
  function renderTables(html) {
    const sepRe = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
    const lines = html.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const header = lines[i], sep = lines[i + 1];
      if (header && header.includes('|') && sep && sepRe.test(sep)) {
        const headCells = splitTableRow(header);
        const bodyRows = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
          bodyRows.push(splitTableRow(lines[j]));
          j++;
        }
        let tbl = '<table><thead><tr>' + headCells.map(c => '<th>' + c + '</th>').join('') + '</tr></thead>';
        if (bodyRows.length) {
          tbl += '<tbody>' + bodyRows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody>';
        }
        out.push(tbl + '</table>');
        i = j;
      } else {
        out.push(header);
        i++;
      }
    }
    return out.join('\n');
  }

  function renderMarkdown(text) {
    // Translate LaTeX commands into Unicode first
    text = stripLatex(text);
    // Split inline "* a * b * c" bullet runs onto their own lines
    text = normalizeInlineLists(text);
    // Escape HTML
    let html = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, (_,c) => '<pre><code>'+c.trim()+'</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    // Horizontal rules (a line that's just 3+ -/*/_ — must run before table
    // detection since a bare "---" line has no "|" and won't match a table separator)
    html = html.replace(/^ {0,3}([-*_])\1{2,}[ \t]*$/gm, '<hr>');
    // Tables ("| a | b |" header + "| :--- | :--- |" separator + data rows)
    html = renderTables(html);
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Unordered lists
    html = html.replace(/(?:^[*\-] .+\n?)+/gm, m => {
      const items = m.trim().split('\n').map(l => '<li>'+l.replace(/^[*\-] /,'')+'</li>').join('');
      return '<ul>'+items+'</ul>';
    });
    // Ordered lists
    html = html.replace(/(?:^\d+\. .+\n?)+/gm, m => {
      const items = m.trim().split('\n').map(l => '<li>'+l.replace(/^\d+\. /,'')+'</li>').join('');
      return '<ol>'+items+'</ol>';
    });
    // Paragraphs (wrap remaining lines)
    html = html.split(/\n\n+/).map(block => {
      if (/^\s*<(h[1-3]|ul|ol|pre|blockquote|table|hr)/.test(block)) return block;
      return '<p>'+block.replace(/\n/g,'<br>')+'</p>';
    }).join('');
    return html;
  }

  function addMsg(text, isUser) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (isUser ? 'user' : 'bot');
    if (isUser) div.textContent = text;
    else { div.innerHTML = renderMarkdown(text); _maybeAddListButton(div, div.innerHTML); }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    // Store raw text for user bubbles, rendered HTML for bot bubbles (matches
    // what's on screen) so continuous-log replay never re-runs the markdown pass.
    _appendToChatLog(isUser ? 'u' : 'b', isUser ? text : div.innerHTML);
    return div;
  }

  // Appends a "+ Add to my list" button under a bot reply that looks like a real
  // explanation — long enough, and not one of our own confirmation/error messages.
  // Clicking it saves the CURRENT question via the exact same addToStudyList() path
  // as the old typed "add this to my list" trigger. The note passed is the student's
  // own preceding question/prompt (not the trigger phrase, since there isn't one) —
  // that's a much better anchor for the book-passage search than a bare "add this".
  function _maybeAddListButton(div, rawHtml){
    const plain = String(rawHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain.length < 150) return;
    if (/to your study list/i.test(plain)) return;
    if (/^Error:|^The AI is busy/.test(plain)) return;
    if (div.querySelector('.ai-add-list-btn')) return; // already added
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ai-add-list-btn';
    btn.textContent = '+ Add to my list';
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const curQ = _currentQuestion();
      if (!curQ) {
        btn.textContent = 'Open a question first';
        setTimeout(() => { btn.disabled = false; btn.textContent = '+ Add to my list'; }, 1600);
        return;
      }
      let note = plain;
      const prevUser = div.previousElementSibling;
      if (prevUser && prevUser.classList.contains('user') && prevUser.textContent.trim()) {
        note = prevUser.textContent.trim();
      }
      try {
        await addToStudyList(curQ, note);
        updateStudyListBadge();
        btn.textContent = '✓ Added';
        btn.classList.add('added');
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '+ Add to my list';
      }
    };
    div.appendChild(btn);
  }

  function addTyping() {
    const div = document.createElement('div');
    div.className = 'ai-msg bot';
    div.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  async function send() {
    const q = input.value.trim();
    if (!q) return;

    // ---- "Add this to my list" — handled entirely locally, no API call/quota spent ----
    if (_looksLikeAddToList(q)) {
      addMsg(q, true);
      input.value = '';
      input.style.height = 'auto';
      const curQ = _currentQuestion();
      if (!curQ) {
        addMsg('You need to be viewing a question for me to save its topic — open one and try again.', false);
      } else {
        // Usually resolves instantly (pure local search); only pauses here on a
        // vague note that needs the AI to pick among candidates.
        const typing = addTyping();
        const entry = await addToStudyList(curQ, q);
        typing.remove();
        const refCount = Array.isArray(entry.refs) ? entry.refs.length : 0;
        addMsg('Added **' + entry.topic + '**' + (entry.unit ? ' (' + entry.unit + ')' : '') +
          ' to your study list ✓' +
          (refCount ? (' — pulled ' + refCount + ' matching passage' + (refCount > 1 ? 's' : '') + ' straight from the book.') :
            ' — no exact passage matched in the book, so your note is saved as a reminder instead.') +
          (entry.aiExplanation ? ' Also kept the explanation from this chat.' : '') +
          ' Tap 📚 up top any time to see everything you\'ve saved (' +
          _loadStudyList().length + ' so far).', false);
      }
      return;
    }

    // ---- Rate limit: 30/day for regular users, unlimited for admins (Rafay, etc.) ----
    var isAdmin = false;
    try { isAdmin = (typeof isAdminUser === 'function') && isAdminUser(); } catch(e) {}
    var AI_USAGE_KEY = 'ea3quiz_v2_aiUsage';
    var DAILY_LIMIT = 30;
    function todayEst(){
      try{return new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});}
      catch(e){return new Date().toISOString().slice(0,10);}
    }
    function readUsage(){
      try{return JSON.parse(localStorage.getItem(AI_USAGE_KEY))||{};}catch(e){return {};}
    }
    if (!isAdmin) {
      var usage = readUsage();
      var used = usage[todayEst()] || 0;
      if (used >= DAILY_LIMIT) {
        addMsg(q, true);
        input.value = '';
        input.style.height = 'auto';
        var limitMsg = document.createElement('div');
        limitMsg.className = 'ai-msg bot';
        limitMsg.innerHTML = '<strong>Daily limit reached.</strong><br>You\'ve used all '+DAILY_LIMIT+' AI questions for today. The limit resets at midnight (Eastern Time).';
        messages.appendChild(limitMsg);
        input.focus();
        return;
      }
    }

    // Access gate — belt and suspenders in case the UI check was bypassed.
    if (!_aiAllowed()) {
      const gate = document.createElement('div');
      gate.className = 'ai-msg bot';
      // Distinguish "demo quota exhausted" from "not allowed at all"
      var isDemo = (typeof isDemoActive === 'function' && isDemoActive());
      if (isDemo && typeof demoAiRemaining === 'function' && demoAiRemaining() === 0) {
        gate.innerHTML = '<strong>You\'ve used all '+DEMO_AI_LIMIT+' demo AI questions.</strong><br>Ask the admin to upgrade you to full access for unlimited use.';
      } else {
        gate.innerHTML = '<strong>AI Tutor is disabled on this account.</strong><br>Only the account owner can use the AI tutor. Ask the admin if you need access.';
      }
      messages.appendChild(gate);
      input.value = '';
      return;
    }

    // Demo users: count this against their small AI quota BEFORE we send
    var _isDemoCaller = (typeof isDemoActive === 'function' && isDemoActive() && (typeof isAdminUser !== 'function' || !isAdminUser()));
    if (_isDemoCaller) {
      try { bumpDemoAi(); } catch(e) {}
    }

    addMsg(q, true);
    // Persist immediately so the user's question survives a mid-response close/refresh
    try { saveChatForCurrentQ(); } catch(e) {}
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    // ---- RESPONSE CACHE ----
    // If this exact prompt was asked on this exact question and got a good answer before,
    // just replay the answer — zero API cost. Only applies when there's no follow-up
    // context to worry about (i.e., first message on the question, or a repeated quick-action).
    const _cq = _currentQuestion();
    const _cacheKey = _cq ? (_questionHash(_cq) + '::' + _promptFingerprint(q)) : '';
    if (_cacheKey) {
      try {
        const cache = JSON.parse(localStorage.getItem('ea3quiz_v2_ai_resp_cache') || '{}');
        const hit = cache[_cacheKey];
        if (hit && hit.r && hit.r.length > 40) {
          // Replay the cached answer instantly, no fetch, no billing
          const div = document.createElement('div');
          div.className = 'ai-msg bot';
          div.innerHTML = renderMarkdown(hit.r);
          _maybeAddListButton(div, div.innerHTML);
          messages.appendChild(div);
          messages.scrollTop = messages.scrollHeight;
          try { _appendToChatLog('b', div.innerHTML); } catch(e) {}
          try { saveChatForCurrentQ(); } catch(e) {}
          sendBtn.disabled = false;
          input.focus();
          return;
        }
      } catch(e) {}
    }

    const typing = addTyping();

    // Increment usage counter (for non-admin users)
    if (!isAdmin) {
      try {
        var u = readUsage();
        var k = todayEst();
        u[k] = (u[k] || 0) + 1;
        localStorage.setItem(AI_USAGE_KEY, JSON.stringify(u));
      } catch(e) {}
    }

    // Scroll so the user's question is visible at the top of the messages area
    const userMsg = messages.lastElementChild.previousElementSibling; // the just-added user msg
    if (userMsg) userMsg.scrollIntoView({ block: 'start', behavior: 'smooth' });

    // Grab the currently visible question, options, AND the correct answer + book's own explanation
    // from the underlying JS data (not just the DOM), so the tutor teaches FROM the truth
    // instead of guessing at it.
    let context = '';
    try {
      let currentQ = null;
      // Global QUESTIONS / st / pos are set whenever a quiz view is active
      if (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS) &&
          typeof st === 'object' && st && Array.isArray(st.order) &&
          typeof pos === 'number' && pos >= 0 && pos < st.order.length) {
        currentQ = QUESTIONS[st.order[pos]];
      }
      if (currentQ) {
        context = 'CURRENT QUESTION ON SCREEN:\n' + (currentQ.q || '').trim() + '\n\nANSWER OPTIONS:\n';
        (currentQ.opts || []).forEach((o, i) => {
          context += String.fromCharCode(65 + i) + '. ' + String(o).trim() + '\n';
        });
        if (typeof currentQ.a === 'number' && currentQ.opts && currentQ.opts[currentQ.a]) {
          context += '\nCORRECT ANSWER: ' + String.fromCharCode(65 + currentQ.a) +
                     '. ' + String(currentQ.opts[currentQ.a]).trim() + '\n';
        }
        // Student's own chosen answer — lets the tutor explain why THEIR pick was wrong
        try {
          const qIdx = st.order[pos];
          const chosen = st.answers[qIdx];
          if (chosen !== null && chosen !== undefined && currentQ.opts && currentQ.opts[chosen]) {
            const letter = String.fromCharCode(65 + chosen);
            const correct = (chosen === currentQ.a);
            context += '\nSTUDENT\'S CHOSEN ANSWER: ' + letter + '. ' +
                       String(currentQ.opts[chosen]).trim() +
                       (correct ? '  (CORRECT)' : '  (INCORRECT — explain why the student was drawn to this trap and why the correct answer is better)') + '\n';
          } else {
            context += '\nSTUDENT\'S CHOSEN ANSWER: (not yet answered)\n';
          }
        } catch(e) {}
        if (currentQ.expl && String(currentQ.expl).trim()) {
          context += '\nBOOK\'S OWN EXPLANATION (use this as the ground truth; expand and clarify, do not contradict):\n' +
                     String(currentQ.expl).trim() + '\n';
        }
        if (currentQ.topic) context += '\nTOPIC / CHAPTER: ' + String(currentQ.topic) + '\n';
        context += '\n';
        // Chapter notes — pull the study guide's own notes for the chapter this question belongs to
        context += _chapterNotesContext(currentQ);
        // Client-side RAG: pull the top ~3 most relevant sections from ANYWHERE in the book
        context += _ragSearch(currentQ, 2);
        // Cross-question memory: prior discussions on this same topic/chapter
        context += _crossQuestionContext(currentQ);
      } else {
        // Fallback: fall back to DOM scraping (no quiz view detected)
        const qtextEl = document.querySelector('.qtext');
        if (qtextEl && qtextEl.offsetParent !== null) {
          context = 'CURRENT QUESTION ON SCREEN:\n' + qtextEl.innerText.trim() + '\n\nANSWER OPTIONS:\n';
          document.querySelectorAll('.opt').forEach((o, i) => {
            if (o.offsetParent !== null) context += String.fromCharCode(65 + i) + '. ' + o.innerText.trim() + '\n';
          });
          context += '\n';
        }
      }
    } catch(e) {}

    // Multi-turn memory: gather the last few messages from the panel so follow-ups
    // like "why is B wrong?" carry context from the previous turn.
    let historyBlock = '';
    try {
      const HIST_MAX = 8; // last 8 messages = ~4 exchanges. Keeps payload small.
      const msgs = Array.from(messages.querySelectorAll('.ai-msg')).slice(-HIST_MAX);
      // Skip the greeting "Hi. Ask me about the current question..." and the message we JUST added
      // (the just-added user message is the LAST child; drop it).
      const trimmed = msgs.slice(0, -1).filter(m => {
        const txt = (m.innerText || '').trim();
        return txt && !/^Hi\. Ask me about/i.test(txt);
      });
      if (trimmed.length) {
        historyBlock = 'PRIOR CONVERSATION (most recent last):\n';
        trimmed.forEach(m => {
          const role = m.classList.contains('user') ? 'STUDENT' : 'TUTOR';
          const txt = (m.innerText || '').trim().replace(/\s+/g, ' ');
          // Cap each turn so a long tutor answer doesn't dominate the payload
          historyBlock += role + ': ' + (txt.length > 700 ? txt.slice(0, 700) + '…' : txt) + '\n';
        });
        historyBlock += '\n';
      }
    } catch(e) {}

    // Only requests actually about the answer choices get the A/B/C/D treatment.
    // Concept explanations, chapter summaries, mnemonics, practice questions, and
    // general questions must NOT get it, even though the options are in context below.
    const wantsBreakdown = /\b(explain this question|why (is|was)( my)? (the )?answer|why.*\bwrong\b|break ?down|wrong answer|trap answer)\b/i.test(q);

    const fullPrompt =
      'ROLE: You are an expert EA-exam tutor. Teach clearly, cite authority (IRC section, Circular 230 § number, ' +
      'IRS Publication, form number) whenever a rule has one, and always tie your answer back to what will actually ' +
      'be tested. Prefer short, well-structured explanations over long ones.\n\n' +
      'TAX YEAR: The current EA SEE testing cycle runs May 1, 2026 – Feb 28, 2027 and tests TAX YEAR 2025 law ' +
      '(returns filed in 2026). Every figure, bracket, standard deduction amount, contribution limit, phase-out, ' +
      'mileage rate, and threshold you cite MUST be the tax year 2025 figure. Do not use 2024 or earlier numbers. ' +
      'If you are unsure a specific number is the 2025 figure, say so plainly rather than guessing. Account for the ' +
      'One Big Beautiful Bill Act (OBBBA) where it applies.\n\n' +
      'GROUND TRUTH: If a CORRECT ANSWER and a BOOK EXPLANATION are provided below, treat them as authoritative — ' +
      'never re-derive the answer or contradict the book, and expand on the book explanation if it is brief or unclear.\n\n' +
      'STYLE: Use clean markdown — **bold** for key terms, ### for short section headings, - for bullet lists. ' +
      'End with a one-line "**Key takeaway:**" that captures the rule the student should memorize.\n\n' +
      'DO NOT emit LaTeX ($\\rightarrow$, $\\leq$, $\\alpha$, etc.). Write real characters: →, ≤, α. ' +
      'DO NOT restate the question back to the student verbatim — go straight into the explanation.\n\n' +
      _learningProfileContext(_cq, q) +
      historyBlock +
      context +
      (wantsBreakdown
        ? 'THIS TURN: the student is asking about the answer choices. Walk through why the correct answer is right ' +
          'and, in a compact list, why each wrong option is wrong ("Why A is wrong: …").\n\n'
        : 'THIS TURN — CRITICAL: the student is NOT asking about the answer choices. Do not mention option A, B, C, ' +
          'or D, and do not write anything resembling "why X is wrong" or a breakdown of the choices. The answer ' +
          'options above are background only. Answer ONLY the exact request in STUDENT QUESTION below.\n\n') +
      'STUDENT QUESTION (this turn): ' + q;

    // Try the request, with one automatic retry on empty response.
    // Streaming render is debounced via requestAnimationFrame — one paint per frame
    // instead of one per network chunk. Big speed win on long answers.
    async function attemptRequest() {
      // NOTE: Authorization header is intentionally NOT sent until the worker's CORS
      // Access-Control-Allow-Headers is updated to include "Authorization". Sending it
      // triggers a preflight the current worker rejects, and the whole fetch fails.
      // Once you deploy the worker CORS patch (adds "Authorization" to allowed headers),
      // re-enable the block below.
      const _headers = { 'Content-Type': 'application/json' };
      // try {
      //   const _a = (typeof auth === 'function') ? auth() : null;
      //   if (_a && _a.access_token) _headers['Authorization'] = 'Bearer ' + _a.access_token;
      // } catch(e) {}
      const res = await fetch('https://ea-ai.tr78601234.workers.dev/', {
        method: 'POST',
        headers: _headers,
        body: JSON.stringify({ prompt: fullPrompt })
      });
      if (!res.ok || !res.body) return '';

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let rafScheduled = false;
      const flush = () => { rafScheduled = false; typing.innerHTML = renderMarkdown(text); };
      typing.innerHTML = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(flush); }
      }
      // Final render to ensure the last chunk lands
      typing.innerHTML = renderMarkdown(text);
      return text;
    }

    try {
      let fullText = await attemptRequest();
      if (!fullText) {
        typing.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
        await new Promise(r => setTimeout(r, 500));
        fullText = await attemptRequest();
      }
      if (!fullText) {
        typing.textContent = 'The AI is busy — please try again in a moment.';
      }
    } catch (e) {
      typing.textContent = 'Error: could not reach the AI. Please try again.';
    }
    sendBtn.disabled = false;
    // The streaming path above writes directly into `typing`'s innerHTML, bypassing
    // addMsg() (and its automatic logging) entirely — without this, real AI answers
    // would never survive navigation or a reload, unlike every other message type.
    try {
      const finalText = (typing.innerText || '').trim();
      if (finalText && !/^Error:|^The AI is busy/.test(finalText)) {
        _appendToChatLog('b', typing.innerHTML);
        _maybeAddListButton(typing, typing.innerHTML);
      }
    } catch(e) {}
    // Save the completed exchange so the conversation reappears next time
    try { saveChatForCurrentQ(); } catch(e) {}
    // Write to the response cache so an identical repeat won't burn tokens
    try {
      if (_cacheKey) {
        // Read the last bot message (what the tutor just wrote)
        const bots = messages.querySelectorAll('.ai-msg.bot');
        const last = bots[bots.length - 1];
        const bodyText = (last && last.innerText || '').trim();
        if (bodyText.length > 40 && !/^Error:|^The AI is busy/.test(bodyText)) {
          const cache = JSON.parse(localStorage.getItem('ea3quiz_v2_ai_resp_cache') || '{}');
          cache[_cacheKey] = { r: bodyText, t: Date.now() };
          // LRU: keep newest 100 entries
          const keys = Object.keys(cache);
          if (keys.length > 100) {
            const kept = keys
              .map(k => ({ k, t: cache[k].t || 0 }))
              .sort((a, b) => b.t - a.t)
              .slice(0, 100)
              .reduce((acc, x) => { acc[x.k] = cache[x.k]; return acc; }, {});
            localStorage.setItem('ea3quiz_v2_ai_resp_cache', JSON.stringify(kept));
          } else {
            localStorage.setItem('ea3quiz_v2_ai_resp_cache', JSON.stringify(cache));
          }
        }
      }
    } catch(e) {}
    input.focus();
  }
  // Prompt fingerprint used by the response cache — collapse whitespace + lowercase so
  // trivial rewordings still hit the cache. This is per-question, so distinct questions
  // can share fingerprints without collision.
  function _promptFingerprint(txt){
    const s = String(txt || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  sendBtn.onclick = send;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  // Quick-action prompts — one click fills the input and sends
  const QUICK_PROMPTS = {
    explain: 'Explain this question in detail. Break down why the correct answer is right and why each wrong answer is wrong.',
    concept: 'Explain the core tax concept behind this question in plain language. What is the underlying rule I need to understand?',
    wrong:   'Look at the answer I chose. Explain why my pick is wrong (or if I got it right, why the trap answers are wrong), and how to spot this on the exam.',
    mnemonic:'Give me a memory device (mnemonic, mental shortcut, or one-line rule) to remember the answer to this question for the EA exam.',
    similar: 'Write ONE similar-difficulty EA-exam practice question that tests the same rule, with four options and the correct answer marked at the end. Do not repeat this exact question.',
    summary: 'Summarize the entire chapter this question belongs to — not just this one question. Give me the most important rules, numbers, thresholds, and exam traps I need to know, organized by section if that helps. Keep it exam-focused.'
  };
  document.querySelectorAll('#ai-tutor-quicks [data-qp]').forEach(b => {
    b.onclick = () => {
      const p = QUICK_PROMPTS[b.dataset.qp];
      if (!p) return;
      input.value = p;
      send();
    };
  });

  // Escape key minimizes the panel (only when it's open)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.style.display === 'flex' && !panel.classList.contains('minimized')) {
      panel.classList.add('minimized');
      input.blur();
    }
  });

  // ---- Resize handle (drag from top-left corner) ----

  // ---- Resize handle: drag to resize width, dblclick to reset ----
  const resizeHandle = document.getElementById('ai-tutor-resize');
  const SIZE_KEY = 'ea3quiz_v2_tutorSize';
  // Restore saved WIDTH on load (desktop only — mobile is fullscreen).
  // Height is always full viewport now, so we ignore any saved height that used
  // to shorten the panel to the top half of the screen.
  try {
    if (window.innerWidth > 500) {
      const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
      if (saved && saved.w) {
        panel.style.width = saved.w + 'px';
        document.documentElement.style.setProperty('--ai-panel-w', saved.w + 'px');
      }
    } else {
      // Mobile: clear any inline width so the CSS mobile rule (100vw) wins cleanly
      panel.style.width = '';
      panel.style.height = '';
    }
  } catch(e) {}

  let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    startW = panel.offsetWidth; startH = panel.offsetHeight;
    document.body.style.userSelect = 'none';
  });
  // Double-click the resize handle to reset the panel to its default width
  resizeHandle.addEventListener('dblclick', (e) => {
    e.preventDefault(); e.stopPropagation();
    // Clear any inline width/height so the CSS defaults take over
    panel.style.width = '';
    panel.style.height = '';
    document.documentElement.style.setProperty('--ai-panel-w', '480px');
    try { localStorage.removeItem(SIZE_KEY); } catch(err) {}
  });
  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    // Dragging up-left grows the panel (since panel is anchored bottom-right)
    const dx = startX - e.clientX;
    const dy = startY - e.clientY;
    const newW = Math.min(Math.max(320, startW + dx), window.innerWidth - 40);
    panel.style.width = newW + 'px';
    // Height stays full-viewport (governed by top/bottom CSS); don't set an explicit height.
    // Keep the quiz-reflow in sync while dragging
    document.documentElement.style.setProperty('--ai-panel-w', newW + 'px');
  });
  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.userSelect = '';
    // Save only the width — height is now always full viewport
    try {
      localStorage.setItem(SIZE_KEY, JSON.stringify({ w: panel.offsetWidth }));
    } catch(e) {}
  });

  // Must run after every const above has been initialized (not just hoisted) —
  // called here at the bottom of the IIFE rather than near the top.
  hydrateChatLog();
  updateStudyListBadge();
})();
