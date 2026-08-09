// ==== FLASHCARDS (Brainscape-style CBR)
// ============================================================================
// ---------- Flashcards (Brainscape-style Confidence-Based Repetition) ----------
// Each card has a 1-5 confidence rating. Ratings persist in localStorage and sync via Supabase.
// Cards are per-chapter Forms + Key Numbers, wrapped straight from Chapter Notes
// data — no lookup or generation needed, front/back is already book data.
var FC_RATINGS_KEY='ea3quiz_v2_fcRatings';
var FC_SESSION_SIZE=10;
var FC_DECK=[], FC_POS=0, FC_REVEALED=false, FC_HISTORY=[];
var FC_CURRENT_CONCEPT=null; // { front, back }
// FC_TITLE/FC_POOL/FC_EXIT_FN/FC_RESTART_FN are set by startChapterFlashcards()
// per session so the same render/rating engine can be entered either from a
// chapter's own Notes page or from the top-level chapter picker, each wanting
// a different "exit"/"restart" target.
var FC_TITLE=null;          // header text; null falls back to the part name
var FC_POOL=[];             // the full candidate set mastery% is computed against
var FC_EXIT_FN=null;        // called on exit; null falls back to showMenu
var FC_RESTART_FN=null;     // called by "Start another session"; null falls back to showMenu

function loadFcRatings(){ try{return JSON.parse(localStorage.getItem(FC_RATINGS_KEY))||{};}catch(e){return {};} }
function saveFcRatings(r){ try{localStorage.setItem(FC_RATINGS_KEY,JSON.stringify(r));}catch(e){} }
function setFcRating(ref, rating){
  var r=loadFcRatings();
  r[ref]={r:rating, t:Date.now()};
  saveFcRatings(r);
}

function fcMasteryPct(pool){
  pool = pool || [];
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

// Chapter concept cards carry their front/back already built (see
// buildChapterCardPool below) — nothing to look up or generate, they ARE the concept.
function ensureConceptForCurrent(){
  var item=FC_DECK[FC_POS];
  FC_CURRENT_CONCEPT = item ? item.concept : null;
}

// ---- Per-chapter concept cards: Forms + Key Numbers, showcased as flashcards ----
// The curated Chapter Notes data (data.js -> CHNOTES) is already front/back
// shaped, so each card just wraps one form or one key-number entry directly.
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
// exitFn lets callers choose where "Exit" lands: the Chapter Notes page's own
// button wants to return to that chapter, while the top-level chapter picker
// (chapterFlashcardsList) wants to return to itself so picking another
// chapter is one tap instead of a detour through Chapter Notes.
function startChapterFlashcards(unit,exitFn){
  var pool=buildChapterCardPool(unit);
  if(!pool.length){ alert('No flashcards available for this chapter yet.'); return; }
  var u=CHNOTES[PART][String(unit)];
  FC_TITLE='SU '+unit+': '+u.t+' — Flashcards';
  FC_POOL=pool;
  FC_EXIT_FN=exitFn || function(){ showNotes(String(unit)); };
  FC_RESTART_FN=function(){ startChapterFlashcards(unit,exitFn); };
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

// Top-level entry point (Reference tile on the menu) — pick a chapter, then
// straight into that chapter's flashcards, no detour through Chapter Notes.
function chapterFlashcardsList(){
  markView('chapfclist');
  setFloatBack(goBack,'← Back');
  side.classList.remove('active','open'); document.body.classList.remove('inquiz'); stopTimer(); stopClock();
  document.getElementById('counter').textContent=PARTS[PART].name+' — Chapter Flashcards';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  var C=CHNOTES[PART];
  if(!C){card.innerHTML='<div class="end"><h2>🧠 Chapter Flashcards</h2><p style="margin:14px 0">No study-guide notes are loaded for this part yet.</p><button class="restart" id="menu">Exam Menu</button></div>';document.getElementById('menu').onclick=showMenu;return;}
  var h='<h2 style="margin-bottom:6px">🧠 Chapter Flashcards <span style="font-weight:400;color:var(--muted);font-size:14px">— '+PARTS[PART].name+'</span></h2>'+
    '<p style="color:var(--muted);font-size:14px;margin-bottom:14px">Pick a chapter to study its forms, key numbers &amp; deadlines as flashcards.</p>';
  Object.keys(C).sort(function(a,b){return a-b;}).forEach(function(n){
    var u=C[n], count=chapterCardCount(n);
    h+='<button class="opt" data-cfc="'+n+'"'+(count?'':' disabled style="opacity:.5;cursor:default"')+'><b>SU '+n+': '+esc(u.t)+'</b><br>'+
       '<span style="color:var(--muted);font-size:13px">'+(count?count+' cards — '+(u.f?u.f.length:0)+' forms, '+(u.k?u.k.length:0)+' key numbers':'no cards yet')+'</span></button>';
  });
  h+='<div class="nav2"><button class="navbtn" id="cfcBack">← Exam Menu</button><span></span></div>';
  card.innerHTML=h;
  card.querySelectorAll('[data-cfc]').forEach(function(b){b.onclick=function(){startChapterFlashcards(b.dataset.cfc,chapterFlashcardsList);};});
  document.getElementById('cfcBack').onclick=showMenu;
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
    document.getElementById('fcRestart').onclick=FC_RESTART_FN||showMenu;
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

  if(!FC_REVEALED){
    html+='<div class="fc-label">Topic</div>'+
      '<div class="fc-q">'+esc(concept.front)+'</div>'+
      '<div class="fc-tap-hint">Tap card, or press <b>Space</b>/<b>→</b>, to reveal</div>';
  } else {
    html+='<div class="fc-label">Key fact</div>'+
      '<div class="fc-q" style="margin-bottom:16px">'+esc(concept.front)+'</div>'+
      '<div class="fc-answer-box" style="text-align:left">'+esc(concept.back).replace(/\n/g,'<br>')+'</div>'+
      (concept.source?'<div style="font-size:11px;color:var(--muted);margin-top:12px;text-align:center;letter-spacing:.5px">📘 '+esc(concept.source)+'</div>':'');
  }
  html+='</div>';

  if(FC_REVEALED){
    html+='<div class="fc-rate-hd">How well did you know it? <span style="opacity:.6">(press 1–5, or Space/→ for "kinda")</span></div>'+
      '<div class="fc-rate">'+
        '<button class="fc-r1" data-r="1">1<small>No clue</small></button>'+
        '<button class="fc-r2" data-r="2">2<small>Barely</small></button>'+
        '<button class="fc-r3" data-r="3">3<small>Kinda</small></button>'+
        '<button class="fc-r4" data-r="4">4<small>Pretty sure</small></button>'+
        '<button class="fc-r5" data-r="5">5<small>Know it cold</small></button>'+
      '</div>';
    if(currentRating){
      html+='<p style="text-align:center;font-size:12px;color:var(--muted);margin-top:12px">Last rating: <b>'+currentRating+'/5</b></p>';
    }
  }

  html+='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px">'+
    '<button class="mpill" id="fcPrevBtn"'+(FC_HISTORY.length?'':' disabled style="opacity:.4;cursor:default"')+'>← Previous</button>'+
    '<span style="font-size:11px;color:var(--muted)">← previous · Space/→ '+(FC_REVEALED?'next':'reveal')+'</span>'+
    '<button class="mpill" id="fcNextBtn">'+(FC_REVEALED?'Next →':'Reveal →')+'</button>'+
  '</div>';

  html+='</div>';
  card.innerHTML=html;

  var fcCard=document.getElementById('fcCard');
  if(fcCard && !FC_REVEALED){
    fcCard.onclick=function(){ FC_REVEALED=true; renderFlashcard(); };
  }
  card.querySelectorAll('[data-r]').forEach(function(b){
    b.onclick=function(e){ e.stopPropagation(); rateCurrentCard(+b.dataset.r); };
  });
  var _fcExit=document.getElementById('fcExitTop');
  if(_fcExit)_fcExit.onclick=function(){
    if(confirm('Exit flashcards? Your ratings are saved.')){ unbindFcKeys(); fcExit(); }
  };
  var _fcPrev=document.getElementById('fcPrevBtn');
  if(_fcPrev && FC_HISTORY.length) _fcPrev.onclick=function(e){ e.stopPropagation(); fcPrevCard(); };
  var _fcNext=document.getElementById('fcNextBtn');
  if(_fcNext) _fcNext.onclick=function(e){ e.stopPropagation(); fcAdvance(); };
}

// Shared "keep moving" action for Space, → and the on-screen Next button:
// reveal the card if it's still face-down, otherwise rate it "kinda" (3) and
// advance — so repeatedly pressing the same key/button steps through the deck.
function fcAdvance(){
  if(!FC_CURRENT_CONCEPT) return;
  if(!FC_REVEALED){ FC_REVEALED=true; renderFlashcard(); }
  else { rateCurrentCard(3); }
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
// ---- keyboard shortcuts (only active during flashcard view) ----
// Space and → both drive fcAdvance() (reveal, then advance) so holding down
// or repeatedly tapping either one steps through the whole deck. ← always
// goes back a card, revealed or not.
var _fcKeyHandler=null;
function bindFcKeys(){
  if(_fcKeyHandler) return;
  _fcKeyHandler=function(e){
    // Ignore if typing in an input
    var tag=(e.target && e.target.tagName)||'';
    if(tag==='INPUT'||tag==='TEXTAREA') return;
    // Only active on flashcard view. (Not document.body's nonexistent
    // "data-view" attribute — nothing in the app ever sets that; CURVIEW is
    // the real view marker markView() maintains.)
    if(!CURVIEW || CURVIEW.kind!=='flashcards') return;
    if(e.key===' '||e.key==='Spacebar'||e.key==='ArrowRight'){
      e.preventDefault();
      fcAdvance();
    } else if(/^[1-5]$/.test(e.key) && FC_REVEALED){
      e.preventDefault();
      rateCurrentCard(+e.key);
    } else if(e.key==='Escape'){
      e.preventDefault();
      if(confirm('Exit flashcards? Your ratings are saved.')){ unbindFcKeys(); fcExit(); }
    } else if(e.key==='ArrowLeft'){
      e.preventDefault();
      fcPrevCard();
    }
  };
  document.addEventListener('keydown', _fcKeyHandler);
}
function unbindFcKeys(){
  if(_fcKeyHandler){ document.removeEventListener('keydown', _fcKeyHandler); _fcKeyHandler=null; }
}

// ============================================================================
