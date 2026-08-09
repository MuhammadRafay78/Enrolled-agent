// ==== CHAPTER NOTES: full study-guide notes viewer
// ============================================================================
// ---------- chapter notes (full detail, from the study guide) ----------
var NOTEBACK=null;
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
// Collapse state for the Forms / Key numbers headers in Chapter Notes, keyed by
// part+chapter+section so each chapter remembers its own state. Device-local
// (see DEVICE_LOCAL in account-sync.js) — a display preference, not progress.
function notesSecState(){try{return JSON.parse(localStorage.getItem('ea3quiz_notesec'))||{};}catch(e){return {};}}
function notesSecSave(s){try{localStorage.setItem('ea3quiz_notesec',JSON.stringify(s));}catch(e){}}
function notesSecKeyFor(unit,name){return PART+':'+unit+':'+name;}
function notesSecOpen(unit,name){var v=notesSecState()[notesSecKeyFor(unit,name)];return v!==false;} // default: open
function notesSecSetOpen(unit,name,open){var s=notesSecState();s[notesSecKeyFor(unit,name)]=open;notesSecSave(s);}
function scrollToEl(el){
  if(!el)return;
  try{
    if(typeof el.scrollIntoView==='function'){el.scrollIntoView({behavior:'smooth',block:'start'});return;}
    var y=0,n=el; while(n){y+=n.offsetTop||0;n=n.offsetParent;}
    window.scrollTo(0,Math.max(0,y-12));
  }catch(err){}
}
function tableHTML(t){
  var rows=t.split('\n').map(function(r){return r.split(' | ');});
  var h='<table class="ntable">';
  rows.forEach(function(cells,ri){
    h+='<tr>'+cells.map(function(c){return ri===0?'<th>'+esc(c)+'</th>':'<td>'+esc(c)+'</td>';}).join('')+'</tr>';
  });
  return h+'</table>';
}
function notesIndex(n){
  var u=CHNOTES[PART][n];
  var h='<button class="side-close" id="sideClose">✕ Close</button><div class="side-hd">SU '+n+' — Contents</div>';
  h+='<button class="side-btn" data-jump="forms">📄 Forms ('+u.f.length+')</button>';
  h+='<button class="side-btn" data-jump="nums">🔢 Key numbers ('+u.k.length+')</button>';
  if(BOOKQ[PART]&&BOOKQ[PART][n]&&BOOKQ[PART][n].length)
    h+='<button class="side-btn" data-jump="bookq">📝 Study questions ('+BOOKQ[PART][n].length+')</button>';
  h+='<div style="margin-top:8px;font-size:12px;color:var(--muted)">Sections</div>';
  u.s.forEach(function(s,i){
    h+='<button class="side-btn" data-jump="s'+i+'" style="text-align:left;font-size:12.5px;padding:7px 9px'+(s.l===3?';padding-left:18px':'')+'">'+esc(s.t)+'</button>';
  });
  h+='<button class="side-btn" id="notesBack" style="margin-top:10px">← Back</button>';
  return h;
}
function showNotes(n,backFn){
  n=String(n);
  var C=CHNOTES[PART];
  if(!C||!C[n]){card.innerHTML='<div class="end"><h2>📘 Chapter Notes</h2><p style="margin:14px 0">No notes are loaded for this chapter.</p><button class="restart" id="menu">Exam Menu</button></div>';document.getElementById('menu').onclick=showMenu;return;}
  if(backFn)NOTEBACK=backFn;
  stopTimer();stopClock();
  var u=C[n];
  document.getElementById('counter').textContent='SU '+n+': '+u.t+' — Chapter Notes';
  document.getElementById('score').textContent='Study guide';
  document.getElementById('prog').style.width='0%';
  side.classList.add('active');side.classList.remove('open');document.body.classList.add('inquiz');
  markView('notes',{unit:n});
  side.innerHTML=notesIndex(n);

  var h='<div class="nsearchwrap"><input class="nsearch" id="noteSearch" placeholder="🔍 Search chapter"></div>'+
    '<div class="nhead"><div class="nhead-t"><h2 style="margin:0 0 2px;padding-right:210px">SU '+n+': '+esc(u.t)+'</h2>'+
    '<p style="color:var(--muted);font-size:13px;margin:0">Complete notes from your '+PARTS[PART].name+' study guide — forms, thresholds, rules'+(u.ex?', and worked examples':'')+'.</p></div></div><div id="noteRes"></div>';
  // flashcards launcher — one card per form and per key-number/threshold in this chapter
  var fcCount=(typeof chapterCardCount==='function')?chapterCardCount(n):0;
  if(fcCount){
    h+='<button type="button" class="fcstart" id="chapterFcBtn"><span class="fcstart-ico">🧠</span><span class="fcstart-t"><b>Flashcards for this chapter</b><br><span style="color:var(--muted);font-size:12.5px">Forms, key numbers &amp; deadlines — '+fcCount+' card'+(fcCount===1?'':'s')+'</span></span><span class="fcstart-go">→</span></button>';
  }
  // forms
  var formsOpen=notesSecOpen(n,'forms');
  h+='<button type="button" class="nh sechead" id="forms" data-secn="forms"><span>📄 Forms in this chapter</span><span class="chev">'+(formsOpen?'▾':'▸')+'</span></button>';
  h+='<div class="secbody" id="secbody-forms" style="display:'+(formsOpen?'block':'none')+'">';
  if(u.f.length){
    h+='<table class="ntable"><tr><th style="width:132px">Form</th><th>Official title</th><th>What it is for</th></tr>';
    u.f.forEach(function(f){
      h+='<tr><td><b>'+esc(f.f)+'</b></td><td>'+esc(f.ttl||'')+'</td><td>'+esc(f.t)+
         (f.bk?'<div class="fbook"><b>From the book:</b> '+esc(f.bk)+(f.bksec?'<span class="nsrc"> '+esc(f.bksec)+'</span>':'')+'</div>':'')+
         '</td></tr>';
    });
    h+='</table>';
  } else h+='<p style="color:var(--muted)">No forms referenced in this chapter.</p>';
  h+='</div>';
  // key numbers
  var numsOpen=notesSecOpen(n,'nums');
  h+='<button type="button" class="nh sechead" id="nums" data-secn="nums"><span>🔢 Key numbers, thresholds &amp; deadlines</span><span class="chev">'+(numsOpen?'▾':'▸')+'</span></button>';
  h+='<div class="secbody" id="secbody-nums" style="display:'+(numsOpen?'block':'none')+'">';
  if(u.k.length){
    h+='<ul class="nlist">'+u.k.map(function(x){return '<li>'+esc(x.t)+'<div class="nsrc">'+esc(x.sec)+'</div></li>';}).join('')+'</ul>';
  } else h+='<p style="color:var(--muted)">No specific thresholds listed in this chapter.</p>';
  h+='</div>';
  // sections
  h+='<h3 class="nh">📚 Detailed notes</h3>';
  u.s.forEach(function(s,i){
    h+='<div class="nsec" id="s'+i+'"><h4 class="'+(s.l===3?'nsub':'nsec-h')+'">'+esc(s.t)+'</h4>';
    var exBuf=[];
    function flushEx(){
      if(!exBuf.length)return;
      h+='<details class="nex"><summary>Example — tap to work through it</summary>'+exBuf.map(function(t){return '<p>'+esc(t)+'</p>';}).join('')+'</details>';
      exBuf=[];
    }
    s.i.forEach(function(pair){
      var k=pair[0],t=pair[1];
      if(k==='ex'){exBuf.push(t);return;}
      flushEx();
      if(k==='table')h+=tableHTML(t);
      else if(k==='li')h+='<ul class="nlist"><li>'+esc(t)+'</li></ul>';
      else if(k==='note')h+='<p class="nnote">'+esc(t)+'</p>';
      else h+='<p>'+esc(t)+'</p>';
    });
    flushEx();
    h+='</div>';
  });
  h+=bookqHTML(n);
  h+='<div class="nav2"><button class="navbtn" id="notesBack2">← Back</button><span></span></div>';
  card.innerHTML=h;
  wireBookq(n);
  var fcBtn=document.getElementById('chapterFcBtn');
  if(fcBtn)fcBtn.onclick=function(){ startChapterFlashcards(n); };
  var back=function(){ if(NOTEBACK){var f=NOTEBACK;NOTEBACK=null;f();} else showMenu(); };
  document.getElementById('notesBack2').onclick=back;
  setFloatBack(back,'← Back');
  var nb=document.getElementById('notesBack'); if(nb)nb.onclick=back;
  var sc=document.getElementById('sideClose'); if(sc)sc.onclick=function(){side.classList.remove('open');};
  card.querySelectorAll('[data-secn]').forEach(function(b){
    b.onclick=function(){
      var key=b.dataset.secn;
      var open=!notesSecOpen(n,key);
      notesSecSetOpen(n,key,open);
      var body=document.getElementById('secbody-'+key), chev=b.querySelector('.chev');
      if(body)body.style.display=open?'block':'none';
      if(chev)chev.textContent=open?'▾':'▸';
    };
  });
  side.querySelectorAll('[data-jump]').forEach(function(b){
    b.onclick=function(){
      var key=b.dataset.jump;
      var el=document.getElementById(key);
      side.classList.remove('open');
      // jumping to a collapsed Forms/Key-numbers section would land on a header
      // with nothing visible below it — open it first.
      if((key==='forms'||key==='nums')&&!notesSecOpen(n,key)){
        notesSecSetOpen(n,key,true);
        var body=document.getElementById('secbody-'+key);
        if(body)body.style.display='block';
        if(el){var chev=el.querySelector('.chev');if(chev)chev.textContent='▾';}
      }
      scrollToEl(el);
    };
  });
  restoreScroll();
  var ns=document.getElementById('noteSearch');
  ns.oninput=function(){
    var q=ns.value.trim().toLowerCase(),box=document.getElementById('noteRes');
    if(q.length<3){box.innerHTML='';return;}
    var hits=[];
    u.s.forEach(function(s,si){
      if(hits.length>=30)return;
      if(s.t.toLowerCase().indexOf(q)>=0){                 // section title match
        hits.push({sec:s.t,k:'sec',t:(s.i[0]?s.i[0][1]:''),jump:si});
      }
      s.i.forEach(function(p){
        if(hits.length>=30)return;
        if(p[1].toLowerCase().indexOf(q)>=0)hits.push({sec:s.t,k:p[0],t:p[1],jump:si});
      });
    });
    box.innerHTML=hits.length?('<div class="nres nresbox"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between"><span>'+hits.length+' match'+(hits.length>1?'es':'')+' — click to jump</span><button id="noteResX" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px">✕</button></div>'+hits.map(function(x){
      return '<div class="nresi" data-go="s'+x.jump+'"><b>'+esc(x.sec)+(x.k==='ex'?' · example':(x.k==='sec'?' · section':''))+'</b><p>'+esc(x.t)+'</p></div>';
    }).join('')+'</div>'):'<p style="color:var(--muted);font-size:13px">No matches in this chapter.</p>';
    box.querySelectorAll('[data-go]').forEach(function(el){
      el.style.cursor='pointer';
      el.onclick=function(){var t=document.getElementById(el.dataset.go);scrollToEl(t);};
    });
    var x=document.getElementById('noteResX');
    if(x)x.onclick=function(){ns.value='';box.innerHTML='';};
  };
}
function notesUnitList(){
  markView('noteslist');
  setFloatBack(goBack,'← Back');
  var C=CHNOTES[PART];
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  document.getElementById('counter').textContent=PARTS[PART].name+' — Chapter Notes';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  if(!C){card.innerHTML='<div class="end"><h2>📘 Chapter Notes</h2><p style="margin:14px 0">No study-guide notes are loaded for this part yet.</p>'+bookDownloadHtml()+'<button class="restart" id="menu">Exam Menu</button></div>';document.getElementById('menu').onclick=showMenu;return;}
  var h='<h2 style="margin-bottom:6px">📘 Chapter Notes <span style="font-weight:400;color:var(--muted);font-size:14px">— '+PARTS[PART].name+'</span></h2><p style="color:var(--muted);font-size:14px;margin-bottom:14px">Your complete study guide, chapter by chapter — forms, thresholds, rules and worked examples.</p>';
  h+=bookDownloadHtml();
  Object.keys(C).sort(function(a,b){return a-b;}).forEach(function(n){
    var u=C[n];
    var nq=(BOOKQ[PART]&&BOOKQ[PART][n])?BOOKQ[PART][n].length:0;
    h+='<button class="opt" data-nu="'+n+'"><b>SU '+n+': '+esc(u.t)+'</b><br><span style="color:var(--muted);font-size:13px">'+u.s.length+' sections · '+u.f.length+' forms · '+u.k.length+' key numbers'+(nq?' · '+nq+' study questions':'')+'</span></button>';
  });
  h+='<div class="nav2"><button class="navbtn" id="nulBack">← Exam Menu</button><span></span></div>';
  card.innerHTML=h;
  card.querySelectorAll('[data-nu]').forEach(function(b){b.onclick=function(){showNotes(b.dataset.nu,notesUnitList);};});
  document.getElementById('nulBack').onclick=showMenu;
}

// ============================================================================
// ==== NOTES LIBRARY (list of chapters)
// ============================================================================
// ---------- study notes library ----------
// Full study-guide PDFs, offered as a download alongside (or instead of) the
// interactive notes library. Keyed by Part — only parts with a book shipped show the link.
var BOOK_PDFS={
  1:{file:'books/EA-Part1-Individuals-Study-Guide.pdf', label:'EA Part 1 — Individuals Study Guide'},
  2:{file:'books/EA-Part2-Businesses-Study-Guide.pdf', label:'EA Part 2 — Businesses Study Guide'}
};
function bookDownloadHtml(){
  var b=BOOK_PDFS[PART]; if(!b)return '';
  return '<a class="dlbook" href="'+b.file+'" download>📥 Download the full book (PDF) — <span>'+b.label+'</span></a>';
}
function showLibrary(openUnit){
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  var R=REFRESH[PART];
  document.getElementById('counter').textContent=PARTS[PART].name+' — Study Notes';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  if(!R){card.innerHTML='<div class="end"><h2>📖 Study Notes</h2><p style="margin:14px 0">No study notes are loaded for this part yet.</p><button class="restart" id="menu">Exam Menu</button></div>';document.getElementById('menu').onclick=showMenu;return;}
  var h='<h2 style="margin-bottom:6px">📖 Study Notes Library</h2><p style="color:var(--muted);font-size:14px;margin-bottom:14px">Condensed rules from your study guide. Click a unit to expand its sections.</p>';
  h+=bookDownloadHtml();
  h+='<input class="searchbox" id="libSearch" placeholder="🔍 Search the notes…"><div id="libRes"></div>';
  Object.keys(R.units).sort(function(a,b){return a-b;}).forEach(function(n){
    var u=R.units[n], open=(String(openUnit)===String(n));
    h+='<button class="sechead" data-lu="'+n+'">SU '+n+': '+u.title+' <span style="color:var(--muted);font-weight:400;font-size:13px">('+u.secs.length+' sections)</span><span class="chev">'+(open?'▾':'▸')+'</span></button>';
    h+='<div class="secbody" style="display:'+(open?'block':'none')+'">';
    u.secs.forEach(function(s){
      var sec=R.secs[s.k]; if(!sec)return;
      h+='<div class="rsec" style="margin:0 0 12px;padding:10px 13px;border:1px solid var(--border);border-radius:9px"><b>'+sec.title+'</b><ul>'+sec.b.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>';
    });
    h+='</div>';
  });
  h+='<div class="nav2"><button class="navbtn" id="libBack">← Exam Menu</button><span></span></div>';
  card.innerHTML=h;
  card.querySelectorAll('[data-lu]').forEach(function(b){b.onclick=function(){showLibrary(b.dataset.lu===String(openUnit)?null:b.dataset.lu);};});
  document.getElementById('libBack').onclick=showMenu;
  var sb=document.getElementById('libSearch');
  sb.oninput=function(){
    var q=sb.value.trim().toLowerCase(), box=document.getElementById('libRes');
    if(q.length<3){box.innerHTML='';return;}
    var hits=[];
    Object.keys(R.secs).forEach(function(k){
      if(hits.length>=25)return;
      var s=R.secs[k];
      if(s.title.toLowerCase().indexOf(q)>=0||s.b.join(' ').toLowerCase().indexOf(q)>=0)hits.push(s);
    });
    box.innerHTML=hits.length?hits.map(function(s){
      return '<div class="rsec" style="margin:0 0 10px;padding:10px 13px;border:1px solid var(--border);border-radius:9px"><b>SU '+s.u+' · '+s.title+'</b><ul>'+s.b.slice(0,4).map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>';
    }).join(''):'<p style="color:var(--muted);font-size:13px">No matches.</p>';
  };
}
// Times you clocked yourself with the Start/Stop timer, shown separately from
// the automatic per-question tracking so the two are never confused.
function swReport(){
  var s=swGetAll();
  var days=Object.keys(s.days||{}).sort().reverse();
  var all=swTotal(s);
  var parts=[1,2,3].filter(function(p){return swPartTotal(s,p)>0;});
  if(!all&&!parts.length)return '';
  var h='<h4 style="margin-top:18px">⏱ Your Start/Stop Timer</h4>'+
    '<p style="margin:0 0 8px">Today: <b>'+fmtDur(swDay(s,dayKey()))+'</b> · '+
    'Yesterday: <b>'+fmtDur(swDay(s,yesterdayKey()))+'</b> · '+
    'Total: <b>'+fmtDur(all)+'</b>'+(s.run?' · <span style="color:var(--green);font-weight:700">running now</span>':'')+'</p>';
  if(parts.length){
    h+='<table><tr><th>Exam Part</th><th>Time</th></tr>'+parts.map(function(p){
      return '<tr><td>'+(PARTS[p]?PARTS[p].name:'Part '+p)+'</td><td style="white-space:nowrap">'+fmtDur(swPartTotal(s,p))+'</td></tr>';
    }).join('')+'</table>';
  }
  if(days.length){
    h+='<h4 style="margin-top:14px">Day by day</h4><table><tr><th>Day</th><th>Time</th></tr>'+days.slice(0,14).map(function(k){
      var d=new Date(k+'T12:00:00');
      var lbl=k===dayKey()?'Today':(k===yesterdayKey()?'Yesterday':d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}));
      return '<tr><td>'+lbl+'</td><td style="white-space:nowrap">'+fmtDur(s.days[k])+'</td></tr>';
    }).join('')+'</table>';
  }
  return h;
}
function timeReport(){
  var t=getTime();
  var tot=0; Object.keys(t.parts).forEach(function(k){tot+=t.parts[k];});
  if(!tot)return swReport();
  var today=t.days[new Date().toISOString().slice(0,10)]||0;
  var h='<h4 style="margin-top:18px">⏱ Study Time</h4>';
  h+='<p style="margin:0 0 8px">Total tracked: <b>'+fmtDur(tot)+'</b>'+(today?' · today: <b>'+fmtDur(today)+'</b>':'')+'</p>';
  var prows=Object.keys(t.parts).sort().map(function(p){
    return '<tr><td>'+(PARTS[p]?PARTS[p].name:'Part '+p)+'</td><td style="white-space:nowrap">'+fmtDur(t.parts[p])+'</td></tr>';
  }).join('');
  h+='<table><tr><th>Exam Part</th><th>Time</th></tr>'+prows+'</table>';
  var sets=Object.keys(t.sets).map(function(k){return {label:t.sets[k].label||k,s:t.sets[k].s||0};})
    .sort(function(a,b){return b.s-a.s;}).slice(0,12);
  if(sets.length)h+='<h4 style="margin-top:14px">By Mock / Chapter</h4><table><tr><th>Section</th><th>Time</th></tr>'+
    sets.map(function(x){return '<tr><td>'+x.label+'</td><td style="white-space:nowrap">'+fmtDur(x.s)+'</td></tr>';}).join('')+'</table>';
  var units=Object.keys(t.units).map(function(k){return {u:k,s:t.units[k]};}).sort(function(a,b){return b.s-a.s;}).slice(0,12);
  if(units.length)h+='<h4 style="margin-top:14px">By Study Unit</h4><table><tr><th>Study Unit</th><th>Time</th></tr>'+
    units.map(function(x){return '<tr><td>'+x.u+'</td><td style="white-space:nowrap">'+fmtDur(x.s)+'</td></tr>';}).join('')+'</table>';
  var tops=Object.keys(t.topics).map(function(k){return {u:k,s:t.topics[k]};}).sort(function(a,b){return b.s-a.s;}).slice(0,10);
  if(tops.length)h+='<h4 style="margin-top:14px">Most Time by Topic</h4><table><tr><th>Topic</th><th>Time</th></tr>'+
    tops.map(function(x){return '<tr><td>'+x.u+'</td><td style="white-space:nowrap">'+fmtDur(x.s)+'</td></tr>';}).join('')+'</table>';
  return swReport()+h;
}

// ============================================================================
// ==== PERFORMANCE DASHBOARD (by unit, time report)
// ============================================================================
function showDashboard(){
  markView('dash');
  setFloatBack(goBack,'← Back');
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  document.getElementById('counter').textContent='My Performance';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  const units={},topics={};let tA=0,tR=0;
  const fold=function(qs,ans){
    qs.forEach(function(q,i){
      const v=ans[i];if(v===null||v===undefined)return;
      const r=v===q.a;tA++;if(r)tR++;
      units[q.unit]=units[q.unit]||{a:0,r:0};units[q.unit].a++;if(r)units[q.unit].r++;
      topics[q.topic]=topics[q.topic]||{a:0,r:0};topics[q.topic].a++;if(r)topics[q.topic].r++;
    });
  };
  EXAMS.forEach(function(ex,e){const s=loadState(e);if(s)fold(ex.questions,s.answers);});
  MCQS.forEach(function(mc,mi){const s=mcqState(mi);if(s)fold(mc.questions,s.answers);});
  XTRA.forEach(function(g,i){const s=xState(i);if(s)fold(g.questions,s.answers);});
  if(!tA){
    card.innerHTML='<div class="end"><h2>📊 My Performance</h2><p style="margin:14px 0">No answers recorded yet — answer some questions in any mock or chapter, then check back here to see your strongest and weakest areas.</p>'+timeReport()+'<button class="restart" id="menu">Exam Menu</button></div>';
    document.getElementById('menu').onclick=showMenu;return;
  }
  const rows=function(obj,minA){return Object.entries(obj).map(function(en){const p=Math.round(en[1].r/en[1].a*100);return{u:en[0],a:en[1].a,r:en[1].r,p:p};}).filter(function(x){return x.a>=minA;}).sort(function(x,y){return x.p-y.p;});};
  const uRows=rows(units,1);
  const tRows=rows(topics,2).slice(0,15);
  const bar=function(p){const col=p>=75?'var(--green)':(p>=50?'#f59e0b':'var(--red)');return '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;min-width:80px"><div style="height:100%;width:'+p+'%;background:'+col+'"></div></div>';};
  const mk=function(list){return list.map(function(x){return '<tr><td>'+x.u+'</td><td style="white-space:nowrap">'+x.r+'/'+x.a+' ('+x.p+'%)</td><td>'+bar(x.p)+'</td></tr>';}).join('');};
  const pct=Math.round(tR/tA*100);
  card.innerHTML='<div class="end"><h2>📊 My Performance</h2>'+
    '<div class="big" style="color:'+(pct>=75?'var(--green)':'var(--red)')+'">'+pct+'%</div>'+
    '<p><b>'+tR+' of '+tA+'</b> questions answered correctly across all mocks, chapter questions, and Becker questions. The exam pass line is roughly 75% — anything below that in a section needs restudy. Weakest areas are listed first.</p>'+
    '<h4 style="margin-top:16px">By Study Unit</h4><table><tr><th>Study Unit</th><th>Score</th><th style="min-width:90px">Bar</th></tr>'+mk(uRows)+'</table>'+
    (tRows.length?'<h4 style="margin-top:16px">Weakest Topics <span style="font-weight:400;color:var(--muted)">(2+ questions answered)</span></h4><table><tr><th>Topic</th><th>Score</th><th style="min-width:90px">Bar</th></tr>'+mk(tRows)+'</table>':'')+
    '<p style="color:var(--muted);font-size:13px;margin-top:12px">Tip: use 🔁 Smart Review on the menu to drill the exact questions behind these numbers.</p>'+
    timeReport()+
    '<button class="restart" id="menu">Exam Menu</button></div>';
  document.getElementById('menu').onclick=showMenu;
}

// ============================================================================
