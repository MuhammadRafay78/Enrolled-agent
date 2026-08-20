// ==== QUIZ VIEW: enterQuiz, render, renderSide
// ============================================================================
// ---------- quiz ----------
function enterQuiz(){
  side.classList.add('active');side.classList.remove('open');document.body.classList.add('inquiz');
  lastAct=Date.now();startClock();
  startTimerIfNeeded();
  renderSide();render();
}
function headerScore(){
  if(st.mode==='exam'&&!st.examDone){tickTimer();return;}
  const c=counts();
  document.getElementById('score').textContent='Score: '+c.right+'/'+c.ans+(c.ans?' ('+Math.round(c.right/c.ans*100)+'%)':'');
}
function examName(){return exam===-2?'Smart Review':(exam===-3?UNITS[CHAP].name:(exam===-4?MCQS[MCH].name:(exam===-5?XTRA[XCH].name:(exam===-6?'Flagged Questions':(exam===-7?'Wrong Questions':(exam===-8?('Search: "'+(window._searchQuizTerm||'')+'"'):(exam===-9?'Wrong + Flagged (Shuffled)':(exam===-10?'Toughest for Me':(exam===-11?GLEIM_CH[GCH].name:EXAMS[exam].name)))))))));}
function renderSide(){
  const c=counts();
  const fb=feedbackOn();
  side.innerHTML='<button class="side-close" id="sideClose">✕ Close</button><div class="side-hd">'+examName()+(st.mode==='exam'&&!st.examDone?' <span style="color:var(--red)">⏱</span>':'')+'</div>'+
    '<div class="qgrid">'+st.order.map(function(qIdx,p){
      let cls='qn';
      if(st.answers[qIdx]!==null)cls+=fb?(st.answers[qIdx]===QUESTIONS[qIdx].a?' done-right':' done-wrong'):' done-neutral';
      else if(st.revealed&&st.revealed[qIdx])cls+=' seen';
      if(st.flags[qIdx])cls+=' flg';
      if(p===pos)cls+=' cur';
      return '<button class="'+cls+'" data-j="'+p+'">'+(p+1)+'</button>';
    }).join('')+'</div>'+
    '<div style="font-size:12px;color:var(--muted);margin-top:10px">'+c.ans+'/'+QUESTIONS.length+' answered'+(fb?' · '+c.right+' correct':'')+(st.flags.some(Boolean)?' · ⚑ '+st.flags.filter(Boolean).length+' flagged':'')+'</div>'+
    (function(){
      var q=QUESTIONS[st.order[pos]], un=q?unitNumOf(q.unit):null;
      return (CHNOTES[PART]&&un&&CHNOTES[PART][un])?'<button class="side-btn" id="sbNotes">📘 Chapter Notes</button>':'';
    })()+
    (canReveal()?'<button class="side-btn'+(st.revealAll?' on':'')+'" id="sbRevealAll">👁 '+(st.revealAll?'Hide all answers':'Show all answers')+'</button>':'')+
    '<button class="side-btn" id="sbResults">'+(st.mode==='exam'&&!st.examDone?'Submit Exam':'Results')+'</button>'+
    (st.flags.some(Boolean)?'<button class="side-btn" id="sbFlag">Next flagged ⚑</button>':'')+
    (st.review?'':'<button class="side-btn" id="sbReset">Reset progress</button>')+
    '<button class="side-btn" id="sbMenu">← Go back</button>';
  side.querySelectorAll('[data-j]').forEach(function(b){b.onclick=function(){pos=+b.dataset.j;side.classList.remove('open');renderSide();render();scrollTop();};});
  document.getElementById('sideClose').onclick=function(){side.classList.remove('open');};
  var sbn=document.getElementById('sbNotes');
  if(sbn)sbn.onclick=function(){
    var q=QUESTIONS[st.order[pos]],un=unitNumOf(q.unit);
    var back=function(){enterQuiz();};
    showNotes(un,back);
  };
  var sra=document.getElementById('sbRevealAll');
  if(sra)sra.onclick=toggleRevealAll;
  document.getElementById('sbResults').onclick=function(){st.mode==='exam'&&!st.examDone?confirmSubmit():showEnd();};
  const fbtn=document.getElementById('sbFlag');
  if(fbtn)fbtn.onclick=function(){
    for(let k=1;k<=st.order.length;k++){const p2=(pos+k)%st.order.length;if(st.flags[st.order[p2]]){pos=p2;break;}}
    side.classList.remove('open');renderSide();render();scrollTop();
  };
  const rbtn=document.getElementById('sbReset');
  if(rbtn)rbtn.onclick=function(){exam===-3?resetChapter():(exam===-4?resetMcqNow():resetExam(exam));};
  document.getElementById('sbMenu').onclick=function(){
    // Return to whichever list screen this quiz was actually launched from,
    // not always the top-level exam menu — so picking another chapter/set is one click.
    if(exam===-4)mcqChapterList();
    else if(exam===-5)extraList();
    else if(exam===-11)gleimList();
    else showMenu();
  };
}
// Format an explanation string so the correct-answer reasoning and the
// 'Why the others are wrong:' bullets render as separate paragraphs and lines.
function fmtExpl(s){
  if(!s) return '';
  var parts=s.split(/\s*Why the others are wrong:\s*/i);
  var main=(parts[0]||'').trim();
  // paragraph-break the main reasoning on double newlines OR sentence-boundary heuristic
  var mainHtml=main.split(/\n{2,}/).map(function(p){return '<p>'+esc(p.trim())+'</p>';}).join('');
  var out=mainHtml;
  if(parts.length>1 && parts[1].trim()){
    out+='<div class="wow-hd"><b>Why the others are wrong:</b></div>';
    // Split on bullet markers (accept • or -) preceding option letters A-D)
    var body=parts[1];
    var bullets=body.split(/(?=[•\-]\s*[A-D]\)\s*)/).map(function(b){return b.trim();}).filter(Boolean);
    bullets.forEach(function(b){
      var m=b.match(/^[•\-]\s*([A-D])\)\s*([\s\S]*)$/);
      if(m){
        out+='<div class="wow-item"><b>'+m[1]+')</b> '+esc(m[2].trim())+'</div>';
      }else{
        out+='<div class="wow-item">'+esc(b)+'</div>';
      }
    });
  }
  return out;
}
// examName() + position + " · 🔥 N today · Nd streak" — kept in one place since
// several call sites (render, revealing an answer, picking one) each need to
// refresh it the moment today's count changes, not just on the next render.
function refreshCounterHeader(){
  document.getElementById('counter').textContent=examName()+' — Question '+(pos+1)+' of '+QUESTIONS.length+todayStreakSuffix();
}
function render(){
  markView('quiz',{exam:exam,pos:pos,mch:MCH,chap:CHAP,xch:XCH});
  if(st&&st.pos!==pos){st.pos=pos;saveState();}
  setFloatBack(goBack,'← Back');
  // Every question displayed here counts toward today's total/streak once per
  // set-opening — including one you already answered or already revealed —
  // but going Q2 -> Q1 within the same sitting doesn't recount Q1; only
  // reopening the set later does (see resetSessionSeen() call sites).
  countQuestionOnce(st.order[pos]);
  refreshCounterHeader();
  headerScore();
  const c=counts();
  document.getElementById('prog').style.width=(c.ans/QUESTIONS.length*100)+'%';
  const qIdx=st.order[pos],Q=QUESTIONS[qIdx],perm=getPerm(qIdx);
  const letters=['A','B','C','D'];
  card.innerHTML='<div class="badges"><span class="badge">'+Q.topic+'</span><span class="badge unit">'+Q.unit+'</span>'+
    (exam<0&&REVIEW_REFS[qIdx]?'<span class="badge unit">'+REVIEW_REFS[qIdx].replace(/m(\d+)_(\d+)/,function(_,e,i){return 'Mock '+(+e+1)+' · Q'+(+i+1);})+'</span>':'')+
    '<button class="flagbtn'+(st.flags[qIdx]?' on':'')+'" id="flagBtn">⚑ '+(st.flags[qIdx]?'Flagged':'Flag')+'</button>'+
    (function(){
      // AI is gated: only the account owner (see ADMINS) gets the button.
      // Show the inline Ask AI button for admin OR demo users with quota left
      var _isAdmin = (typeof isAdminUser === 'function' && isAdminUser());
      var _isDemo  = (typeof isDemoActive === 'function' && isDemoActive() && typeof demoAiRemaining === 'function' && demoAiRemaining() > 0);
      if (!_isAdmin && !_isDemo) return '';
      var isWrong = (st.answers[qIdx]!==null && st.answers[qIdx]!==Q.a && feedbackOn());
      var label = isWrong ? '💡 Why did I get this wrong?' : '✨ Ask AI';
      var cls = isWrong ? 'flagbtn askai-hot' : 'flagbtn';
      return '<button class="'+cls+'" id="askAiBtn" data-hot="'+(isWrong?'1':'0')+'" title="Ask AI to explain this question (shortcut: ? or i)">'+label+'</button>'+
        '<button class="flagbtn" id="conceptAiBtn" title="Ask AI to teach the underlying concept, independent of this specific question">💭 Explain concept</button>';
    })()+
    (st.answers[qIdx]!==null?'<button class="flagbtn" id="resetQBtn" title="Clear your answer for this question">↺ Reset</button>':'')+
    (canReveal()&&st.answers[qIdx]===null&&!st.revealAll?'<button class="flagbtn'+(isRevealed(qIdx)?' on':'')+'" id="seeAnsBtn">👁 '+(isRevealed(qIdx)?'Hide answer':'See answer')+'</button>':'')+'</div>'+
    '<div class="qtext">'+Q.q+'</div>'+
    '<div id="opts">'+perm.map(function(orig,j){return '<button class="opt" data-i="'+j+'"><span class="letter">'+letters[j]+'.</span>'+Q.opts[orig]+'</button>';}).join('')+'</div>'+
    refresherHTML(Q)+
    '<div id="verdict"></div><div class="exp" id="exp"></div>'+
    '<div class="nav2"><button class="navbtn" id="prev"'+(pos===0?' disabled':'')+'>← Previous</button><button class="navbtn primary" id="next">'+(pos===QUESTIONS.length-1?(st.mode==='exam'&&!st.examDone?'Finish':'Results'):'Next')+' →</button></div>';
  card.querySelectorAll('#opts .opt').forEach(function(b){b.onclick=function(){pick(+b.dataset.i);};});
  wireRefresher();
  document.getElementById('flagBtn').onclick=function(){
    st.flags[qIdx]=!st.flags[qIdx];saveState();renderSide();render();
  };
  // Shared by the Ask AI and Explain Concept buttons — opens/restores the
  // tutor panel exactly the same way, then prefills and sends the given prompt.
  function _sendAiPrompt(promptText){
    var btn=document.getElementById('ai-tutor-btn');
    var panel=document.getElementById('ai-tutor-panel');
    var input=document.getElementById('ai-tutor-input');
    var sendBtn=document.getElementById('ai-tutor-send');
    if(!panel||!input||!sendBtn)return;
    // Route through the floating tutor button's open handler so the quiz
    // reflows left (body.ai-open), chat history restores, etc. If the panel
    // is already open, just prefill and send.
    var wasOpen = (panel.style.display === 'flex' && !panel.classList.contains('minimized'));
    if(!wasOpen && btn && btn.style.display !== 'none'){ btn.click(); }
    else if(panel.classList.contains('minimized')){
      panel.classList.remove('minimized');
      if(window.innerWidth >= 1024) document.body.classList.add('ai-open');
    }
    input.value = promptText;
    setTimeout(function(){sendBtn.click();},80);
  }
  var aab=document.getElementById('askAiBtn');
  if(aab)aab.onclick=function(){
    // Prefill and send — targeted prompt if the student got this question wrong
    var isHot = aab.getAttribute('data-hot') === '1';
    _sendAiPrompt(isHot
      ? 'I chose the wrong answer to this question. Explain why my choice is wrong and why the correct answer is right. Focus on the specific rule I got confused about, and give me a one-line way to remember it next time.'
      : 'Explain this question in detail. Break down why the correct answer is right and why each wrong answer is wrong.');
  };
  var cab=document.getElementById('conceptAiBtn');
  if(cab)cab.onclick=function(){
    _sendAiPrompt('Explain the core tax concept behind this question in plain language. What is the underlying rule I need to understand?');
  };
  var rqb=document.getElementById('resetQBtn');
  if(rqb)rqb.onclick=function(){
    if(!confirm('Reset your answer to this question? You can answer it again.'))return;
    st.answers[qIdx]=null;
    setRevealed(qIdx,false);
    saveState();
    renderSide();
    render();
    headerScore();
  };
  document.getElementById('prev').onclick=function(){if(pos>0){pos--;renderSide();render();scrollTop();}};
  document.getElementById('next').onclick=function(){
    if(pos<QUESTIONS.length-1){pos++;renderSide();render();scrollTop();}
    else st.mode==='exam'&&!st.examDone?confirmSubmit():showEnd();
  };
  var sab=document.getElementById('seeAnsBtn');
  if(sab)sab.onclick=function(){setRevealed(qIdx,!isRevealed(qIdx));renderSide();render();};
  if(st.answers[qIdx]!==null){feedbackOn()?showFeedback():markSelection();}
  else if(isRevealed(qIdx))showRevealed();
}

// ============================================================================
// ==== QUICK REFRESHER (book-sourced notes)
// ============================================================================
// ---------- quick refresher (book-sourced) ----------
function unitNumOf(u){var m=/^SU\s*(\d+)/.exec(u||'');return m?+m[1]:null;}
function refreshFor(Q){
  var R=REFRESH[PART]; if(!R)return null;
  var un=unitNumOf(Q.unit);
  var keys=R.tmap[Q.topic+'||'+un]||R.tmap[Q.topic+'||null']||null;
  if(!keys||!keys.length){
    if(un&&R.units[un])return {unit:un,secs:[],ub:R.units[un]};
    return null;
  }
  return {unit:un,secs:keys.map(function(k){return R.secs[k];}).filter(Boolean),ub:(un&&R.units[un])?R.units[un]:null};
}
function qrefKey(){
  if(exam>=0)return 'mock:'+exam+':'+st.order[pos];
  if(exam===-4)return 'mcq:'+MCH+':'+st.order[pos];
  return null;               // chapter/review sessions resolve via source ref below
}
function qrefFor(Q){
  var R=QREF[PART]; if(!R)return null;
  var k=qrefKey();
  // chapter-from-mocks and Smart Review carry a source ref like m0_12 -> mock:0:12
  if(!k&&exam<0&&REVIEW_REFS&&REVIEW_REFS[st.order[pos]]){
    var m=/^m(\d+)_(\d+)$/.exec(REVIEW_REFS[st.order[pos]]);
    if(m)k='mock:'+m[1]+':'+m[2];
  }
  if(!k)return null;
  var ids=R.q[k]; if(!ids||!ids.length)return null;
  return ids.map(function(pr){var p=R.p[pr[0]];return p?{u:p.u,sec:p.s,t:p.t,score:pr[1]}:null;}).filter(Boolean);
}
function refresherHTML(Q){
  var hits=qrefFor(Q);
  if(!hits||!hits.length)return '';
  var strong=hits[0].score>=0.20;
  var body=hits.map(function(h){
    return '<div class="rsec"><b>SU '+h.u+' · '+h.sec+'</b><p>'+h.t+'</p></div>';
  }).join('');
  var lbl=hits[0].sec;
  return '<div class="refbox"><button class="refhead" id="refToggle">📌 '+(strong?'What the book says':'Related background')+
    ' <span class="reflbl">'+lbl.slice(0,60)+'</span><span class="chev" id="refChev">▸</span></button>'+
    '<div class="refbody" id="refBody" style="display:none">'+body+
    '<p class="refsrc">Passages from your '+PARTS[PART].name+' study guide, matched to this question.'+
    ((CHNOTES[PART]&&hits[0].u&&CHNOTES[PART][hits[0].u])?' <a href="#" id="refFull">Open full chapter notes →</a>':'')+
    '</p></div></div>';
}
function wireRefresher(){
  var b=document.getElementById('refToggle'); if(!b)return;
  b.onclick=function(){
    var body=document.getElementById('refBody'),ch=document.getElementById('refChev');
    var open=body.style.display!=='none';
    body.style.display=open?'none':'block';
    ch.textContent=open?'▸':'▾';
    var rf=document.getElementById('refFull');
    if(rf&&!rf._w){rf._w=1;rf.onclick=function(ev){
      ev.preventDefault();
      var hits=qrefFor(QUESTIONS[st.order[pos]]);
      if(hits&&hits[0])showNotes(hits[0].u,function(){enterQuiz();});
    };}
  };
}
function scrollTop(){window.scrollTo({top:0,behavior:'smooth'});}
function markSelection(){
  const qIdx=st.order[pos],perm=getPerm(qIdx);
  const selDisp=perm.indexOf(st.answers[qIdx]);
  card.querySelectorAll('#opts .opt').forEach(function(b,j){b.classList.toggle('sel',j===selDisp);});
}
function pick(dispJ){
  const qIdx=st.order[pos],Q=QUESTIONS[qIdx],perm=getPerm(qIdx);
  const orig=perm[dispJ];
  if(st.mode==='exam'&&!st.examDone){
    st.answers[qIdx]=orig;countQuestionOnce(qIdx);recordAttempt(Q,orig);saveState();markSelection();renderSide();headerScore();refreshCounterHeader();
    const c=counts();document.getElementById('prog').style.width=(c.ans/QUESTIONS.length*100)+'%';
    return;
  }
  if(st.answers[qIdx]!==null)return;
  st.answers[qIdx]=orig;
  updateSrs(refOf(qIdx),orig===Q.a);
  countQuestionOnce(qIdx);
  recordAttempt(Q,orig);
  saveState();renderSide();showFeedback();headerScore();refreshCounterHeader();
  const c=counts();document.getElementById('prog').style.width=(c.ans/QUESTIONS.length*100)+'%';
}

// ---- Per-question attempt history (used by Toughest for Me) ----
// Stored as { qHash: [{ts, c: chosenIdx, ok: 0|1}, …] } — keeps up to the last 5 attempts.
// Different from st.answers which only remembers the LAST answer.
var ATTEMPTS_KEY='ea3quiz_v2_attempts';
function _qh(text){var s=String(text||''),h=5381;for(var i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;return h.toString(36);}
function loadAttempts(){try{return JSON.parse(localStorage.getItem(ATTEMPTS_KEY))||{};}catch(e){return {};}}
function saveAttempts(a){try{localStorage.setItem(ATTEMPTS_KEY,JSON.stringify(a));}catch(e){}}
function recordAttempt(Q,chose){
  try{
    if(!Q||typeof chose!=='number')return;
    var a=loadAttempts();
    var k=_qh(Q.q);
    if(!a[k])a[k]=[];
    a[k].push({ts:Date.now(),c:chose,ok:(chose===Q.a)?1:0});
    if(a[k].length>5)a[k]=a[k].slice(-5);
    // Global cap: retain the 500 most-recently-touched questions to bound localStorage
    var keys=Object.keys(a);
    if(keys.length>500){
      keys.sort(function(k1,k2){
        var t1=a[k1][a[k1].length-1].ts||0,t2=a[k2][a[k2].length-1].ts||0;
        return t2-t1;
      });
      var kept={};keys.slice(0,500).forEach(function(k){kept[k]=a[k];});
      a=kept;
    }
    saveAttempts(a);
  }catch(e){}
}
function showFeedback(){
  const qIdx=st.order[pos],Q=QUESTIONS[qIdx],perm=getPerm(qIdx);
  const sel=st.answers[qIdx],isRight=sel===Q.a,letters=['A','B','C','D'];
  const correctDisp=perm.indexOf(Q.a),selDisp=perm.indexOf(sel);
  card.querySelectorAll('#opts .opt').forEach(function(b,j){
    b.disabled=true;
    if(j===correctDisp)b.classList.add('correct');
    else if(j===selDisp)b.classList.add('wrong');
    else b.classList.add('dim');
  });
  document.getElementById('verdict').innerHTML='<div class="verdict '+(isRight?'ok':'no')+'">'+(isRight?'✓ Correct!':'✗ Incorrect — the correct answer is '+letters[correctDisp]+'.')+'</div>';
  let html;
  if(Q.expl!==undefined){
    html='<h4>Explanation (correct answer: '+letters[correctDisp]+')</h4><div class="why">'+fmtExpl(Q.expl)+'</div>';
  }else{
    html='<h4>Why '+letters[correctDisp]+' is correct</h4><div class="why">'+Q.why+'</div><h4>Why the other choices are wrong</h4>';
    perm.forEach(function(orig,j){const w=Q.wrongs[orig];if(w)html+='<div class="wrongitem"><b>'+letters[j]+'.</b> '+w+'</div>';});
  }
  const exp=document.getElementById('exp');
  exp.innerHTML=html;exp.style.display='block';
}
// Show the correct answer and explanation for a question the user has not answered.
function showRevealed(){
  const qIdx=st.order[pos],Q=QUESTIONS[qIdx],perm=getPerm(qIdx);
  const letters=['A','B','C','D'],correctDisp=perm.indexOf(Q.a);
  card.querySelectorAll('#opts .opt').forEach(function(b,j){
    b.disabled=true;
    if(j===correctDisp)b.classList.add('correct'); else b.classList.add('dim');
  });
  document.getElementById('verdict').innerHTML=
    '<div class="revealnote">👁 Answer shown — <b>'+letters[correctDisp]+'</b> is correct. '+
    'This question stays unanswered and is not scored.'+
    (st.revealAll?'':' <a href="#" id="unreveal">Hide and attempt it</a>')+'</div>';
  let html;
  if(Q.expl!==undefined){
    html='<h4>Explanation (correct answer: '+letters[correctDisp]+')</h4><div class="why">'+fmtExpl(Q.expl)+'</div>';
  }else{
    html='<h4>Why '+letters[correctDisp]+' is correct</h4><div class="why">'+Q.why+'</div><h4>Why the other choices are wrong</h4>';
    perm.forEach(function(orig,j){const w=Q.wrongs[orig];if(w)html+='<div class="wrongitem"><b>'+letters[j]+'.</b> '+w+'</div>';});
  }
  const exp=document.getElementById('exp');
  exp.innerHTML=html;exp.style.display='block';
  const un=document.getElementById('unreveal');
  if(un)un.onclick=function(e){e.preventDefault();setRevealed(qIdx,false);renderSide();render();};
}

// ============================================================================
// ==== SUBMIT / RESULTS SCREEN
// ============================================================================
// ---------- submit / results ----------
function confirmSubmit(){
  side.classList.remove('open');
  const c=counts();
  const un=QUESTIONS.length-c.ans;
  card.innerHTML='<div class="end"><h2>Submit '+examName()+'?</h2>'+
    '<p style="margin:12px 0">'+(un?('You still have <b>'+un+' unanswered question'+(un>1?'s':'')+'</b>. Unanswered questions count as wrong.'):'All questions answered.')+'</p>'+
    '<button class="restart" id="doSubmit">Submit Exam</button>'+
    '<button class="restart" id="goBack" style="background:#64748b;margin-left:8px">Keep Working</button></div>';
  document.getElementById('doSubmit').onclick=function(){submitExam(false);};
  document.getElementById('goBack').onclick=function(){renderSide();render();};
}
function submitExam(auto){
  st.examDone=true;
  st.answers.forEach(function(v,i){if(v!==null)updateSrs(refOf(i),v===QUESTIONS[i].a);});
  saveState();stopTimer();
  if(auto)alert('Time is up! Your exam has been submitted automatically.');
  renderSide();showEnd();
}
function showEnd(){
  stopTimer();side.classList.remove('open');
  const c=counts();
  document.getElementById('prog').style.width=(c.ans/QUESTIONS.length*100)+'%';
  document.getElementById('counter').textContent=examName()+' — Results';
  const denom=st.mode==='exam'&&st.examDone?QUESTIONS.length:(c.ans||1);
  const pct=Math.round(c.right/denom*100);
  const units={};
  QUESTIONS.forEach(function(q,i){
    units[q.unit]=units[q.unit]||{total:0,right:0,ans:0};
    units[q.unit].total++;
    if(st.answers[i]!==null){units[q.unit].ans++;if(st.answers[i]===q.a)units[q.unit].right++;}
  });
  const unitRows=Object.entries(units).map(function(en){var u=en[0],s=en[1];return '<tr><td>'+u+'</td><td>'+s.right+'/'+s.ans+' (of '+s.total+')</td><td>'+(s.ans?Math.round(s.right/s.ans*100):0)+'%</td></tr>';}).join('');
  const missed=[];
  st.order.forEach(function(qIdx,p){if(st.answers[qIdx]!==null&&st.answers[qIdx]!==QUESTIONS[qIdx].a)missed.push({p:p,q:QUESTIONS[qIdx]});});
  const flagged=[];
  st.order.forEach(function(qIdx,p){if(st.flags[qIdx])flagged.push({p:p,q:QUESTIONS[qIdx]});});
  let extra='';
  if(st.mode==='exam'&&st.examDone&&st.examStart)extra='<p style="color:var(--muted);font-size:13.5px">Time used: '+fmtMs(Math.min(Date.now()-st.examStart,EXAM_MS))+' of 3:30:00</p>';
  const missedList=missed.length?'<h4 style="margin-top:18px">Questions you missed ('+missed.length+')</h4><ul class="missed">'+missed.map(function(m){return '<li><a href="#" data-g="'+m.p+'"><b>Q'+(m.p+1)+'</b></a> — '+m.q.topic+'</li>';}).join('')+'</ul>':(c.ans===QUESTIONS.length?'<p style="margin-top:14px">Perfect — nothing missed! 🎉</p>':'');
  const flagList=flagged.length?'<h4 style="margin-top:14px">Flagged for review (⚑ '+flagged.length+')</h4><ul class="missed">'+flagged.map(function(m){return '<li><a href="#" data-g="'+m.p+'"><b>Q'+(m.p+1)+'</b></a> — '+m.q.topic+'</li>';}).join('')+'</ul>':'';
  card.innerHTML='<div class="end"><h2>'+examName()+' — Results'+(c.ans<QUESTIONS.length&&!(st.mode==='exam'&&st.examDone)?' (in progress)':'')+'</h2>'+
    '<div class="big" style="color:'+(pct>=75?'var(--green)':'var(--red)')+'">'+pct+'%</div>'+
    '<p>You answered <b>'+c.right+' of '+c.ans+'</b> correctly'+(QUESTIONS.length-c.ans>0?' ('+(QUESTIONS.length-c.ans)+' unanswered)':'')+'. The average student score is 75%.</p>'+extra+
    '<table><tr><th>Study Unit</th><th>Correct</th><th>%</th></tr>'+unitRows+'</table>'+missedList+flagList+
    '<button class="restart" id="back">Back to Questions</button>'+
    '<button class="restart" id="menu" style="background:#64748b;margin-left:8px">Exam Menu</button></div>';
  card.querySelectorAll('[data-g]').forEach(function(a){a.onclick=function(ev){ev.preventDefault();pos=+a.dataset.g;renderSide();render();};});
  document.getElementById('back').onclick=function(){startTimerIfNeeded();renderSide();render();};
  document.getElementById('menu').onclick=showMenu;
}
// ---------- performance dashboard ----------

// ============================================================================
