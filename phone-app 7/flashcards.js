// ==== FLASHCARDS (Brainscape-style CBR)
// ============================================================================
// ---------- Flashcards (Brainscape-style Confidence-Based Repetition + AI concept generation) ----------
// Each card has a 1-5 confidence rating. Ratings persist in localStorage and sync via Supabase.
// Content is AI-generated: quiz Q + correct answer + explanation → concept card (front/back).
// Cached so each card is only generated once per question.
var FC_RATINGS_KEY='ea3quiz_v2_fcRatings';
var FC_CONCEPTS_KEY='ea3quiz_v2_fcConcepts_v2'; // v2: book-sourced instead of AI-generated
var FC_SESSION_SIZE=10;
var FC_DECK=[], FC_POS=0, FC_REVEALED=false, FC_HISTORY=[];
var FC_CURRENT_CONCEPT=null; // { front, back } or null while loading
// Mode plumbing so the same deck/render/rating engine can serve more than one
// flashcard flow (wrong-answer review vs. per-chapter concept cards) without
// duplicating it. Each start*Flashcards() function sets these; render/exit/
// restart code reads them instead of assuming "wrong answers".
var FC_TITLE=null;          // header text; null falls back to the part name
var FC_POOL=[];             // the full candidate set mastery% is computed against
var FC_EXIT_FN=null;        // called on exit; null falls back to showMenu
var FC_RESTART_FN=null;     // called by "Start another session"; null falls back to startFlashcards

function loadFcRatings(){ try{return JSON.parse(localStorage.getItem(FC_RATINGS_KEY))||{};}catch(e){return {};} }
function saveFcRatings(r){ try{localStorage.setItem(FC_RATINGS_KEY,JSON.stringify(r));}catch(e){} }
function setFcRating(ref, rating){
  var r=loadFcRatings();
  r[ref]={r:rating, t:Date.now()};
  saveFcRatings(r);
}
function loadFcConcepts(){ try{return JSON.parse(localStorage.getItem(FC_CONCEPTS_KEY))||{};}catch(e){return {};} }
function saveFcConcepts(c){ try{localStorage.setItem(FC_CONCEPTS_KEY,JSON.stringify(c));}catch(e){} }

function fcMasteryPct(pool){
  pool = pool || collectWrong();
  if(!pool.length) return 0;
  var r=loadFcRatings();
  var total=0;
  pool.forEach(function(w){
    var entry=r[w.ref];
    total += entry ? entry.r : 0;
  });
  return Math.round((total / (pool.length * 5)) * 100);
}
function pickWeightedDeck(pool, ratings, size){
  var weighted=pool.map(function(item){
    var entry=ratings[item.ref];
    var confidence=entry ? entry.r : 0;
    var weight = confidence===0 ? 5 : (7 - confidence);
    return {item:item, weight:weight};
  });
  var picked=[];
  var pickCount=Math.min(size, weighted.length);
  for(var i=0;i<pickCount;i++){
    var totalW=weighted.reduce(function(t,x){return t+x.weight;},0);
    var roll=Math.random()*totalW;
    var idx=0;
    for(var j=0;j<weighted.length;j++){
      roll -= weighted[j].weight;
      if(roll<=0){ idx=j; break; }
    }
    picked.push(weighted[idx].item);
    weighted.splice(idx,1);
  }
  return picked;
}

// Find the most relevant chapter-notes section for a given wrong question.
// Returns { front, back, source } or null if no match.
function findBookConcept(item){
  var q = item.q;
  if(!CHNOTES[PART] || !q.unit) return null;

  // Extract search terms: topic + significant words from the question and correct answer
  var stop = {the:1,a:1,an:1,is:1,are:1,was:1,were:1,of:1,to:1,in:1,on:1,at:1,for:1,with:1,by:1,and:1,or:1,but:1,not:1,which:1,following:1,what:1,when:1,where:1,who:1,how:1,does:1,do:1,did:1,has:1,have:1,had:1,be:1,been:1,being:1,this:1,that:1,these:1,those:1,it:1,as:1,if:1,then:1,than:1,from:1,into:1,about:1,taxpayer:1,taxpayers:1,any:1,all:1,each:1,every:1,some:1,except:1,following:1,statement:1,statements:1,true:1,false:1};

  function tokens(str){
    return String(str||'').toLowerCase()
      .replace(/[^a-z0-9§\s]/g,' ')
      .split(/\s+/)
      .filter(function(w){ return w.length>2 && !stop[w]; });
  }

  var qTokens = tokens(q.q + ' ' + (q.topic||'') + ' ' + q.opts[q.a]);
  if(!qTokens.length) return null;
  var tokenSet = {};
  qTokens.forEach(function(t){ tokenSet[t]=(tokenSet[t]||0)+1; });

  // Score every section in the current part's chapter notes
  var best = null;
  var C = CHNOTES[PART];
  Object.keys(C).forEach(function(unitNum){
    var u = C[unitNum];
    if(!u || !u.s) return;
    // Boost score if this section is in the same unit as the question
    var unitBoost = (String(unitNum) === String(q.unit) || (u.t && q.unit && u.t.toLowerCase().indexOf(String(q.unit).toLowerCase())>=0)) ? 3 : 0;
    u.s.forEach(function(sec, si){
      if(!sec.b || !sec.b.length) return;
      var body = sec.t + ' ' + sec.b.join(' ');
      var bodyLower = body.toLowerCase();
      var score = unitBoost;
      Object.keys(tokenSet).forEach(function(t){
        // count occurrences (approximate)
        var re = new RegExp('\\b'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi');
        var matches = bodyLower.match(re);
        if(matches) score += matches.length;
      });
      if(!best || score > best.score){
        best = { score:score, unit:unitNum, unitTitle:u.t, sec:sec, si:si };
      }
    });
  });

  if(!best || best.score < 3) return null; // require a minimum relevance

  // Format the answer using the actual book section
  var body = best.sec.b.slice(0, 6).join('\n\n'); // up to 6 paragraphs to keep it focused
  var back = body;
  if(best.sec.b.length > 6){
    back += '\n\n(Additional detail in SU ' + best.unit + ' — see full Chapter Notes)';
  }

  // Front: Use the topic if available, otherwise a concept-based prompt
  var front = q.topic
    ? 'Explain: ' + q.topic
    : (q.q.length < 120 ? q.q : q.q.slice(0,120)+'…');

  return {
    front: front,
    back: back,
    source: 'SU ' + best.unit + (best.sec.t ? ' — ' + best.sec.t : '')
  };
}

// Ask the AI Worker as a fallback ONLY when no book match found.
// We include the verified question + correct answer + why so it can't invent facts.
async function generateConceptCard(item){
  // First try to find it in the book
  var bookConcept = findBookConcept(item);
  if(bookConcept) return bookConcept;

  // Fallback: use the verified quiz data as-is (no AI hallucination)
  var q = item.q;
  var correctLetter = String.fromCharCode(65+q.a);
  var back = 'Correct answer (' + correctLetter + '): ' + q.opts[q.a];
  if(q.why) back += '\n\n' + q.why;
  return {
    front: q.topic ? 'Recall: ' + q.topic : q.q,
    back: back,
    source: 'From your question bank'
  };
}

async function ensureConceptForCurrent(){
  var item=FC_DECK[FC_POS];
  if(!item) return;
  // Chapter concept cards carry their front/back already built — no lookup or
  // AI generation needed, they ARE the concept.
  if(item.concept){
    FC_CURRENT_CONCEPT = item.concept;
    return;
  }
  var concepts=loadFcConcepts();
  if(concepts[item.ref]){
    FC_CURRENT_CONCEPT = concepts[item.ref];
    return;
  }
  // Book lookup is synchronous — no loading state needed
  var generated = await generateConceptCard(item);
  if(!FC_DECK[FC_POS] || FC_DECK[FC_POS].ref !== item.ref) return;
  if(generated){
    var c=loadFcConcepts();
    c[item.ref]=generated;
    saveFcConcepts(c);
    FC_CURRENT_CONCEPT = generated;
  }
  renderFlashcard();
}

// Preload not needed anymore since book lookup is instant, but keep for API compatibility
function prefetchUpcoming(){ /* no-op — cards are now instant from book */ }

function startFlashcards(){
  var wrong=collectWrong();
  if(!wrong.length){ alert('No wrong questions yet — flashcards appear here once you have some to review.'); return; }
  FC_TITLE=null;
  FC_POOL=wrong;
  FC_EXIT_FN=null;
  FC_RESTART_FN=null;
  var ratings=loadFcRatings();
  FC_DECK=pickWeightedDeck(wrong, ratings, FC_SESSION_SIZE);
  FC_POS=0;
  FC_REVEALED=false;
  FC_HISTORY=[];
  FC_CURRENT_CONCEPT=null;
  bindFcKeys();
  ensureConceptForCurrent();
  renderFlashcard();
}

// ---- Per-chapter concept cards: Forms + Key Numbers, showcased as flashcards ----
// Unlike the wrong-answer deck above, these cards need no lookup or AI
// generation — the curated Chapter Notes data (data.js -> CHNOTES) already
// IS front/back-shaped, so each card just wraps one form or one key-number
// entry directly.
function chapterCardCount(unit){
  var u=CHNOTES[PART] && CHNOTES[PART][String(unit)];
  if(!u) return 0;
  return (u.f?u.f.length:0) + (u.k?u.k.length:0);
}
function buildChapterCardPool(unit){
  unit=String(unit);
  var u=CHNOTES[PART] && CHNOTES[PART][unit];
  if(!u) return [];
  var refBase='chapfc_p'+PART+'_'+unit+'_';
  var pool=[];
  (u.f||[]).forEach(function(f,i){
    var front='📄 '+f.f+(f.ttl?' — '+f.ttl:'');
    var back=f.t + (f.bk ? '\n\n'+(f.bksec?f.bksec+': ':'')+f.bk : '');
    pool.push({ref:refBase+'f'+i, concept:{front:front, back:back, source:'SU '+unit+' — Forms'}});
  });
  (u.k||[]).forEach(function(x,i){
    pool.push({ref:refBase+'k'+i, concept:{front:x.sec, back:x.t, source:'SU '+unit+' — Key Numbers'}});
  });
  return pool;
}
function startChapterFlashcards(unit){
  var pool=buildChapterCardPool(unit);
  if(!pool.length){ alert('No flashcards available for this chapter yet.'); return; }
  var u=CHNOTES[PART][String(unit)];
  FC_TITLE='SU '+unit+': '+u.t+' — Flashcards';
  FC_POOL=pool;
  FC_EXIT_FN=function(){ showNotes(String(unit)); };
  FC_RESTART_FN=function(){ startChapterFlashcards(unit); };
  var ratings=loadFcRatings();
  FC_DECK=pickWeightedDeck(pool, ratings, pool.length); // show the whole chapter, weakest-first-biased order
  FC_POS=0;
  FC_REVEALED=false;
  FC_HISTORY=[];
  FC_CURRENT_CONCEPT=null;
  bindFcKeys();
  ensureConceptForCurrent();
  renderFlashcard();
}

function fcExit(){ (FC_EXIT_FN||showMenu)(); }
function renderFlashcard(){
  side.classList.remove('active','open'); document.body.classList.remove('inquiz'); stopTimer(); stopClock();
  markView('flashcards');
  setFloatBack(function(){ if(confirm('Exit flashcards? Your ratings are saved.')){unbindFcKeys();fcExit();} }, '← Exit');
  document.getElementById('counter').textContent=FC_TITLE || ('Flashcards — '+PARTS[PART].name);
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width=Math.round((FC_POS/FC_DECK.length)*100)+'%';

  var mastery=fcMasteryPct(FC_POOL);

  if(FC_POS>=FC_DECK.length){
    unbindFcKeys();
    card.innerHTML='<div class="fc-wrap"><div class="fc-done">'+
      '<h2>🎯 Session complete</h2>'+
      '<p>You reviewed '+FC_DECK.length+' card'+(FC_DECK.length===1?'':'s')+'.</p>'+
      '<div class="fc-mastery-big">'+mastery+'%</div>'+
      '<p style="font-size:13px">overall mastery</p>'+
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:24px">'+
        '<button class="mpill" id="fcRestart" style="padding:10px 18px">Start another session</button>'+
        '<button class="mpill" id="fcExit" style="padding:10px 18px">Back to menu</button>'+
      '</div></div></div>';
    document.getElementById('fcRestart').onclick=FC_RESTART_FN||startFlashcards;
    document.getElementById('fcExit').onclick=function(){unbindFcKeys();fcExit();};
    return;
  }

  var item=FC_DECK[FC_POS];
  var currentRating=(loadFcRatings()[item.ref]||{}).r || 0;
  var concept = FC_CURRENT_CONCEPT;

  var html='<div class="fc-wrap">'+
    '<div class="fc-topbar">'+
      '<button class="mpill" id="fcExitTop" title="Exit flashcards (Esc)" style="padding:6px 12px;font-size:13px">← Exit</button>'+
      '<span>Card '+(FC_POS+1)+' of '+FC_DECK.length+'</span>'+
      '<span class="fc-mastery" title="Overall mastery across this deck"><span>Mastery</span>'+
        '<span class="fc-mastery-bar"><i style="width:'+mastery+'%"></i></span>'+
        '<b style="color:var(--ink)">'+mastery+'%</b>'+
      '</span>'+
    '</div>'+
    '<div class="fc-card '+(FC_REVEALED?'back':'')+'" id="fcCard">';

  if(!concept){
    // Still generating
    html+='<div class="fc-label">Generating card…</div>'+
      '<div class="ai-typing" style="justify-content:center;margin:20px 0"><span></span><span></span><span></span></div>'+
      '<div class="fc-tap-hint">AI is turning this into a concept card</div>';
  } else if(!FC_REVEALED){
    html+='<div class="fc-label">'+(item.concept?'Topic':'Question')+'</div>'+
      '<div class="fc-q">'+esc(concept.front)+'</div>'+
      '<div class="fc-tap-hint">Tap to reveal · <b>Space</b></div>';
  } else {
    html+='<div class="fc-label">'+(item.concept?'Key fact':'Answer')+'</div>'+
      '<div class="fc-q" style="margin-bottom:16px">'+esc(concept.front)+'</div>'+
      '<div class="fc-answer-box" style="text-align:left">'+esc(concept.back).replace(/\n/g,'<br>')+'</div>'+
      (concept.source?'<div style="font-size:11px;color:var(--muted);margin-top:12px;text-align:center;letter-spacing:.5px">📘 '+esc(concept.source)+'</div>':'');
  }
  html+='</div>';

  if(FC_REVEALED && concept){
    html+='<div class="fc-rate-hd">How well did you know it? <span style="opacity:.6">(press 1–5)</span></div>'+
      '<div class="fc-rate">'+
        '<button class="fc-r1" data-r="1">1<small>No clue</small></button>'+
        '<button class="fc-r2" data-r="2">2<small>Barely</small></button>'+
        '<button class="fc-r3" data-r="3">3<small>Kinda</small></button>'+
        '<button class="fc-r4" data-r="4">4<small>Pretty sure</small></button>'+
        '<button class="fc-r5" data-r="5">5<small>Know it cold</small></button>'+
      '</div>';
    var canRegen=!item.concept; // chapter cards are book data, not AI-generated — nothing to regenerate
    if(currentRating){
      html+='<p style="text-align:center;font-size:12px;color:var(--muted);margin-top:12px">Last rating: <b>'+currentRating+'/5</b>'+(canRegen?' · Press <b>R</b> to regenerate this card':'')+'</p>';
    } else {
      html+='<p style="text-align:center;font-size:12px;color:var(--muted);margin-top:12px">'+(canRegen?'Press <b>R</b> to regenerate · ':'')+'<b>←</b> previous</p>';
    }
  }
  html+='</div>';
  card.innerHTML=html;

  var fcCard=document.getElementById('fcCard');
  if(fcCard && concept && !FC_REVEALED){
    fcCard.onclick=function(){ FC_REVEALED=true; renderFlashcard(); };
  }
  card.querySelectorAll('[data-r]').forEach(function(b){
    b.onclick=function(e){ e.stopPropagation(); rateCurrentCard(+b.dataset.r); };
  });
  var _fcExit=document.getElementById('fcExitTop');
  if(_fcExit)_fcExit.onclick=function(){
    if(confirm('Exit flashcards? Your ratings are saved.')){ unbindFcKeys(); fcExit(); }
  };
}

function rateCurrentCard(rating){
  var current=FC_DECK[FC_POS];
  if(!current) return;
  setFcRating(current.ref, rating);
  FC_HISTORY.push({pos:FC_POS, concept:FC_CURRENT_CONCEPT});
  FC_POS++;
  FC_REVEALED=false;
  FC_CURRENT_CONCEPT=null;
  ensureConceptForCurrent();
  renderFlashcard();
}
function fcPrevCard(){
  if(FC_HISTORY.length===0) return;
  var last=FC_HISTORY.pop();
  FC_POS=last.pos;
  FC_CURRENT_CONCEPT=last.concept;
  FC_REVEALED=false;
  renderFlashcard();
}
function fcRegenerateCurrent(){
  var item=FC_DECK[FC_POS]; if(!item) return;
  var concepts=loadFcConcepts();
  delete concepts[item.ref];
  saveFcConcepts(concepts);
  FC_CURRENT_CONCEPT=null;
  FC_REVEALED=false;
  ensureConceptForCurrent();
  renderFlashcard();
}

// ---- keyboard shortcuts (only active during flashcard view) ----
var _fcKeyHandler=null;
function bindFcKeys(){
  if(_fcKeyHandler) return;
  _fcKeyHandler=function(e){
    // Ignore if typing in an input
    var tag=(e.target && e.target.tagName)||'';
    if(tag==='INPUT'||tag==='TEXTAREA') return;
    // Only active on flashcard view
    if(document.body.getAttribute('data-view')!=='flashcards') return;
    if(e.key===' '||e.key==='Spacebar'){
      e.preventDefault();
      if(!FC_CURRENT_CONCEPT) return;
      if(!FC_REVEALED){ FC_REVEALED=true; renderFlashcard(); }
      else { rateCurrentCard(3); } // Space after reveal = neutral "kinda" and advance
    } else if(/^[1-5]$/.test(e.key) && FC_REVEALED){
      e.preventDefault();
      rateCurrentCard(+e.key);
    } else if(e.key==='Escape'){
      e.preventDefault();
      if(confirm('Exit flashcards? Your ratings are saved.')){ unbindFcKeys(); fcExit(); }
    } else if(e.key==='ArrowLeft'){
      e.preventDefault();
      fcPrevCard();
    } else if(e.key==='r'||e.key==='R'){
      e.preventDefault();
      fcRegenerateCurrent();
    }
  };
  document.addEventListener('keydown', _fcKeyHandler);
}
function unbindFcKeys(){
  if(_fcKeyHandler){ document.removeEventListener('keydown', _fcKeyHandler); _fcKeyHandler=null; }
}

// ============================================================================
