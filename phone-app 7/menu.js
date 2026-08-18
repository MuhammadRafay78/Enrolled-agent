// ==== DARK MODE
// ============================================================================
// ---------- dark mode ----------
var THEMES=[
  {id:'light',   label:'Light',      icon:'☀️',  cls:'',         sw:'#f4f6f9'},
  {id:'dim',     label:'Dim',        icon:'🌑',  cls:'dim',      sw:'#1a1e26'},
  {id:'dark',    label:'Dark',       icon:'🌒',  cls:'dark',     sw:'#14181f'},
  {id:'midnight',label:'Midnight',   icon:'🌌',  cls:'midnight', sw:'#0a0d13'},
  {id:'dracula', label:'Dracula',    icon:'🧛',  cls:'dracula',  sw:'#282a36'},
  {id:'solarized',label:'Solarized', icon:'🧭',  cls:'solarized',sw:'#002b36'},
  {id:'tokyo',   label:'Tokyo Night',icon:'🗼',  cls:'tokyo',    sw:'#1a1b26'},
  {id:'forest',  label:'Forest',     icon:'🌲',  cls:'forest',   sw:'#1a2418'},
  {id:'amber',   label:'Amber',      icon:'🕯️',  cls:'amber',    sw:'#1a1408'}
];
var THEME_CLASSES=['dim','dark','slate','midnight','onyx','dracula','solarized','tokyo','forest','amber','sepia','ocean','warm','nord','rose','hc','is-dark'];
function applyTheme(id){
  var t=THEMES.find(function(x){return x.id===id;})||THEMES[0];
  var b=document.body;
  THEME_CLASSES.forEach(function(c){ b.classList.remove(c); });
  if(t.cls) b.classList.add(t.cls);
  // Mark the body as "is-dark" for any non-light theme so shared dark-mode
  // sub-element styling applies across every dark variant.
  if(t.cls) b.classList.add('is-dark');
  // Force a reflow so subsequent paint uses the new theme cleanly.
  void b.offsetHeight;
  var btn=document.getElementById('darkToggle');
  if(btn){ btn.textContent=t.icon; btn.title='Theme: '+t.label+' (click to change)'; }
  try{localStorage.setItem('ea_theme_local',t.id);}catch(err){}
  // legacy write for anything still reading ea3quiz_dark — but do NOT write ea3quiz_theme (would sync across devices)
  try{localStorage.setItem('ea3quiz_dark', (t.cls?'1':'0'));}catch(err){}
}
function initDark(){
  var saved=null;
  try{ saved=localStorage.getItem('ea_theme_local'); }catch(err){}
  if(!saved){
    // migrate legacy synced theme key
    try{ saved=localStorage.getItem('ea3quiz_theme'); if(saved) localStorage.setItem('ea_theme_local',saved); }catch(err){}
  }
  if(!saved){
    try{ if(localStorage.getItem('ea3quiz_dark')==='1') saved='dark'; }catch(err){}
  }
  // Retired themes map to the closest current one
  var retired={ocean:'tokyo',warm:'amber',nord:'tokyo',rose:'dracula',sepia:'light',hc:'dark',slate:'midnight',onyx:'midnight'};
  if(saved && retired[saved]) saved=retired[saved];
  applyTheme(saved||'light');
  // Purge the now-unused synced key so it doesn't clash with the local one.
  try{ localStorage.removeItem('ea3quiz_theme'); }catch(err){}
  var b=document.getElementById('darkToggle'); if(!b)return;
  b.onclick=function(ev){
    ev.stopPropagation();
    var cur=(function(){try{return localStorage.getItem('ea_theme_local');}catch(e){return null;}})()||'light';
    var old=document.getElementById('themePop'); if(old){old.remove(); return;}
    var pop=document.createElement('div');
    pop.id='themePop'; pop.className='themepop';
    pop.innerHTML='<div class="tphd">Theme</div><div class="tpgrid">'+
      THEMES.map(function(t){return '<button class="tpitem'+(t.id===cur?" sel":"")+'" data-tid="'+t.id+'">'+
        '<span class="tpsw" style="background:'+t.sw+'"></span>'+
        '<span class="tpname">'+t.label+'</span></button>';}).join('')+'</div>';
    document.body.appendChild(pop);
    var r=b.getBoundingClientRect();
    pop.style.top=(r.bottom+8+window.scrollY)+'px';
    pop.style.right=Math.max(8, window.innerWidth-r.right)+'px';
    pop.querySelectorAll('[data-tid]').forEach(function(el){
      el.onclick=function(){ applyTheme(el.dataset.tid); pop.remove(); };
    });
    setTimeout(function(){
      var close=function(e){ if(!pop.contains(e.target)){ pop.remove(); document.removeEventListener('click',close); } };
      document.addEventListener('click',close);
    },0);
  };
}

// ============================================================================
// ==== EXAM TIMER (3:30 countdown)
// ============================================================================
// ---------- timer ----------
function fmtMs(ms){
  if(ms<0)ms=0;
  const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
  return h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function stopTimer(){if(timerInt){clearInterval(timerInt);timerInt=null;}}
function tickTimer(){
  if(!st||st.mode!=='exam'||st.examDone){stopTimer();return;}
  const rem=EXAM_MS-(Date.now()-st.examStart);
  const c=counts();
  document.getElementById('score').textContent='⏱ '+fmtMs(rem)+' · '+c.ans+'/'+QUESTIONS.length;
  if(rem<=0){submitExam(true);}
}
function startTimerIfNeeded(){
  stopTimer();
  if(st&&st.mode==='exam'&&!st.examDone){
    if(EXAM_MS-(Date.now()-st.examStart)<=0){submitExam(true);return;}
    timerInt=setInterval(tickTimer,1000);tickTimer();
  }
}
// ---------- menu ----------

// ============================================================================
// ==== MENU: showParts, showMenu (dashboard)
// ============================================================================
// ---------- part landing ----------
var PART=3;
function partCounts(p){
  var d=PARTS[p];
  var n=d.exams.reduce(function(t,e){return t+e.questions.length;},0)+d.mcqs.reduce(function(t,c){return t+c.questions.length;},0);
  if(typeof EXTRA!=='undefined'&&EXTRA[p])n+=EXTRA[p].reduce(function(t,g){return t+g.questions.length;},0);
  if(typeof BOOKQ!=='undefined'&&BOOKQ[p])Object.keys(BOOKQ[p]).forEach(function(k){n+=BOOKQ[p][k].length;});
  return n;
}
function showParts(){
  setFloatBack(null);
  saveView({part:PART,kind:'parts'});
  exam=-1;st=null;stopTimer();stopClock();side.classList.remove('active','open');document.body.classList.remove('inquiz');
  document.getElementById('counter').textContent='EA Exam Prep';
  document.getElementById('score').textContent='Choose a part';
  document.getElementById('prog').style.width='0%';
  var html='<h2 style="margin-bottom:6px">Choose Your Exam Part</h2><p style="color:var(--muted);font-size:14px;margin-bottom:18px">Pick which part of the EA (Special Enrollment) exam you want to study. Each part keeps its own separate progress.</p>';
  var mk=function(p,icon){
    var d=PARTS[p],bits=[];
    if(d.exams.length)bits.push(d.exams.length+' mock exams');
    if(d.units.length)bits.push(d.units.length+' chapters');
    if(d.mcqs.length)bits.push(d.mcqs.length+' MCQ chapter sets');
    var nq=partCounts(p), extra=[];
    if(CHNOTES[p])extra.push(Object.keys(CHNOTES[p]).length+' chapters of notes');
    if(SHEETS[p]&&SHEETS[p].length)extra.push('key numbers &amp; deadlines');
    var line = nq ? (nq+' questions · '+bits.join(', ')) : ('Study notes only — '+extra.join(' · '));
    return '<button class="opt partcard" data-p="'+p+'"><b>'+icon+' '+d.name+' — '+d.sub+'</b><br><span style="color:var(--muted);font-size:13.5px">'+line+'</span></button>';
  };
  html+=mk(1,'📕')+mk(2,'📘')+mk(3,'📗');
  card.innerHTML=html;
  renderAdminPanel();
  card.querySelectorAll('[data-p]').forEach(function(b){b.onclick=function(){selectPart(+b.dataset.p);showMenu();};});
}
// Inline line icons (monochrome, inherit colour) — replaces emoji on the home screen.
var MICON={
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  hash:'<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  loop:'<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-8"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  sparkle:'<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  xmark:'<path d="M18 6L6 18M6 6l12 12"/>',
  shuffle:'<path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  card:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M7 3h10M5 10h14"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'
};
function micon(n){return '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true">'+(MICON[n]||'')+'</svg>';}
function showMenu(){
  exam=-1;st=null;stopTimer();stopClock();side.classList.remove('active','open');document.body.classList.remove('inquiz');
  setFloatBack(goBack,'← Back');
  const meta=PARTS[PART];
  markView('menu');
  const nMock=EXAMS.reduce(function(t,e){return t+e.questions.length;},0);
  const nMcq=MCQS.reduce(function(t,c){return t+c.questions.length;},0);
  const nExtra=(XTRA||[]).reduce(function(t,g){return t+g.questions.length;},0);
  const nGleim=(GLEIM_CH||[]).reduce(function(t,g){return t+g.questions.length;},0);
  var nBookq=0; if(BOOKQ[PART])Object.keys(BOOKQ[PART]).forEach(function(k){nBookq+=BOOKQ[PART][k].length;});
  // Some mock-exam questions are verbatim copies of a chapter-bank question
  // (mainly Mock Exam 1 reusing chapter practice questions) — nMock/nMcq/etc.
  // above stay as true per-resource sizes (used in their own section headers,
  // e.g. "4 exams · 400 questions"), but the part-wide total shown at the
  // top of the dashboard, and everywhere it feeds "Answered"/search, should
  // count each real question once even if it appears in more than one pool.
  function _qKey(q){ return String((q&&q.q)||'').toLowerCase().replace(/\s+/g,' ').trim(); }
  var _uniqQ={};
  EXAMS.forEach(function(e){e.questions.forEach(function(q){_uniqQ[_qKey(q)]=1;});});
  MCQS.forEach(function(c){c.questions.forEach(function(q){_uniqQ[_qKey(q)]=1;});});
  (XTRA||[]).forEach(function(g){g.questions.forEach(function(q){_uniqQ[_qKey(q)]=1;});});
  (GLEIM_CH||[]).forEach(function(g){g.questions.forEach(function(q){_uniqQ[_qKey(q)]=1;});});
  if(BOOKQ[PART])Object.keys(BOOKQ[PART]).forEach(function(k){BOOKQ[PART][k].forEach(function(q){_uniqQ[_qKey(q)]=1;});});
  const totalQ=Object.keys(_uniqQ).length;
  document.getElementById('counter').textContent=meta.name+(totalQ?' Practice':' — Study Notes');
  document.getElementById('score').textContent=totalQ?'Choose an exam':'Choose a section';
  document.getElementById('prog').style.width='0%';
  const due=dueReview();
  const secOpen=getSec();

  // ---- rolled-up progress for the whole part ----
  var ansAll=0,rightAll=0,unitAgg={};
  // Shared across every fold() call below (and the BOOKQ block further down)
  // so a question answered in more than one pool — e.g. a chapter-bank
  // question that's also in a mock exam — only counts once toward these
  // dashboard totals, same reasoning as totalQ above. Whichever pool gets
  // folded in first "wins" the tie for right/wrong; pools are folded in a
  // fixed order (exams, then chapter bank, extra, Gleim, book questions).
  var _countedQ={};
  function fold(qs,answers){
    if(!answers)return;
    answers.forEach(function(v,j){
      if(v===null||v===undefined||!qs[j])return;
      var key=_qKey(qs[j]); if(_countedQ[key])return; _countedQ[key]=1;
      ansAll++; var ok=(v===qs[j].a); if(ok)rightAll++;
      var u=qs[j].unit||'—';
      unitAgg[u]=unitAgg[u]||{a:0,r:0}; unitAgg[u].a++; if(ok)unitAgg[u].r++;
    });
  }
  var mockInfo=EXAMS.map(function(ex,i){
    var s=loadState(i),a=0,r=0;
    if(s){s.answers.forEach(function(v,j){if(v!==null&&v!==undefined){a++;if(v===ex.questions[j].a)r++;}});fold(ex.questions,s.answers);}
    return {s:s,a:a,r:r,n:ex.questions.length};
  });
  MCQS.forEach(function(mc,i){var s=mcqState(i);if(s)fold(mc.questions,s.answers);});
  (XTRA||[]).forEach(function(g,i){var sx=xState(i);if(sx)fold(g.questions,sx.answers);});
  (GLEIM_CH||[]).forEach(function(g,i){var sg=gState(i);if(sg)fold(g.questions,sg.answers);});
  if(BOOKQ[PART]){var bs=bqState();Object.keys(BOOKQ[PART]).forEach(function(n){var qs=BOOKQ[PART][n];qs.forEach(function(q,i){var v=bs[n+':'+i];if(v!==undefined&&v!==null){var key=_qKey(q);if(_countedQ[key])return;_countedQ[key]=1;ansAll++;var ok=(v===q.a);if(ok)rightAll++;var u=q.unit||'—';unitAgg[u]=unitAgg[u]||{a:0,r:0};unitAgg[u].a++;if(ok)unitAgg[u].r++;}});});}
  var pct=ansAll?Math.round(rightAll/ansAll*100):0;
  var weakest=null;
  Object.keys(unitAgg).forEach(function(u){
    var g=unitAgg[u]; if(g.a<5)return;
    var p=g.r/g.a; if(!weakest||p<weakest.p)weakest={u:u,p:p};
  });

  let html='<div class="mhead"><div><div class="mtitle">'+meta.name+'</div>'+
    '<div class="msub">'+meta.sub+(totalQ?' · '+totalQ.toLocaleString()+' questions':' · study guide only')+'</div></div>'+
    '<div style="display:flex;gap:7px;align-items:center">'+
      (swPartTotal(swGetAll(),PART)>0?'<span class="mpill" style="cursor:default">⏱ '+fmtDur(swPartTotal(swGetAll(),PART))+'</span>':'')+
      '<button class="mpill" id="partPill">Part 1 · 2 · 3</button></div></div>';

  // ---- stat cards ----
  var _today=todayCount(), _streak=currentStreak(), _streakTot=streakTotal();
  var _streakStr = _streak>0 ? ('🔥 '+_streak+'-day streak') : 'Answer a question to start a streak';
  var _streakSubline = _streak>0 ? ('over '+_streak+' day'+(_streak===1?'':'s')+' · avg '+Math.round(_streakTot/_streak)+'/day') : 'Not started yet';
  // ---- chapter-notes review streak (mirrors the question streak above) ----
  var _notesY=CHNOTES[PART]?Object.keys(CHNOTES[PART]).length:0;
  var _notesX=_notesY?summaryReviewedCount(PART):0;
  var _notesPct=_notesY?Math.round(_notesX/_notesY*100):0;
  var _notesStreak=summaryCurrentStreak(PART), _notesWeek=summaryWindowCount(7,PART);
  var _notesStreakStr = _notesStreak>0 ? ('🔥 '+_notesStreak+'-day streak') : 'Open a chapter\'s notes to start';
  var _notesCycles=_notesY?summaryCycleCount(PART,_notesY):0;
  var _notesLapProgress=_notesY?summaryCycleCurrentCount(PART):0;
  html+='<div class="mstats">'+
    '<div class="mstat"><div class="lbl">Answered</div><div class="val">'+ansAll.toLocaleString()+
      '<small> / '+totalQ.toLocaleString()+'</small></div><div class="mbar"><i style="width:'+(totalQ?Math.round(ansAll/totalQ*100):0)+'%"></i></div></div>'+
    '<div class="mstat"><div class="lbl">Accuracy</div><div class="val">'+(ansAll?pct+'<small>%</small>':'—')+
      '</div><div class="mbar"><i class="ok" style="width:'+pct+'%"></i></div></div>'+
    '<div class="mstat"><div class="lbl">Due for review</div><div class="val" style="color:'+(due.length?'#b45309':'var(--muted)')+'">'+due.length+'</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:9px">'+(weakest?'Weakest: '+esc(weakest.u.replace(/:.*$/,''))+' ('+Math.round(weakest.p*100)+'%)':'Answer a few to see gaps')+'</div></div>'+
    '<div class="mstat"><div class="lbl">Today</div><div class="val" style="color:'+(_today?'#2563eb':'var(--muted)')+'">'+_today+'</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:9px">'+_streakStr+'</div></div>'+
    '<div class="mstat"><div class="lbl">Streak total</div><div class="val" style="color:'+(_streakTot?'#059669':'var(--muted)')+'">'+_streakTot.toLocaleString()+'</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:9px">'+_streakSubline+'</div></div>'+
  '</div>';

  // Chapter-notes review stats get their own labeled, always-2-across group
  // rather than folding into the 3-column grid above — five question-stat
  // cards already read fine at 3-per-row (3+2), but stretching that grid to
  // seven left an orphaned single card on mobile and on wide screens alike.
  if(_notesY)html+='<div class="mgrouphd"><span>📘 Notes review</span></div><div class="mgrid2">'+
    '<div class="mstat"><div class="lbl">Notes reviewed</div><div class="val">'+_notesX+
      '<small> / '+_notesY+'</small></div><div class="mbar"><i style="width:'+_notesPct+'%"></i></div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:9px">'+_notesStreakStr+(_notesWeek?' · '+_notesWeek+' this week':'')+'</div></div>'+
    '<div class="mstat"><div class="lbl">Full revisions'+((_notesCycles||_notesLapProgress)?' <span class="lbl-reset" data-nr="1" title="Reset revision count for this Part">↺</span>':'')+'</div><div class="val" style="color:'+(_notesCycles?'#7c3aed':'var(--muted)')+'">'+_notesCycles+'</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:9px">'+(_notesLapProgress?_notesLapProgress+' of '+_notesY+' toward the next':'Every chapter once = 1 revision')+'</div></div>'+
  '</div>';

  if(totalQ)html+='<input class="searchbox" id="searchBox" placeholder="🔍 Search all '+totalQ.toLocaleString()+' questions by keyword or topic…"><div id="sres"></div>';

  // ---- practice: mock exams as progress cards ----
  if(EXAMS.length){
    html+='<div class="mgrouphd"><span>Practice</span><span>'+EXAMS.length+' exams · '+nMock+' questions</span></div><div class="mgrid2">';
    EXAMS.forEach(function(ex,i){
      var m=mockInfo[i],pc=Math.round(m.a/m.n*100),cls='',lab='Start',meta2=m.n+' questions · not started';
      if(m.s){
        var submitted=(m.s.mode==='exam'&&m.s.examDone);
        if(m.a>=m.n||submitted){cls='done';lab=Math.round(m.r/m.n*100)+'%';meta2='Complete · '+m.r+' of '+m.n+' correct';}
        else if(m.a>0){cls='on';lab='Resume';meta2=m.a+' of '+m.n+' answered'+(m.s.mode==='exam'?' · ⏱ exam mode':'');}
        else{cls='on';lab='Resume';meta2='Started · '+(m.s.mode==='exam'?'exam mode':'practice mode');}
      }
      html+='<button class="mcard" data-e="'+i+'"><span class="row1"><span class="nm">'+esc(ex.name)+'</span>'+
        '<span class="st '+cls+'">'+lab+'</span></span>'+
        '<span class="mbar"><i class="'+(cls==='done'?'ok':'')+'" style="width:'+(cls==='done'?100:pc)+'%"></i></span>'+
        '<span class="meta">'+meta2+'</span>'+
        (m.s?'<span class="mreset" data-r="'+i+'" title="Reset this exam">↺</span>':'')+'</button>';
    });
    html+='</div>';
  }

  // ---- by chapter ----
  var chapBits=[];
  if(MCQS.length)chapBits.push('<button class="mwide" id="mcqBtn"><span class="ic">'+micon('list')+'</span><span class="tx"><span class="nm">Chapter questions</span>'+
    '<span class="sub">'+MCQS.length+' chapters · '+nMcq.toLocaleString()+' questions</span></span></button>');
  if(CHNOTES[PART]){
    var nch=Object.keys(CHNOTES[PART]).length;
    var nbq=0; if(BOOKQ[PART])Object.keys(BOOKQ[PART]).forEach(function(k){nbq+=BOOKQ[PART][k].length;});
    chapBits.push('<button class="mwide" id="libBtn"><span class="ic">'+micon('book')+'</span><span class="tx"><span class="nm">Chapter notes</span>'+
      '<span class="sub">'+nch+' chapters'+(nbq?' · '+nbq+' study questions':'')+(_notesX?' · '+_notesX+'/'+nch+' reviewed':'')+'</span></span></button>');
  }
  if(chapBits.length)html+='<div class="mgrouphd"><span>By chapter</span></div><div class="mgrid2">'+chapBits.join('')+'</div>';
  if(XTRA.length || (GLEIM_CH&&GLEIM_CH.length)){
    var bits=[];
    if(XTRA.length){
      var xt=XTRA.reduce(function(t,g){return t+g.questions.length;},0);
      var xa=0;
      XTRA.forEach(function(g,i){var s2=xState(i); if(s2)s2.answers.forEach(function(v){if(v!==null&&v!==undefined)xa++;});});
      bits.push('<button class="mwide" id="xtraBtn"><span class="ic">'+micon('sparkle')+'</span><span class="tx"><span class="nm">Becker questions</span>'+
        '<span class="sub">'+XTRA.length+' chapters · '+xt.toLocaleString()+' questions'+(xa?' · '+xa+' answered':'')+'</span></span></button>');
    }
    if(GLEIM_CH && GLEIM_CH.length){
      var gt=GLEIM_CH.reduce(function(t,g){return t+g.questions.length;},0);
      var ga=0;
      GLEIM_CH.forEach(function(g,i){var s3=gState(i); if(s3)s3.answers.forEach(function(v){if(v!==null&&v!==undefined)ga++;});});
      bits.push('<button class="mwide" id="gleimBtn"><span class="ic">'+micon('sparkle')+'</span><span class="tx"><span class="nm">Gleim questions</span>'+
        '<span class="sub">'+GLEIM_CH.length+' chapters · '+gt.toLocaleString()+' questions'+(ga?' · '+ga+' answered':'')+'</span></span></button>');
    }
    html+='<div class="mgrouphd"><span>Extra question banks</span><span>outside sources</span></div><div class="mgrid2">'+bits.join('')+'</div>';
  }

  // ---- reference tiles ----
  var tiles=[];
  if(SHEETS[PART]&&SHEETS[PART].length){
    var nn=SHEETS[PART].filter(function(r){return !r.dl;}).length, nd=SHEETS[PART].filter(function(r){return r.dl;}).length;
    tiles.push('<button class="mtile" id="numsBtn"><span class="ic">'+micon('hash')+'</span><span class="nm">Key numbers</span><span class="sub">'+nn+'</span></button>');
    tiles.push('<button class="mtile" id="dlBtn"><span class="ic">'+micon('cal')+'</span><span class="nm">Deadlines</span><span class="sub">'+nd+'</span></button>');
  }
  tiles.push('<button class="mtile" id="reviewBtn"'+(due.length?'':' disabled style="opacity:.5;cursor:default"')+'><span class="ic">'+micon('loop')+'</span><span class="nm">Smart review</span>'+
    '<span class="sub'+(due.length?' warn':'')+'">'+(due.length?due.length+' due':'nothing due')+'</span></button>');
  var _flagCount=collectFlagged().length, _wrongCount=collectWrong().length;
  tiles.push('<button class="mtile" id="flaggedBtn"'+(_flagCount?'':' disabled style="opacity:.5;cursor:default"')+'><span class="ic">'+micon('flag')+'</span><span class="nm">Flagged</span>'+
    '<span class="sub'+(_flagCount?' warn':'')+'">'+(_flagCount?_flagCount+' to review':'none flagged')+'</span></button>');
  tiles.push('<button class="mtile" id="wrongBtn"'+(_wrongCount?'':' disabled style="opacity:.5;cursor:default"')+'><span class="ic">'+micon('xmark')+'</span><span class="nm">Wrong</span>'+
    '<span class="sub'+(_wrongCount?' warn':'')+'">'+(_wrongCount?_wrongCount+' to retry':'none wrong')+'</span></button>');
  // Shuffled wrong + flagged (deduped)
  var _mixCount=(function(){var seen={},n=0;collectFlagged().concat(collectWrong()).forEach(function(x){if(!seen[x.ref]){seen[x.ref]=1;n++;}});return n;})();
  tiles.push('<button class="mtile" id="mixBtn"'+(_mixCount?'':' disabled style="opacity:.5;cursor:default"')+'><span class="ic">'+micon('shuffle')+'</span><span class="nm">Mix &amp; shuffle</span>'+
    '<span class="sub'+(_mixCount?' warn':'')+'">'+(_mixCount?_mixCount+' wrong + flagged':'nothing to mix')+'</span></button>');
  if(CHNOTES[PART]){
    tiles.push('<button class="mtile" id="chapFcBtn"><span class="ic">'+micon('book')+'</span><span class="nm">Chapter Flashcards</span><span class="sub">browse by chapter</span></button>');
  }
  // "Toughest for me" — curated quiz of the hardest questions for THIS student:
  // wrong + flagged (deduped) + a top-up of unanswered questions in weak chapters.
  var _toughPreview = (function(){
    try { return collectToughestForMe(25).length; } catch(e){ return 0; }
  })();
  tiles.push('<button class="mtile" id="toughBtn"'+(_toughPreview?'':' disabled style="opacity:.5;cursor:default"')+'><span class="ic">'+micon('target')+'</span><span class="nm">Toughest for me</span>'+
    '<span class="sub'+(_toughPreview?' warn':'')+'">'+(_toughPreview?_toughPreview+' curated Qs':'answer a few first')+'</span></button>');
  tiles.push('<button class="mtile" id="dashBtn"><span class="ic">'+micon('chart')+'</span><span class="nm">Performance</span><span class="sub">by unit</span></button>');
  html+='<div class="mgrouphd"><span>Reference</span></div><div class="mgrid4">'+tiles.join('')+'</div>';

  // ---- chapters-from-mocks stays collapsible and out of the way ----
  if(UNITS.length){
    html+='<button class="sechead" data-sec="chap">'+meta.name+': Chapters from Mock Questions <span style="color:var(--muted);font-weight:400;font-size:13px">('+UNITS.length+' study units)</span><span class="chev">'+(secOpen.chap?'▾':'▸')+'</span></button>';
    var chapHtml=UNITS.map(function(u,ui){
      const s=chapState(ui);
      let status='Not started',color='var(--muted)';
      if(s){
        let a=0,r=0;
        s.answers.forEach(function(v,j){if(v!==null&&v!==undefined){a++;const it=u.items[j];if(v===EXAMS[it.e].questions[it.i].a)r++;}});
        if(a>0){color='var(--blue)';status=a+'/'+u.items.length+' answered · '+r+' correct · click to resume';}
      }
      return '<div style="display:flex;gap:8px;align-items:stretch;margin-bottom:10px"><button class="opt" style="margin-bottom:0;flex:1" data-c="'+ui+'"><b>'+esc(u.name)+'</b><span style="color:var(--muted)"> — '+u.items.length+' questions from all mocks</span><br><span style="font-size:13px;color:'+color+'">'+status+'</span></button><button class="reset-mini" data-cr="'+ui+'" title="Reset chapter progress">↺</button></div>';
    }).join('');
    html+='<div class="secbody" style="display:'+(secOpen.chap?'block':'none')+'">'+chapHtml+'</div>';
  }
  html+='<div class="nav2"><button class="navbtn" id="backToParts">← Choose Part (1 / 2 / 3)</button><span></span></div>';
  card.innerHTML=html;

  // ---- wiring ----
  card.querySelectorAll('[data-e]').forEach(function(b){b.onclick=function(){startFlow(+b.dataset.e);};});
  card.querySelectorAll('[data-r]').forEach(function(b){b.onclick=function(ev){ev.stopPropagation();resetExam(+b.dataset.r);};});
  card.querySelectorAll('[data-nr]').forEach(function(b){b.onclick=function(ev){ev.stopPropagation();resetNotesCycles();};});
  const rb=document.getElementById('reviewBtn'); if(due.length)rb.onclick=startReview;
  var _fbn=document.getElementById('flaggedBtn'); if(_fbn&&_flagCount)_fbn.onclick=startFlaggedReview;
  var _wbn=document.getElementById('wrongBtn'); if(_wbn&&_wrongCount)_wbn.onclick=startWrongReview;
  var _mbn=document.getElementById('mixBtn'); if(_mbn&&_mixCount)_mbn.onclick=startShuffledWrongFlagged;
  var _cfcbn=document.getElementById('chapFcBtn'); if(_cfcbn)_cfcbn.onclick=chapterFlashcardsList;
  var _tbn=document.getElementById('toughBtn'); if(_tbn&&_toughPreview)_tbn.onclick=startToughestForMe;
  document.getElementById('dashBtn').onclick=showDashboard;
  var mb=document.getElementById('mcqBtn'); if(mb)mb.onclick=mcqChapterList;
  var xb=document.getElementById('xtraBtn'); if(xb)xb.onclick=extraList;
  var gb=document.getElementById('gleimBtn'); if(gb)gb.onclick=gleimList;
  var lb=document.getElementById('libBtn'); if(lb)lb.onclick=notesUnitList;
  var nbn=document.getElementById('numsBtn'); if(nbn)nbn.onclick=function(){showSheet('nums','all');};
  var dbn=document.getElementById('dlBtn'); if(dbn)dbn.onclick=function(){showSheet('dl');};
  document.getElementById('backToParts').onclick=showParts;
  document.getElementById('partPill').onclick=showParts;
  card.querySelectorAll('[data-sec]').forEach(function(b){b.onclick=function(){const k=b.dataset.sec;const o=getSec();o[k]=!o[k];try{localStorage.setItem('ea3quiz_sec',JSON.stringify(o));}catch(err){}showMenu();};});
  card.querySelectorAll('[data-c]').forEach(function(b){b.onclick=function(){startChapter(+b.dataset.c);};});
  card.querySelectorAll('[data-cr]').forEach(function(b){b.onclick=function(){resetChapterKey(+b.dataset.cr);};});
  const sb=document.getElementById('searchBox');
  if(sb)sb.oninput=function(){renderSearch(sb.value);};
}
// Chapter MCQs get their own page now that the home screen is a summary.

// ============================================================================
// ==== MCQ CHAPTER LIST (Chapter questions page)
// ============================================================================
function mcqChapterList(){
  markView('mcqlist');
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  setFloatBack(goBack,'← Back');
  const nMcq=MCQS.reduce(function(t,c){return t+c.questions.length;},0);
  document.getElementById('counter').textContent=PARTS[PART].name+' — Chapter Questions';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  var h='<div class="mhead"><div><div class="mtitle">Chapter questions</div>'+
    '<div class="msub">'+MCQS.length+' chapters · '+nMcq.toLocaleString()+' questions with the study guide’s own explanations</div></div></div>';
  h+='<div class="mgrid2">';
  MCQS.forEach(function(mc,i){
    var s=mcqState(i),a=0,r=0;
    if(s)s.answers.forEach(function(v,j){if(v!==null&&v!==undefined){a++;if(v===mc.questions[j].a)r++;}});
    var n=mc.questions.length,pc=Math.round(a/n*100),cls='',lab='Start',meta2=n+' questions · not started';
    if(a>=n&&n){cls='done';lab=Math.round(r/n*100)+'%';meta2='Complete · '+r+' of '+n+' correct';}
    else if(a>0){cls='on';lab='Resume';meta2=a+' of '+n+' answered · '+r+' correct';}
    h+='<button class="mcard" data-mc="'+i+'"><span class="row1"><span class="nm">'+esc(mc.name)+'</span>'+
      '<span class="st '+cls+'">'+lab+'</span></span>'+
      '<span class="mbar"><i class="'+(cls==='done'?'ok':'')+'" style="width:'+pc+'%"></i></span>'+
      '<span class="meta">'+meta2+'</span>'+
      (s?'<span class="mreset" data-mcr="'+i+'" title="Reset this chapter">↺</span>':'')+'</button>';
  });
  h+='</div><div class="nav2"><button class="navbtn" id="mcqBack">← Exam menu</button><span></span></div>';
  card.innerHTML=h;
  card.querySelectorAll('[data-mc]').forEach(function(b){b.onclick=function(){startMcq(+b.dataset.mc);};});
  card.querySelectorAll('[data-mcr]').forEach(function(b){b.onclick=function(ev){ev.stopPropagation();resetMcqKey(+b.dataset.mcr);};});
  document.getElementById('mcqBack').onclick=showMenu;
  restoreScroll();
}

// ============================================================================
// ==== DASHBOARD SEARCH
// ============================================================================
function renderSearch(term){
  const box=document.getElementById('sres');
  term=(term||'').trim().toLowerCase();
  if(term.length<3){box.innerHTML='';return;}
  const match=function(q){return q.q.toLowerCase().includes(term)||(q.topic||'').toLowerCase().includes(term)||(q.unit||'').toLowerCase().includes(term);};
  const hits=[];
  const MAX_HITS=200;
  EXAMS.forEach(function(ex,e){ex.questions.forEach(function(q,i){
    if(hits.length>=MAX_HITS)return;
    if(match(q))hits.push({kind:'mock',e:e,i:i,q:q,label:'Mock '+(e+1)+' · Q'+(i+1)});
  });});
  MCQS.forEach(function(mc,mi){mc.questions.forEach(function(q,i){
    if(hits.length>=MAX_HITS)return;
    if(match(q))hits.push({kind:'mcq',e:mi,i:i,q:q,label:'MCQ Ch'+mc.n+' · Q'+(i+1)});
  });});
  XTRA.forEach(function(g,xi){g.questions.forEach(function(q,i){
    if(hits.length>=MAX_HITS)return;
    if(match(q))hits.push({kind:'xtra',e:xi,i:i,q:q,label:esc(g.name)+' · Q'+(i+1)});
  });});
  if(!hits.length){box.innerHTML='<p style="color:var(--muted);font-size:13px;margin-bottom:14px">No matches.</p>';return;}
  var header='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:4px 0 10px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:10px;">'+
    '<span style="font-size:13px;color:var(--muted)"><b style="color:var(--ink)">'+hits.length+(hits.length>=MAX_HITS?'+':'')+'</b> matching '+(hits.length===1?'question':'questions')+' found</span>'+
    '<button class="mpill" id="attemptSearchBtn" style="background:var(--blue-bg,rgba(37,99,235,.1));color:var(--blue);border-color:var(--blue);font-weight:600">✦ Attempt all '+hits.length+'</button>'+
    '</div>';
  box.innerHTML=header+hits.map(function(h){
    return '<button class="sitem" data-k="'+h.kind+'" data-se="'+h.e+'" data-si="'+h.i+'"><b>'+h.label+'</b> <span class="stopic">'+esc(h.q.topic||'')+'</span><br><span class="ssnip">'+esc(h.q.q.slice(0,110))+'…</span></button>';
  }).join('')+'<div style="height:14px"></div>';
  box.querySelectorAll('.sitem').forEach(function(b){b.onclick=function(){
    if(b.dataset.k==='mcq')jumpMcq(+b.dataset.se,+b.dataset.si);
    else if(b.dataset.k==='xtra'){startExtra(+b.dataset.se); pos=st.order.indexOf(+b.dataset.si); if(pos<0)pos=0; renderSide(); render();}
    else jumpTo(+b.dataset.se,+b.dataset.si);
  };});
  var asb=document.getElementById('attemptSearchBtn');
  if(asb)asb.onclick=function(){startSearchQuiz(hits, term);};
}
function startSearchQuiz(hits, term){
  if(!hits||!hits.length)return;
  resetSessionSeen();
  exam=-8;
  QUESTIONS=hits.map(function(h){return h.q;});
  REVIEW_REFS=hits.map(function(h){
    if(h.kind==='mock')return 'm'+h.e+'_'+h.i;
    if(h.kind==='mcq')return 'mcq'+h.e+'_'+h.i;
    return 'xtra'+h.e+'_'+h.i;
  });
  window._searchQuizTerm = term || '';
  st=makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  st.review=true; pos=0;
  enterQuiz();
}
function jumpTo(e,qi){
  let s=loadState(e);
  if(!s){s=makeState(EXAMS[e].questions.length,EXAMS[e].questions,false,'practice');}
  resetSessionSeen();
  exam=e;st=s;QUESTIONS=EXAMS[e].questions;saveState();
  pos=st.order.indexOf(qi);if(pos<0)pos=0;
  enterQuiz();
}
function jumpMcq(ci,qi){
  startMcq(ci);
  pos=st.order.indexOf(qi);if(pos<0)pos=0;
  renderSide();render();
}

// ============================================================================
// ==== MOCK EXAM FLOW: startFlow, chooser, reset
// ============================================================================
// ---------- start / reset ----------
function startFlow(e){
  const s=loadState(e);
  if(s){resetSessionSeen();exam=e;st=s;QUESTIONS=EXAMS[e].questions;
    pos=resumePos(st);
    enterQuiz();return;}
  showChooser(e);
}
function showChooser(e){
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();
  document.getElementById('counter').textContent=EXAMS[e].name+' — Setup';
  document.getElementById('score').textContent='';
  card.innerHTML='<h2 style="margin-bottom:6px">'+EXAMS[e].name+'</h2><p style="color:var(--muted);font-size:14px;margin-bottom:16px">Choose how you want to take this exam.</p>'+
    '<label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:14.5px;cursor:pointer"><input type="checkbox" id="shufCheck" checked style="width:17px;height:17px"> Shuffle question order and answer choices</label>'+
    '<button class="opt" id="mPractice"><b>📘 Practice Mode</b><br><span style="color:var(--muted);font-size:13.5px">Instant feedback with explanations after every answer. Answers can\'t be changed.</span></button>'+
    '<button class="opt" id="mExam"><b>⏱ Exam Simulation Mode</b><br><span style="color:var(--muted);font-size:13.5px">3.5-hour countdown, no feedback while you work, answers can be changed until you submit — like the real thing. The clock keeps running even if you close the file.</span></button>'+
    '<div class="nav2" style="margin-top:14px"><button class="navbtn" id="backMenu">← Back</button><span></span></div>';
  const go=function(mode){
    const shuf=document.getElementById('shufCheck').checked;
    resetSessionSeen();
    exam=e;QUESTIONS=EXAMS[e].questions;
    st=makeState(QUESTIONS.length,QUESTIONS,shuf,mode);
    pos=0;saveState();enterQuiz();
  };
  document.getElementById('mPractice').onclick=function(){go('practice');};
  document.getElementById('mExam').onclick=function(){go('exam');};
  document.getElementById('backMenu').onclick=showMenu;
}
function resetExam(e){
  if(confirm('Reset all progress for '+EXAMS[e].name+'? Your next attempt can be shuffled. This cannot be undone.')){
    try{localStorage.removeItem(skey(e));localStorage.removeItem('ea3quiz_mock_'+e);}catch(err){}
    showMenu();
  }
}
// Self-service fix for a wrong "Full revisions" count (e.g. from a past bug,
// or an odd cross-device merge) — resets just the lap-progress counters for
// the current Part, not the permanent "chapters ever reviewed" history.
async function resetNotesCycles(){
  if(!confirm('Reset the revision count for '+PARTS[PART].name+'? This sets "Full revisions" and current-lap progress back to 0. Your permanent notes-reviewed history is not affected. This cannot be undone.'))return;
  var totalChapters=CHNOTES[PART]?Object.keys(CHNOTES[PART]).length:0;
  var r=await resetCyclesForPart(PART,totalChapters);
  if(!r.ok){ alert(r.msg||'Reset failed — try again.'); return; }
  showMenu();
}

// ============================================================================
// ==== CHAPTERS FROM MOCKS (deriveUnits)
// ============================================================================
// ---------- chapters ----------
function deriveUnits(exams){
  const map={};
  exams.forEach(function(ex,e){ex.questions.forEach(function(q,i){
    if(!map[q.unit])map[q.unit]={name:q.unit,items:[]};
    map[q.unit].items.push({e:e,i:i});
  });});
  return Object.values(map).sort(function(a,b){
    return (parseInt(a.name.replace(/\D+/,''))||99)-(parseInt(b.name.replace(/\D+/,''))||99);
  });
}
let UNITS=[];
var P2MOCK1 = null;
var P2MOCK2 = null;
var P2MOCK3 = null;
var P2PRAC = null;
var EXAMS_P2 = [];
var MCQS_P2 = null;
var QREF_P2 = null;
var CHNOTES_P2 = null;
var CHNOTES_P1 = null;
var CHNOTES_P3 = null;
var SHEETS = null;
var BOOKQ = null;
var CHNOTES={};
var QREF_P3 = null;
var QREF_P1 = null;
var QREF={};
var REFRESH={};
var P1MOCK1 = null;
var P1MOCK2 = null;
var P1MOCK3 = null;
var P1PRAC = null;
var EXAMS_P1 = [];
var MCQS_P1 = null;
var EXTRA_P1 = null;
var EXTRA_P2 = null;
var EXTRA_P3 = null;
var EXTRA={};
// Gleim question bank (Part 1 only for now). Structure mirrors MCQS/XTRA.
var GLEIM_P1 = null;
var GLEIM={};
var GLEIM_CH=[];  // currently-selected Part's Gleim chapters
var EXAMS_P3=[], UNITS_P3=[], MCQS_P3=[];
var PARTS={};
function selectPart(p){
  if(typeof swGet==='function'){var _s=swGet(); if(_s.run){swAccrue(_s,Date.now());_s.run.p=p;swSave(_s);}}
  PART=p;EXAMS=PARTS[p].exams;UNITS=PARTS[p].units;MCQS=PARTS[p].mcqs;XTRA=PARTS[p].extra||[];
  GLEIM_CH=PARTS[p].gleim||[];
  if(typeof swRender==='function')swRender();
  if(typeof swPanelRender==='function'){var pn=document.getElementById('swPanel'); if(pn&&pn.classList.contains('open'))swPanelRender();}
}
let CHAP=-1,MCH=-1,XCH=-1,GCH=-1;
var XTRA=[];

// ---- Gleim question bank (mirrors XTRA but with its own storage namespace) ----
function gKey(i){return 'ea3quiz_v2_'+pp()+'gleim_'+i;}
function gState(i){
  try{
    var s=JSON.parse(localStorage.getItem(gKey(i))); if(!s) return null;
    var g=(typeof GLEIM_CH!=='undefined')&&GLEIM_CH&&GLEIM_CH[i];
    if(g&&s&&s.answers&&s.answers.length!==g.questions.length) return null;
    return s;
  }catch(e){ return null; }
}
function startGleim(i){
  resetSessionSeen();
  exam=-11; GCH=i;
  QUESTIONS=GLEIM_CH[i].questions; REVIEW_REFS=[];
  st=gState(i)||makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  pos=resumePos(st);
  saveState(); enterQuiz();
}
function resetGleimKey(i){
  if(confirm('Reset progress for '+GLEIM_CH[i].name+'? This cannot be undone.')){
    try{ localStorage.removeItem(gKey(i)); }catch(e){}
    showMenu();
  }
}
function gleimList(){
  markView('glist');
  side.classList.remove('active','open'); document.body.classList.remove('inquiz'); stopTimer(); stopClock();
  setFloatBack(goBack,'← Back');
  var tot=GLEIM_CH.reduce(function(t,g){return t+g.questions.length;},0);
  document.getElementById('counter').textContent=PARTS[PART].name+' — Gleim Questions';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  var h='<div class="mhead"><div><div class="mtitle">Gleim questions</div>'+
    '<div class="msub">'+GLEIM_CH.length+' chapters · '+tot.toLocaleString()+' questions from the Gleim EA Review question bank, grouped by study unit</div></div></div>'+
    '<p class="xnote">These questions are from the Gleim EA Review — kept separate from your study-guide chapter questions, Becker questions, and mocks.</p>';
  h+='<div class="mgrid2">';
  GLEIM_CH.forEach(function(g,i){
    var st2=gState(i),a=0,r=0;
    if(st2)st2.answers.forEach(function(v,j){if(v!==null&&v!==undefined&&g.questions[j]){a++;if(v===g.questions[j].a)r++;}});
    var n=g.questions.length, pc=n?Math.round(a/n*100):0, cls='', lab='Start', meta=''+n+' questions · not started';
    if(a>=n&&n){cls='done'; lab=Math.round(r/n*100)+'%'; meta='Complete · '+r+' of '+n+' correct';}
    else if(a>0){cls='on'; lab='Resume'; meta=a+' of '+n+' answered · '+r+' correct';}
    h+='<button class="mcard" data-gc="'+i+'"><span class="row1"><span class="nm">'+esc(g.name)+'</span>'+
       '<span class="st '+cls+'">'+lab+'</span></span><span class="mbar"><i class="'+(cls==='done'?'ok':'')+'" style="width:'+pc+'%"></i></span>'+
       '<span class="meta">'+meta+'</span>'+(st2?'<span class="mreset" data-gr="'+i+'" title="Reset">↺</span>':'')+'</button>';
  });
  h+='</div><div class="nav2"><button class="navbtn" id="gBack">← Exam menu</button><span></span></div>';
  card.innerHTML=h;
  card.querySelectorAll('[data-gc]').forEach(function(b){ b.onclick=function(){ startGleim(+b.dataset.gc); }; });
  card.querySelectorAll('[data-gr]').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation(); resetGleimKey(+b.dataset.gr); }; });
  document.getElementById('gBack').onclick=showMenu;
  restoreScroll();
}

// ---------- MCQ chapters (from study-guide chapter files) ----------


// ============================================================================
// ==== EXTRA QUESTIONS: xKey/xState/startExtra/extraList
// ============================================================================
// ---------- Extra Questions (external bank, kept separate from the study guide) ----------
function xKey(i){return 'ea3quiz_v2_'+pp()+'extra_'+i;}
function xState(i){
  try{
    var s=JSON.parse(localStorage.getItem(xKey(i)));
    if(!s)return null;
    // Guard: if the group layout changed (e.g., re-grouped by chapter), the old
    // answers array may be longer than the new chapter's question list. Ignore
    // stale state rather than throwing when iterating past the new length.
    var g=(typeof XTRA!=='undefined')&&XTRA&&XTRA[i];
    if(g&&s&&s.answers&&s.answers.length!==g.questions.length)return null;
    return s;
  }catch(e){return null;}
}
function startExtra(i){
  resetSessionSeen();
  exam=-5;XCH=i;
  QUESTIONS=XTRA[i].questions;REVIEW_REFS=[];
  st=xState(i)||makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  pos=resumePos(st);
  saveState();enterQuiz();
}
function resetExtraKey(i){
  if(confirm('Reset progress for '+XTRA[i].name+'? This cannot be undone.')){
    try{localStorage.removeItem(xKey(i));}catch(e){}
    showMenu();
  }
}
function extraList(){
  markView('xlist');
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  setFloatBack(goBack,'← Back');
  var tot=XTRA.reduce(function(t,g){return t+g.questions.length;},0);
  document.getElementById('counter').textContent=PARTS[PART].name+' — Becker Questions';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  var h='<div class="mhead"><div><div class="mtitle">Becker questions</div>'+
    '<div class="msub">'+XTRA.length+' chapters · '+tot.toLocaleString()+' questions from the Becker question bank, grouped by study-guide chapter</div></div></div>'+
    '<p class="xnote">These questions are from the Becker question bank — kept separate from your study-guide chapter questions and mocks.</p>';
  h+='<div class="mgrid2">';
  XTRA.forEach(function(g,i){
    var st2=xState(i),a=0,r=0;
    if(st2)st2.answers.forEach(function(v,j){if(v!==null&&v!==undefined&&g.questions[j]){a++;if(v===g.questions[j].a)r++;}});
    var n=g.questions.length,pc=n?Math.round(a/n*100):0,cls='',lab='Start',meta=''+n+' questions · not started';
    if(a>=n&&n){cls='done';lab=Math.round(r/n*100)+'%';meta='Complete · '+r+' of '+n+' correct';}
    else if(a>0){cls='on';lab='Resume';meta=a+' of '+n+' answered · '+r+' correct';}
    h+='<button class="mcard" data-xc="'+i+'"><span class="row1"><span class="nm">'+esc(g.name)+'</span>'+
       '<span class="st '+cls+'">'+lab+'</span></span><span class="mbar"><i class="'+(cls==='done'?'ok':'')+'" style="width:'+pc+'%"></i></span>'+
       '<span class="meta">'+meta+'</span>'+(st2?'<span class="mreset" data-xr="'+i+'" title="Reset">↺</span>':'')+'</button>';
  });
  h+='</div><div class="nav2"><button class="navbtn" id="xBack">← Exam menu</button><span></span></div>';
  card.innerHTML=h;
  card.querySelectorAll('[data-xc]').forEach(function(b){b.onclick=function(){startExtra(+b.dataset.xc);};});
  card.querySelectorAll('[data-xr]').forEach(function(b){b.onclick=function(ev){ev.stopPropagation();resetExtraKey(+b.dataset.xr);};});
  document.getElementById('xBack').onclick=showMenu;
  restoreScroll();
}

// ============================================================================
// ==== MCQ STATE: mcqKey, mcqState, startMcq
// ============================================================================
function mcqKey(i){return 'ea3quiz_v2_'+pp()+'mcq_'+i;}
function mcqState(i){
  try{const s=JSON.parse(localStorage.getItem(mcqKey(i)));if(s&&Array.isArray(s.answers)&&s.answers.length===MCQS[i].questions.length)return s;}catch(err){}
  return null;
}
function startMcq(i){
  resetSessionSeen();
  exam=-4;MCH=i;
  QUESTIONS=MCQS[i].questions;REVIEW_REFS=[];
  st=mcqState(i)||makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  pos=resumePos(st);
  saveState();enterQuiz();
}
function resetMcqNow(){
  if(confirm('Reset progress for '+MCQS[MCH].name+'? This cannot be undone.')){
    try{localStorage.removeItem(mcqKey(MCH));}catch(err){}
    startMcq(MCH);
  }
}
function resetMcqKey(i){
  if(confirm('Reset progress for '+MCQS[i].name+'? This cannot be undone.')){
    try{localStorage.removeItem(mcqKey(i));}catch(err){}
    showMenu();
  }
}
function getSec(){try{return JSON.parse(localStorage.getItem('ea3quiz_sec'))||{};}catch(err){return {};}}

// ============================================================================
// ==== CHAPTER-FROM-MOCKS STATE + startChapter
// ============================================================================
function chapKey(u){return 'ea3quiz_v2_'+pp()+'unit_'+u;}
function xtraKeyFor(){return xKey(XCH);}
function chapState(ui){
  try{const s=JSON.parse(localStorage.getItem(chapKey(ui)));if(s&&Array.isArray(s.answers)&&s.answers.length===UNITS[ui].items.length)return s;}catch(err){}
  return null;
}
function startChapter(u){
  resetSessionSeen();
  exam=-3;CHAP=u;
  const unit=UNITS[u];
  QUESTIONS=unit.items.map(function(it){return EXAMS[it.e].questions[it.i];});
  REVIEW_REFS=unit.items.map(function(it){return 'm'+it.e+'_'+it.i;});
  st=chapState(u)||makeState(QUESTIONS.length,QUESTIONS,false,'practice');
  pos=resumePos(st);
  saveState();enterQuiz();
}
function resetChapter(){
  if(confirm('Reset progress for '+UNITS[CHAP].name+'? This cannot be undone.')){
    try{localStorage.removeItem(chapKey(CHAP));}catch(err){}
    startChapter(CHAP);
  }
}
function resetChapterKey(ui){
  if(confirm('Reset progress for '+UNITS[ui].name+'? This cannot be undone.')){
    try{localStorage.removeItem(chapKey(ui));}catch(err){}
    showMenu();
  }
}

// ============================================================================
