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
    // Restore this question's saved conversation, if any
    try { _lastQHash = ''; _syncChatToCurrentQuestion(); } catch(e) {}
    setTimeout(()=>input.focus(),100);
  };
  closeBtn.onclick = (e) => { e.stopPropagation(); panel.style.display = 'none'; btn.style.display = 'flex'; _setAiOpen(false); };
  // Click header (but not close button) to minimize/expand
  document.getElementById('ai-tutor-header').onclick = () => {
    panel.classList.toggle('minimized');
    // Minimized = quiz should have its space back
    _setAiOpen(!panel.classList.contains('minimized'));
    if (!panel.classList.contains('minimized')) setTimeout(()=>input.focus(),100);
  };
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
  function saveChatForCurrentQ(){
    const q = _currentQuestion();
    if (!q) return;
    const key = _questionHash(q);
    if (!key) return;
    const bubbles = Array.from(messages.querySelectorAll('.ai-msg')).filter(m => {
      const txt = (m.innerText || '').trim();
      // Skip the greeting bubble
      return txt && !/^Hi\. Ask me about/i.test(txt);
    }).map(m => ({
      r: m.classList.contains('user') ? 'u' : 'b',
      // Store raw text for user, HTML for bot (so bot markdown formatting is preserved)
      t: m.classList.contains('user') ? (m.innerText || '') : (m.innerHTML || '')
    }));
    const all = _loadAllChats();
    if (bubbles.length === 0) { delete all[key]; }
    else all[key] = { m: bubbles, t: Date.now() };
    _saveAllChats(all);
  }
  function loadChatForCurrentQ(){
    // Clear any existing bubbles except the greeting
    Array.from(messages.querySelectorAll('.ai-msg')).forEach((m,i) => {
      if (i > 0) m.remove(); // keep the first greeting
    });
    const q = _currentQuestion();
    if (!q) return;
    const key = _questionHash(q);
    const all = _loadAllChats();
    const rec = all[key];
    if (!rec || !Array.isArray(rec.m)) return;
    rec.m.forEach(b => {
      const div = document.createElement('div');
      div.className = 'ai-msg ' + (b.r === 'u' ? 'user' : 'bot');
      if (b.r === 'u') div.textContent = b.t;
      else div.innerHTML = b.t;
      messages.appendChild(div);
    });
    messages.scrollTop = messages.scrollHeight;
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
    // Sections in CHNOTES have shape { t, l, i: [ [type, content], ... ] }
    if (!sec) return '';
    let out = String(sec.t || '');
    if (Array.isArray(sec.i)) {
      sec.i.forEach(item => {
        if (Array.isArray(item)) out += ' ' + item.join(' ');
        else if (typeof item === 'string') out += ' ' + item;
      });
    }
    return out;
  }
  function _ragSearch(currentQ, maxHits){
    try {
      if (typeof CHNOTES === 'undefined' || !CHNOTES || typeof PART === 'undefined') return '';
      const notes = CHNOTES[PART];
      if (!notes) return '';
      // Build the query terms from the question + all answer options + topic
      const queryParts = [currentQ.q || ''];
      (currentQ.opts || []).forEach(o => queryParts.push(o));
      if (currentQ.topic) queryParts.push(currentQ.topic);
      const qWords = new Set(_keywords(queryParts.join(' ')));
      if (!qWords.size) return '';
      // Score every section across every chapter
      const scored = [];
      Object.entries(notes).forEach(([chNum, ch]) => {
        if (!ch || !Array.isArray(ch.s)) return;
        ch.s.forEach((sec, si) => {
          const text = _sectionText(sec);
          const wds = _keywords(text);
          if (!wds.length) return;
          let hits = 0;
          const seen = new Set();
          wds.forEach(w => { if (qWords.has(w) && !seen.has(w)) { hits++; seen.add(w); } });
          if (hits < 2) return; // require at least 2 distinct keyword overlaps
          // Score: hits per unique term seen in section (favors focused sections)
          const score = hits + Math.min(hits / Math.max(1, wds.length) * 5, 3);
          const snippet = text.slice(0, 400);
          scored.push({ chNum, chTitle: ch.t || '', sec: sec.t || '', score, snippet });
        });
      });
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, maxHits || 2);
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

  // ---- Detect question change while panel is open, swap chat history ----
  let _lastQHash = '';
  function _syncChatToCurrentQuestion(){
    const q = _currentQuestion();
    const h = q ? _questionHash(q) : '';
    if (h === _lastQHash) return;
    _lastQHash = h;
    loadChatForCurrentQ();
  }
  // Poll while panel is open; cheap and reliable across all view types
  setInterval(() => {
    if (panel.style.display === 'flex' && !panel.classList.contains('minimized')) {
      _syncChatToCurrentQuestion();
    }
  }, 600);

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
    // $...$, $$...$$, and \(...\) / \[...\] wrappers around a single command
    text = text.replace(/\${1,2}\\([a-zA-Z]+)\${1,2}/g, (_,cmd) => map[cmd] || cmd);
    text = text.replace(/\\[\(\[]\s*\\([a-zA-Z]+)\s*\\[\)\]]/g, (_,cmd) => map[cmd] || cmd);
    // Bare \rightarrow (no $ wrapping) also gets replaced
    text = text.replace(/\\([a-zA-Z]+)/g, (m,cmd) => map[cmd] !== undefined ? map[cmd] : m);
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
      if (/^\s*<(h[1-3]|ul|ol|pre|blockquote)/.test(block)) return block;
      return '<p>'+block.replace(/\n/g,'<br>')+'</p>';
    }).join('');
    return html;
  }

  function addMsg(text, isUser) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (isUser ? 'user' : 'bot');
    if (isUser) div.textContent = text;
    else div.innerHTML = renderMarkdown(text);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
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
          messages.appendChild(div);
          messages.scrollTop = messages.scrollHeight;
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

    const fullPrompt =
      'ROLE: You are an expert EA-exam tutor. Teach clearly, cite authority (IRC section, Circular 230 § number, ' +
      'IRS Publication, form number) whenever a rule has one, and always tie your answer back to what will actually ' +
      'be tested. Prefer short, well-structured explanations over long ones.\n\n' +
      'TAX YEAR: The current EA SEE testing cycle runs May 1, 2026 – Feb 28, 2027 and tests TAX YEAR 2025 law ' +
      '(returns filed in 2026). Every figure, bracket, standard deduction amount, contribution limit, phase-out, ' +
      'mileage rate, and threshold you cite MUST be the tax year 2025 figure. Do not use 2024 or earlier numbers. ' +
      'If you are unsure a specific number is the 2025 figure, say so plainly rather than guessing. Account for the ' +
      'One Big Beautiful Bill Act (OBBBA) where it applies.\n\n' +
      'GROUND TRUTH: If a CORRECT ANSWER and a BOOK EXPLANATION are provided below, treat them as authoritative. ' +
      'Your job is to explain WHY the correct answer is correct and WHY each wrong option is wrong — not to ' +
      're-derive the answer or contradict the book. If the book explanation is brief or unclear, expand on it.\n\n' +
      'STYLE: Use clean markdown — **bold** for key terms, ### for short section headings, - for bullet lists. ' +
      'When you contrast wrong answers, use a compact list ("Why A is wrong: …", "Why C is wrong: …"). ' +
      'End with a one-line "**Key takeaway:**" that captures the rule the student should memorize.\n\n' +
      'DO NOT emit LaTeX ($\\rightarrow$, $\\leq$, $\\alpha$, etc.). Write real characters: →, ≤, α. ' +
      'DO NOT restate the question back to the student verbatim — go straight into the explanation.\n\n' +
      _learningProfileContext(_cq, q) +
      historyBlock +
      context +
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
    similar: 'Write ONE similar-difficulty EA-exam practice question that tests the same rule, with four options and the correct answer marked at the end. Do not repeat this exact question.'
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
})();
