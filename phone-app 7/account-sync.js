// ==== ACCOUNTS & CLOUD SYNC (Supabase)
// ============================================================================
// ---------- accounts + cross-device sync ----------
// Talks to Supabase's REST API with plain fetch, so the file stays self-contained.
// With no account configured, or signed out, everything below is inert and the app
// behaves exactly as it always has: progress lives in this browser only.
var SUPA={url:'https://ebztmghojfiuigkvwfvr.supabase.co',
          key:'sb_publishable_pRmvgWWZqjXLW2B667yDmA_No2AY18T'};
var AUTHK='ea3quiz_auth', METAK='ea3quiz_meta';
// ---- Demo access (per-account, 15 minutes, gated by admin approval) ----
// Requires an admin to approve the signup with the "demo" flag. The demo timer
// starts on the demo user's first sign-in on any device and runs for DEMO_MINUTES.
// Server side needs one extra column on the approvals table:
//   ALTER TABLE approvals ADD COLUMN IF NOT EXISTS demo boolean DEFAULT false;
// If the column doesn't exist yet, everyone is treated as full-access (safe default).
var DEMO_KEY='ea3quiz_demo';
var DEMO_MINUTES=15;
var DEMO_AI_LIMIT=5;   // demo users may ask up to 5 AI Tutor questions during their session
function demoAiUsed(){ try{ var d=JSON.parse(localStorage.getItem(DEMO_KEY))||{}; return +(d.aiUsed||0); }catch(e){ return 0; } }
function demoAiRemaining(){ return Math.max(0, DEMO_AI_LIMIT - demoAiUsed()); }
function bumpDemoAi(){
  try{
    var d=JSON.parse(localStorage.getItem(DEMO_KEY))||{};
    d.aiUsed=(+(d.aiUsed||0))+1;
    localStorage.setItem(DEMO_KEY, JSON.stringify(d));
  }catch(e){}
}
function demoInfo(){
  try{
    var d=JSON.parse(localStorage.getItem(DEMO_KEY)); if(!d||!d.start)return null;
    var dur=(d.duration||DEMO_MINUTES*60000);
    var remaining=Math.max(0, d.start+dur-Date.now());
    return { active: remaining>0, remaining: remaining, expired: remaining<=0, start: d.start, duration: dur, forEmail: d.forEmail||'' };
  }catch(e){ return null; }
}
function isDemoActive(){
  var d=demoInfo(); if(!d||!d.active) return false;
  // Only counts if it matches the currently signed-in email (or was set with no email)
  var a=auth(); var email=(a&&a.email)||'';
  return !d.forEmail || d.forEmail===email;
}
function isDemoExpired(){
  var d=demoInfo(); if(!d) return false;
  var a=auth(); var email=(a&&a.email)||'';
  if(d.forEmail && d.forEmail!==email) return false;
  return d.expired;
}
function startDemoForCurrentUser(){
  var a=auth(); if(!a) return;
  // Don't restart if one is already active for this user
  var d=demoInfo();
  if(d && d.forEmail===(a.email||'') && d.active) return;
  try{ localStorage.setItem(DEMO_KEY, JSON.stringify({start:Date.now(), duration:DEMO_MINUTES*60000, forEmail:a.email||''})); }catch(e){}
}
function endDemo(){
  try{ localStorage.removeItem(DEMO_KEY); }catch(e){}
}
function fmtDemoTime(ms){
  var s=Math.max(0, Math.floor(ms/1000));
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
var SYNCST='off', SYNCTIMER=null, PULLED=false;

function isSynced(k){
  if(!/^ea3quiz/.test(k)) return false;
  if(k===AUTHK||k===METAK) return false;
  // Device-local: these can grow large or are per-device by nature. Excluding them from
  // sync keeps the payload under Supabase's request-size limit. Question/flag progress
  // (mock, mcq, extra, gleim, chapter) is unaffected and still syncs.
  var DEVICE_LOCAL = {
    'ea3quiz_demo': 1,                    // demo session timer, per-device
    'ea3quiz_v2_ai_chats': 1,             // per-question chat history — can be 100s of KB
    'ea3quiz_v2_ai_resp_cache': 1,        // AI response cache — can be 100s of KB
    'ea3quiz_v2_tough_ai_cache': 1,       // Toughest-for-me ranking cache
    'ea3quiz_v2_tutorSize': 1,            // AI panel width preference
    'ea3quiz_v2_ai_migration_v1': 1,      // one-time boot marker
    'ea_theme_local': 1,                  // theme preference is already local-only by name
    'ea3quiz_sec': 1,                     // collapsed-section state (menu)
    'ea3quiz_notesec': 1                  // collapsed-section state (chapter notes)
  };
  if(DEVICE_LOCAL[k]) return false;
  return true;
}
function auth(){ try{return JSON.parse(localStorage.getItem(AUTHK))||null;}catch(e){return null;} }
function authGate(){ return !!(SUPA.url&&SUPA.key&&!auth()); }
function setAuth(a){ try{ a?localStorage.setItem(AUTHK,JSON.stringify(a)):localStorage.removeItem(AUTHK); }catch(e){} }
function meta(){ try{return JSON.parse(localStorage.getItem(METAK))||{};}catch(e){return {};} }
function stamp(k){
  if(!isSynced(k))return;
  var m=meta();
  // strictly increasing: two edits in the same millisecond must still order correctly
  m[k]=Math.max(Date.now(),(m[k]||0)+1);
  try{Storage.prototype.setItem.call(localStorage,METAK,JSON.stringify(m));}catch(e){}
}

// Record every local edit and schedule a push. Patch the prototype rather than the
// instance: localStorage is a platform object and per-instance assignment is ignored.
(function(){
  try{
    var P=Storage.prototype, oset=P.setItem, orem=P.removeItem;
    P.setItem=function(k,v){
      oset.call(this,k,v);
      try{ if(this===window.localStorage&&isSynced(k)){ stamp(k); queuePush(); } }catch(e){}
    };
    P.removeItem=function(k){
      orem.call(this,k);
      try{ if(this===window.localStorage&&isSynced(k)){ stamp(k); queuePush(); } }catch(e){}
    };
  }catch(e){}
})();

function setSync(s){ SYNCST=s; var el=document.getElementById('acctState'); if(el)el.textContent=
  s==='off'?'':(s==='sync'?'Syncing…':(s==='ok'?'Synced':(s==='offline'?'Offline':'Sync error'))); }

function supaBase(){ return SUPA.url.replace(/\/+$/,'').replace(/\/rest\/v1$/,''); }
function api(path,opts){
  opts=opts||{};
  var a=auth();
  var h=Object.assign({'apikey':SUPA.key,'Content-Type':'application/json'},opts.headers||{});
  if(a&&a.access_token)h['Authorization']='Bearer '+a.access_token;
  return fetch(supaBase()+path,Object.assign({},opts,{headers:h}));
}
async function refreshToken(){
  var a=auth(); if(!a||!a.refresh_token)return false;
  var r=await fetch(supaBase()+'/auth/v1/token?grant_type=refresh_token',
    {method:'POST',headers:{'apikey':SUPA.key,'Content-Type':'application/json'},
     body:JSON.stringify({refresh_token:a.refresh_token})});
  if(!r.ok){ return false; }
  var j=await r.json();
  setAuth({access_token:j.access_token,refresh_token:j.refresh_token,email:(j.user&&j.user.email)||a.email,exp:Date.now()+(j.expires_in||3600)*1000});
  return true;
}
async function apiRetry(path,opts){
  var r=await api(path,opts);
  if(r.status===401){ if(await refreshToken()) r=await api(path,opts); }
  return r;
}
async function signUp(email,pw){
  var r=await fetch(supaBase()+'/auth/v1/signup',
    {method:'POST',headers:{'apikey':SUPA.key,'Content-Type':'application/json'},
     body:JSON.stringify({email:email,password:pw})});
  var j=await r.json().catch(function(){return {};});
  if(!r.ok) throw new Error(j.msg||j.error_description||j.message||('Sign-up failed ('+r.status+')'));
  if(j.access_token){ setAuth({access_token:j.access_token,refresh_token:j.refresh_token,email:email,exp:Date.now()+(j.expires_in||3600)*1000}); return 'in'; }
  return 'confirm';                    // the project requires email confirmation
}
async function signIn(email,pw){
  var r=await fetch(supaBase()+'/auth/v1/token?grant_type=password',
    {method:'POST',headers:{'apikey':SUPA.key,'Content-Type':'application/json'},
     body:JSON.stringify({email:email,password:pw})});
  var j=await r.json().catch(function(){return {};});
  if(!r.ok) throw new Error(j.error_description||j.msg||j.message||'Could not sign in');
  setAuth({access_token:j.access_token,refresh_token:j.refresh_token,email:email,exp:Date.now()+(j.expires_in||3600)*1000});
  return true;
}
function signOut(){ setAuth(null); PULLED=false; setSync('off'); renderAcct(); }
// ---- Admin bypass + single-device session claim ----
var ADMINS=['rafay'];
var SESSION_KEY='ea3quiz_session_owner';
function isAdminUser(){
  try{
    var a=auth(); if(!a) return false;
    // Check the name field (old-style auth)
    if(a.name && ADMINS.indexOf(String(a.name).toLowerCase().trim())>=0) return true;
    // Check the email field (Supabase auth) — match against the email prefix before @
    if(a.email){
      var prefix=String(a.email).toLowerCase().split('@')[0].trim();
      if(ADMINS.indexOf(prefix)>=0) return true;
      // Also try the full email against ADMINS (in case someone adds a full email)
      if(ADMINS.indexOf(String(a.email).toLowerCase().trim())>=0) return true;
    }
    return false;
  }catch(e){ return false; }
}
function claimSession(){
  if(!auth() || !SUPA.url || !SUPA.key) return;
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify({dev:ea_dev_id(), at:Date.now(), name:(auth()||{}).name||''})); }catch(e){}
}
function checkSessionOwner(){
  // Multi-device / multi-tab is allowed for everyone.
  // Previously restricted non-admins to one device at a time; now unrestricted.
  return true;
}
// ---- Signup approval workflow (admin gates new users) ----
async function submitApprovalRequest(name, email){
  if(!SUPA.url||!SUPA.key) return {ok:true, missing:true};
  try{
    var r=await apiRetry('/rest/v1/approvals',{method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify([{name:String(name||'').trim(), email:email||'', approved:false}])});
    if(r.status===404 || r.status===401) return {ok:true, missing:true};   // table not set up yet
    return {ok:r.ok, status:r.status};
  }catch(e){ return {ok:false, err:String(e.message||e)}; }
}
async function checkApproval(name){
  if(!SUPA.url||!SUPA.key) return {approved:true, missing:true};
  try{
    // Ask for the demo flag too — if the column doesn't exist yet the row still comes back and demo is undefined (treated as false)
    var q='/rest/v1/approvals?name=eq.'+encodeURIComponent(String(name||'').trim())+'&select=name,approved,demo';
    var r=await apiRetry(q,{method:'GET'});
    if(r.status===404 || r.status===401) return {approved:true, missing:true};   // graceful fallback
    if(!r.ok){
      // Retry without the demo column in case the schema hasn't been migrated
      try{
        var q2='/rest/v1/approvals?name=eq.'+encodeURIComponent(String(name||'').trim())+'&select=name,approved';
        var r2=await apiRetry(q2,{method:'GET'});
        if(!r2.ok) return {approved:true, missing:true};
        var rows2=await r2.json();
        if(!rows2||!rows2.length) return {approved:false, notFound:true};
        return {approved: !!rows2[0].approved, demo:false};
      }catch(e2){ return {approved:true, missing:true}; }
    }
    var rows=await r.json();
    if(!rows || !rows.length) return {approved:false, notFound:true};
    return {approved: !!rows[0].approved, demo: !!rows[0].demo};
  }catch(e){ return {approved:true, err:String(e.message||e)}; }
}
async function listApprovedUsers(){
  if(!SUPA.url||!SUPA.key) return {rows:[]};
  try{
    var r=await apiRetry('/rest/v1/approvals?approved=eq.true&select=name,email,approved_at&order=approved_at.desc',{method:'GET'});
    if(r.status===404) return {rows:[], missing:true};
    if(!r.ok) return {rows:[], err:'HTTP '+r.status};
    return {rows:await r.json()};
  }catch(e){ return {rows:[], err:String(e.message||e)}; }
}
async function listPendingApprovals(){
  if(!SUPA.url||!SUPA.key) return {rows:[]};
  try{
    var r=await apiRetry('/rest/v1/approvals?approved=eq.false&select=name,email,requested_at&order=requested_at.asc',{method:'GET'});
    if(r.status===404) return {rows:[], missing:true};
    if(!r.ok) return {rows:[], err:'HTTP '+r.status};
    return {rows:await r.json()};
  }catch(e){ return {rows:[], err:String(e.message||e)}; }
}
async function approveUser(name){
  // Standard "full-access" approval
  var q='/rest/v1/approvals?name=eq.'+encodeURIComponent(String(name||'').trim());
  var body={approved:true, approved_at:new Date().toISOString(), demo:false};
  var r=await apiRetry(q,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify(body)});
  if(!r.ok){
    // If demo column doesn't exist, retry without it
    try{
      var r2=await apiRetry(q,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({approved:true, approved_at:new Date().toISOString()})});
      return r2.ok;
    }catch(e){ return false; }
  }
  return r.ok;
}
// Approve with a 15-minute demo cap on the user's account
async function approveUserAsDemo(name){
  var q='/rest/v1/approvals?name=eq.'+encodeURIComponent(String(name||'').trim());
  var body={approved:true, approved_at:new Date().toISOString(), demo:true};
  var r=await apiRetry(q,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify(body)});
  if(!r.ok){
    // Column doesn't exist — tell caller so admin knows to run the SQL
    return {ok:false, needsMigration:true};
  }
  return {ok:true};
}
async function rejectUser(name){
  var q='/rest/v1/approvals?name=eq.'+encodeURIComponent(String(name||'').trim());
  var r=await apiRetry(q,{method:'DELETE',headers:{'Prefer':'return=minimal'}});
  return r.ok;
}
function renderAdminPanel(){
  if(!isAdminUser()) return;
  setTimeout(function(){
    try{
      if(!card || card.querySelector('#adminUsers')) return;
      var box=document.createElement('div');
      box.id='adminUsers'; box.style.margin='0 0 18px';
      box.innerHTML='<div class="mgrouphd"><span>Admin</span><span>user management</span></div>'+
        '<div class="mstat" style="padding:12px 14px;color:var(--muted)">Loading users\u2026</div>';
      card.insertAdjacentElement('afterbegin', box);
      (async function(){
        var pendResp=await listPendingApprovals();
        var apprResp=await listApprovedUsers();
        var pend=(pendResp && pendResp.rows) || [];
        var appr=((apprResp && apprResp.rows) || []).filter(function(u){ return ADMINS.indexOf(String(u.name||'').toLowerCase().trim())<0; });
        var missing=(pendResp && pendResp.missing) || (apprResp && apprResp.missing);
        var err=(pendResp && pendResp.err) || (apprResp && apprResp.err);
        // Restore expanded state (persists per session)
        var expanded = sessionStorage.getItem('adminPanelOpen')==='1';
        var pendCount=pend.length, apprCount=appr.length;
        var summary='Admin \u00b7 '+apprCount+' active'+(pendCount?' \u00b7 <b style="color:var(--orange,#b45309)">'+pendCount+' pending</b>':'');
        var html='<div id="adminHeaderBar" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--card);cursor:pointer;user-select:none;font-size:13px;">'+
          '<span style="color:var(--muted)">'+summary+'</span>'+
          '<span id="adminChev" style="color:var(--muted);font-size:12px">'+(expanded?'\u25b2 collapse':'\u25bc expand')+'</span>'+
          '</div>';
        html+='<div id="adminBody" style="display:'+(expanded?'block':'none')+';margin-top:10px">';
        if(missing){ html+='<div class="mstat" style="padding:12px 14px;color:var(--muted)">Approvals table not set up in Supabase yet. Run the setup SQL in the Supabase SQL Editor to enable admin approvals.</div>'; }
        else if(err){ html+='<div class="mstat" style="padding:12px 14px;color:var(--red)">Error loading users: '+esc(err)+'</div>'; }
        if(pend.length){
          html+='<div style="font-size:12px;color:var(--muted);margin:4px 0 4px">PENDING</div>';
          pend.forEach(function(p){
            html+='<div class="mstat" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;margin-bottom:6px;flex-wrap:wrap">'+
              '<span><b>'+esc(p.name)+'</b> <span style="color:var(--muted);font-size:12px">requested '+new Date(p.requested_at).toLocaleDateString()+'</span></span>'+
              '<span style="display:flex;gap:6px;flex-wrap:wrap">'+
              '<button class="mpill" data-au-approve="'+esc(p.name)+'" style="background:var(--green-bg);color:var(--green);border-color:var(--green)">Approve · Full</button>'+
              '<button class="mpill" data-au-demo="'+esc(p.name)+'" style="background:rgba(59,130,246,.12);color:var(--blue);border-color:var(--blue)">Approve · Demo 15m</button>'+
              '<button class="mpill" data-au-reject="'+esc(p.name)+'" style="background:var(--red-bg);color:var(--red);border-color:var(--red)">Reject</button>'+
              '</span></div>';
          });
        }
        html+='<div style="font-size:12px;color:var(--muted);margin:12px 0 4px">ACTIVE (besides you)</div>';
        if(!appr.length){
          html+='<div class="mstat" style="padding:12px 14px;color:var(--muted)">No other approved users yet.</div>';
        } else {
          appr.forEach(function(u){
            html+='<div class="mstat" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;margin-bottom:6px">'+
              '<span><b>'+esc(u.name)+'</b> <span style="color:var(--muted);font-size:12px">approved '+(u.approved_at?new Date(u.approved_at).toLocaleDateString():'')+'</span></span>'+
              '<button class="mpill" data-au-revoke="'+esc(u.name)+'" style="background:var(--red-bg);color:var(--red);border-color:var(--red)">Revoke</button>'+
              '</div>';
          });
        }
        html+='</div>';
        box.innerHTML=html;
        // Toggle expand/collapse
        var hdr=document.getElementById('adminHeaderBar');
        var body=document.getElementById('adminBody');
        var chev=document.getElementById('adminChev');
        if(hdr) hdr.onclick=function(){
          var isOpen = body.style.display!=='none';
          body.style.display = isOpen?'none':'block';
          chev.textContent = isOpen?'\u25bc expand':'\u25b2 collapse';
          sessionStorage.setItem('adminPanelOpen', isOpen?'0':'1');
        };
        box.querySelectorAll('[data-au-approve]').forEach(function(b){
          b.onclick=async function(e){ e.stopPropagation(); b.disabled=true; var ok=await approveUser(b.dataset.auApprove); if(ok){box.remove(); (typeof showParts==='function'?showParts:showMenu)();} else { alert('Approve failed'); b.disabled=false; } };
        });
        box.querySelectorAll('[data-au-demo]').forEach(function(b){
          b.onclick=async function(e){
            e.stopPropagation();
            if(!confirm('Approve '+b.dataset.auDemo+' with a 15-minute demo cap? They will be signed out after 15 minutes and need you to upgrade them for full access.'))return;
            b.disabled=true;
            var res=await approveUserAsDemo(b.dataset.auDemo);
            if(res && res.ok){ box.remove(); (typeof showParts==='function'?showParts:showMenu)(); }
            else if(res && res.needsMigration){
              alert('Your Supabase table is missing the "demo" column. Run this ONCE in the Supabase SQL editor, then try again:\n\nALTER TABLE approvals ADD COLUMN IF NOT EXISTS demo boolean DEFAULT false;');
              b.disabled=false;
            }
            else { alert('Demo approval failed'); b.disabled=false; }
          };
        });
        box.querySelectorAll('[data-au-reject]').forEach(function(b){
          b.onclick=async function(e){ e.stopPropagation(); if(!confirm('Reject '+b.dataset.auReject+'?'))return; b.disabled=true; var ok=await rejectUser(b.dataset.auReject); if(ok){box.remove(); (typeof showParts==='function'?showParts:showMenu)();} else { alert('Reject failed'); b.disabled=false; } };
        });
        box.querySelectorAll('[data-au-revoke]').forEach(function(b){
          b.onclick=async function(e){ e.stopPropagation(); if(!confirm('Revoke access for '+b.dataset.auRevoke+'? They will be signed out.'))return; b.disabled=true; var ok=await rejectUser(b.dataset.auRevoke); if(ok){box.remove(); (typeof showParts==='function'?showParts:showMenu)();} else { alert('Revoke failed'); b.disabled=false; } };
        });
      })();
    }catch(e){}
  },0);
}
function kickIfNotOwner(){
  if(!auth() || isAdminUser()) return;
  if(checkSessionOwner()) return;
  try{ localStorage.setItem('ea_kicked','1'); }catch(e){}
  signOut();
  if(typeof acctScreen==='function') acctScreen();
}
var OWNERK='ea_local_owner';   // NOT synced (no ea3quiz prefix): tracks whose data is on this device
function wipeLocalSynced(){
  var kill=[];
  for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(isSynced(k))kill.push(k); }
  kill.forEach(function(k){ try{localStorage.removeItem(k);}catch(e){} });
  try{localStorage.removeItem(METAK);}catch(e){}
  if(typeof SWINT!=='undefined'&&SWINT){ try{clearInterval(SWINT);}catch(e){} SWINT=null; }
  PULLED=false;
}
function accountSwitch(email){
  email=email||'';
  var cur=null; try{cur=localStorage.getItem(OWNERK);}catch(e){}
  if(cur&&cur!==email){ wipeLocalSynced(); }   // a different person is signing in on this device
  try{localStorage.setItem(OWNERK,email);}catch(e){}
}


// ============================================================================
// ==== SYNC CORE: bundle, push, pull, live poll
// ============================================================================
function localBundle(){
  var m=meta(), out={};
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);
    if(!isSynced(k))continue;
    out[k]={v:localStorage.getItem(k),t:m[k]||0};
  }
  return out;
}
// Merge rule: for each key the newer timestamp wins. Progress is per-exam, so two
// devices working on different exams both keep their work.
//
// Two keys break that assumption: ea3quiz_v2_daily (the streak log) and
// ea3quiz_time (the automatic study-time tracker) are single shared blobs
// that every device increments locally as you use the app — the app never
// re-reads the server's copy before adding to them mid-session. If device A
// answers questions today and syncs, then device B (still holding its own
// older local copy of the same blob) ticks even one more second of study
// time or answers one more question, B's write timestamp becomes the newer
// one and — under plain "newest wins" — B's whole blob replaces A's on the
// server, silently erasing A's day. Counters can only go up, never down, so
// instead of picking a winner these two are merged per-day (per-key within
// the day) by taking the max on each side — the result is always at least
// as complete as either device's own local data, on both sides afterward.
// ea3quiz_v2_summary_daily, ea3quiz_v2_summary_reviewed, and
// ea3quiz_v2_summary_cycles (the chapter-notes review streak + full-part
// revision counter) have the same cross-device problem as the two above, so
// they get the same union-based treatment rather than newest-wins.
var MERGE_MAX_KEYS={ 'ea3quiz_v2_daily':1, 'ea3quiz_time':1, 'ea3quiz_v2_summary_daily':1, 'ea3quiz_v2_summary_reviewed':1, 'ea3quiz_v2_summary_cycles':1 };
function _mergeCounterDict(a,b){
  var out={};
  Object.keys(a||{}).forEach(function(k){out[k]=a[k];});
  Object.keys(b||{}).forEach(function(k){out[k]=Math.max(out[k]||0,b[k]||0);});
  return out;
}
// {part: {unit:1,...}} — union the reviewed-chapter sets under each part
// rather than taking either side wholesale, so a chapter reviewed only on
// device A isn't lost when device B's write timestamp happens to be newer.
function _mergeNestedSet(a,b){
  var out={};
  Object.keys(a||{}).forEach(function(pk){out[pk]=Object.assign({},a[pk]);});
  Object.keys(b||{}).forEach(function(pk){out[pk]=Object.assign({},out[pk]||{},b[pk]);});
  return out;
}
// {day: {total,seen:{"part_unit":1,...}}} — union each day's seen-set (not
// max the totals) so two devices reviewing different chapters on the same
// day both get counted, then total is recomputed from the merged set.
function _mergeSummaryDaily(aStr,bStr){
  var a={},b={};
  try{a=JSON.parse(aStr)||{};}catch(e){}
  try{b=JSON.parse(bStr)||{};}catch(e){}
  var days={};
  Object.keys(a).forEach(function(k){days[k]=1;});
  Object.keys(b).forEach(function(k){days[k]=1;});
  var out={};
  Object.keys(days).forEach(function(k){
    var seen=Object.assign({},(a[k]||{}).seen,(b[k]||{}).seen);
    out[k]={total:Object.keys(seen).length,seen:seen};
  });
  return JSON.stringify(out);
}
function _mergeSyncedValue(key,aStr,bStr){
  if(key==='ea3quiz_v2_daily'){
    var a={},b={};
    try{a=JSON.parse(aStr)||{};}catch(e){}
    try{b=JSON.parse(bStr)||{};}catch(e){}
    return JSON.stringify(_mergeCounterDict(a,b));
  }
  if(key==='ea3quiz_v2_summary_daily') return _mergeSummaryDaily(aStr,bStr);
  if(key==='ea3quiz_v2_summary_reviewed'){
    var a2={},b2={};
    try{a2=JSON.parse(aStr)||{};}catch(e){}
    try{b2=JSON.parse(bStr)||{};}catch(e){}
    return JSON.stringify(_mergeNestedSet(a2,b2));
  }
  // {part: {count,current:{unit:1,...}}} — count can only go up (max). The
  // in-progress lap's touched-chapter set is unioned ONLY when both sides
  // are genuinely mid-way through the SAME lap (equal count) — safe to
  // combine partial progress from two devices there. When counts differ,
  // the higher-count side just completed (and reset) a lap the other side's
  // "current" still predates — unioning that stale, nearly-full set back in
  // would resurrect it into what should be a fresh lap, undoing the reset.
  // Take the higher-count side's current as-is instead.
  if(key==='ea3quiz_v2_summary_cycles'){
    var a3={},b3={};
    try{a3=JSON.parse(aStr)||{};}catch(e){}
    try{b3=JSON.parse(bStr)||{};}catch(e){}
    var parts={};
    Object.keys(a3).forEach(function(pk){parts[pk]=1;});
    Object.keys(b3).forEach(function(pk){parts[pk]=1;});
    var outCycles={};
    Object.keys(parts).forEach(function(pk){
      var pa=a3[pk]||{count:0,current:{}}, pb=b3[pk]||{count:0,current:{}};
      var ca=pa.count||0, cb=pb.count||0;
      var mergedCurrent;
      if(ca===cb) mergedCurrent=Object.assign({},pa.current,pb.current);
      else mergedCurrent=Object.assign({},(ca>cb?pa.current:pb.current));
      outCycles[pk]={count:Math.max(ca,cb),current:mergedCurrent};
    });
    return JSON.stringify(outCycles);
  }
  // ea3quiz_time: {parts,units,topics,days} are flat day/id -> count dicts,
  // merged the same way; sets is keyed by exam/chapter with a {s:seconds,label} shape.
  var empty={parts:{},sets:{},units:{},topics:{},days:{}};
  var a=empty,b=empty;
  try{a=Object.assign({},empty,JSON.parse(aStr));}catch(e){}
  try{b=Object.assign({},empty,JSON.parse(bStr));}catch(e){}
  var out={parts:_mergeCounterDict(a.parts,b.parts),units:_mergeCounterDict(a.units,b.units),
    topics:_mergeCounterDict(a.topics,b.topics),days:_mergeCounterDict(a.days,b.days),sets:{}};
  var setKeys={};
  Object.keys(a.sets||{}).forEach(function(k){setKeys[k]=1;});
  Object.keys(b.sets||{}).forEach(function(k){setKeys[k]=1;});
  Object.keys(setKeys).forEach(function(k){
    var av=(a.sets&&a.sets[k])||{s:0}, bv=(b.sets&&b.sets[k])||{s:0};
    out.sets[k]={s:Math.max(av.s||0,bv.s||0), label:av.label||bv.label};
  });
  return JSON.stringify(out);
}
async function syncNow(force){
  if(!SUPA.url||!SUPA.key||!auth())return;
  var _quiet=(force==='quiet');
  if(!navigator.onLine){ if(!_quiet) setSync('offline'); return; }
  if(!_quiet) setSync('sync');
  try{
    var r=await apiRetry('/rest/v1/progress?select=k,v,t',{method:'GET'});
    if(!r.ok) throw new Error('read failed ('+r.status+')');
    var rows=await r.json();
    var remote={}; rows.forEach(function(x){remote[x.k]={v:x.v,t:Number(x.t)||0};});
    var local=localBundle(), m=meta(), push=[];
    var keys={};
    Object.keys(local).forEach(function(k){keys[k]=1;});
    Object.keys(remote).forEach(function(k){keys[k]=1;});
    var changed=false;
    Object.keys(keys).forEach(function(k){
      var L=local[k], R=remote[k];
      if(MERGE_MAX_KEYS[k]&&L&&R&&L.v!==R.v){
        var merged=_mergeSyncedValue(k,L.v,R.v);
        var t=Math.max(L.t,R.t)+1;
        try{ Storage.prototype.setItem.call(localStorage,k,merged); }catch(e){}
        m[k]=t; changed=true;
        push.push({k:k,v:merged,t:t});
        return;
      }
      if(L&&(!R||L.t>R.t)) push.push({k:k,v:L.v,t:L.t});
      else if(R&&(!L||R.t>L.t)){
        try{ localStorage.setItem(k,R.v); }catch(e){}
        m[k]=R.t; changed=true;
      }
    });
    try{localStorage.setItem(METAK,JSON.stringify(m));}catch(e){}
    if(push.length){
      var pushBody=push.map(function(x){return {k:x.k,v:x.v,t:x.t};});
      var pr=await apiRetry('/rest/v1/progress',{method:'POST',
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(pushBody)});
      // If the batched push fails (usually payload too big), fall back to per-key pushes
      // so ONE bad row doesn't kill the whole sync. Skip rows > 500KB entirely — they
      // won't ever succeed and are usually stale cache values that snuck through.
      if(!pr.ok){
        var anyOk=false, skipped=[];
        for(var _i=0;_i<pushBody.length;_i++){
          var _row=pushBody[_i];
          if((_row.v||'').length > 500000){ skipped.push(_row.k); continue; }
          try{
            var _prOne=await apiRetry('/rest/v1/progress',{method:'POST',
              headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
              body:JSON.stringify([_row])});
            if(_prOne.ok) anyOk=true;
          }catch(e){}
        }
        if(skipped.length){ try{console.warn('Sync skipped oversized keys:',skipped);}catch(_){ } }
        if(!anyOk && push.length) throw new Error('write failed ('+pr.status+')');
      }
    }
    PULLED=true; if(!_quiet) setSync('ok');
    try{ kickIfNotOwner(); }catch(e){}
    if(changed){
      // If the pulled state includes old-Domain-shape extras from another device
      // still running the older file, translate them into the new Chapter shape here.
      try{ if(typeof __migrateExtraStateV1==='function') __migrateExtraStateV1(); }catch(e){}
      // Refresh visible surfaces WITHOUT jumping to the other device's view/position.
      // Each device keeps its own current question; sidebar/timer refresh in place.
      try{ if(typeof renderAcct==='function') renderAcct(); }catch(e){}
      try{ if(typeof swRender==='function') swRender(); }catch(e){}
      try{ var _p=document.getElementById('swPanel'); if(_p && _p.classList.contains('open') && typeof swPanelRender==='function') swPanelRender(); }catch(e){}
      try{
        // Only re-render for a background sync when the visible screen is the
        // home menu — its progress counts are what "changed" refers to. Any other
        // screen (chapter notes, cheat sheets, dashboard, etc.) gets a destructive
        // full re-render from this, which resets scroll position out from under a
        // reader every ~20s (the live-sync poll interval) even mid-scroll.
        var _onHome = !CURVIEW || CURVIEW.kind==='menu' || CURVIEW.kind==='parts';
        if((typeof exam==='undefined' || exam===-1) && _onHome){
          if(typeof restoreView==='function') restoreView();
        }else if(Array.isArray(QUESTIONS)){
          // In a quiz: reload answers/flags from the freshly-pulled localStorage
          // but PRESERVE this device's current position.
          var _load=null;
          if(exam===-4 && typeof MCH!=='undefined' && typeof mcqState==='function') _load=function(){return mcqState(MCH);};
          else if(exam===-5 && typeof XCH!=='undefined' && typeof xState==='function') _load=function(){return xState(XCH);};
          else if(exam>=0 && typeof loadState==='function') _load=function(){return loadState(exam);};
          if(_load){
            var _fresh=_load();
            if(_fresh && st && typeof st==='object'){
              if(Array.isArray(_fresh.answers)) st.answers=_fresh.answers;
              if(Array.isArray(_fresh.flags)) st.flags=_fresh.flags;
              if(typeof renderSide==='function') renderSide();
            }
          }
        }
      }catch(e){}
    }
  }catch(e){
    setSync('err');
    // Store the last error so we can show it in the UI + console for diagnosis
    try{
      window._lastSyncError = { msg: String(e && e.message || e), at: new Date().toISOString(), stack: (e && e.stack || '').slice(0, 500) };
      console.error('[EA sync error]', window._lastSyncError);
    }catch(_){}
  }
}
// Diagnostic: return a summary of everything that WOULD sync + total size,
// plus the last sync error. Call from console: window.diagnoseSync()
window.diagnoseSync = function(){
  try{
    var bundle = localBundle();
    var totalBytes = 0, rows = [];
    Object.keys(bundle).forEach(function(k){
      var v = bundle[k].v || '';
      rows.push({ key: k, bytes: v.length, kb: (v.length/1024).toFixed(1) });
      totalBytes += v.length;
    });
    rows.sort(function(a,b){ return b.bytes - a.bytes; });
    return {
      totalBytes: totalBytes,
      totalKB: (totalBytes/1024).toFixed(1),
      rowCount: rows.length,
      top10: rows.slice(0, 10),
      lastError: window._lastSyncError || null,
      auth: (auth() && { name: auth().name, email: auth().email, tokenLen: (auth().access_token||'').length }) || null,
      online: navigator.onLine,
      supaConfigured: !!(SUPA.url && SUPA.key)
    };
  }catch(e){ return { err: String(e) }; }
};
function queuePush(){
  if(!SUPA.url||!auth())return;
  // Leading-edge debounce: schedule the FIRST subsequent push exactly 2.5s from now
  // and don't reset it. Continuous writes (timer tick, once/sec) then flush every 2.5s
  // instead of never flushing while writes are ongoing.
  if(SYNCTIMER)return;
  SYNCTIMER=setTimeout(function(){SYNCTIMER=null; syncNow('quiet');},2500);
}
window.addEventListener('online',function(){ if(auth())syncNow('quiet'); });
// live-sync: poll every 20s while signed in and in a visible tab; instant sync on focus/visibility.
var LIVEPOLL=null;
function livePoll(){
  if(LIVEPOLL){try{clearInterval(LIVEPOLL);}catch(e){}}
  LIVEPOLL=setInterval(function(){
    if(!auth())return;
    if(document.visibilityState==='hidden')return;
    if(!navigator.onLine)return;
    syncNow('quiet');
  },20000);
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible' && auth() && navigator.onLine) syncNow('quiet');
});
window.addEventListener('focus',function(){ if(auth() && navigator.onLine) syncNow('quiet'); });
livePoll();

// Self-service reset for one Part's chapter-notes "revision" tracking (the
// current-lap set + "Full revisions" count shown on the Notes-review card).
// Does NOT touch the permanent, cumulative "X of Y chapters ever reviewed"
// record — only the lap-progress counters, in case they're ever wrong for
// any reason (a bug, a cross-device merge oddity, or just wanting to
// restart the count). Pushes straight to the server, bypassing the normal
// max-merge that MERGE_MAX_KEYS applies to this key — that merge exists so
// counters never drop on their own across devices, which is exactly what a
// deliberate reset needs to override. Returns {ok:true} on success or
// {ok:false, msg} if not signed in.
async function resetCyclesForPart(part, totalChapters){
  if(!auth())return {ok:false, msg:'Not signed in.'};
  function apply(){
    var cycles=JSON.parse(localStorage.getItem('ea3quiz_v2_summary_cycles')||'{}');
    cycles[part]={count:0,current:{}};
    localStorage.setItem('ea3quiz_v2_summary_cycles',JSON.stringify(cycles));
  }
  async function pushOnce(){
    var m=JSON.parse(localStorage.getItem('ea3quiz_meta')||'{}');
    var v=localStorage.getItem('ea3quiz_v2_summary_cycles');
    var t=m['ea3quiz_v2_summary_cycles']||Date.now();
    return apiRetry('/rest/v1/progress',{method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify([{k:'ea3quiz_v2_summary_cycles',v:v,t:t}])});
  }
  apply();
  await pushOnce();
  // Re-apply and push again after a short delay, to win any race against a
  // queued/in-flight background sync that might still be holding the old value.
  await new Promise(function(res){setTimeout(res,1200);});
  apply();
  await pushOnce();
  return {ok:true};
}


// A name plus a 4-digit PIN is mapped to a hidden account. Supabase needs an email and
// password, so the name becomes a local-only address and the PIN becomes the password.
// Security rests on the PIN; the suffix below is not a secret.

// ============================================================================
