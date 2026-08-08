// ==== SCROLL / VIEW STATE RESTORATION
// ============================================================================
// ---------- remember where you were (survives refresh) ----------

// Remember the reading position for each screen, so leaving and coming back puts you
// back where you were rather than at the top.
var SCRKEY='ea3quiz_scroll', CURSIG=null, SCRTIMER=null;
function scrollMap(){ try{return JSON.parse(localStorage.getItem(SCRKEY))||{};}catch(e){return {};} }
function sigOf(v){
  if(!v)return null;
  return [v.part,v.kind,v.unit||'',v.filt||'',v.mch||'',v.chap||'',v.xch||''].join('|');
}
function rememberScroll(){
  if(!CURSIG)return;
  var y=window.pageYOffset||document.documentElement.scrollTop||0;
  var m=scrollMap();
  if(y>40)m[CURSIG]=y; else delete m[CURSIG];
  try{localStorage.setItem(SCRKEY,JSON.stringify(m));}catch(e){}
}
function restoreScroll(){
  var y=CURSIG?(scrollMap()[CURSIG]||0):0;
  var go=function(){ try{window.scrollTo(0,y);}catch(e){} };
  go();
  // the page is still laying out on first paint, so try again next frame
  if(window.requestAnimationFrame)requestAnimationFrame(function(){requestAnimationFrame(go);});
  setTimeout(go,60);
}
window.addEventListener('scroll',function(){
  clearTimeout(SCRTIMER);
  SCRTIMER=setTimeout(rememberScroll,250);
},{passive:true});
window.addEventListener('beforeunload',rememberScroll);
var VKEY='ea_view_local';
// one-time: move legacy synced view marker into a device-local key so each device
// keeps its own current view (question, chapter, etc.) independent of the other.
(function(){
  try{
    var legacy=localStorage.getItem('ea3quiz_view');
    if(legacy && !localStorage.getItem(VKEY)) localStorage.setItem(VKEY,legacy);
    if(legacy) localStorage.removeItem('ea3quiz_view');
  }catch(e){}
})();
function saveView(v){try{localStorage.setItem(VKEY,JSON.stringify(v));}catch(e){}}
// Navigation history: each markView pushes the previous view descriptor so
// the floating Back button walks through actual history instead of jumping home.
var NAV_STACK=[], NAV_POPPING=false, PREV_VIEW=null;
function navPush(v){ if(NAV_POPPING) return; if(v) NAV_STACK.push(v); if(NAV_STACK.length>60) NAV_STACK.shift(); }
function navGo(v){
  if(!v||!v.kind){ showParts(); return; }
  NAV_POPPING=true;
  try{
    var K=v.kind;
    if(v.part && v.part!==PART) selectPart(v.part);
    if(K==='parts') showParts();
    else if(K==='menu') showMenu();
    else if(K==='mcqlist' && typeof mcqChapterList==='function') mcqChapterList();
    else if(K==='xlist' && typeof extraList==='function') extraList();
    else if(K==='noteslist' && typeof notesUnitList==='function') notesUnitList();
    else if(K==='dash' && typeof showDashboard==='function') showDashboard();
    else if(K==='notes' && typeof showNotes==='function' && v.unit!=null) showNotes(v.unit);
    else if((K==='nums'||K==='dl') && typeof showSheet==='function') showSheet(K==='dl'?'dl':'nums', v.filt||'all');
    else if(K==='acct' && typeof acctScreen==='function') acctScreen();
    else if(K==='quiz'){
      // resume the specific quiz using its stored context
      if(v.mch!=null && typeof startMcq==='function') startMcq(v.mch);
      else if(v.xch!=null && typeof startExtra==='function') startExtra(v.xch);
      else if(v.chap!=null && typeof startChapter==='function') startChapter(v.chap);
      else if(v.exam!=null && v.exam>=0 && typeof startFlow==='function') startFlow(v.exam);
      else showMenu();
    }
    else showMenu();
  }catch(e){ showMenu(); }
  finally{ NAV_POPPING=false; }
}
function goBack(){
  var v=NAV_STACK.pop();
  if(v) navGo(v); else showParts();
}
function markView(kind,extra){
  var v={part:PART,kind:kind};
  if(extra)for(var k in extra)v[k]=extra[k];
  var sig=sigOf(v);
  if(CURSIG&&CURSIG!==sig){ rememberScroll(); if(PREV_VIEW) navPush(PREV_VIEW); }
  PREV_VIEW=v;   // bank where we were before moving on
  CURSIG=sig;
  saveView(v);
}
function restoreView(){
  if(authGate()){ acctScreen(); return; }
  var v=null;
  try{v=JSON.parse(localStorage.getItem(VKEY));}catch(e){}
  if(!v||!v.kind||!PARTS[v.part]){showParts();return;}
  try{
    selectPart(v.part);
    if(v.kind==='parts'){showParts();return;}
    if(v.kind==='menu'){showMenu();return;}
    if(v.kind==='notes'&&CHNOTES[PART]&&CHNOTES[PART][v.unit]){showNotes(v.unit,notesUnitList);return;}
    if(v.kind==='noteslist'){notesUnitList();return;}
    if(v.kind==='mcqlist'&&MCQS.length){mcqChapterList();return;}
    if(v.kind==='xlist'&&XTRA.length){extraList();return;}
    if(v.kind==='acct'){acctScreen();return;}
    if(v.kind==='nums'){showSheet('nums',v.filt||'all');return;}
    if(v.kind==='dl'){showSheet('dl');return;}
    if(v.kind==='dash'){showDashboard();return;}
    if(v.kind==='quiz'){
      if(v.exam>=0&&EXAMS[v.exam]&&loadState(v.exam)){startFlow(v.exam);}
      else if(v.exam===-4&&MCQS[v.mch]){startMcq(v.mch);}
      else if(v.exam===-3&&UNITS[v.chap]){startChapter(v.chap);}
      else if(v.exam===-5&&XTRA[v.xch]){startExtra(v.xch);}
      else {showMenu();return;}
      if(typeof v.pos==='number'&&st&&v.pos<st.order.length){pos=v.pos;renderSide();render();}
      return;
    }
  }catch(e){}
  showMenu();
}
document.getElementById('gridToggle').onclick=function(){side.classList.toggle('open');};
// ---------- floating back button (follows you down the page) ----------
var FLOATBACK=null;
// Only float when the page is actually long enough to scroll — on a short page the
// in-card "← Back" button is already visible, so a hovering copy would just be clutter.
function syncFloatBack(){
  var b=document.getElementById('floatBack');
  if(!b)return;
  var scrollable=(document.documentElement.scrollHeight||0)>(window.innerHeight||0)+120;
  if(FLOATBACK&&scrollable)b.classList.add('show'); else b.classList.remove('show');
}
function setFloatBack(fn,label){
  FLOATBACK=fn||null;
  var b=document.getElementById('floatBack');
  if(!b)return;
  if(fn)b.textContent=label||'← Back';
  syncFloatBack();
  setTimeout(syncFloatBack,0);   // re-check once the new view has laid out
}
window.addEventListener('resize',syncFloatBack);
(function(){
  var b=document.getElementById('floatBack');
  if(b)b.onclick=function(){ if(FLOATBACK){var f=FLOATBACK;setFloatBack(null);f();} };
})();
// ---------- back to top ----------
var topBtn=document.getElementById('toTop');
if(topBtn){
  topBtn.onclick=function(){
    try{window.scrollTo({top:0,behavior:'smooth'});}catch(e){window.scrollTo(0,0);}
    if(side)side.scrollTop=0;
  };
  window.addEventListener('scroll',function(){
    var y=window.pageYOffset||document.documentElement.scrollTop||0;
    if(y>420)topBtn.classList.add('show'); else topBtn.classList.remove('show');
    syncFloatBack();
  });
}

// ============================================================================
// ==== KEYBOARD SHORTCUTS (in-quiz)
// ============================================================================
// ---------- keyboard shortcuts ----------
document.addEventListener('keydown',function(e){
  if(!st||exam===-1)return;                                  // only inside a quiz
  if(e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  var nb=document.getElementById('next'), pb=document.getElementById('prev');
  if(e.key==='ArrowRight'){ if(nb){e.preventDefault();nb.click();} return; }
  if(e.key==='ArrowLeft'){ if(pb&&!pb.disabled){e.preventDefault();pb.click();} return; }
  // Up/Down jump a row in the sidebar grid (5 columns) so 93 -> Up = 88, Down = 98
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){
    if(typeof pos!=='number'||!Array.isArray(QUESTIONS))return;
    var step=(e.key==='ArrowDown')?5:-5;
    var np=Math.max(0,Math.min(QUESTIONS.length-1,pos+step));
    if(np===pos)return;
    e.preventDefault();
    pos=np;
    try{ if(typeof saveState==='function') saveState(); }catch(err){}
    try{ if(typeof renderSide==='function') renderSide(); }catch(err){}
    try{ if(typeof render==='function') render(); }catch(err){}
    try{ if(typeof scrollTop==='function') scrollTop(); }catch(err){}
    return;
  }
  if(e.key==='f'||e.key==='F'){ var fb=document.getElementById('flagBtn'); if(fb){e.preventDefault();fb.click();} return; }
  // Ask AI: `?` (shift+/) or `i` — both open the tutor with the "explain this question" prompt
  if(e.key==='?'||e.key==='i'||e.key==='I'){
    var aab=document.getElementById('askAiBtn'); if(aab){e.preventDefault();aab.click();}
    return;
  }
  var k=e.key.toUpperCase();
  if(k>='A'&&k<='D'){
    var opts=document.querySelectorAll('#opts .opt');
    var i='ABCD'.indexOf(k);
    if(opts[i]&&!opts[i].disabled){e.preventDefault();opts[i].click();}
  }
});
// Refresh the timer panel every 2s while it's open, so remote pulls (from other devices)
// show up in the display without waiting for the user to close+reopen.
setInterval(function(){
  try{ var _p=document.getElementById('swPanel'); if(_p && _p.classList.contains('open') && typeof swPanelRender==='function') swPanelRender(); }catch(e){}
},2000);

// ============================================================================
// ==== BOOT: __wire (build EXAMS, PARTS, CHNOTES from __PAY)
// ============================================================================
function __wire(){
  EXAMS = [
  {name:"Mock Exam 1", desc:"Part 3 Practice Exam — 100 questions", questions:MOCK1},
  {name:"Mock Exam 2", desc:"Part 3 Mock Exam — 100 questions", questions:MOCK2},
  {name:"Mock Exam 3", desc:"Part 3 Mock Exam — 100 questions", questions:MOCK3},
  {name:"Mock Exam 4", desc:"Part 3 Mock Exam — 100 questions", questions:MOCK4}
  ];
  EXAMS_P2 = [
  {name:"Mock Exam 1", desc:"Part 2 Mock Exam — 100 questions", questions:P2MOCK1},
  {name:"Mock Exam 2", desc:"Part 2 Mock Exam — 100 questions", questions:P2MOCK2},
  {name:"Mock Exam 3", desc:"Part 2 Mock Exam — 100 questions", questions:P2MOCK3},
  {name:"Practice Exam", desc:"Part 2 Practice Exam — 100 questions", questions:P2PRAC}
  ];
  EXAMS_P1 = [
  {name:"Mock Exam 1", desc:"Part 1 Mock Exam — 100 questions", questions:P1MOCK1},
  {name:"Mock Exam 2", desc:"Part 1 Mock Exam — 100 questions", questions:P1MOCK2},
  {name:"Mock Exam 3", desc:"Part 1 Mock Exam — 100 questions", questions:P1MOCK3},
  {name:"Practice Exam", desc:"Part 1 Practice Exam — 100 questions", questions:P1PRAC}
  ];
  UNITS=deriveUnits(EXAMS);
  CHNOTES={1:CHNOTES_P1,2:CHNOTES_P2,3:CHNOTES_P3};
  QREF={1:QREF_P1,2:QREF_P2,3:QREF_P3};
  EXTRA={1:EXTRA_P1,2:EXTRA_P2,3:EXTRA_P3};
  GLEIM={1:GLEIM_P1||[],2:[],3:[]};
  EXAMS_P3=EXAMS; UNITS_P3=UNITS; MCQS_P3=MCQS;
  PARTS={
  3:{name:"EA Part 3", sub:"Representation, Practices & Procedures", exams:EXAMS_P3, units:UNITS_P3, mcqs:MCQS_P3, extra:EXTRA_P3, gleim:GLEIM[3]},
  2:{name:"EA Part 2", sub:"Businesses", exams:EXAMS_P2, units:deriveUnits(EXAMS_P2), mcqs:MCQS_P2, extra:EXTRA_P2, gleim:GLEIM[2]},
  1:{name:"EA Part 1", sub:"Individuals", exams:EXAMS_P1, units:deriveUnits(EXAMS_P1), mcqs:MCQS_P1, extra:EXTRA_P1, gleim:GLEIM[1]}
};
}
function __gunzip(b64){
  var bin=atob(b64), n=bin.length, u=new Uint8Array(n);
  for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);
  return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

// ---------- One-time migration: preserve user progress across Domain→Chapter regrouping ----------

// ============================================================================
// ==== EXTRA STATE MIGRATION (Domain→Chapter, sync-aware)
// ============================================================================
var __EXTRA_OLD_SIZES = {"P1":[102,256,174,20,25,74],"P2":[354,208,90],"P3":[159,149,117,79]};
var __EXTRA_NEW_SIZES = {"P1":[42,50,20,67,21,33,48,18,15,29,58,64,67,6,44,25,18,26],"P2":[32,15,20,66,41,21,20,27,26,87,43,72,7,27,59,29,13,18,29],"P3":[54,67,43,31,25,16,27,37,60,40,19,75,10]};
function __migrateExtraStateV1(){
  // Runs at boot AND after every successful sync-pull. Idempotent: if there's no
  // old-shape state, it's a no-op. If new-shape state already exists for a chapter,
  // we MERGE (don't overwrite) — protects laptop-answered questions from being
  // wiped when mobile pushes older state via sync.
  try{
    var changed=false;
    ['P1','P2','P3'].forEach(function(part){
      var pfx = (part==='P3') ? '' : ('p'+part.charAt(1)+'_');
      var oldSizes = __EXTRA_OLD_SIZES[part];
      var newSizes = __EXTRA_NEW_SIZES[part];
      var mig = __EXTRA_MIGRATION[part] || {};
      // 1. Collect old-shape states (length matches an old domain's size)
      var oldStates = {};
      for(var gi=0; gi<oldSizes.length; gi++){
        var key='ea3quiz_v2_'+pfx+'extra_'+gi;
        var raw=localStorage.getItem(key);
        if(!raw)continue;
        var s=null;
        try{s=JSON.parse(raw);}catch(e){continue;}
        if(!s||!Array.isArray(s.answers))continue;
        if(s.answers.length!==oldSizes[gi])continue;  // Not the old shape
        oldStates[gi]=s;
      }
      if(Object.keys(oldStates).length===0)return;

      // 2. Read any EXISTING new-shape state so we can merge into it, not overwrite
      var newStates={};
      for(var nc=0; nc<newSizes.length; nc++){
        var nkey='ea3quiz_v2_'+pfx+'extra_'+nc;
        // If a key at this index currently holds NEW-shape state, keep it as the base
        var nraw=localStorage.getItem(nkey);
        if(nraw){
          try{
            var ns=JSON.parse(nraw);
            if(ns&&Array.isArray(ns.answers)&&ns.answers.length===newSizes[nc]){
              newStates[nc]=ns;
            }
          }catch(e){}
        }
      }
      // 3. Fold each old answer into the new-shape state at the correct position
      Object.keys(oldStates).forEach(function(gi){
        var s=oldStates[gi];
        s.answers.forEach(function(v, qi){
          if(v===null||v===undefined)return;
          var mapKey=gi+'_'+qi;
          var target=mig[mapKey];
          if(!target)return;
          var ncc=target[0], nq=target[1];
          if(!newStates[ncc]){
            var L=newSizes[ncc];
            newStates[ncc]={
              answers:new Array(L).fill(null),
              flags:new Array(L).fill(false),
              order:Array.from({length:L},function(_,i){return i;}),
              optOrder:null,
              mode:'practice',
              examStart:null,
              examDone:false
            };
          }
          // Merge: don't clobber an existing answer at this position; only fill blanks.
          // This keeps whatever the user answered on THIS device intact if the same
          // slot happened to be filled by both devices.
          if(newStates[ncc].answers[nq]===null||newStates[ncc].answers[nq]===undefined){
            newStates[ncc].answers[nq]=v;
          }
          if(Array.isArray(s.flags)&&s.flags[qi]){newStates[ncc].flags[nq]=true;}
        });
      });
      // 4. Clear old-shape keys (they'd otherwise be re-detected next run) and write merged new-shape
      Object.keys(oldStates).forEach(function(gi){
        try{localStorage.removeItem('ea3quiz_v2_'+pfx+'extra_'+gi);}catch(e){}
      });
      Object.keys(newStates).forEach(function(nc){
        try{
          localStorage.setItem('ea3quiz_v2_'+pfx+'extra_'+nc, JSON.stringify(newStates[nc]));
          // Bump meta timestamp so sync pushes the merged state back to cloud
          try{
            var mk=JSON.parse(localStorage.getItem('ea3quiz_meta'))||{};
            mk['ea3quiz_v2_'+pfx+'extra_'+nc]=Date.now();
            localStorage.setItem('ea3quiz_meta',JSON.stringify(mk));
          }catch(_){}
        }catch(e){}
      });
      changed=true;
    });
    return changed;
  }catch(e){
    // Never let migration break the app
    try{console.error('Extra state migration failed:',e);}catch(_){}
    return false;
  }
}


// ============================================================================
// ==== BOOT ENTRY: __boot
// ============================================================================
async function __boot(){
  try{
    var keys=Object.keys(__PAY);
    for(var i=0;i<keys.length;i++){ window[keys[i]]=JSON.parse(await __gunzip(__PAY[keys[i]])); __PAY[keys[i]]=null; }
  }catch(e){
    document.getElementById('card').innerHTML='<div class="end"><h2>Could not unpack the question data</h2>'+
      '<p style="margin:14px 0">This compact build needs a current browser. Use the full-size file instead \u2014 identical content.</p>'+
      '<p style="color:var(--muted);font-size:13px">'+String(e)+'</p></div>';
    return;
  }
  __wire();
  __migrateExtraStateV1();
  initDark(); initStopwatch(); renderAcct();
  var a=auth(); if(a){ setSync('sync'); syncNow('quiet'); }
  restoreView();
  var ab=document.getElementById('acctBtn'); if(ab)ab.onclick=acctScreen;
  // Kick off the demo watcher (banner + auto-expire)
  setInterval(_demoTick, 1000);
  _demoTick();
}

// ---- Demo-mode UI: banner shows remaining time; on expiration, block use and sign out ----
function _demoTick(){
  try{
    var d=demoInfo();
    var bar=document.getElementById('demoBanner');
    var block=document.getElementById('demoBlock');
    var showBanner = d && d.forEmail && auth() && auth().email===d.forEmail && d.active;
    var showBlock  = d && d.forEmail && auth() && auth().email===d.forEmail && d.expired;
    if(showBanner){
      if(!bar){
        bar=document.createElement('div');
        bar.id='demoBanner';
        bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9998;background:rgba(59,130,246,.95);color:#fff;padding:8px 14px;font-size:13.5px;font-weight:600;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.15);';
        document.body.appendChild(bar);
        document.body.style.paddingTop='36px';
      }
      var aiLeft = (typeof demoAiRemaining === 'function') ? demoAiRemaining() : 0;
      var aiPart = ' · '+aiLeft+' / '+DEMO_AI_LIMIT+' AI questions left';
      bar.textContent='Demo access — '+fmtDemoTime(d.remaining)+' remaining'+aiPart+'. Ask the admin for full access to keep going.';
    } else if(bar){
      bar.remove(); document.body.style.paddingTop='';
    }
    if(showBlock){
      if(!block){
        block=document.createElement('div');
        block.id='demoBlock';
        block.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;';
        block.innerHTML='<div style="background:var(--card);color:var(--ink);border:1px solid var(--border);border-radius:14px;padding:28px;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)">'+
          '<div style="font-size:44px;margin-bottom:12px">⏳</div>'+
          '<h2 style="margin:0 0 10px;font-size:20px">Your 15-minute demo has ended</h2>'+
          '<p style="margin:0 0 18px;color:var(--muted);font-size:14.5px;line-height:1.5">Thanks for trying the app. To continue studying, ask the admin to upgrade you to full access.</p>'+
          '<button id="demoSignout" class="opt" style="margin:0">Sign out</button>'+
          '</div>';
        document.body.appendChild(block);
        document.getElementById('demoSignout').onclick=function(){
          try{ signOut(); }catch(e){}
          endDemo();
          location.reload();
        };
      }
    } else if(block){
      block.remove();
    }
  }catch(e){}
}

__boot();
