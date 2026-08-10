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
// "I'm weak on this chapter, come back to it" flags — one per part, synced
// across devices like the rest of study progress (unlike notesSecState
// above, this isn't a display preference, so it isn't device-local).
function weakKey(){return 'ea3quiz_weak_p'+PART;}
function weakState(){try{return JSON.parse(localStorage.getItem(weakKey()))||{};}catch(e){return {};}}
function weakSave(s){try{localStorage.setItem(weakKey(),JSON.stringify(s));}catch(e){}}
function isWeakChapter(unit){return !!weakState()[unit];}
function setWeakChapter(unit,weak){var s=weakState();if(weak)s[unit]=true;else delete s[unit];weakSave(s);}
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
  var headers=rows[0]||[];
  var h='<table class="ntable"><tr>'+headers.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
  rows.slice(1).forEach(function(cells){
    // data-label feeds the narrow-screen layout (styles.css), where each row
    // collapses into a labeled card instead of columns too thin to read.
    h+='<tr>'+cells.map(function(c,ci){return '<td data-label="'+esc(headers[ci]||'')+'">'+esc(c)+'</td>';}).join('')+'</tr>';
  });
  return h+'</table>';
}
function notesIndex(n){
  var u=CHNOTES[PART][n];
  var h='<button class="side-close" id="sideClose">✕ Close</button><div class="side-hd">SU '+n+' — Contents</div>';
  h+='<button class="side-btn" data-jump="summary">🧭 Summary</button>';
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
// ---- Chapter summary: one tight bullet per section, numbers preserved verbatim ----
// Built mechanically from the same curated section/key-number data as the full
// notes below — never AI-generated — so a $ threshold or % rate can't quietly
// drift or go missing in the condensing. Each bullet is the section's own
// first substantive sentence (skipping bare list items, which are rarely full
// sentences) plus, verbatim, any Key Numbers entries already tagged to that
// exact section title.
// Pulls the lead sentence(s) off a paragraph rather than always just the
// first one: many of these paragraphs open with a short throat-clearing
// sentence ("The rules are different for Roth IRA distributions.") with the
// actual substance in the sentence right after it, so stopping at sentence 1
// unconditionally produced vacuous gists. Keeps adding whole sentences until
// the gist is substantial (~90 chars) or it has two, whichever comes first —
// and never adds a sentence that would need to be cut in half to fit maxLen;
// a fragment can flip or lose meaning, a short-but-complete gist can't.
// Footnote markers glued straight onto the period (e.g. "...income.177") hide
// the real sentence boundary — used both when checking whether text looks
// like a real sentence and when splitting it, so a footnoted ending doesn't
// get mistaken for "no terminal punctuation" in one place and stripped in
// the other. The same marker turns up glued onto a mid-sentence comma just
// as often (e.g. "...Acceptance Agent,13 to request..."), left dangling
// right in the middle of a gist if not stripped the same way — a digit
// glued after a letter+comma is never part of the real number the way
// "$1,234" is (that comma is always preceded by a digit, not a letter), so
// this can't be confused with an actual thousands separator.
function _stripFootnoteMarkers(text){
  return String(text||'')
    .replace(/([a-zA-Z%\)])\.(\d{1,3})(?=\s|$)/g,'$1.')
    .replace(/([a-zA-Z%\)]),(\d{1,3})(?=\s|$)/g,'$1,');
}
function _leadSentences(text,maxLen){
  var t=_stripFootnoteMarkers(text).trim();
  // Abbreviations like "U.S." or "I.R.S." are internal periods with no
  // trailing space, which the boundary regex below can't tell apart from a
  // real sentence end otherwise — it would match nothing at the true start
  // and resync mid-word, producing garbage like "S. S.". A decimal number
  // like the "2.0" in "SECURE 2.0 Act" has the same problem, but worse:
  // since nothing ever follows that period with whitespace, no match
  // succeeds there at all, and the regex silently resyncs on the *next*
  // real sentence end further down the text — quietly truncating
  // everything up to and including "2." off the front, e.g. "Under the
  // SECURE 2." vanishes entirely and the piece starts mid-word: "0 Act,
  // distributions...". Temporarily swap both kinds of period for a
  // placeholder so neither can be mistaken for a boundary, then restore
  // them in each extracted piece afterward.
  var PH='\u0001';
  var hasAbbr=/\b(?:[A-Za-z]\.){2,}/.test(t);
  var hasDecimal=/\d\.\d/.test(t);
  var work=t;
  if(hasAbbr)work=work.replace(/\b(?:[A-Za-z]\.){2,}/g,function(m){return m.split('.').join(PH);});
  if(hasDecimal)work=work.replace(/(\d)\.(\d)/g,function(m,a,b){return a+PH+b;});
  // A quoted term ("the "kiddie tax." We start...") has the identical
  // problem one step removed: the period is followed by a closing quote
  // mark, not whitespace, so the same resync-and-truncate happens — the
  // closing quote itself ends up stranded as the first character of the
  // next piece. Let optional closing quote/paren characters ride along with
  // the terminal punctuation itself (not just the lookahead) so they're
  // captured as part of the sentence that ends, not left dangling for the
  // next one.
  var re=/[^.!?]*[.!?]+["'”’)]*(?=\s|$)/g, m, sentences=[];
  while((m=re.exec(work))){
    var piece=m[0].trim();
    if(!piece)continue;
    if(hasAbbr||hasDecimal)piece=piece.split(PH).join('.');
    sentences.push(piece);
    if(sentences.length>=3)break; // hard stop regardless of length
  }
  if(!sentences.length) return t.length>maxLen ? _clipToBoundary(t,maxLen) : t;
  var out='';
  for(var i=0;i<sentences.length;i++){
    var candidate=out?out+' '+sentences[i]:sentences[i];
    if(candidate.length>maxLen){
      // A leftover fragment (e.g. "2025." — the tail of a sentence a source
      // "rule" entry got split at) is too thin to strand as the whole gist,
      // even though it's technically a complete match on its own — extend
      // into the next sentence via clipping rather than returning it alone.
      // Once we already have something substantial, stop instead of cutting it.
      if(out.length<30) return _clipToBoundary(candidate,maxLen);
      break;
    }
    out=candidate;
    if(out.length>=90)break;
  }
  return out;
}
function _clipToBoundary(s,maxLen){
  var cut=s.lastIndexOf(', ',maxLen);
  if(cut<maxLen*0.5)cut=s.lastIndexOf(' ',maxLen);
  return s.slice(0,cut>0?cut:maxLen).replace(/[,;:]+$/,'')+'…';
}
// Book-extraction artifacts sometimes leave a bare label or heading fragment
// ("Study Unit", "4", "More Reading:", "Exam Note") tagged the same as real
// body text, or split one real sentence across two "rule" entries at a
// comma ("...after July 4," / "2025."). Validating the EXTRACTED gist
// (rather than pre-checking the raw candidate's own ending) means a real
// sentence that's simply followed by a colon-introduced list — "IRS Written
// Determinations are ... open to public inspection. There are many types
// ..., including:" — still gets recognized, since _leadSentences already
// stops at the first complete, substantial sentence and never reaches the
// colon. A genuine result ends in . ! or … (optionally inside a closing
// quote/paren), starts with a capital letter/digit/quote — not lowercase,
// which marks a continuation fragment like "child has)." — and runs longer
// than a stray leftover. A colon ending is also accepted, but only once
// it's substantial (40+ chars): a real "...allow expensing in specific
// instances:" lead-in is worth showing even without its list, but a bare
// "More Reading:" label is not — length is what tells them apart.
function _isUsableGist(g){
  if(!g||g.length<20)return false;
  if(!/[.!?…]["'”’)]*$/.test(g) && !(g.length>=40 && /:$/.test(g)))return false;
  var firstChar=g.replace(/^["'“‘(]+/,'').charAt(0);
  if(/[a-z]/.test(firstChar))return false;
  // A numbered sub-heading ("2) Separation of Liability Relief.") reads as a
  // grammatically complete sentence to the checks above but is really just a
  // list marker's label, not a fact. Genuine content that happens to start
  // with a number still has a $ or % in it somewhere; a bare label doesn't.
  if(/^\(?\d+[.)]\s/.test(g)&&!/[$%]/.test(g))return false;
  return true;
}
// A source paragraph ('rule'-kind) almost always comes before the bullet
// list ('li'-kind) that follows it, and the paragraph is very often just a
// throat-clearing definition ("MFS is one of the options available to
// married couples...") while the actual thresholds and specific rules live
// in the bullets right after it. Picking "the first candidate that reads
// like a real sentence," full stop, means the vacuous definition wins every
// time and the list of $ amounts and specific conditions right below it
// never even gets considered. Score every candidate instead — 'li' included,
// not just a last-resort fallback — and prefer the first one carrying an
// actual number, since that's the whole point of a "numbers included"
// summary. Falls back to plain reading order when nothing in the section
// states a number at all, so a purely conceptual section still gets a gist.
function _hasQuantSignal(text){
  if(/\$[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?%/.test(text))return true;
  // A bare number can still be a real threshold worth surfacing — an age, a
  // day count, a contribution cap stated without a $ sign — but plenty of
  // bare digits in this content are form numbers ("Form 8379"), publication/
  // schedule/part references ("Part 2, Businesses"), or just the tax year
  // ("2025") mentioned in passing. Strip those out before checking so they
  // can't win a slot meant for actual thresholds.
  var stripped=text
    .replace(/\b(?:Form|Schedule|Publication|Part)\s+[\w-]+/gi,'')
    .replace(/\b20\d{2}\b/g,'');
  return /\b\d{1,3}\b/.test(stripped);
}
function _sectionGist(s){
  var candidates=[];
  for(var j=0;j<s.i.length;j++){
    var kind=s.i[j][0];
    if(kind==='table'||kind==='ex')continue;
    var g=_leadSentences(s.i[j][1],200);
    if(_isUsableGist(g))candidates.push(g);
  }
  if(!candidates.length)return '';
  for(var k=0;k<candidates.length;k++){
    if(_hasQuantSignal(candidates[k]))return candidates[k];
  }
  return candidates[0];
}
// Bolds $ amounts and % rates so the thresholds jump out at a skim — the rest
// of the key-number sentence stays as-is, nothing is trimmed or reworded.
function _highlightNums(text){
  return esc(text).replace(/\$[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?%/g,function(m){return '<b>'+m+'</b>';});
}
// A key number's .sec tag has to match a section's .t title verbatim to
// land in that section's summary bullet — but source extraction sometimes
// tags one with a numbering prefix the section title carries ("3) Married
// Filing Separately...") or a smart-vs-straight quote the title doesn't
// (curly ' vs '), so an otherwise-real match silently fails string equality
// and the number just vanishes from the summary. Normalize both sides
// before comparing so formatting noise can't cost a real match.
function _normalizeSecLabel(s){
  return String(s||'')
    .replace(/^\s*\d+\)\s*/,'')
    .replace(/[‘’]/g,"'")
    .replace(/[“”]/g,'"')
    .trim();
}
function chapterSummaryHTML(u){
  var titleBySec={};
  u.s.forEach(function(s){ titleBySec[_normalizeSecLabel(s.t)]=s.t; });
  var byTitle={}, unmatched=[];
  u.k.forEach(function(x){
    var real=titleBySec[_normalizeSecLabel(x.sec)];
    if(real)(byTitle[real]=byTitle[real]||[]).push(x.t);
    else unmatched.push(x.t); // e.g. numbers sourced from the end-of-chapter
    // review questions rather than a detailed-notes section — still real,
    // still worth surfacing, just with nowhere else in this list to attach to.
  });
  var h='<p style="color:var(--muted);font-size:13px;margin-bottom:10px">A quick pass through every topic in this chapter, numbers included — the full notes below go deeper.</p><ul class="nsum-list">';
  u.s.forEach(function(s){
    // s.sum is a hand-written summary, filled in chapter by chapter — actual
    // explanatory prose rather than a sentence lifted verbatim from the
    // source text. Falls back to the mechanical extraction below for any
    // chapter that doesn't have one yet. s.sumTable is a hand-authored,
    // already-escaped HTML fragment (e.g. a comparison table like Coverdell
    // vs. 529) — used as-is, not passed through esc(), for the rare section
    // where a table genuinely reads clearer than another paragraph of prose.
    var gist=s.sum||_sectionGist(s);
    var nums=byTitle[s.t]||[];
    h+='<li'+(s.l===3?' class="nsum-sub"':'')+'><b>'+esc(s.t)+'</b>'+(gist?' — '+esc(gist):'')+
       (s.sumTable||'')+
       (nums.length?'<ul class="nsum-nums">'+nums.map(function(t){return '<li>'+_highlightNums(t)+'</li>';}).join('')+'</ul>':'')+
       '</li>';
  });
  if(unmatched.length){
    h+='<li><b>Also worth knowing</b><ul class="nsum-nums">'+unmatched.map(function(t){return '<li>'+_highlightNums(t)+'</li>';}).join('')+'</ul></li>';
  }
  h+='</ul>';
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
  // summary
  var summaryOpen=notesSecOpen(n,'summary');
  h+='<button type="button" class="nh sechead" id="summary" data-secn="summary"><span>🧭 Chapter summary</span><span class="chev">'+(summaryOpen?'▾':'▸')+'</span></button>';
  h+='<div class="secbody" id="secbody-summary" style="display:'+(summaryOpen?'block':'none')+'">'+chapterSummaryHTML(u)+'</div>';
  // forms
  var formsOpen=notesSecOpen(n,'forms');
  h+='<button type="button" class="nh sechead" id="forms" data-secn="forms"><span>📄 Forms in this chapter</span><span class="chev">'+(formsOpen?'▾':'▸')+'</span></button>';
  h+='<div class="secbody" id="secbody-forms" style="display:'+(formsOpen?'block':'none')+'">';
  if(u.f.length){
    h+='<table class="ntable"><tr><th class="form-col">Form</th><th>Official title</th><th>What it is for</th></tr>';
    u.f.forEach(function(f){
      h+='<tr><td class="form-col" data-label="Form"><b>'+esc(f.f)+'</b></td><td data-label="Official title">'+esc(f.ttl||'')+'</td><td data-label="What it is for">'+esc(f.t)+
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
  // sections — each one collapsible on its own (default open, same as Forms/Key
  // numbers above), plus a bulk toggle since a chapter can run 30-40 sections.
  var anyDetailOpen=u.s.some(function(s,i){return notesSecOpen(n,'s'+i);});
  h+='<div class="nh" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span>📚 Detailed notes</span>'+
     '<button type="button" class="mpill" id="notesToggleAll" style="padding:4px 12px">'+(anyDetailOpen?'Collapse all':'Expand all')+'</button></div>';
  u.s.forEach(function(s,i){
    var open=notesSecOpen(n,'s'+i);
    h+='<div class="nsec" id="s'+i+'"><button type="button" class="'+(s.l===3?'nsub':'nsec-h')+'" data-secn="s'+i+'"><span>'+esc(s.t)+'</span><span class="chev">'+(open?'▾':'▸')+'</span></button>';
    h+='<div class="secbody" id="secbody-s'+i+'" style="display:'+(open?'block':'none')+'">';
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
    h+='</div></div>';
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
      var toggleAll=document.getElementById('notesToggleAll');
      if(toggleAll&&/^s\d+$/.test(key)){
        var anyOpen=u.s.some(function(s,i){return notesSecOpen(n,'s'+i);});
        toggleAll.textContent=anyOpen?'Collapse all':'Expand all';
      }
    };
  });
  var toggleAllBtn=document.getElementById('notesToggleAll');
  if(toggleAllBtn)toggleAllBtn.onclick=function(){
    var anyOpen=u.s.some(function(s,i){return notesSecOpen(n,'s'+i);});
    var openTo=!anyOpen; // any open -> this click collapses everything; none open -> expands everything
    u.s.forEach(function(s,i){
      notesSecSetOpen(n,'s'+i,openTo);
      var body=document.getElementById('secbody-s'+i), head=card.querySelector('[data-secn="s'+i+'"]');
      if(body)body.style.display=openTo?'block':'none';
      if(head){var chev=head.querySelector('.chev');if(chev)chev.textContent=openTo?'▾':'▸';}
    });
    toggleAllBtn.textContent=openTo?'Collapse all':'Expand all';
  };
  // Jumping to (or search-landing on) a collapsed section would show a header
  // with nothing visible below it — auto-open whatever the target belongs to.
  // Works uniformly for forms/nums/summary/detail sections since they all
  // share the same sechead + secbody-KEY + notesSecOpen(n,KEY) shape.
  function notesJumpTo(key){
    var el=document.getElementById(key);
    if(!notesSecOpen(n,key)){
      notesSecSetOpen(n,key,true);
      var body=document.getElementById('secbody-'+key);
      if(body)body.style.display='block';
      if(el){var chev=el.querySelector('.chev');if(chev)chev.textContent='▾';}
    }
    scrollToEl(el);
  }
  side.querySelectorAll('[data-jump]').forEach(function(b){
    b.onclick=function(){ side.classList.remove('open'); notesJumpTo(b.dataset.jump); };
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
        if(hits.length>=30||p[0]==='table')return; // raw pipe-delimited table rows read as garbage in a one-line snippet
        if(p[1].toLowerCase().indexOf(q)>=0)hits.push({sec:s.t,k:p[0],t:p[1],jump:si});
      });
    });
    box.innerHTML=hits.length?('<div class="nres nresbox"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between"><span>'+hits.length+' match'+(hits.length>1?'es':'')+' — click to jump</span><button id="noteResX" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px">✕</button></div>'+hits.map(function(x){
      return '<div class="nresi" data-go="s'+x.jump+'"><b>'+esc(x.sec)+(x.k==='ex'?' · example':(x.k==='sec'?' · section':''))+'</b><p>'+esc(x.t)+'</p></div>';
    }).join('')+'</div>'):'<p style="color:var(--muted);font-size:13px">No matches in this chapter.</p>';
    box.querySelectorAll('[data-go]').forEach(function(el){
      el.style.cursor='pointer';
      el.onclick=function(){ notesJumpTo(el.dataset.go); };
    });
    var x=document.getElementById('noteResX');
    if(x)x.onclick=function(){ns.value='';box.innerHTML='';};
  };
}
// ============================================================================
// ==== CHAPTER NOTES: continuous "book" scroll (all chapters, one page)
// ============================================================================
// Reading mode: chapters render fully expanded (no per-section accordions —
// the point is nothing to click), one after another, with the next chapter
// appended automatically as you scroll near the bottom. Bookq/flashcard ids
// from the single-chapter view (showNotes) aren't safe to reuse verbatim
// here since multiple chapters now share one DOM — every id below is
// namespaced with the unit number so chapters can coexist without colliding.
var BOOK_IO=null, BOOK_HDIO=null;
// Reading-progress bar: how far down the whole book you are, not just this
// chapter. Self-guarding on #chbkWrap so it's a no-op outside book view —
// no separate teardown needed when the user navigates away.
window.addEventListener('scroll',function(){
  if(!document.getElementById('chbkWrap'))return;
  var doc=document.documentElement;
  var max=doc.scrollHeight-window.innerHeight;
  var pct=max>0?Math.min(100,Math.max(0,(window.pageYOffset||doc.scrollTop||0)/max*100)):0;
  var prog=document.getElementById('prog');
  if(prog)prog.style.width=pct+'%';
},{passive:true});
function chapterUnitOrder(){
  return Object.keys(CHNOTES[PART]).sort(function(a,b){return a-b;});
}
// Same question/answer UI as bookqHTML/wireBookq (study-tools.js), but every
// id carries the unit so answering chapter 5's Q2 can't touch chapter 2's Q2.
function bookqHTMLScoped(n){
  var B=BOOKQ[PART]; if(!B||!B[n]||!B[n].length)return '';
  var qs=B[n], st=bqState(), done=0, right=0;
  qs.forEach(function(q,i){var v=st[n+':'+i]; if(v!==undefined&&v!==null){done++; if(v===q.a)right++;}});
  var h='<h3 class="nh" id="bookq-'+n+'">📝 Study Questions <span style="font-weight:400;color:var(--muted);font-size:13px">('+qs.length+' from this chapter'+(done?' · '+right+'/'+done+' correct':'')+')</span></h3>';
  h+='<p style="color:var(--muted);font-size:13px;margin:0 0 12px">Pick an answer and the book’s explanation appears underneath. <a href="#" class="bqReset" data-n="'+n+'">Reset answers</a></p>';
  var L=['A','B','C','D'];
  qs.forEach(function(q,i){
    var sel=st[n+':'+i]; var answered=(sel!==undefined&&sel!==null);
    h+='<div class="bq" id="bq-'+n+'-'+i+'"><div class="bqq"><span class="bqn">'+(i+1)+'.</span> '+esc(q.q)+'</div>';
    h+='<div class="bqopts">';
    q.opts.forEach(function(o,j){
      var cls='bqopt';
      if(answered){ if(j===q.a)cls+=' correct'; else if(j===sel)cls+=' wrong'; else cls+=' dim'; }
      h+='<button class="'+cls+'" data-bqn="'+n+'" data-bq="'+i+'" data-opt="'+j+'"'+(answered?' disabled':'')+'><b>'+L[j]+'.</b> '+esc(o)+'</button>';
    });
    h+='</div>';
    h+='<div class="bqans" id="bqans-'+n+'-'+i+'"'+(answered?'':' style="display:none"')+'>';
    if(answered){
      h+='<div class="bqverdict '+(sel===q.a?'ok':'no')+'">'+(sel===q.a?'✓ Correct':'✗ Incorrect — the answer is '+L[q.a])+'</div><div class="why">'+fmtExpl(q.expl)+'</div>';
    }
    h+='</div></div>';
  });
  return h;
}
function wireBookqScoped(n,root){
  var B=BOOKQ[PART]; if(!B||!B[n])return;
  var qs=B[n], L=['A','B','C','D'];
  // Same "every view counts, including already-answered ones" rule as
  // wireBookq in study-tools.js — see the comment there. This also runs
  // again after "Reset answers" re-wires the section, but by then bqState()
  // has nothing left for this chapter, so nothing gets double-counted.
  (function(){
    var s0=bqState();
    qs.forEach(function(q,i){ if(s0[n+':'+i]!==undefined&&s0[n+':'+i]!==null)recordAnswerToday(); });
  })();
  root.querySelectorAll('[data-bqn="'+n+'"]').forEach(function(b){
    b.onclick=function(){
      var i=+b.dataset.bq, j=+b.dataset.opt, q=qs[i];
      var s=bqState(); var firstAnswer=(s[n+':'+i]===undefined||s[n+':'+i]===null);
      s[n+':'+i]=j; bqSave(s);
      if(firstAnswer)recordAnswerToday();
      var wrap=document.getElementById('bq-'+n+'-'+i);
      wrap.querySelectorAll('.bqopt').forEach(function(o,k){
        o.disabled=true; o.classList.remove('correct','wrong','dim');
        if(k===q.a)o.classList.add('correct'); else if(k===j)o.classList.add('wrong'); else o.classList.add('dim');
      });
      var ans=document.getElementById('bqans-'+n+'-'+i);
      ans.innerHTML='<div class="bqverdict '+(j===q.a?'ok':'no')+'">'+(j===q.a?'✓ Correct':'✗ Incorrect — the answer is '+L[q.a])+'</div><p>'+esc(q.expl)+'</p>';
      ans.style.display='block';
      var hdr=document.querySelector('#bookq-'+n+' span');
      if(hdr){
        var st2=bqState(),d=0,r=0;
        qs.forEach(function(qq,ii){var v=st2[n+':'+ii];if(v!==undefined&&v!==null){d++;if(v===qq.a)r++;}});
        hdr.textContent='('+qs.length+' from this chapter'+(d?' · '+r+'/'+d+' correct':'')+')';
      }
    };
  });
  root.querySelectorAll('.bqReset[data-n="'+n+'"]').forEach(function(rs){
    rs.onclick=function(e){
      e.preventDefault();
      var s=bqState();
      Object.keys(s).forEach(function(k){if(k.indexOf(n+':')===0)delete s[k];});
      bqSave(s);
      var mount=document.getElementById('bookqwrap-'+n);
      if(mount){ mount.innerHTML=bookqHTMLScoped(n); wireBookqScoped(n,mount); }
    };
  });
}
// Collapsible headers (summary/forms/key numbers/each detail section) — same
// shape as showNotes' single-chapter view, but every id carries the unit
// number so multiple chapters' collapse state can coexist in one DOM.
// notesSecOpen/notesSecSetOpen (defined above) are already keyed by
// PART+unit+name, so no changes needed there — only the DOM ids here.
function chapterBlockHTML(n){
  var u=CHNOTES[PART][n];
  var h='<section class="chbk" id="chbk-'+n+'" data-unit="'+n+'">';
  var weak=isWeakChapter(n);
  h+='<div class="chbk-hd" data-hd="'+n+'"><h2 style="margin:0 0 2px">SU '+n+': '+esc(u.t)+'</h2>'+
     '<p style="color:var(--muted);font-size:13px;margin:0">Complete notes from your '+PARTS[PART].name+' study guide — forms, thresholds, rules'+(u.ex?', and worked examples':'')+'.</p></div>';
  h+='<button type="button" class="wkflag'+(weak?' on':'')+'" data-wkunit="'+n+'">'+(weak?'🚩 Flagged as weak — tap to clear':'🏳️ Flag this chapter as weak')+'</button>';
  var fcCount=(typeof chapterCardCount==='function')?chapterCardCount(n):0;
  if(fcCount){
    h+='<button type="button" class="fcstart" data-fcunit="'+n+'"><span class="fcstart-ico">🧠</span><span class="fcstart-t"><b>Flashcards for this chapter</b><br><span style="color:var(--muted);font-size:12.5px">Forms, key numbers &amp; deadlines — '+fcCount+' card'+(fcCount===1?'':'s')+'</span></span><span class="fcstart-go">→</span></button>';
  }
  // summary
  var summaryOpen=notesSecOpen(n,'summary');
  h+='<button type="button" class="nh sechead" id="sechead-'+n+'-summary" data-secn="summary"><span>🧭 Chapter summary</span><span class="chev">'+(summaryOpen?'▾':'▸')+'</span></button>';
  h+='<div class="secbody" id="secbody-'+n+'-summary" style="display:'+(summaryOpen?'block':'none')+'">'+chapterSummaryHTML(u)+'</div>';
  // forms
  var formsOpen=notesSecOpen(n,'forms');
  h+='<button type="button" class="nh sechead" id="sechead-'+n+'-forms" data-secn="forms"><span>📄 Forms in this chapter</span><span class="chev">'+(formsOpen?'▾':'▸')+'</span></button>';
  h+='<div class="secbody" id="secbody-'+n+'-forms" style="display:'+(formsOpen?'block':'none')+'">';
  if(u.f.length){
    h+='<table class="ntable"><tr><th class="form-col">Form</th><th>Official title</th><th>What it is for</th></tr>';
    u.f.forEach(function(f){
      h+='<tr><td class="form-col" data-label="Form"><b>'+esc(f.f)+'</b></td><td data-label="Official title">'+esc(f.ttl||'')+'</td><td data-label="What it is for">'+esc(f.t)+
         (f.bk?'<div class="fbook"><b>From the book:</b> '+esc(f.bk)+(f.bksec?'<span class="nsrc"> '+esc(f.bksec)+'</span>':'')+'</div>':'')+
         '</td></tr>';
    });
    h+='</table>';
  } else h+='<p style="color:var(--muted)">No forms referenced in this chapter.</p>';
  h+='</div>';
  // key numbers
  var numsOpen=notesSecOpen(n,'nums');
  h+='<button type="button" class="nh sechead" id="sechead-'+n+'-nums" data-secn="nums"><span>🔢 Key numbers, thresholds &amp; deadlines</span><span class="chev">'+(numsOpen?'▾':'▸')+'</span></button>';
  h+='<div class="secbody" id="secbody-'+n+'-nums" style="display:'+(numsOpen?'block':'none')+'">';
  if(u.k.length){
    h+='<ul class="nlist">'+u.k.map(function(x){return '<li>'+esc(x.t)+'<div class="nsrc">'+esc(x.sec)+'</div></li>';}).join('')+'</ul>';
  } else h+='<p style="color:var(--muted)">No specific thresholds listed in this chapter.</p>';
  h+='</div>';
  // detailed notes — each section collapsible on its own, plus a bulk toggle
  var anyDetailOpen=u.s.some(function(s,i){return notesSecOpen(n,'s'+i);});
  h+='<div class="nh" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span>📚 Detailed notes</span>'+
     '<button type="button" class="mpill" data-toggleall="'+n+'" style="padding:4px 12px">'+(anyDetailOpen?'Collapse all':'Expand all')+'</button></div>';
  u.s.forEach(function(s,i){
    var open=notesSecOpen(n,'s'+i);
    h+='<div class="nsec" id="chbk-'+n+'-s'+i+'"><button type="button" class="'+(s.l===3?'nsub':'nsec-h')+'" data-secn="s'+i+'"><span>'+esc(s.t)+'</span><span class="chev">'+(open?'▾':'▸')+'</span></button>';
    h+='<div class="secbody" id="secbody-'+n+'-s'+i+'" style="display:'+(open?'block':'none')+'">';
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
    h+='</div></div>';
  });
  h+='<div id="bookqwrap-'+n+'">'+bookqHTMLScoped(n)+'</div>';
  h+='</section><div class="chbk-div"><span>End of Study Unit '+n+'</span></div>';
  return h;
}
function wireChapterBlock(n){
  var root=document.getElementById('chbk-'+n);
  if(!root)return;
  var fcBtn=root.querySelector('[data-fcunit="'+n+'"]');
  if(fcBtn)fcBtn.onclick=function(){ startChapterFlashcards(n,function(){ showNotesBook(n); }); };
  wireBookqScoped(n,root);
  var wkBtn=root.querySelector('[data-wkunit="'+n+'"]');
  if(wkBtn)wkBtn.onclick=function(){
    var weak=!isWeakChapter(n);
    setWeakChapter(n,weak);
    wkBtn.classList.toggle('on',weak);
    wkBtn.textContent=weak?'🚩 Flagged as weak — tap to clear':'🏳️ Flag this chapter as weak';
    // Keep the TOC drawer's chapter-list flag icon (if the side panel is
    // currently showing one for this chapter) in sync without re-rendering
    // the whole panel.
    var chBtn=side.querySelector('[data-jumpchapter="'+n+'"]');
    if(chBtn){
      var mark=chBtn.querySelector('.wkmark');
      if(weak&&!mark){ chBtn.insertAdjacentHTML('afterbegin','<span class="wkmark">🚩 </span>'); }
      else if(!weak&&mark){ mark.remove(); }
    }
  };
  var u=CHNOTES[PART][n];
  root.querySelectorAll('[data-secn]').forEach(function(b){
    b.onclick=function(){
      var key=b.dataset.secn;
      var open=!notesSecOpen(n,key);
      notesSecSetOpen(n,key,open);
      var body=document.getElementById('secbody-'+n+'-'+key), chev=b.querySelector('.chev');
      if(body)body.style.display=open?'block':'none';
      if(chev)chev.textContent=open?'▾':'▸';
      refreshToggleAllLabel(n);
    };
  });
  var toggleAllBtn=root.querySelector('[data-toggleall="'+n+'"]');
  if(toggleAllBtn)toggleAllBtn.onclick=function(){
    var anyOpen=u.s.some(function(s,i){return notesSecOpen(n,'s'+i);});
    var openTo=!anyOpen;
    u.s.forEach(function(s,i){
      notesSecSetOpen(n,'s'+i,openTo);
      var body=document.getElementById('secbody-'+n+'-s'+i), head=root.querySelector('[data-secn="s'+i+'"]');
      if(body)body.style.display=openTo?'block':'none';
      if(head){var chev=head.querySelector('.chev');if(chev)chev.textContent=openTo?'▾':'▸';}
    });
    toggleAllBtn.textContent=openTo?'Collapse all':'Expand all';
  };
}
function refreshToggleAllLabel(n){
  var root=document.getElementById('chbk-'+n), toggleAllBtn=root&&root.querySelector('[data-toggleall="'+n+'"]');
  if(!toggleAllBtn)return;
  var u=CHNOTES[PART][n];
  var anyOpen=u.s.some(function(s,i){return notesSecOpen(n,'s'+i);});
  toggleAllBtn.textContent=anyOpen?'Collapse all':'Expand all';
}
// Opens a collapsed summary/forms/nums/section (used when jumping to it via
// search or the side panel, matching notesJumpTo in the single-chapter view —
// landing on a collapsed header with nothing visible below it is no good).
function openChapterSection(n,key){
  if(notesSecOpen(n,key))return;
  notesSecSetOpen(n,key,true);
  var body=document.getElementById('secbody-'+n+'-'+key);
  if(body)body.style.display='block';
  var root=document.getElementById('chbk-'+n), btn=root&&root.querySelector('[data-secn="'+key+'"]');
  var chev=btn&&btn.querySelector('.chev');
  if(chev)chev.textContent='▾';
  refreshToggleAllLabel(n);
}
// Side-panel contents for jumping *within* the chapter currently in view —
// summary/forms/key numbers/study questions/section list, same set the
// single-chapter view's own side panel (notesIndex) offers. Re-rendered
// whenever the active chapter changes so it always reflects what's on screen.
function notesBookChapterJumpHTML(n){
  var u=CHNOTES[PART][n];
  var h='<div class="side-hd" style="position:sticky;top:-12px">SU '+n+' — Contents</div>';
  h+='<button class="side-btn" data-jumpsec="summary">🧭 Summary</button>';
  h+='<button class="side-btn" data-jumpsec="forms">📄 Forms ('+u.f.length+')</button>';
  h+='<button class="side-btn" data-jumpsec="nums">🔢 Key numbers ('+u.k.length+')</button>';
  if(BOOKQ[PART]&&BOOKQ[PART][n]&&BOOKQ[PART][n].length)
    h+='<button class="side-btn" data-jumpsec="bookq">📝 Study questions ('+BOOKQ[PART][n].length+')</button>';
  h+='<div style="margin-top:8px;font-size:12px;color:var(--muted)">Sections</div>';
  u.s.forEach(function(s,i){
    h+='<button class="side-btn" data-jumpsec="s'+i+'" style="text-align:left;font-size:12.5px;padding:7px 9px'+(s.l===3?';padding-left:18px':'')+'">'+esc(s.t)+'</button>';
  });
  return h;
}
function notesBookIndex(order,activeUnit){
  var h='<button class="side-close" id="sideClose">✕ Close</button>';
  h+='<div id="bookChapterJump">'+notesBookChapterJumpHTML(activeUnit)+'</div>';
  h+='<div style="margin:14px 0 10px;border-top:1px solid var(--border)"></div>';
  h+='<div class="side-hd" style="position:sticky;top:-12px">'+esc(PARTS[PART].name)+' — Chapters</div>';
  order.forEach(function(n){
    h+='<button class="side-btn'+(n===String(activeUnit)?' on':'')+'" data-jumpchapter="'+n+'" style="text-align:left">'+(isWeakChapter(n)?'<span class="wkmark">🚩 </span>':'')+'SU '+n+': '+esc(CHNOTES[PART][n].t)+'</button>';
  });
  h+='<button class="side-btn" id="notesBookBack" style="margin-top:10px">← Chapter list</button>';
  return h;
}
function showNotesBook(startUnit){
  startUnit=String(startUnit);
  var C=CHNOTES[PART];
  if(!C||!C[startUnit]){ notesUnitList(); return; }
  stopTimer();stopClock();
  var order=chapterUnitOrder();
  var startIdx=order.indexOf(startUnit); if(startIdx<0)startIdx=0;
  markView('notesbook',{unit:startUnit});
  side.classList.add('active');side.classList.remove('open');document.body.classList.add('inquiz');
  document.getElementById('counter').textContent='SU '+startUnit+': '+C[startUnit].t+' — Chapter Notes';
  document.getElementById('score').textContent='Study guide';
  document.getElementById('prog').style.width='0%';
  var h='<p style="color:var(--muted);font-size:13px;margin:0 0 10px">Scroll down for the next chapter — every chapter in '+esc(PARTS[PART].name)+' follows in order, no need to go back.</p>';
  h+='<div class="nsearchwrap" style="position:static;height:auto;justify-content:stretch;margin-bottom:14px"><input class="nsearch" id="bookSearch" style="width:100%" placeholder="🔍 Search all of '+esc(PARTS[PART].name)+'"></div><div id="bookSearchRes"></div>';
  h+='<div class="chbk-wrap" id="chbkWrap">'+chapterBlockHTML(startUnit)+'</div>';
  h+='<div class="chbk-sentinel" id="chbkSentinel"></div><div class="chbk-loading" id="chbkLoading" style="display:none"></div>';
  h+='<div class="nav2"><button class="navbtn" id="chbkBack">← Chapter list</button><span></span></div>';
  card.innerHTML=h;
  var back=function(){ notesUnitList(); };
  document.getElementById('chbkBack').onclick=back;
  setFloatBack(back,'← Chapter list');
  side.innerHTML=notesBookIndex(order,startUnit);
  wireChapterBlock(startUnit);
  var lastActiveUnit=startUnit;
  wireChapterJumpBox(document.getElementById('bookChapterJump'),startUnit);

  // Keeps the header, the "Chapters" highlight, and the within-chapter jump
  // list (Summary/Forms/Key numbers/Sections) all pointed at whichever
  // chapter is actually on screen — called both as you scroll and on an
  // explicit jump, so the side panel never shows the wrong chapter's sections.
  function updateActiveChapterUI(n){
    if(n===lastActiveUnit)return;
    lastActiveUnit=n;
    document.getElementById('counter').textContent='SU '+n+': '+C[n].t+' — Chapter Notes';
    side.querySelectorAll('[data-jumpchapter]').forEach(function(b){b.classList.toggle('on',b.dataset.jumpchapter===n);});
    var jumpBox=document.getElementById('bookChapterJump');
    if(jumpBox){ jumpBox.innerHTML=notesBookChapterJumpHTML(n); wireChapterJumpBox(jumpBox,n); }
  }

  // Re-observing after appending chapters fires an "initial state" callback
  // reflecting wherever the page is scrolled *right now* — which, for a jump
  // to a specific section (search results land mid-chapter, not on the
  // chapter's own heading), is still the pre-jump position at the instant
  // ensureLoadedThrough() runs, before the smooth scroll has moved anything.
  // That stale callback would otherwise race the explicit header update in
  // goToBookTarget() and win, snapping the header back to the old chapter.
  // Suppressing observer-driven updates for a beat after an explicit jump
  // lets the explicit update stand until the scroll (and real tracking) catches up.
  var lastJumpAt=0;
  function observeHeadings(){
    if(BOOK_HDIO)BOOK_HDIO.disconnect();
    BOOK_HDIO=new IntersectionObserver(function(entries){
      if(Date.now()-lastJumpAt<800)return;
      entries.forEach(function(e){
        if(!e.isIntersecting)return;
        updateActiveChapterUI(e.target.dataset.hd);
      });
    // Top-anchored band, not centered: a heading scrolled to the top of the
    // viewport (natural reading, or a scrollIntoView({block:'start'}) jump)
    // both land inside it, so "current chapter" tracks either kind of move.
    },{rootMargin:'0px 0px -75% 0px'});
    document.querySelectorAll('[data-hd]').forEach(function(el){BOOK_HDIO.observe(el);});
  }
  observeHeadings();

  var loadedIdx=startIdx;
  // Appends chapters in order up through (and including) targetIdx — used both
  // by the infinite-scroll sentinel (one chapter at a time) and by search
  // jumping straight to a match in a chapter that hasn't scrolled into view yet.
  function ensureLoadedThrough(targetIdx){
    var wrap=document.getElementById('chbkWrap');
    while(loadedIdx<targetIdx&&loadedIdx<order.length-1){
      loadedIdx++;
      var nextN=order[loadedIdx];
      var tmp=document.createElement('div');
      tmp.innerHTML=chapterBlockHTML(nextN);
      while(tmp.firstChild)wrap.appendChild(tmp.firstChild);
      wireChapterBlock(nextN);
    }
    observeHeadings();
    if(loadedIdx>=order.length-1){
      if(BOOK_IO){BOOK_IO.disconnect();BOOK_IO=null;}
      var loading=document.getElementById('chbkLoading');
      if(loading){loading.style.display='block';loading.textContent='— End of '+PARTS[PART].name+' chapter notes —';}
    }
  }
  if(BOOK_IO)BOOK_IO.disconnect();
  BOOK_IO=new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting)ensureLoadedThrough(loadedIdx+1); });
  },{rootMargin:'800px 0px 800px 0px'});
  BOOK_IO.observe(document.getElementById('chbkSentinel'));

  // Jump to a specific chapter and, if given, a target within it — a numeric
  // section index (search results), an "s<i>" key (side-panel section list),
  // or "summary"/"forms"/"nums"/"bookq" (side-panel top-level jumps). Loads
  // whatever chapters between here and there haven't been appended yet, and
  // opens the target if it's currently collapsed. A chapter before the book's
  // start unit was never (and won't be) loaded forward, so land there by
  // restarting the book at that earlier chapter.
  function goToBookTarget(n,key){
    var idx=order.indexOf(n);
    if(idx<startIdx){ showNotesBook(n); return; }
    if(typeof key==='number')key='s'+key;
    lastJumpAt=Date.now();
    ensureLoadedThrough(idx);
    updateActiveChapterUI(n);
    var el;
    if(key==null) el=document.getElementById('chbk-'+n);
    else if(key==='bookq') el=document.getElementById('bookqwrap-'+n);
    else if(/^s\d+$/.test(key)){ openChapterSection(n,key); el=document.getElementById('chbk-'+n+'-'+key); }
    else { openChapterSection(n,key); el=document.getElementById('sechead-'+n+'-'+key); }
    scrollToEl(el);
  }
  function wireChapterJumpBox(box,n){
    if(!box)return;
    box.querySelectorAll('[data-jumpsec]').forEach(function(b){
      b.onclick=function(){ side.classList.remove('open'); goToBookTarget(n,b.dataset.jumpsec); };
    });
  }
  side.querySelectorAll('[data-jumpchapter]').forEach(function(b){
    b.onclick=function(){ side.classList.remove('open'); goToBookTarget(b.dataset.jumpchapter,null); };
  });
  var sc=document.getElementById('sideClose'); if(sc)sc.onclick=function(){side.classList.remove('open');};
  var bb=document.getElementById('notesBookBack'); if(bb)bb.onclick=function(){ notesUnitList(); };
  var bsIn=document.getElementById('bookSearch'), bsBox=document.getElementById('bookSearchRes');
  bsIn.oninput=function(){
    var q=bsIn.value.trim().toLowerCase();
    if(q.length<3){bsBox.innerHTML='';return;}
    var hits=[];
    order.forEach(function(n){
      var u=C[n];
      u.s.forEach(function(s,si){
        if(hits.length>=40)return;
        if(s.t.toLowerCase().indexOf(q)>=0)hits.push({unit:n,sec:si,title:s.t,snippet:(s.i[0]?s.i[0][1]:'')});
        s.i.forEach(function(p){
          if(hits.length>=40||p[0]==='table')return; // raw pipe-delimited table rows read as garbage in a one-line snippet
          if(p[1].toLowerCase().indexOf(q)>=0)hits.push({unit:n,sec:si,title:s.t,snippet:p[1]});
        });
      });
    });
    bsBox.innerHTML=hits.length?('<div class="nres nresbox"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between"><span>'+hits.length+' match'+(hits.length>1?'es':'')+' — click to jump</span><button id="bookSearchX" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px">✕</button></div>'+hits.map(function(x,i){
      return '<div class="nresi" data-goidx="'+i+'"><b>SU '+x.unit+' · '+esc(x.title)+'</b><p>'+esc(x.snippet)+'</p></div>';
    }).join('')+'</div>'):'<p style="color:var(--muted);font-size:13px">No matches.</p>';
    bsBox.querySelectorAll('[data-goidx]').forEach(function(el){
      el.style.cursor='pointer';
      el.onclick=function(){ var x=hits[+el.dataset.goidx]; goToBookTarget(x.unit,x.sec); };
    });
    var xbtn=document.getElementById('bookSearchX');
    if(xbtn)xbtn.onclick=function(){bsIn.value='';bsBox.innerHTML='';};
  };
  restoreScroll();
}
function notesUnitList(){
  markView('noteslist');
  setFloatBack(goBack,'← Back');
  var C=CHNOTES[PART];
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  document.getElementById('counter').textContent=PARTS[PART].name+' — Chapter Notes';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  if(!C){card.innerHTML='<div class="end"><h2>📘 Chapter Notes</h2><p style="margin:14px 0">No study-guide notes are loaded for this part yet.</p>'+bookDownloadHtml()+taxToolDownloadHtml()+'<button class="restart" id="menu">Exam Menu</button></div>';document.getElementById('menu').onclick=showMenu;return;}
  var h='<h2 style="margin-bottom:6px">📘 Chapter Notes <span style="font-weight:400;color:var(--muted);font-size:14px">— '+PARTS[PART].name+'</span></h2><p style="color:var(--muted);font-size:14px;margin-bottom:14px">Your complete study guide, chapter by chapter — forms, thresholds, rules and worked examples.</p>';
  h+=bookDownloadHtml();
  h+=taxToolDownloadHtml();
  Object.keys(C).sort(function(a,b){return a-b;}).forEach(function(n){
    var u=C[n];
    var nq=(BOOKQ[PART]&&BOOKQ[PART][n])?BOOKQ[PART][n].length:0;
    h+='<button class="opt'+(isWeakChapter(n)?' weak':'')+'" data-nu="'+n+'"><b>'+(isWeakChapter(n)?'🚩 ':'')+'SU '+n+': '+esc(u.t)+'</b><br><span style="color:var(--muted);font-size:13px">'+u.s.length+' sections · '+u.f.length+' forms · '+u.k.length+' key numbers'+(nq?' · '+nq+' study questions':'')+'</span></button>';
  });
  h+='<div class="nav2"><button class="navbtn" id="nulBack">← Exam Menu</button><span></span></div>';
  card.innerHTML=h;
  card.querySelectorAll('[data-nu]').forEach(function(b){b.onclick=function(){showNotesBook(b.dataset.nu);};});
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
// Excel workbooks with worked formulas (tax brackets, credits, deductions —
// all current-year figures), offered as a download alongside the book PDF.
// Keyed by Part, same pattern as BOOK_PDFS above.
var TAX_TOOLS={
  1:{file:'books/EA-Part1-Tax-Calculation-Master-Sheet-2025.xlsx', label:'2025 Individual Tax Calculation Master Sheet'}
};
function taxToolDownloadHtml(){
  var t=TAX_TOOLS[PART]; if(!t)return '';
  return '<a class="dlbook" href="'+t.file+'" download>📊 Download Excel formula sheet — <span>'+t.label+'</span></a>';
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
