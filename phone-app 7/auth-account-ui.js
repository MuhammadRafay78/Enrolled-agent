// ==== AUTH: name/pin → email/password
// ============================================================================
function nameSlug(n){
  var s=(n||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'');
  return s.slice(0,40);
}
// example.com is reserved by RFC 2606 for exactly this: a syntactically valid domain
// that can never reach a real mailbox. Supabase rejects .local as invalid.
function nameEmail(n){ return nameSlug(n)+'@example.com'; }
function pinPass(p){ return 'pin-'+String(p).trim()+'-eaprep'; }
async function joinOrSignIn(name,pin){
  var email=nameEmail(name), pw=pinPass(pin);
  try{
    await signIn(email,pw);
    var a=auth(); a.name=name.trim(); setAuth(a);
    return 'in';
  }catch(e){
    var msg=String(e.message||e).toLowerCase();
    if(!/invalid login|credentials|not found|email/.test(msg)) throw e;
  }
  // no such account yet, or the PIN was wrong
  try{
    var r=await signUp(email,pw);
    var a2=auth(); if(a2){ a2.name=name.trim(); setAuth(a2); }
    return r==='confirm'?'confirm':'new';
  }catch(e2){
    var m2=String(e2.message||e2).toLowerCase();
    if(/already|registered|exists/.test(m2)) throw new Error('That name is already used with a different PIN.');
    throw e2;
  }
}
var AUTHMODE='in';
async function signInOnly(name,pin){
  var email=nameEmail(name), pw=pinPass(pin);
  try{ await signIn(email,pw); }
  catch(e){ throw new Error('No account found with that name and PIN. If you are new, tap “Create a login”.'); }
  var a=auth(); if(a){ a.name=name.trim(); setAuth(a); }
  if(!isAdminUser()){
    var st=await checkApproval(name.trim());
    if(!st.missing && !st.approved){
      signOut();
      throw new Error(st.notFound?'This account is not registered for approval yet. Please create a login again — the request was not received.':'Your account is waiting for admin approval. You will be able to sign in once the admin approves you.');
    }
    // Demo-approved accounts start (or resume) a 15-minute session timer
    if(st.demo){
      // If a timer for this email already ran out on this device, block sign-in
      var d=demoInfo();
      if(d && d.forEmail===((auth()||{}).email||'') && d.expired){
        signOut();
        throw new Error('Your 15-minute demo has ended on this device. Ask the admin for full access.');
      }
      startDemoForCurrentUser();
    }
  }
  return 'in';
}
async function signUpOnly(name,pin){
  var email=nameEmail(name), pw=pinPass(pin);
  var r;
  try{ r=await signUp(email,pw); }
  catch(e){ var m=String(e.message||e).toLowerCase();
    if(/already|registered|exists/.test(m)) throw new Error('That name is already taken. Choose another name, or tap “Sign in” if it\'s yours.');
    throw e; }
  var a=auth(); if(a){ a.name=name.trim(); setAuth(a); }
  // Admins skip the queue.
  if(isAdminUser()) return r==='confirm'?'confirm':'new';
  // Submit for admin approval; keep them signed OUT until approved.
  await submitApprovalRequest(name.trim(), email);
  signOut();
  return 'pending';
}

// ============================================================================
// ==== ACCOUNT UI: chip, screen, admin panel
// ============================================================================
function renderAcct(){
  var b=document.getElementById('acctBtn'); if(!b)return;
  var a=auth();
  try{document.body.classList.toggle('gated', authGate());}catch(e){}
  if(!SUPA.url||!SUPA.key){ b.style.display='none'; return; }
  b.style.display='';
  b.innerHTML=a?('<span class="acctdot"></span>'+esc(a.name||(a.email||'account').split('@')[0])):'Sign in';
  b.className='acctbtn'+(a?' on':'');
}
function acctScreen(){
  markView('acct');
  side.classList.remove('active','open');document.body.classList.remove('inquiz');stopTimer();stopClock();
  setFloatBack(goBack,'← Back');
  if(authGate())setFloatBack(null);
  document.getElementById('counter').textContent='Account';
  document.getElementById('score').textContent='';
  document.getElementById('prog').style.width='0%';
  var a=auth();
  if(!SUPA.url||!SUPA.key){
    card.innerHTML='<div class="mhead"><div><div class="mtitle">Account</div>'+
      '<div class="msub">Sync is not configured in this copy of the file.</div></div></div>'+
      '<p class="xnote">Progress is being saved in this browser only. To turn on accounts, the file needs a project URL and key baked in.</p>'+
      '<div class="nav2"><button class="navbtn" id="acctBack">← Back</button><span></span></div>';
    document.getElementById('acctBack').onclick=showMenu; return;
  }
  if(a){
    var m=meta(),n=Object.keys(m).length;
    card.innerHTML='<div class="mhead"><div><div class="mtitle">Account</div>'+
      '<div class="msub">Signed in as '+esc(a.name||(a.email||'').split('@')[0])+'</div></div></div>'+
      '<div class="mstats"><div class="mstat"><div class="lbl">Status</div><div class="val" style="font-size:19px" id="acctSyncBig">'+
        (SYNCST==='ok'?'Synced':(SYNCST==='sync'?'Syncing…':(SYNCST==='offline'?'Offline':'Not synced yet')))+'</div></div>'+
      '<div class="mstat"><div class="lbl">Items tracked</div><div class="val">'+n+'</div></div>'+
      '<div class="mstat"><div class="lbl">Devices</div><div class="val" style="font-size:15px">Any, same login</div></div></div>'+
      '<p class="xnote">Your answers, flags, study time and timer are saved to your account and merged across devices. '+
      'The most recent change to each exam wins, so working on different exams on different devices is safe.</p>'+
      (function(){
        try{
          var e = window._lastSyncError;
          if(!e) return '';
          var diag = window.diagnoseSync ? window.diagnoseSync() : {};
          var top = (diag.top10||[]).slice(0,3).map(function(r){ return r.key+' ('+r.kb+' KB)'; }).join(', ');
          return '<div class="mstat" style="padding:12px 14px;margin-bottom:10px;border-color:#b91c1c;background:rgba(185,28,28,0.12)">'+
            '<div style="font-size:12px;color:#f87171;font-weight:600;margin-bottom:4px">LAST SYNC ERROR</div>'+
            '<div style="font-size:13px;color:var(--ink);margin-bottom:6px">'+esc(e.msg)+'</div>'+
            '<div style="font-size:11.5px;color:var(--muted)">Total payload: '+(diag.totalKB||'?')+' KB across '+(diag.rowCount||'?')+' keys. Largest: '+esc(top||'—')+'.</div>'+
          '</div>';
        }catch(_){ return ''; }
      })()+
      '<div class="mgrid2"><button class="mwide" id="syncNowBtn"><span class="ic">'+micon('loop')+'</span><span class="tx">'+
        '<span class="nm">Sync now</span><span class="sub">Push and pull straight away</span></span></button>'+
      '<button class="mwide" id="signOutBtn"><span class="ic">'+micon('user')+'</span><span class="tx">'+
        '<span class="nm" style="color:#f87171">Sign out</span><span class="sub">Progress stays on this device too</span></span></button></div>'+
      '<button class="mwide" id="resetMineBtn" style="margin-top:8px;border-color:#7f1d1d"><span class="ic">'+micon('loop')+'</span><span class="tx">'+
        '<span class="nm" style="color:#f87171">Reset my progress</span><span class="sub">Erase this account\'s answers &amp; timer, on the cloud and this device</span></span></button>'+
      '<div class="nav2"><button class="navbtn" id="acctBack">← Back</button><span></span></div>';
    document.getElementById('syncNowBtn').onclick=async function(){ await syncNow(); acctScreen(); };
    document.getElementById('signOutBtn').onclick=function(){ if(confirm('Sign out? Progress already on this device stays.')){signOut(); if(authGate()){acctScreen();}else{showMenu();}} };
    document.getElementById('resetMineBtn').onclick=async function(){
      if(!confirm('Erase ALL progress and study time for '+((auth()||{}).name||'this account')+'? This clears it on the cloud and every device. This cannot be undone.'))return;
      try{ if(navigator.onLine){ await apiRetry('/rest/v1/progress?k=not.is.null',{method:'DELETE',headers:{'Prefer':'return=minimal'}}); } }catch(e){}
      wipeLocalSynced();
      if(typeof SWINT!=='undefined'&&SWINT){try{clearInterval(SWINT);}catch(e){}SWINT=null;}
      try{swSave({tot:{},days:{},run:null});}catch(e){}
      PULLED=false; try{await syncNow('quiet');}catch(e){}
      renderAcct(); if(typeof swPanelRender==='function'){} showMenu();
    };
        // Admin-only: show pending approval requests with Approve/Reject buttons
    if(isAdminUser()){
      var box=document.createElement('div'); box.id='adminApprovals'; box.style.marginTop='14px';
      box.innerHTML='<div class="mgrouphd"><span>Admin</span><span>signup approvals</span></div>'+
        '<div class="mstat" style="padding:12px 14px">Loading pending signups\u2026</div>';
      card.querySelector('.nav2').before(box);
      (async function(){
        var pend=await listPendingApprovals();
        if(!pend || !pend.length){
          box.innerHTML='<div class="mgrouphd"><span>Admin</span><span>signup approvals</span></div>'+
            '<div class="mstat" style="padding:12px 14px;color:var(--muted)">No pending signups.</div>';
          return;
        }
        var html='<div class="mgrouphd"><span>Admin</span><span>'+pend.length+' pending</span></div>';
        pend.forEach(function(p){
          html+='<div class="mstat" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;margin-bottom:6px;flex-wrap:wrap">'+
                '<span><b>'+esc(p.name)+'</b><br><small style="color:var(--muted)">'+esc(p.email||'')+' \u00b7 '+new Date(p.requested_at).toLocaleString()+'</small></span>'+
                '<span style="display:flex;gap:6px;flex-wrap:wrap">'+
                '<button class="mpill" data-approve="'+esc(p.name)+'" style="background:var(--green-bg);color:var(--green);border-color:var(--green)">Approve \u00b7 Full</button>'+
                '<button class="mpill" data-demo="'+esc(p.name)+'" style="background:rgba(59,130,246,.12);color:var(--blue);border-color:var(--blue)">Approve \u00b7 Demo 15m</button>'+
                '<button class="mpill" data-reject="'+esc(p.name)+'" style="background:var(--red-bg);color:var(--red);border-color:var(--red)">Reject</button>'+
                '</span></div>';
        });
        box.innerHTML=html;
        box.querySelectorAll('[data-approve]').forEach(function(b){
          b.onclick=async function(){ b.disabled=true; var ok=await approveUser(b.dataset.approve); if(ok) acctScreen(); else { alert('Approve failed'); b.disabled=false; } };
        });
        box.querySelectorAll('[data-demo]').forEach(function(b){
          b.onclick=async function(){
            if(!confirm('Approve '+b.dataset.demo+' with a 15-minute demo cap? They will be signed out after 15 minutes and need you to upgrade them for full access.'))return;
            b.disabled=true;
            var res=await approveUserAsDemo(b.dataset.demo);
            if(res && res.ok) acctScreen();
            else if(res && res.needsMigration){
              alert('Your Supabase table is missing the "demo" column. Run this ONCE in the Supabase SQL editor, then try again:\n\nALTER TABLE approvals ADD COLUMN IF NOT EXISTS demo boolean DEFAULT false;');
              b.disabled=false;
            }
            else { alert('Demo approval failed'); b.disabled=false; }
          };
        });
        box.querySelectorAll('[data-reject]').forEach(function(b){
          b.onclick=async function(){ if(!confirm('Reject '+b.dataset.reject+'? Their account request will be removed.'))return; b.disabled=true; var ok=await rejectUser(b.dataset.reject); if(ok) acctScreen(); else { alert('Reject failed'); b.disabled=false; } };
        });
      })();
    }
    document.getElementById('acctBack').onclick=showMenu;
    return;
  }
  var _BRAND='<span class="blogo"><svg width="42" height="42" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="elg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><rect x="3" y="3" width="42" height="42" rx="12" fill="url(#elg)"/><path d="M24 11l11 4v7c0 7-4.7 11.6-11 14-6.3-2.4-11-7-11-14v-7z" fill="rgba(255,255,255,.16)" stroke="#fff" stroke-width="1.6"/><path d="M15 18l9-6 9 6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M18 19.5v6M24 19.5v6M30 19.5v6" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M14.5 27h19" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></span><span class="btext"><span class="bname">Enrolled Agent</span><span class="btag">Exam Prep — Complete Package</span></span>';
  var _HERO='<svg viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Enrolled Agent Exam Prep"><defs><linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0f172a"/></linearGradient><linearGradient id="hsh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><rect x="10" y="10" width="320" height="320" rx="28" fill="url(#hbg)"/><circle cx="170" cy="150" r="112" fill="none" stroke="rgba(96,165,250,.25)" stroke-width="1.5"/><circle cx="170" cy="150" r="150" fill="none" stroke="rgba(96,165,250,.12)" stroke-width="1.5"/><path d="M170 62l60 22v40c0 40-26 64-60 76-34-12-60-36-60-76V84z" fill="rgba(37,99,235,.18)" stroke="url(#hsh)" stroke-width="3"/><path d="M140 127l30-22 30 22" fill="none" stroke="#93c5fd" stroke-width="6" stroke-linejoin="round"/><path d="M150 131v30M170 131v30M190 131v30" stroke="#93c5fd" stroke-width="6" stroke-linecap="round"/><path d="M137 165h66" stroke="#93c5fd" stroke-width="6" stroke-linecap="round"/><text x="170" y="252" text-anchor="middle" font-family="Georgia,serif" font-size="30" font-weight="700" fill="#e2e8f0">Enrolled Agent</text><text x="170" y="284" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" letter-spacing="3" fill="#93c5fd">EXAM PREP · ALL 3 PARTS</text></svg>';
  var _m=(typeof AUTHMODE!=='undefined'?AUTHMODE:'in');
  card.innerHTML='<div class="authlayout"><div class="authleft"><div class="brandrow">'+_BRAND+'</div><div class="mhead"><div><div class="mtitle">'+(_m==='up'?'Create your login':'Sign in')+'</div>'+
    '<div class="msub">'+(_m==='up'?'Pick a name and a 4-digit PIN — this becomes your private login.':'Enter your name and 4-digit PIN.')+'</div></div></div>'+
    '<div class="authbox">'+
      '<label class="authlbl">Your name</label>'+
      '<input class="authin" id="authName" type="text" autocomplete="off" placeholder="" maxlength="40">'+
      '<label class="authlbl">4-digit PIN</label>'+
      '<input class="authin" id="authPin" type="password" inputmode="numeric" autocomplete="off" placeholder="' + '••••' + '" maxlength="4">'+
      '<div id="authMsg" class="authmsg"></div>'+
      '<button class="authgo" id="doJoin" style="width:100%;margin-top:12px">'+(_m==='up'?'Create login':'Sign in')+'</button>'+
      '<div style="margin-top:14px;text-align:center;font-size:13px;color:var(--muted)">'+
        (_m==='up'?'Already have a login? <a href="#" id="authSwap" style="color:var(--accent);font-weight:600">Sign in</a>':'New here? <a href="#" id="authSwap" style="color:var(--accent);font-weight:600">Create a login</a>')+'</div>'+
    '</div>'+
    '<p class="xnote">'+(_m==='up'?'Keep your PIN private — anyone who knows your name and PIN can open your account. Use the same name and PIN on your phone and your progress follows you.':'Use the same name and PIN on any device and your progress follows you.')+'</p></div><aside class="authhero">'+_HERO+'</aside></div>';
  var msg=document.getElementById('authMsg');
  function say(t,bad){ msg.className='authmsg'+(bad?' bad':''); msg.textContent=t; }
  async function go(){
    var n=document.getElementById('authName').value.trim();
    var p=document.getElementById('authPin').value.trim();
    if(!nameSlug(n)){ say('Enter your name.',1); return; }
    if(!/^\d{4}$/.test(p)){ say('The PIN must be exactly 4 digits.',1); return; }
    say(_m==='up'?'Creating…':'Checking…');
    try{
      var r=(_m==='up')?await signUpOnly(n,p):await signInOnly(n,p);
      if(r==='confirm'){ say('Email confirmation is still switched on in Supabase. Turn it off under Authentication → Sign In / Providers → Email, then try again.',1); return; }
      if(r==='pending'){
        say('Request submitted. The admin will approve your account. Please try signing in again after approval.',0);
        return;
      }
      say(r==='new'?'Created. Setting up your account…':'Welcome back. Syncing…');
      accountSwitch((auth()||{}).email||'');
      claimSession();
      await syncNow();
      renderAcct(); showMenu();
    }catch(ex){
      var t=String(ex.message||ex);
      if(/rate limit/i.test(t)) t='Supabase is still trying to email a confirmation. Turn off Authentication → Sign In / Providers → Email → "Confirm email", then try again.';
      say(t,1);
    }
  }
  document.getElementById('doJoin').onclick=go;
  document.getElementById('authPin').onkeydown=function(ev){ if(ev.key==='Enter')go(); };
  document.getElementById('authName').onkeydown=function(ev){ if(ev.key==='Enter')document.getElementById('authPin').focus(); };
  var _sw=document.getElementById('authSwap'); if(_sw)_sw.onclick=function(ev){ ev.preventDefault(); AUTHMODE=(_m==='up'?'in':'up'); acctScreen(); };
}


// ============================================================================
