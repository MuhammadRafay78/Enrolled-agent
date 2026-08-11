var MCQS = null;

var EXAMS = []; // ADD_MOCKS_HERE

const card=document.getElementById('card');
const side=document.getElementById('side');
const EXAM_MS=210*60*1000; // 3.5 hours
let exam=-1, QUESTIONS=[], st=null, pos=0, timerInt=null, REVIEW_REFS=[];

// ---------- helpers ----------

// ============================================================================
// ==== HELPERS: state basics, storage keys, shuffle
// ============================================================================
function pp(){return PART===3?'':('p'+PART+'_');}
const skey=e=>'ea3quiz_v2_'+pp()+'mock_'+e;
function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}return a;}
const REFOPT=/all of the above|none of the above|all of these|none of these|both .* and|are correct/i;
function canShuffleOpts(q){return !q.opts.some(function(o){return REFOPT.test(o);});}
function makeState(len,qs,shuffle,mode){
  const order=Array.from(Array(len).keys());
  let optOrder=null;
  if(shuffle){
    shuffleArr(order);
    optOrder=qs.map(function(q){const p=[0,1,2,3];return canShuffleOpts(q)?shuffleArr(p):p;});
  }
  return {answers:Array(len).fill(null),order:order,optOrder:optOrder,flags:Array(len).fill(false),mode:mode,examStart:mode==='exam'?Date.now():null,examDone:false};
}
function loadState(e){
  try{
    const v2=JSON.parse(localStorage.getItem(skey(e)));
    if(v2&&Array.isArray(v2.answers)&&v2.answers.length===EXAMS[e].questions.length)return v2;
  }catch(err){}
  try{
    const v1=JSON.parse(localStorage.getItem('ea3quiz_mock_'+e));
    if(Array.isArray(v1)&&v1.length===EXAMS[e].questions.length){
      const s=makeState(v1.length,EXAMS[e].questions,false,'practice');
      s.answers=v1;
      localStorage.setItem(skey(e),JSON.stringify(s));
      return s;
    }
  }catch(err){}
  return null;
}
function saveState(){
  if(!st)return;
  if(typeof pos==='number')st.pos=pos;      // resume on this question next time
  try{
    if(exam>=0)localStorage.setItem(skey(exam),JSON.stringify(st));
    else if(exam===-3)localStorage.setItem(chapKey(CHAP),JSON.stringify(st));
    else if(exam===-4)localStorage.setItem(mcqKey(MCH),JSON.stringify(st));
    else if(exam===-5)localStorage.setItem(xKey(XCH),JSON.stringify(st));
  }catch(err){}
}
// Where to open a quiz: the question you were last looking at, otherwise the first one
// you have not answered. Browsing with answers shown leaves nothing "answered", so
// without this you would always be sent back to question 1.
function resumePos(state){
  if(!state||!state.order)return 0;
  if(typeof state.pos==='number'&&state.pos>=0&&state.pos<state.order.length)return state.pos;
  var first=state.order.map(function(qi){return state.answers[qi];}).findIndex(function(a){return a===null;});
  return first===-1?0:first;
}
function getPerm(qIdx){return (st.optOrder&&st.optOrder[qIdx])?st.optOrder[qIdx]:[0,1,2,3];}
function refOf(qIdx){return exam>=0?('m'+exam+'_'+qIdx):REVIEW_REFS[qIdx];}
function feedbackOn(){return st.mode==='practice'||st.examDone;}
// "See answers" — reveal the answer without recording an attempt, so scores stay honest.
// Blocked while an exam simulation is still running.
function canReveal(){return !(st.mode==='exam'&&!st.examDone);}
function isRevealed(qIdx){
  if(!canReveal())return false;
  if(st.revealAll)return true;
  return !!(st.revealed&&st.revealed[qIdx]);
}
function setRevealed(qIdx,on){
  if(!st.revealed)st.revealed={};
  if(on)st.revealed[qIdx]=1; else delete st.revealed[qIdx];
  saveState();
}
function toggleRevealAll(){
  st.revealAll=!st.revealAll;
  saveState();renderSide();render();
}
function counts(){
  let ans=0,right=0;
  st.answers.forEach(function(v,i){if(v!==null){ans++;if(v===QUESTIONS[i].a)right++;}});
  return {ans:ans,right:right};
}
// ---------- spaced repetition ----------

// ============================================================================
// ==== STUDY TIME TRACKING
// ============================================================================
// ---------- study time tracking ----------
var TKEY='ea3quiz_time', tickInt=null, lastAct=Date.now();
function getTime(){try{return JSON.parse(localStorage.getItem(TKEY))||{parts:{},sets:{},units:{},topics:{},days:{}};}catch(err){return {parts:{},sets:{},units:{},topics:{},days:{}};}}
function saveTime(t){try{localStorage.setItem(TKEY,JSON.stringify(t));}catch(err){}}
function fmtDur(s){
  s=Math.round(s||0);
  if(s<60)return s+'s';
  var h=Math.floor(s/3600),m=Math.round(s%3600/60);
  return h?(h+'h '+m+'m'):(m+'m');
}
function setLabel(){
  if(exam>=0)return {k:'p'+PART+':mock:'+exam, label:PARTS[PART].name+' — '+EXAMS[exam].name};
  if(exam===-3)return {k:'p'+PART+':unit:'+CHAP, label:PARTS[PART].name+' — '+UNITS[CHAP].name};
  if(exam===-4)return {k:'p'+PART+':mcq:'+MCH, label:PARTS[PART].name+' — '+MCQS[MCH].name};
  if(exam===-2)return {k:'p'+PART+':review', label:PARTS[PART].name+' — Smart Review'};
  return null;
}
function tickTime(){
  if(!st||exam===-1)return;
  if(document.visibilityState==='hidden')return;
  if(Date.now()-lastAct>120000)return;               // idle guard: pause after 2 min inactivity
  var sl=setLabel(); if(!sl)return;
  var t=getTime(), q=QUESTIONS[st.order[pos]];
  t.parts[PART]=(t.parts[PART]||0)+1;
  t.sets[sl.k]=t.sets[sl.k]||{s:0,label:sl.label};
  t.sets[sl.k].s+=1;
  if(q){
    if(q.unit){t.units[q.unit]=(t.units[q.unit]||0)+1;}
    if(q.topic){t.topics[q.topic]=(t.topics[q.topic]||0)+1;}
  }
  var d=new Date().toISOString().slice(0,10);
  t.days[d]=(t.days[d]||0)+1;
  saveTime(t);
}
function startClock(){stopClock();tickInt=setInterval(tickTime,1000);}
function stopClock(){if(tickInt){clearInterval(tickInt);tickInt=null;}}
['keydown','click','mousemove','touchstart','scroll'].forEach(function(ev){
  document.addEventListener(ev,function(){lastAct=Date.now();},{passive:true});
});

// ============================================================================
// ==== MANUAL STOPWATCH
// ============================================================================
// ---------- manual study stopwatch (Start / Stop per part) ----------
// Separate from the automatic tracker above: this one only counts when you tell it to.
// per-device stopwatch: each device stores its own timer state under a device-tagged key.
// Displays sum across all devices via swGetAll(); accrual/writes still target THIS device only.
function ea_dev_id(){
  var d=null; try{d=localStorage.getItem('ea_device_id');}catch(e){}
  if(!d){ d=Date.now().toString(36)+Math.random().toString(36).slice(2,10);
    try{localStorage.setItem('ea_device_id',d);}catch(e){} }
  return d;
}
var SWKEY='ea3quiz_stopwatch_'+ea_dev_id(), SWANCHORKEY='ea3quiz_sw_anchor', SWINT=null;
function _swAnchor(){ try{var v=JSON.parse(localStorage.getItem(SWANCHORKEY));if(v&&(v.tot||v.days))return {tot:v.tot||{},days:v.days||{}};}catch(e){} return {tot:{},days:{}}; }
function _swSaveAnchor(a){ try{localStorage.setItem(SWANCHORKEY,JSON.stringify(a));}catch(e){} }

// one-time migration: move legacy single-key stopwatch to this device's key so no time is lost.
(function(){
  try{
    var legacy=localStorage.getItem('ea3quiz_stopwatch');
    if(legacy && !localStorage.getItem(SWKEY)){
      localStorage.setItem(SWKEY,legacy);
      localStorage.removeItem('ea3quiz_stopwatch');
    }
  }catch(e){}
})();
// Aggregate across all ea3quiz_stopwatch_* keys (this device + any others that have synced in).
function swGetAll(){
  var A=_swAnchor();
  var out={tot:{},days:{},run:null};
  Object.keys(A.tot||{}).forEach(function(p){ out.tot[p]=(out.tot[p]||0)+(A.tot[p]||0); });
  Object.keys(A.days||{}).forEach(function(day){
    var v=A.days[day]; var n=(typeof v==='number')?v:0;
    if(v && typeof v==='object'){ Object.keys(v).forEach(function(p){ n+=(v[p]||0); }); }
    out.days[day]=(out.days[day]||0)+n;
  });
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(!k || k.indexOf('ea3quiz_stopwatch_')!==0) continue;
      var s=null; try{s=JSON.parse(localStorage.getItem(k));}catch(e){}
      if(!s) continue;
      var t=s.tot||{};
      Object.keys(t).forEach(function(p){ out.tot[p]=(out.tot[p]||0)+(t[p]||0); });
      var d=s.days||{};
      Object.keys(d).forEach(function(day){
        var v=d[day];
        // days can be either a number (total seconds that day) or an object (per-part). Sum to a number.
        var n=(typeof v==='number')?v:0;
        if(v && typeof v==='object'){ Object.keys(v).forEach(function(p){ n+=(v[p]||0); }); }
        out.days[day]=(out.days[day]||0)+n;
      });
      if(k===SWKEY && s.run) out.run=s.run;
    }
  }catch(e){}
  return out;
}
// v31: undo the v29 legacy-doubling. Runs once per device.
(function(){
  try{ if(localStorage.getItem('ea_sw_dedup_v31')==='1') return; }catch(e){}
  try{
    var buckets=[];
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(!k) continue;
      if(k.indexOf('ea3quiz_stopwatch_')!==0) continue;
      var v=null; try{ v=JSON.parse(localStorage.getItem(k)); }catch(e){}
      if(v) buckets.push({k:k,v:v});
    }
    if(buckets.length){
      // MAX per part / per day across buckets — represents the shared legacy total.
      var A=_swAnchor(); var tot={}, days={};
      buckets.forEach(function(b){
        var t=b.v.tot||{};
        Object.keys(t).forEach(function(p){ tot[p]=Math.max(tot[p]||0, t[p]||0); });
        var d=b.v.days||{};
        Object.keys(d).forEach(function(day){
          var val=d[day]; var n=(typeof val==='number')?val:0;
          if(val && typeof val==='object'){ Object.keys(val).forEach(function(p){ n+=(val[p]||0); }); }
          days[day]=Math.max(days[day]||0, n);
        });
      });
      // Keep the existing anchor as a floor (in case another device already migrated).
      Object.keys(A.tot||{}).forEach(function(p){ tot[p]=Math.max(tot[p]||0, A.tot[p]||0); });
      Object.keys(A.days||{}).forEach(function(day){ days[day]=Math.max(days[day]||0, A.days[day]||0); });
      _swSaveAnchor({tot:tot,days:days});
      // Zero out this device's bucket; keep run info if present.
      var mine=null; try{mine=JSON.parse(localStorage.getItem(SWKEY));}catch(e){}
      var newMine={tot:{},days:{},run:(mine&&mine.run)?mine.run:null};
      try{localStorage.setItem(SWKEY,JSON.stringify(newMine));}catch(e){}
      // For any other-device buckets that happen to sit locally, replace with empty so
      // sync propagation reflects a de-duplicated state.
      buckets.forEach(function(b){ if(b.k!==SWKEY){ try{localStorage.setItem(b.k, JSON.stringify({tot:{},days:{},run:null}));}catch(e){} } });
    }
    try{localStorage.setItem('ea_sw_dedup_v31','1');}catch(e){}
  }catch(e){}
})();

function swGet(){
  try{var s=JSON.parse(localStorage.getItem(SWKEY));if(s&&s.tot)return s;}catch(e){}
  return {tot:{},days:{},run:null};
}
function swSave(s){try{localStorage.setItem(SWKEY,JSON.stringify(s));}catch(e){}}
function dayKey(d){
  d=d||new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function yesterdayKey(){ var d=new Date(); d.setDate(d.getDate()-1); return dayKey(d); }
function hhmmss(sec){
  sec=Math.max(0,Math.round(sec||0));
  var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),x=sec%60;
  return (h?h+':':'')+(h?String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0');
}
// Time is banked second by second into the day it actually happened, so a session
// running past midnight splits across both days by itself.
function swAccrue(s,now){
  if(!s.run)return false;
  var last=s.run.last||s.run.t;
  var delta=Math.floor((now-last)/1000);
  if(delta<=0)return false;
  s.days=s.days||{};
  s.days[dayKey()]=(s.days[dayKey()]||0)+delta;
  // credit the part you are actually on right now, not the one you started on —
  // so switching parts mid-session moves the clock with you
  var pnow=(typeof PART!=='undefined')?PART:s.run.p;
  s.tot[pnow]=(s.tot[pnow]||0)+delta;
  s.run.p=pnow;
  s.run.last=last+delta*1000;
  s.run.seen=now;
  return true;
}
function swDay(s,k){ return (s.days&&s.days[k])||0; }
function swTotal(s){ var t=0,d=s.days||{}; for(var k in d)t+=d[k]; return t; }
function swPartTotal(s,p){ return s.tot[p]||0; }
// A clock left running when the browser closed: everything up to the last tick is
// already banked. Treat that like an auto-pause (not an end) so the session — and
// its question count — survives being reopened later; only an explicit "End
// session" click should reset the count to zero.
function swRecover(){
  var s=swGet();
  if(s.run&&s.run.seen&&Date.now()-s.run.seen>180000){
    var legSec=Math.max(0,(s.run.seen-s.run.t)/1000);
    var legQ=Math.max(0,totalAnsweredAllTime()-(s.run.q0||0));
    if(s.session){s.session.accSec=(s.session.accSec||0)+legSec; s.session.qBank=(s.session.qBank||0)+legQ; s.session.p=s.run.p;}
    s.run=null; swSave(s);
  }
  return s;
}
// Live elapsed seconds for the current session: banked prior legs + the leg in progress.
function swSessionElapsed(s){
  var acc=(s.session&&s.session.accSec)||0;
  return acc+(s.run?Math.max(0,(Date.now()-s.run.t)/1000):0);
}
// Questions answered so far this session: banked prior legs + the leg in progress.
// Banking per-leg (like time) means answers from OTHER activity while paused don't
// silently bleed into a session that isn't actively running.
function swSessionQCount(s){
  if(!s.session)return 0;
  var banked=s.session.qBank||0;
  var live=s.run?Math.max(0,totalAnsweredAllTime()-(s.run.q0||0)):0;
  return banked+live;
}
// Formats an average pace like "48s/question" or "2m 10s/question".
function fmtPace(sec,q){
  if(!q)return '';
  var avg=sec/q;
  return (avg<60?Math.round(avg)+'s':fmtDur(avg))+'/question';
}
// Start: begin a brand-new session (question count resets to 0) and start the clock.
function swStart(){
  var s=swGet();
  if(s.session)return;
  var now=Date.now();
  s.session={accSec:0,qBank:0,startedAt:now,p:PART};
  s.run={p:PART,t:now,last:now,seen:now,q0:totalAnsweredAllTime()};
  swSave(s); swRender(); swPanelRender(); swTick();
}
// Pause: stop the clock but keep the session (and its banked question count) alive.
function swPause(){
  var s=swGet();
  if(!s.run)return;
  var legSec=Math.max(0,(Date.now()-s.run.t)/1000);
  var legQ=Math.max(0,totalAnsweredAllTime()-(s.run.q0||0));
  swAccrue(s,Date.now());
  if(s.session){s.session.accSec=(s.session.accSec||0)+legSec; s.session.qBank=(s.session.qBank||0)+legQ; s.session.p=s.run.p;}
  s.run=null; swSave(s);
  if(SWINT){clearInterval(SWINT);SWINT=null;}
  swRender(); swPanelRender();
}
// Resume: continue the current session's clock and question count from where it paused.
function swResume(){
  var s=swGet();
  if(s.run||!s.session)return;
  var now=Date.now();
  s.run={p:PART,t:now,last:now,seen:now,q0:totalAnsweredAllTime()};
  s.session.p=PART;
  swSave(s); swRender(); swPanelRender(); swTick();
}
// Stop/End session: finalize into "Last session" and reset the question count to 0.
function swStop(){
  var s=swGet();
  if(!s.session&&!s.run)return;
  var legSec=0, legQ=0;
  if(s.run){
    legSec=Math.max(0,(Date.now()-s.run.t)/1000);
    legQ=Math.max(0,totalAnsweredAllTime()-(s.run.q0||0));
    swAccrue(s,Date.now());
  }
  var accSec=((s.session&&s.session.accSec)||0)+legSec;
  var qTotal=((s.session&&s.session.qBank)||0)+legQ;
  s.lastSession={q:qTotal,sec:Math.round(accSec),endedAt:Date.now()};
  s.run=null; s.session=null; swSave(s);
  if(SWINT){clearInterval(SWINT);SWINT=null;}
  swRender(); swPanelRender();
}
// Header chip: no session → start; running → pause; paused → resume.
function swToggle(){
  var s=swGet();
  if(!s.session)swStart();
  else if(s.run)swPause();
  else swResume();
}
function swTick(){
  if(SWINT)clearInterval(SWINT);
  SWINT=setInterval(function(){
    var s=swGet();
    if(!s.run){clearInterval(SWINT);SWINT=null;swRender();return;}
    swAccrue(s,Date.now()); swSave(s);
    swRender();
    var p=document.getElementById('swPanel');
    if(p&&p.classList.contains('open'))swPanelRender();
  },1000);
}
function swRender(){
  var b=document.getElementById('swBtn'); if(!b)return;
  var s=swGetAll(), dev=swGet(), running=!!dev.run, paused=!!dev.session&&!dev.run, today=swDay(s,dayKey());
  var q=dev.session?swSessionQCount(dev):0;
  b.className='swbtn'+(running?' running':(paused?' paused':''));
  b.innerHTML=(running?'<span class="swdot"></span>':(paused?'<span class="swdot paused"></span>':'⏱ '))+
    '<span class="swtime">'+(running||paused?hhmmss(today):(today>0?fmtDur(today):'Start'))+'</span>'+
    (dev.session?'<span class="swqcount">· '+q+' q'+(paused?' · paused':'')+'</span>':'');
  b.title=running?('Timing now — '+q+' question'+(q===1?'':'s')+' this session. Click to pause.')
        :paused?('Paused — '+q+' question'+(q===1?'':'s')+' so far. Click to resume.')
        :'Today’s study time — click to start the timer.';
}
function swPanelRender(){
  var el=document.getElementById('swPanel'); if(!el)return;
  var s=swGetAll(), dev=swGet(), run=!!dev.run, paused=!!dev.session&&!dev.run;
  var today=swDay(s,dayKey()), yday=swDay(s,yesterdayKey()), all=swTotal(s);
  var curPart=run?dev.run.p:(paused?dev.session.p:null);
  var sessH='';
  if(dev.session){
    var qNow=swSessionQCount(dev), secNow=swSessionElapsed(dev);
    sessH='<div class="swcap">This session'+(paused?' (paused)':'')+'</div>'+
      '<div class="swsess">'+qNow+' question'+(qNow===1?'':'s')+' · '+hhmmss(secNow)+
      (qNow?' · '+fmtPace(secNow,qNow):'')+'</div>';
  }else if(dev.lastSession&&(dev.lastSession.q||dev.lastSession.sec)){
    var ls=dev.lastSession;
    sessH='<div class="swcap">Last session</div>'+
      '<div class="swsess">'+ls.q+' question'+(ls.q===1?'':'s')+' in '+hhmmss(ls.sec)+
      (ls.q?' · '+fmtPace(ls.sec,ls.q):'')+'</div>';
  }
  var goLabel=run?'⏸ Pause the time':(paused?'▶ Resume the time':'▶ Start the time');
  var h='<h4>Study timer</h4>'+
    '<div class="swbig">'+hhmmss(today)+'</div>'+
    '<div class="swsub">today'+(curPart!=null?(run?' · running · ':' · paused · ')+(PARTS[curPart]?PARTS[curPart].name:'Part '+curPart):'')+'</div>'+
    '<button class="swgo'+(run?' pause':'')+'" id="swGo">'+goLabel+'</button>'+
    (dev.session?'<button class="swend" id="swEnd">■ End session</button>':'')+
    sessH+
    '<div class="swcap">By day</div>'+
    '<table class="swtbl">'+
      '<tr class="cur"><td>Today</td><td>'+fmtDur(today)+'</td></tr>'+
      '<tr><td>Yesterday</td><td>'+fmtDur(yday)+'</td></tr>'+
      '<tr><td>Total</td><td>'+fmtDur(all)+'</td></tr>'+
    '</table>'+
    '<div class="swcap">By part</div>'+
    '<table class="swtbl">'+[1,2,3].map(function(p){
      var cur=curPart!=null?String(curPart)===String(p):String(PART)===String(p);
      return '<tr'+(cur?' class="cur"':'')+'><td>'+(PARTS[p]?PARTS[p].name:'Part '+p)+'</td><td>'+fmtDur(swPartTotal(s,p))+'</td></tr>';
    }).join('')+'</table>'+
    '<div class="swfoot"><span style="color:var(--muted)">Pausing keeps this session\'s question count · ending resets it</span></div>';
  el.innerHTML=h;
  document.getElementById('swGo').onclick=function(){swToggle();};
  var endBtn=document.getElementById('swEnd');
  if(endBtn)endBtn.onclick=function(e){e.stopPropagation();swStop();};
}
function initStopwatch(){
  var s=swRecover();
  var b=document.getElementById('swBtn'), more=document.getElementById('swMore'), pan=document.getElementById('swPanel');
  if(!b)return;
  b.onclick=function(e){e.stopPropagation();swToggle();};
  more.onclick=function(e){
    e.stopPropagation();
    pan.classList.toggle('open');
    if(pan.classList.contains('open'))swPanelRender();
  };
  pan.onclick=function(e){e.stopPropagation();};
  document.addEventListener('click',function(){pan.classList.remove('open');});
  // keep counting across a refresh if it was still running
  if(s.run)swTick();
  swRender();
}

// ============================================================================
// ==== SPACED REPETITION (SRS)
// ============================================================================
function srsKey(){return 'ea3quiz_srs'+(PART===3?'':('_p'+PART));}
function getSrs(){try{return JSON.parse(localStorage.getItem(srsKey()))||{};}catch(err){return {};}}
function saveSrs(s){try{localStorage.setItem(srsKey(),JSON.stringify(s));}catch(err){}}
function updateSrs(ref,correct){
  if(!ref)return;
  const s=getSrs();const r=s[ref]||{m:0,s:0};
  if(correct){r.s++;}else{r.m++;r.s=0;}
  s[ref]=r;saveSrs(s);
}
function dueReview(){
  const s=getSrs(),out=[];
  EXAMS.forEach(function(ex,e){
    ex.questions.forEach(function(q,i){
      const r=s['m'+e+'_'+i];
      if(r&&r.m>0&&r.s<2)out.push({q:q,ref:'m'+e+'_'+i,label:'Mock '+(e+1)+' · Q'+(i+1),m:r.m,s:r.s});
    });
  });
  out.sort(function(a,b){return (b.m-a.m)||(a.s-b.s);});
  return out;
}

// ============================================================================
// ==== DAILY ACTIVITY / STREAKS
// ============================================================================
// ---------- daily activity tracking (EST timezone) ----------
// Tracks how many questions the user answers per day, across all Parts.
// Stored under an ea3quiz_ key so it syncs cross-device via Supabase.
var DAILY_KEY='ea3quiz_v2_daily';
function estDate(d){
  // Returns YYYY-MM-DD in America/New_York timezone
  try{return (d||new Date()).toLocaleDateString('en-CA',{timeZone:'America/New_York'});}
  catch(e){return (d||new Date()).toISOString().slice(0,10);}
}
function dailyLog(){
  try{return JSON.parse(localStorage.getItem(DAILY_KEY))||{};}catch(e){return {};}
}
function recordAnswerToday(){
  var log=dailyLog(); var k=estDate();
  log[k]=(log[k]||0)+1;
  try{localStorage.setItem(DAILY_KEY,JSON.stringify(log));}catch(e){}
}
// A question counts toward today's total at most once per "opening" of a
// quiz set — not once per Next/Prev click. resetSessionSeen() is called by
// every start*()/jumpTo() that launches or resumes a set (a genuine "open"),
// so going Q2 -> Q1 within one sitting doesn't inflate the count, but leaving
// back to the menu and re-entering the same set later starts a fresh,
// re-countable pass. Deliberately in-memory only (not persisted) — a page
// reload is as good as reopening. Keyed by plain qIdx: every reset site also
// reassigns QUESTIONS to the new set's array, so indices from a previous set
// can't collide with the new one.
var SESSION_SEEN={};
function resetSessionSeen(){ SESSION_SEEN={}; }
function countQuestionOnce(qIdx){
  if(SESSION_SEEN[qIdx])return;
  SESSION_SEEN[qIdx]=1;
  recordAnswerToday();
}
function todayCount(){ return dailyLog()[estDate()]||0; }
// Lifetime count of answers logged, used to measure how many questions were
// attempted during a given Start/Stop timer session (session count = delta of this).
function totalAnsweredAllTime(){ var log=dailyLog(),t=0; for(var k in log)t+=(log[k]||0); return t; }
function currentStreak(){
  var log=dailyLog(); var streak=0;
  var d=new Date();
  // If today has 0, streak might still be alive counting from yesterday — but
  // for a study-habit tracker, we want to reflect "today included."
  // Convention: streak counts consecutive days with >0 up to and including today.
  // If today is 0, streak = 0 (broken).
  if(!log[estDate(d)])return 0;
  while(true){
    var k=estDate(d);
    if(log[k]&&log[k]>0){streak++;d.setDate(d.getDate()-1);}
    else break;
    if(streak>3650)break; // safety
  }
  return streak;
}
// Total questions answered across the current streak's days (inclusive of today)
function streakTotal(){
  var streak=currentStreak(); if(!streak)return 0;
  var log=dailyLog(); var total=0; var d=new Date();
  for(var i=0;i<streak;i++){
    var k=estDate(d);
    total+=(log[k]||0);
    d.setDate(d.getDate()-1);
  }
  return total;
}
// " · 🔥 12 today · 4-day streak" — appended to the quiz header (#counter) while
// attempting questions, separate from the exam countdown (#score), so you can
// watch today's count/streak move live as you go through a mock or practice
// set without leaving the quiz to check the main menu.
function todayStreakSuffix(){
  var t=todayCount(); if(!t)return '';
  var s=currentStreak();
  return ' · 🔥 '+t+' today'+(s>1?' · '+s+'-day streak':'');
}

// ============================================================================
