// ==== REVIEW: smart, flagged, wrong, shuffled
// ============================================================================
// ---------- review session ----------
function startReview(){
  const due=dueReview();
  if(!due.length)return;
  exam=-2;
  QUESTIONS=due.map(function(d){return d.q;});
  REVIEW_REFS=due.map(function(d){return d.ref;});
  st=makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  st.review=true;
  pos=0;
  enterQuiz();
}
// Gather questions across all sources in the current PART matching a predicate.
// Returns array of {q, ref}.
function gatherAcrossPart(matchFn){
  var out=[];
  // Mocks + practice exam
  EXAMS.forEach(function(ex,e){
    var s=loadState(e); if(!s)return;
    ex.questions.forEach(function(q,i){
      if(matchFn(s,i,q)) out.push({q:q, ref:'m'+e+'_'+i});
    });
  });
  // Chapter question sets
  MCQS.forEach(function(mc,mi){
    var s=mcqState(mi); if(!s)return;
    mc.questions.forEach(function(q,i){
      if(matchFn(s,i,q)) out.push({q:q, ref:'mcq'+mi+'_'+i});
    });
  });
  // Extra question sets
  XTRA.forEach(function(g,xi){
    var s=xState(xi); if(!s)return;
    g.questions.forEach(function(q,i){
      if(matchFn(s,i,q)) out.push({q:q, ref:'xtra'+xi+'_'+i});
    });
  });
  return out;
}
function collectFlagged(){
  return gatherAcrossPart(function(s,i){ return s.flags && s.flags[i]===true; });
}
function collectWrong(){
  return gatherAcrossPart(function(s,i,q){
    return s.answers && s.answers[i]!==null && s.answers[i]!==undefined && s.answers[i]!==q.a;
  });
}
function startFlaggedReview(){
  var items=collectFlagged();
  if(!items.length){ alert('No flagged questions in this Part yet. Flag questions using the ⚑ button while answering.'); return; }
  exam=-6;
  QUESTIONS=items.map(function(d){return d.q;});
  REVIEW_REFS=items.map(function(d){return d.ref;});
  st=makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  st.review=true; pos=0;
  enterQuiz();
}
function startWrongReview(){
  var items=collectWrong();
  if(!items.length){ alert('No wrong answers in this Part yet. Attempt some questions first!'); return; }
  exam=-7;
  QUESTIONS=items.map(function(d){return d.q;});
  REVIEW_REFS=items.map(function(d){return d.ref;});
  st=makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  st.review=true; pos=0;
  enterQuiz();
}
function startShuffledWrongFlagged(){
  var flagged=collectFlagged();
  var wrong=collectWrong();
  // Deduplicate by ref so questions that are BOTH wrong AND flagged aren't repeated
  var seen={};
  var combined=[];
  flagged.concat(wrong).forEach(function(item){
    if(!seen[item.ref]){ seen[item.ref]=true; combined.push(item); }
  });
  if(!combined.length){ alert('Nothing to shuffle — no flagged or wrong questions in this Part yet.'); return; }
  // Fisher-Yates shuffle
  for(var i=combined.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var tmp=combined[i]; combined[i]=combined[j]; combined[j]=tmp;
  }
  exam=-9;
  QUESTIONS=combined.map(function(d){return d.q;});
  REVIEW_REFS=combined.map(function(d){return d.ref;});
  st=makeState(QUESTIONS.length,QUESTIONS,true,'practice'); // shuffle answer options too
  st.review=true; pos=0;
  enterQuiz();
}

// ---- "Toughest for me": a curated quiz of the hardest questions FOR THIS STUDENT ----
// Uses every signal we have:
//   - Wrong (currently answered incorrectly): +8
//   - Wrong + flagged double-signal: +4 extra
//   - Flagged: +5
//   - In a weak chapter (accuracy < 70%, ≥3 attempts): +3
//   - In a weak topic (accuracy < 70%, ≥3 attempts): +2
//   - Question text starts with a NOT/EXCEPT trap: +3
//   - Question involves calculations ($, numbers, %): +2
//   - Long question stem (>250 chars, more mental load): +1
//   - Flashcard confidence rating 1 or 2 (student marked "low"): +6
//   - Unanswered but in a weak chapter (fresh challenge): +4
// Then the top N locally-ranked candidates are optionally reranked by the AI
// (cached per Part for 6h so it doesn't fire on every click).
function _textToughFeatures(text){
  var t = String(text || '').toLowerCase();
  var s = 0;
  // Negation/exception traps — EA exam favourite
  if (/\b(not|except|least\s+likely|does\s+not|cannot|is\s+not\s+true|is\s+not\s+correct)\b/i.test(text || '')) s += 3;
  // Contains dollar amounts / percentages / calculations
  if (/\$[\d,]+|\d+%|\bcalculate|\bcompute|\btotal\s+of|\bhow\s+much/i.test(text || '')) s += 2;
  // Long stem
  if (t.length > 250) s += 1;
  return s;
}
// Analyze attempt history to detect misconception patterns:
// for each topic, which wrong option index does the student pick most often?
// If they always pick B when the answer is C on §1031 questions → they have a specific misconception.
function _computeMisconceptions(){
  var attempts = loadAttempts();
  // Need to know each question's topic + correct answer + student's wrong choice — but attempts
  // are keyed by question text hash, we don't know the topic from the hash alone.
  // Do a scan across the loaded PARTS to build a hash→(topic, a) map from the question bank.
  var idx = {};
  try {
    var parts = (typeof PARTS!=='undefined')?PARTS:null;
    if(parts){
      [1,2,3].forEach(function(p){
        if(!parts[p])return;
        (parts[p].exams||[]).forEach(function(ex){ (ex.questions||[]).forEach(function(q){ idx[_qh(q.q)]={topic:q.topic,unit:q.unit,a:q.a}; }); });
        (parts[p].mcqs||[]).forEach(function(mc){ (mc.questions||[]).forEach(function(q){ idx[_qh(q.q)]={topic:q.topic,unit:q.unit,a:q.a}; }); });
        (parts[p].extra||[]).forEach(function(g){ (g.questions||[]).forEach(function(q){ idx[_qh(q.q)]={topic:q.topic,unit:q.unit,a:q.a}; }); });
      });
    }
  } catch(e){}
  // Aggregate wrong-choice picks by topic
  var byTopic = {}; // { topic: { wrongPicks: [c1,c2,c3,c4], total, hotPick } }
  Object.keys(attempts).forEach(function(h){
    var meta = idx[h]; if(!meta) return;
    var tp = meta.topic||''; if(!tp) return;
    attempts[h].forEach(function(att){
      if(att.ok) return; // ignore correct attempts
      if(!byTopic[tp]) byTopic[tp] = { wrong:[0,0,0,0], total:0 };
      if(att.c>=0 && att.c<=3) byTopic[tp].wrong[att.c]++;
      byTopic[tp].total++;
    });
  });
  // Find topics with a dominant wrong-choice bias (>= 40% of wrong attempts fell to one option)
  var out = {};
  Object.keys(byTopic).forEach(function(tp){
    var b = byTopic[tp];
    if(b.total < 3) return;
    var maxIdx = 0, maxN = b.wrong[0];
    for(var i=1;i<4;i++) if(b.wrong[i]>maxN){maxN=b.wrong[i];maxIdx=i;}
    if(maxN/b.total >= 0.4) out[tp] = { bias:maxIdx, count:b.total };
  });
  return out;
}

function collectToughestForMe(limit){
  limit = limit || 25;
  var flagged = collectFlagged();
  var wrong   = collectWrong();
  var fcRatings = {}; try { fcRatings = JSON.parse(localStorage.getItem('ea3quiz_v2_fcRatings')||'{}'); } catch(e){}
  var attempts = loadAttempts();
  var misconceptions = _computeMisconceptions();
  var now = Date.now();
  var DAY = 86400000;

  // Compute per-chapter and per-topic accuracy
  var chapAgg = {}, topicAgg = {};
  function fold(qs, answers){
    if(!answers) return;
    answers.forEach(function(v,j){
      if(v===null||v===undefined||!qs[j]) return;
      var u=qs[j].unit||'—', tp=qs[j].topic||'—';
      chapAgg[u]=chapAgg[u]||{a:0,r:0};   chapAgg[u].a++;   if(v===qs[j].a) chapAgg[u].r++;
      topicAgg[tp]=topicAgg[tp]||{a:0,r:0}; topicAgg[tp].a++; if(v===qs[j].a) topicAgg[tp].r++;
    });
  }
  EXAMS.forEach(function(ex,i){ var s=loadState(i); if(s) fold(ex.questions, s.answers); });
  MCQS.forEach(function(mc,i){ var s=mcqState(i); if(s) fold(mc.questions, s.answers); });
  (XTRA||[]).forEach(function(g,i){ var s=xState(i); if(s) fold(g.questions, s.answers); });
  var weakChapters = {}, weakTopics = {};
  Object.keys(chapAgg).forEach(function(u){ var g=chapAgg[u]; if(g.a>=3 && (g.r/g.a)<0.7) weakChapters[u]=true; });
  Object.keys(topicAgg).forEach(function(t){ var g=topicAgg[t]; if(g.a>=3 && (g.r/g.a)<0.7) weakTopics[t]=true; });

  // Score wrong/flagged candidates
  var byText = {};
  function tag(item, kind){
    var text = String(item.q.q || '');
    if(!byText[text]) byText[text] = { q:item.q, ref:item.ref, score:0, why:{} };
    var s = byText[text];
    if(kind === 'wrong')   { s.score += 8; s.why.wrong = true; }
    if(kind === 'flagged') { s.score += 5; s.why.flagged = true; }
  }
  wrong.forEach(function(i){ tag(i,'wrong'); });
  flagged.forEach(function(i){ tag(i,'flagged'); });

  // Apply all the other signals to whatever we already have
  Object.keys(byText).forEach(function(t){
    var e = byText[t]; var q = e.q;
    if(e.why.wrong && e.why.flagged) { e.score += 4; e.why.doubleSignal = true; }
    if(weakChapters[q.unit||'']) { e.score += 3; e.why.weakChap = true; }
    if(weakTopics[q.topic||'']) { e.score += 2; e.why.weakTopic = true; }
    e.score += _textToughFeatures(q.q);
    // Flashcard confidence: rating 1 or 2 = "still confused"
    var rating = null;
    if(fcRatings && e.ref && fcRatings[e.ref] && typeof fcRatings[e.ref].rating === 'number') rating = fcRatings[e.ref].rating;
    if(rating !== null && rating <= 2) { e.score += 6; e.why.lowConf = true; }
    // Attempt history signals (only present if the student has attempted this question)
    var hist = attempts[_qh(q.q)];
    if(hist && hist.length){
      var wrongs = hist.filter(function(a){return !a.ok;}).length;
      var last = hist[hist.length-1];
      // Multiple wrong attempts across time = truly stuck
      if(wrongs >= 2){ e.score += 10; e.why.repeatWrong = true; }
      // Regression: got it right earlier, wrong now — confidence lost
      if(hist.length >= 2 && hist[hist.length-2].ok && !last.ok){ e.score += 8; e.why.regression = true; }
      // Recency: wrong within the last 3 days
      if(!last.ok && (now - (last.ts||0)) < 3*DAY){ e.score += 3; e.why.recentWrong = true; }
    }
    // Misconception pattern: student has a dominant wrong pick on this topic
    if(q.topic && misconceptions[q.topic]){
      e.score += 2;
      e.why.misconception = misconceptions[q.topic].bias; // stores the biased index
    }
  });

  // Fresh candidates: unanswered questions in weak chapters (real gaps)
  var freshCandidates = [];
  function seed(qs, refPrefix, sourceIdx, stateReader){
    var s = stateReader ? stateReader(sourceIdx) : null;
    qs.forEach(function(q, i){
      var u = q.unit || '';
      if(!weakChapters[u] && !weakTopics[q.topic||'']) return;
      if(s && s.answers && s.answers[i] !== null && s.answers[i] !== undefined) return;
      var text = String(q.q || '');
      if(byText[text]) return;
      var sc = 4 + _textToughFeatures(q.q);
      freshCandidates.push({
        q:q, ref: refPrefix + '_' + sourceIdx + '_' + i,
        score: sc, why:{fresh:true, weakChap:!!weakChapters[u], weakTopic:!!weakTopics[q.topic||'']}
      });
    });
  }
  EXAMS.forEach(function(ex,i){ seed(ex.questions, 'm', i, loadState); });
  MCQS.forEach(function(mc,i){ seed(mc.questions, 'mcq', i, mcqState); });
  (XTRA||[]).forEach(function(g,i){ seed(g.questions, 'xtra', i, xState); });
  for(var f=freshCandidates.length-1; f>0; f--){
    var fj=Math.floor(Math.random()*(f+1));
    var ft=freshCandidates[f]; freshCandidates[f]=freshCandidates[fj]; freshCandidates[fj]=ft;
  }
  freshCandidates.sort(function(a,b){ return b.score - a.score; });

  var scored = Object.keys(byText).map(function(t){ return byText[t]; });
  scored.sort(function(a,b){ return b.score - a.score; });

  // 70% wrong/flagged, 30% fresh weak-area — grow pool for AI reranking
  var poolSize = Math.max(limit, Math.min(50, scored.length + freshCandidates.length));
  var takeScored = Math.min(scored.length, Math.ceil(poolSize * 0.7));
  var raw = scored.slice(0, takeScored);
  var need = poolSize - raw.length;
  if(need > 0) raw = raw.concat(freshCandidates.slice(0, need));

  // ---- Diversify by chapter ----
  // Cap per-chapter to at most Math.ceil(limit / 5) so a single dominant weak chapter
  // doesn't swallow the whole quiz. Overflow goes into a "reserve" bucket that gets
  // dipped into only if we can't fill the pool from other chapters.
  var perChapCap = Math.max(3, Math.ceil(limit / 5));
  var chapCount = {}, primary = [], reserve = [];
  raw.forEach(function(c){
    var u = c.q.unit || '—';
    chapCount[u] = chapCount[u] || 0;
    if(chapCount[u] < perChapCap){ chapCount[u]++; primary.push(c); }
    else reserve.push(c);
  });
  var out = primary.concat(reserve);
  return out;
}

// AI rerank: takes ~40 candidates, sends the student's profile + candidate list to the tutor,
// asks for the top 25 ranked hardest-first for THIS specific student. Result is cached per Part
// so repeatedly opening "Toughest for me" doesn't re-fire the call.
var TOUGH_AI_CACHE_KEY = 'ea3quiz_v2_tough_ai_cache';
function _toughAiCacheGet(){
  try { return JSON.parse(localStorage.getItem(TOUGH_AI_CACHE_KEY)) || {}; } catch(e){ return {}; }
}
function _toughAiCacheSet(all){ try{ localStorage.setItem(TOUGH_AI_CACHE_KEY, JSON.stringify(all)); } catch(e){} }
function _stableQHash(text){
  var s = String(text || '');
  var h = 5381;
  for(var i=0;i<s.length;i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
async function aiRerankToughest(candidates, limit){
  limit = limit || 25;
  if(!candidates || candidates.length <= limit) return candidates; // nothing to rerank
  // Only run for the admin (same gate as the tutor) — costs tokens
  if(typeof isAdminUser !== 'function' || !isAdminUser()) return candidates;
  var authObj = (typeof auth === 'function') ? auth() : null;
  if(!authObj || !authObj.access_token) return candidates; // no auth = no AI

  // Cache check — 6-hour freshness per Part, and refresh if the candidate set has drifted
  var cacheKey = 'p' + (typeof PART!=='undefined'?PART:'?');
  var all = _toughAiCacheGet();
  var currentSig = candidates.map(function(c){ return _stableQHash(c.q.q); }).sort().join(',');
  var currentHash = _stableQHash(currentSig);
  var rec = all[cacheKey];
  var freshMs = 6 * 60 * 60 * 1000;
  if(rec && rec.t && (Date.now() - rec.t) < freshMs && rec.sig === currentHash && Array.isArray(rec.order)){
    // Reorder from cached ranking
    var byHash = {};
    candidates.forEach(function(c){ byHash[_stableQHash(c.q.q)] = c; });
    var ranked = rec.order.map(function(h){ return byHash[h]; }).filter(Boolean);
    // Any candidates the cache didn't rank get appended at the end
    var seen = {}; ranked.forEach(function(c){ seen[_stableQHash(c.q.q)] = true; });
    candidates.forEach(function(c){ if(!seen[_stableQHash(c.q.q)]) ranked.push(c); });
    return ranked.slice(0, limit);
  }

  // Build a compact rerank prompt
  var stats = (typeof _computeLearningStats === 'function') ? null : null;
  var perfLine = '';
  try {
    // Piggyback on the tutor's stat computation if available in scope, else recompute inline
    var chap = {}, topic = {}, tot = 0, ok = 0;
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(!/^ea3quiz_v2_(?:p[12]_)?(?:mock|mcq|extra)_/.test(k)) continue;
      var s=null; try{s=JSON.parse(localStorage.getItem(k));}catch(e){continue;}
      if(!s||!Array.isArray(s.answers)) continue;
      // Skip: we already have chapAgg-like info baked into candidate.why.*
    }
    perfLine = 'The student has flagged and gotten questions wrong across multiple chapters. Their weak areas are indicated by "weak" flags on candidates.';
  } catch(e){}

  var listStr = candidates.map(function(c, idx){
    var h = _stableQHash(c.q.q);
    var whyBits = [];
    if(c.why.repeatWrong)  whyBits.push('REPEAT-WRONG-2plus');
    if(c.why.regression)   whyBits.push('REGRESSION-right-then-wrong');
    if(c.why.recentWrong)  whyBits.push('RECENT-WRONG-3d');
    if(c.why.wrong)        whyBits.push('WRONG');
    if(c.why.flagged)      whyBits.push('FLAGGED');
    if(c.why.doubleSignal) whyBits.push('WRONG+FLAGGED');
    if(c.why.lowConf)      whyBits.push('low-confidence-fc');
    if(c.why.weakChap)     whyBits.push('weak-chapter');
    if(c.why.weakTopic)    whyBits.push('weak-topic');
    if(typeof c.why.misconception==='number') whyBits.push('bias-picks-' + 'ABCD'.charAt(c.why.misconception));
    if(c.why.fresh)        whyBits.push('unanswered');
    return '[' + h + '] score=' + Math.round(c.score) + ' signals=' + whyBits.join('|') +
           ' ch="' + (c.q.unit||'') + '" topic="' + (c.q.topic||'') + '" q="' + String(c.q.q||'').slice(0, 160).replace(/\n/g,' ') + '"';
  }).join('\n');

  // Also gather a compact misconception summary so the AI can plan a coherent progression
  var mc = _computeMisconceptions();
  var mcLines = Object.keys(mc).slice(0, 6).map(function(tp){
    return '- ' + tp + ': student keeps picking option ' + 'ABCD'.charAt(mc[tp].bias) + ' when wrong (' + mc[tp].count + ' data points)';
  }).join('\n');
  var mcBlock = mcLines ? 'KNOWN MISCONCEPTIONS (dominant wrong-choice pattern by topic):\n' + mcLines + '\n\n' : '';

  var prompt =
    'You are building a personalized "toughest questions for me" quiz for an EA-exam student. ' +
    'RANK the candidates below hardest-first FOR THIS SPECIFIC STUDENT, then return the top ' + limit + '.\n\n' +
    'Signal legend (higher-priority first):\n' +
    ' - REPEAT-WRONG-2plus: they have gotten this exact question wrong 2+ times → they are truly stuck\n' +
    ' - REGRESSION-right-then-wrong: they had it right on a prior attempt but got it wrong most recently → confidence lost\n' +
    ' - WRONG+FLAGGED: currently wrong AND marked for review → high-priority\n' +
    ' - RECENT-WRONG-3d: got it wrong within the last 3 days → still fresh in confusion\n' +
    ' - WRONG: current answer is wrong\n' +
    ' - FLAGGED: student marked for review\n' +
    ' - low-confidence-fc: they rated their flashcard confidence 1 or 2 out of 5\n' +
    ' - weak-chapter / weak-topic: their overall accuracy in this area is below 70%\n' +
    ' - bias-picks-X: on this topic the student consistently picks X when wrong (specific misconception)\n' +
    ' - unanswered: fresh question in a weak area\n\n' +
    mcBlock +
    'CANDIDATES (one per line, [hash] = stable id):\n' + listStr + '\n\n' +
    'Sequencing rules:\n' +
    ' 1. Prioritize REPEAT-WRONG > REGRESSION > WRONG+FLAGGED > RECENT-WRONG > WRONG > FLAGGED+lowConf > weak-area\n' +
    ' 2. Diversify across chapters/topics — no more than 2 in a row from the same chapter\n' +
    ' 3. If the student has a known misconception on a topic, include at least 2 questions covering that topic\n' +
    ' 4. Interleave: don\'t front-load all repeat-wrong questions (student will burn out); alternate difficulty\n\n' +
    'Return ONLY a JSON object of the form: {"ids":["<hash1>","<hash2>", ...]} — exactly ' + limit +
    ' hashes if available, ordered per the rules above. No prose, no code fences, just the JSON.';

  var response = '';
  try {
    // Same CORS reason as the tutor's send(): skip Authorization until the worker's
    // Access-Control-Allow-Headers is updated to include it.
    var res = await fetch('https://ea-ai.tr78601234.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    });
    if(!res.ok || !res.body) return candidates;
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    while(true){
      var chunk = await reader.read();
      if(chunk.done) break;
      response += decoder.decode(chunk.value, { stream: true });
    }
  } catch(e){ return candidates; }

  // Extract JSON — Gemini sometimes wraps in code fences
  var jsonMatch = response.match(/\{[\s\S]*\}/);
  if(!jsonMatch) return candidates;
  var parsed = null;
  try { parsed = JSON.parse(jsonMatch[0]); } catch(e){ return candidates; }
  var ids = parsed && Array.isArray(parsed.ids) ? parsed.ids : null;
  if(!ids || !ids.length) return candidates;

  // Persist ranking
  all[cacheKey] = { t: Date.now(), sig: currentHash, order: ids };
  _toughAiCacheSet(all);

  var byHash = {};
  candidates.forEach(function(c){ byHash[_stableQHash(c.q.q)] = c; });
  var ranked = ids.map(function(h){ return byHash[h]; }).filter(Boolean);
  var seen = {}; ranked.forEach(function(c){ seen[_stableQHash(c.q.q)] = true; });
  candidates.forEach(function(c){ if(!seen[_stableQHash(c.q.q)]) ranked.push(c); });
  return ranked.slice(0, limit);
}

async function startToughestForMe(){
  var poolLimit = 40; // send more candidates to the AI for reranking
  var pool = collectToughestForMe(poolLimit);
  if(!pool.length){
    alert('Nothing to build yet — answer some questions first (and flag the ones that confused you). Then this will curate the hardest of them for you.');
    return;
  }
  // Show a light loading state on the tile
  var tileBtn = document.getElementById('toughBtn');
  var originalSubEl = tileBtn && tileBtn.querySelector('.sub');
  var originalSub = originalSubEl ? originalSubEl.textContent : '';
  if(originalSubEl) originalSubEl.textContent = 'Ranking with AI…';
  var items;
  try {
    items = await aiRerankToughest(pool, 25);
  } catch(e) {
    items = pool.slice(0, 25); // safe fallback
  }
  if(originalSubEl) originalSubEl.textContent = originalSub;
  if(!items.length){ items = pool.slice(0, 25); }

  exam = -10;
  QUESTIONS = items.map(function(d){ return d.q; });
  REVIEW_REFS = items.map(function(d){ return d.ref; });
  st = makeState(QUESTIONS.length, QUESTIONS, true, 'practice');
  st.review = true; pos = 0;
  enterQuiz();
}


// ============================================================================
