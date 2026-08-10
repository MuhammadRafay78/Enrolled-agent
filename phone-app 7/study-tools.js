// ==== CHEAT SHEETS: key numbers, deadlines
// ============================================================================
// ---------- cheat sheets: key numbers & deadlines ----------
var SHEETFILT='all';
var SHEETROWS=[];      // rows currently on screen, indexed by the ＋ Explain buttons
var SHOPEN={};         // which chapter sections are expanded
var SHSAVED=null;      // the reader's own state, put aside while searching
function shKey(){ return 'ea3quiz_shopen_'+PART+'_'+SHEETKIND; }
function shLoad(){ try{SHOPEN=JSON.parse(localStorage.getItem(shKey()))||{};}catch(e){SHOPEN={};} }
function shSave(){ try{localStorage.setItem(shKey(),JSON.stringify(SHOPEN));}catch(e){} }
function shToggle(u){ SHOPEN[u]=!SHOPEN[u]; shSave(); }
function shSetAll(rows,on){
  SHOPEN={};
  if(on)rows.forEach(function(r){SHOPEN[r.u]=true;});
  shSave();
}
var SHEETKIND='nums';
function sheetRows(kind){
  var R=SHEETS[PART]||[];
  return kind==='dl' ? R.filter(function(r){return r.dl;}) : R;
}
function showSheet(kind,filt){
  if(filt!==undefined)SHEETFILT=filt;
  SHEETKIND=kind;
  shLoad(); SHSAVED=null;
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  var rows=sheetRows(kind);
  var isDL=kind==='dl';
  markView(isDL?'dl':'nums',{filt:SHEETFILT});
  var title=isDL?'📅 Deadline Calendar':'🔢 Key Numbers Cheat Sheet';
  document.getElementById('counter').textContent=PARTS[PART].name+' — '+(isDL?'Deadlines':'Key Numbers');
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  if(!rows.length){
    card.innerHTML='<div class="end"><h2>'+title+'</h2><p style="margin:14px 0">Nothing extracted for this part yet.</p><button class="restart" id="menu">Exam Menu</button></div>';
    document.getElementById('menu').onclick=showMenu; return;
  }
  var CATS=[['all','All'],['tbl','📋 Tables'],['money','💵 Amounts'],['rate','% Rates'],['period','⏱ Periods'],['date','📅 Dates']];
  if(!isDL&&SHEETFILT==='tbl')rows=rows.filter(function(r){return !!r.tb;});
  else if(!isDL&&SHEETFILT!=='all')rows=rows.filter(function(r){return r.c.indexOf(SHEETFILT)>=0;});
  var h='<div class="nsearchwrap"><input class="nsearch" id="shSearch" placeholder="🔍 Search"></div>'+
    '<div class="nhead"><div class="nhead-t"><h2 style="margin:0 0 2px;padding-right:210px">'+title+'</h2>'+
    '<p style="color:var(--muted);font-size:13px;margin:0">'+rows.length+' items from your '+PARTS[PART].name+' study guide'+(isDL?' — due dates, windows and extensions':'')+'. <a href="#" id="shPrint">Print / save as PDF</a></p></div></div>';
  if(!isDL){
    h+='<div class="chips">'+CATS.map(function(c){
      return '<button class="chip'+(SHEETFILT===c[0]?' on':'')+'" data-cat="'+c[0]+'">'+c[1]+'</button>';
    }).join('')+'</div>';
  }
  h+='<div class="shtools"><button class="chip" id="shAll">Expand all</button>'+
     '<button class="chip" id="shNone">Collapse all</button>'+
     '<span class="shhint">Tap a chapter to open it</span></div>';
  h+='<div id="shBody">'+sheetBody(rows)+'</div>';
  h+='<div class="nav2 noprint"><button class="navbtn" id="shBack">← Exam Menu</button><span></span></div>';
  card.innerHTML=h;
  document.getElementById('shBack').onclick=showMenu;
  document.getElementById('shPrint').onclick=function(e){e.preventDefault();window.print();};
  card.querySelectorAll('[data-cat]').forEach(function(b){b.onclick=function(){showSheet(kind,b.dataset.cat);};});
  wireSheetDetail(); wireSheetSections();
  document.getElementById('shAll').onclick=function(){ shSetAll(rows,true); document.getElementById('shBody').innerHTML=sheetBody(rows); wireSheetDetail(); wireSheetSections(); };
  document.getElementById('shNone').onclick=function(){ shSetAll(rows,false); document.getElementById('shBody').innerHTML=sheetBody(rows); wireSheetDetail(); wireSheetSections(); };
  setFloatBack(goBack,'← Back');
  restoreScroll();
  var ss=document.getElementById('shSearch');
  ss.oninput=function(){
    var q=ss.value.trim().toLowerCase();
    var f=q.length<2?rows:rows.filter(function(r){return r.t.toLowerCase().indexOf(q)>=0||r.sec.toLowerCase().indexOf(q)>=0||r.v.join(' ').toLowerCase().indexOf(q)>=0;});
    // Matches are always shown expanded so a search never looks empty. The reader's own
    // collapse state is put aside once and restored when the search is cleared.
    if(q.length>=2){
      if(SHSAVED===null)SHSAVED=JSON.stringify(SHOPEN);
      SHOPEN=JSON.parse(SHSAVED);
      f.forEach(function(r){SHOPEN[r.u]=true;});
    } else if(SHSAVED!==null){
      SHOPEN=JSON.parse(SHSAVED); SHSAVED=null;
    }
    document.getElementById('shBody').innerHTML=f.length?sheetBody(f):'<p style="color:var(--muted);font-size:13px">No matches.</p>';
    wireSheetDetail(); wireSheetSections();
  };
}
// Find the book section a cheat-sheet row came from, so we can show the full passage.
function sheetSection(r){
  var C=CHNOTES[PART]||{}, u=C[r.u];
  if(!u)return null;
  for(var i=0;i<u.s.length;i++) if(u.s[i].t===r.sec) return {s:u.s[i],si:i,unit:r.u,ut:u.t};
  return null;
}
// Escape, then highlight the exact sentence this row was pulled from.
function markHit(text,needle){
  var t=esc(text);
  if(!needle)return t;
  var n=esc(needle.trim());
  if(n.length>12){
    var at=t.indexOf(n);
    if(at>=0) return t.slice(0,at)+'<mark>'+n+'</mark>'+t.slice(at+n.length);
    // the row may hold only the first clause of a longer paragraph
    var head=n.slice(0,Math.min(60,n.length)), at2=t.indexOf(head);
    if(at2>=0) return t.slice(0,at2)+'<mark>'+t.slice(at2,at2+n.length)+'</mark>'+t.slice(at2+n.length);
  }
  return t;
}
// Full detail panel for one cheat-sheet row: the book's own passage for that rule.
function sheetDetailHTML(r){
  var f=sheetSection(r);
  if(!f)return '<div class="dtwrap"><p class="dtnone">No further detail in the book for this item.</p></div>';
  var h='<div class="dtwrap"><div class="dtsec">'+esc(f.s.t)+'</div>'+
        '<div class="dtfrom">From SU '+f.unit+(f.ut?': '+esc(f.ut):'')+' of your '+PARTS[PART].name+' study guide</div>';
  var exBuf=[];
  function flushEx(){
    if(!exBuf.length)return;
    h+='<details class="nex"><summary>Example — tap to work through it</summary>'+
       exBuf.map(function(t){return '<p>'+esc(t)+'</p>';}).join('')+'</details>';
    exBuf=[];
  }
  f.s.i.forEach(function(pair){
    var k=pair[0],t=pair[1];
    if(k==='ex'){exBuf.push(t);return;}
    flushEx();
    if(k==='table')h+=tableHTML(t);
    else if(k==='li')h+='<ul><li>'+markHit(t,r.t)+'</li></ul>';
    else if(k==='note')h+='<p class="nnote">'+markHit(t,r.t)+'</p>';
    else h+='<p>'+markHit(t,r.t)+'</p>';
  });
  flushEx();
  h+='<button class="dtjump" data-gonotes="'+f.unit+'" data-gosec="'+f.si+'">📘 Open this chapter in full notes →</button>';
  return h+'</div>';
}
// A short headline for the Value cell so the numbers read in context, e.g.
// "Required CE — 72 hours" instead of a bare "72 hours".
function chipLabel(sec){
  var t=(sec||'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/—.*$/,'').replace(/\s+/g,' ').trim();
  if(t.length>34)t=t.slice(0,32).replace(/\s+\S*$/,'')+'…';
  return t;
}
function sheetBody(rows){
  var C=CHNOTES[PART]||{};
  var byU={};
  rows.forEach(function(r){(byU[r.u]=byU[r.u]||[]).push(r);});
  SHEETROWS=rows;
  var h='';
  Object.keys(byU).sort(function(a,b){return a-b;}).forEach(function(u){
    var ut=(C[u]&&C[u].t)?C[u].t:'';
    var open=SHOPEN[u]?true:false;
    h+='<button class="shhead'+(open?' open':'')+'" data-su="'+u+'"><span class="chev">'+(open?'▾':'▸')+'</span>'+
       '<span class="shttl">SU '+u+(ut?': '+esc(ut):'')+'</span>'+
       '<span class="shcount">'+byU[u].length+'</span></button>';
    h+='<div class="shbody" data-subody="'+u+'" style="display:'+(open?'block':'none')+'">';
    h+='<table class="ntable sheet"><tr><th style="width:140px">Value</th><th>Rule</th><th style="width:86px">Detail</th></tr>';
    byU[u].forEach(function(r){
      var i=rows.indexOf(r);
      var lab=chipLabel(r.sec);
      var chips=(lab?'<div class="vlabel">'+esc(lab)+'</div>':'')+
        (r.v.length?r.v.map(function(v){return '<span class="vchip">'+esc(v)+'</span>';}).join(' '):'<span class="vchip dim">see rule</span>');
      if(r.tb){
        h+='<tr class="tbrow"><td colspan="3"><div class="tbwrap"><div class="tblbl">📋 '+esc(r.sec)+'</div>'+tableHTML(r.t)+
           '<button class="dtbtn" data-dt="'+i+'">＋ Explain</button></div></td></tr>';
        h+='<tr class="dtrow" id="dtrow'+i+'" style="display:none"><td colspan="3"></td></tr>';
        return;
      }
      h+='<tr><td>'+chips+'</td><td>'+esc(r.t)+'</td>'+
         '<td><button class="dtbtn" data-dt="'+i+'">＋ Explain</button></td></tr>';
      h+='<tr class="dtrow" id="dtrow'+i+'" style="display:none"><td colspan="3"></td></tr>';
    });
    h+='</table></div>';
  });
  return h;
}
function wireSheetSections(){
  card.querySelectorAll('[data-su]').forEach(function(b){
    b.onclick=function(){
      var u=b.dataset.su;
      shToggle(u);
      var body=card.querySelector('[data-subody="'+u+'"]');
      var open=!!SHOPEN[u];
      if(body)body.style.display=open?'block':'none';
      b.classList.toggle('open',open);
      var c=b.querySelector('.chev'); if(c)c.textContent=open?'▾':'▸';
    };
  });
}
// Wire the ＋ Explain buttons inside a rendered cheat sheet.
function wireSheetDetail(){
  card.querySelectorAll('[data-dt]').forEach(function(b){
    b.onclick=function(){
      var i=+b.dataset.dt, tr=document.getElementById('dtrow'+i);
      if(!tr)return;
      var open=tr.style.display!=='none';
      if(open){tr.style.display='none';b.classList.remove('on');b.innerHTML='＋ Explain';return;}
      var cell=tr.firstChild;
      if(!cell.innerHTML)cell.innerHTML=sheetDetailHTML(SHEETROWS[i]);
      tr.style.display='';b.classList.add('on');b.innerHTML='− Close';syncFloatBack();
      cell.querySelectorAll('[data-gonotes]').forEach(function(j){
        j.onclick=function(){
          var u=j.dataset.gonotes, si=j.dataset.gosec, kind=SHEETKIND;
          showNotes(u,function(){showSheet(kind,SHEETFILT);});
          var el=document.getElementById('s'+si);
          if(el)scrollToEl(el);
        };
      });
    };
  });
}

// ============================================================================
// ==== BOOK STUDY QUESTIONS
// ============================================================================
// ---------- end-of-chapter study questions (from the book) ----------
function bqKey(){return 'ea3quiz_bookq_p'+PART;}
function bqState(){try{return JSON.parse(localStorage.getItem(bqKey()))||{};}catch(e){return {};}}
function bqSave(s){try{localStorage.setItem(bqKey(),JSON.stringify(s));}catch(e){}}
function bookqHTML(n){
  var B=BOOKQ[PART]; if(!B||!B[n]||!B[n].length)return '';
  var qs=B[n], st=bqState(), done=0, right=0;
  qs.forEach(function(q,i){
    var v=st[n+':'+i];
    if(v!==undefined&&v!==null){done++; if(v===q.a)right++;}
  });
  var h='<h3 class="nh" id="bookq">📝 Study Questions <span style="font-weight:400;color:var(--muted);font-size:13px">('+qs.length+' from this chapter'+(done?' · '+right+'/'+done+' correct':'')+')</span></h3>';
  h+='<p style="color:var(--muted);font-size:13px;margin:0 0 12px">Pick an answer and the book’s explanation appears underneath. <a href="#" id="bqReset">Reset answers</a></p>';
  var L=['A','B','C','D'];
  qs.forEach(function(q,i){
    var sel=st[n+':'+i]; var answered=(sel!==undefined&&sel!==null);
    h+='<div class="bq" id="bq'+i+'"><div class="bqq"><span class="bqn">'+(i+1)+'.</span> '+esc(q.q)+'</div>';
    h+='<div class="bqopts">';
    q.opts.forEach(function(o,j){
      var cls='bqopt';
      if(answered){
        if(j===q.a)cls+=' correct';
        else if(j===sel)cls+=' wrong';
        else cls+=' dim';
      }
      h+='<button class="'+cls+'" data-bq="'+i+'" data-opt="'+j+'"'+(answered?' disabled':'')+'><b>'+L[j]+'.</b> '+esc(o)+'</button>';
    });
    h+='</div>';
    h+='<div class="bqans" id="bqans'+i+'"'+(answered?'':' style="display:none"')+'>';
    if(answered){
      h+='<div class="bqverdict '+(sel===q.a?'ok':'no')+'">'+(sel===q.a?'✓ Correct':'✗ Incorrect — the answer is '+L[q.a])+'</div>'+
         '<div class="why">'+fmtExpl(q.expl)+'</div>';
    }
    h+='</div></div>';
  });
  return h;
}
function wireBookq(n){
  var B=BOOKQ[PART]; if(!B||!B[n])return;
  var qs=B[n], L=['A','B','C','D'];
  card.querySelectorAll('[data-bq]').forEach(function(b){
    b.onclick=function(){
      var i=+b.dataset.bq, j=+b.dataset.opt, q=qs[i];
      var s=bqState(); var firstAnswer=(s[n+':'+i]===undefined||s[n+':'+i]===null);
      s[n+':'+i]=j; bqSave(s);
      if(firstAnswer)recordAnswerToday();
      var wrap=document.getElementById('bq'+i);
      wrap.querySelectorAll('.bqopt').forEach(function(o,k){
        o.disabled=true;
        o.classList.remove('correct','wrong','dim');
        if(k===q.a)o.classList.add('correct');
        else if(k===j)o.classList.add('wrong');
        else o.classList.add('dim');
      });
      var ans=document.getElementById('bqans'+i);
      ans.innerHTML='<div class="bqverdict '+(j===q.a?'ok':'no')+'">'+(j===q.a?'✓ Correct':'✗ Incorrect — the answer is '+L[q.a])+'</div><p>'+esc(q.expl)+'</p>';
      ans.style.display='block';
      var hdr=document.querySelector('#bookq span');
      if(hdr){
        var st2=bqState(),d=0,r=0;
        qs.forEach(function(qq,ii){var v=st2[n+':'+ii];if(v!==undefined&&v!==null){d++;if(v===qq.a)r++;}});
        hdr.textContent='('+qs.length+' from this chapter'+(d?' · '+r+'/'+d+' correct':'')+')';
      }
    };
  });
  var rs=document.getElementById('bqReset');
  if(rs)rs.onclick=function(e){
    e.preventDefault();
    var s=bqState();
    Object.keys(s).forEach(function(k){if(k.indexOf(n+':')===0)delete s[k];});
    bqSave(s); showNotes(n,NOTEBACK);
  };
}

// ============================================================================
