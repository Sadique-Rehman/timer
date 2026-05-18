const RANK_IMAGES = [
  './rank_png/Bronze_1_Rank.png',   './rank_png/Bronze_3_Rank.png',
  './rank_png/Silver_1_Rank.png',   './rank_png/Silver_3_Rank.png',
  './rank_png/Gold_1_Rank.png',     './rank_png/Gold_3_Rank.png',
  './rank_png/Platinum_1_Rank.png', './rank_png/Platinum_3_Rank.png',
  './rank_png/Diamond_1_Rank.png',  './rank_png/Diamond_3_Rank.png',
  './rank_png/Ascendant_1_Rank.png','./rank_png/Ascendant_3_Rank.png',
  './rank_png/Immortal_1_Rank.png', './rank_png/Immortal_3_Rank.png',
  './rank_png/Radiant_Rank.png',
];

const RANKS = [
  { name: 'Wanderer I',      pts: 0   }, { name: 'Wanderer II',     pts: 5   },
  { name: 'Seeker I',        pts: 10  }, { name: 'Seeker II',       pts: 15  },
  { name: 'Shadow I',        pts: 20  }, { name: 'Shadow II',       pts: 30  },
  { name: 'Phantom I',       pts: 40  }, { name: 'Phantom II',      pts: 55  },
  { name: 'Reaper I',        pts: 70  }, { name: 'Reaper II',       pts: 90  },
  { name: 'Abyss Walker I',  pts: 110 }, { name: 'Abyss Walker II', pts: 140 },
  { name: 'Eternal I',       pts: 170 }, { name: 'Eternal II',      pts: 210 },
  { name: 'THE ETERNAL ONE', pts: 250 },
];

function getRank(pts) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) { if (pts >= RANKS[i].pts) idx = i; else break; }
  return RANKS[idx].name;
}
function getRankIndex(pts) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) { if (pts >= RANKS[i].pts) idx = i; else break; }
  return idx;
}
function getRankProgress(pts) {
  const idx = getRankIndex(pts), cur = RANKS[idx], next = RANKS[idx+1];
  if (!next) return { pct: 100, label: 'MAX', nextName: null };
  const pct = ((pts - cur.pts) / (next.pts - cur.pts)) * 100;
  return { pct: Math.min(100, Math.max(0, pct)), label: `${(pts-cur.pts).toFixed(1)} / ${next.pts-cur.pts} pts`, nextName: next.name };
}

let totalStudiedMs = 0, sessionMs = 0, startTime = 0;
let running = false, rafId = null, worker = null;
let highscore = 0, brokeDuring = false, prevRankIdx = 0;
let currentUsername = null, syncTimeout = null, currentUid = null, firestoreReady = false;

function pad(n) { return String(Math.floor(n)).padStart(2,'0'); }
function formatTime(ms) { const s=Math.floor(ms/1000); return pad(Math.floor(s/3600))+':'+pad(Math.floor((s%3600)/60))+':'+pad(s%60); }
function msToPoints(ms) { return ms/3600000; }

const hsBox=document.getElementById('hsBox'), hsTimeEl=document.getElementById('hsTime');
function renderHS() {
  if (highscore===0) { hsTimeEl.textContent='--:--:--'; hsTimeEl.className='hs-time empty'; return; }
  hsTimeEl.textContent=formatTime(highscore); hsTimeEl.className='hs-time';
}
function checkHS(ms) {
  if (ms>highscore) {
    highscore=ms; hsTimeEl.textContent=formatTime(highscore); hsTimeEl.className='hs-time';
    if (!brokeDuring) { brokeDuring=true; hsBox.classList.remove('new'); void hsBox.offsetWidth; hsBox.classList.add('new'); setTimeout(()=>hsBox.classList.remove('new'),600); }
  }
}

const rankBtnName=document.getElementById('rankBtnName'), heroName=document.getElementById('heroName');
const heroImg=document.getElementById('heroImg'), heroPts=document.getElementById('heroPts'), heroHrs=document.getElementById('heroHrs');
const heroUsername=document.getElementById('heroUsername'), progressNext=document.getElementById('progressNext');
const progressPct=document.getElementById('progressPct'), progressFill=document.getElementById('progressFill');
const progressLabel=document.getElementById('progressLabel'), rankList=document.getElementById('rankList');
const rankupToast=document.getElementById('rankupToast');
let toastTimer=null;

function showRankUp(name) {
  rankupToast.textContent=`rank up → ${name}`; rankupToast.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>rankupToast.classList.remove('show'),3200);
}

function updateRankUI(pts) {
  const idx=getRankIndex(pts), rank=RANKS[idx], prog=getRankProgress(pts), isEternal=idx===RANKS.length-1;
  rankBtnName.textContent=rank.name; heroName.textContent=rank.name;
  heroImg.src=RANK_IMAGES[idx]||''; heroImg.alt=rank.name;
  heroPts.textContent=pts.toFixed(2); heroHrs.textContent=pts.toFixed(1)+'h';
  heroUsername.textContent=currentUsername||'—';
  progressNext.textContent=prog.nextName?'next → '+prog.nextName:'max rank achieved';
  progressLabel.textContent=prog.nextName?prog.label:'—';
  progressPct.textContent=prog.pct.toFixed(1)+'%'; progressFill.style.width=prog.pct+'%';
  progressFill.classList.toggle('eternal',isEternal); progressPct.classList.toggle('eternal',isEternal);
  buildRankList(idx);
  if (idx>prevRankIdx) { showRankUp(rank.name); prevRankIdx=idx; }
}

function buildRankList(currentIdx) {
  rankList.innerHTML='';
  RANKS.forEach((r,i)=>{
    const isCurrent=i===currentIdx, isUnlocked=i<currentIdx, isLocked=i>currentIdx, isEternal=i===RANKS.length-1;
    const item=document.createElement('div');
    item.className='rank-item'+(isCurrent?' current':'')+(isEternal?' eternal':'');
    const imgWrap=document.createElement('div');
    imgWrap.className='rank-item-img'+(isLocked?' locked':'');
    const img=document.createElement('img'); img.src=RANK_IMAGES[i]||''; img.alt=r.name;
    imgWrap.appendChild(img);
    const info=document.createElement('div'); info.className='rank-item-info';
    const name=document.createElement('div'); name.className='rank-item-name'+(isLocked?' locked':''); name.textContent=r.name;
    const ptsEl=document.createElement('div'); ptsEl.className='rank-item-pts';
    ptsEl.textContent=r.pts+' pts'+(RANKS[i+1]?' → '+RANKS[i+1].pts:'+');
    info.appendChild(name); info.appendChild(ptsEl);
    const status=document.createElement('div');
    status.className='rank-item-status '+(isCurrent?'current':isUnlocked?'unlocked':'locked');
    if (isCurrent) { const b=document.createElement('span'); b.className='current-badge'; b.textContent='current'; status.appendChild(b); }
    else status.textContent=isUnlocked?'done':'locked';
    item.appendChild(imgWrap); item.appendChild(info); item.appendChild(status);
    rankList.appendChild(item);
    if (isCurrent) setTimeout(()=>item.scrollIntoView({block:'nearest',behavior:'smooth'}),100);
  });
}

const modalOverlay=document.getElementById('modalOverlay');
document.getElementById('rankBtn').addEventListener('click',()=>{ updateRankUI(msToPoints(totalStudiedMs)); modalOverlay.classList.add('open'); });
document.getElementById('modalClose').addEventListener('click',()=>modalOverlay.classList.remove('open'));
modalOverlay.addEventListener('click',e=>{ if(e.target===modalOverlay) modalOverlay.classList.remove('open'); });
document.getElementById('leaderboardBtn').addEventListener('click',()=>window.open('leaderboard.html','_blank'));
document.getElementById('trophyBtn').addEventListener('click',()=>window.open('leaderboard.html','_blank'));

const workerSrc=`let iv=null;self.onmessage=function(e){if(e.data==='start'){if(!iv)iv=setInterval(()=>self.postMessage('tick'),500);}else if(e.data==='stop'){clearInterval(iv);iv=null;}};`;
try {
  worker=new Worker(URL.createObjectURL(new Blob([workerSrc],{type:'application/javascript'})));
  worker.onmessage=()=>{
    if(!running) return;
    const sesMs=sessionMs+(performance.now()-startTime), liveTotal=totalStudiedMs+(performance.now()-startTime);
    display.textContent=formatTime(sesMs); checkHS(sesMs);
    const pts=msToPoints(liveTotal), newIdx=getRankIndex(pts);
    if(newIdx>prevRankIdx){prevRankIdx=newIdx;showRankUp(RANKS[newIdx].name);rankBtnName.textContent=RANKS[newIdx].name;}
    if(modalOverlay.classList.contains('open')) updateRankUI(pts);
  };
} catch(e){}

function rafTick() {
  if(!running) return;
  const sesMs=sessionMs+(performance.now()-startTime), liveTotal=totalStudiedMs+(performance.now()-startTime);
  display.textContent=formatTime(sesMs); checkHS(sesMs);
  const pts=msToPoints(liveTotal), newIdx=getRankIndex(pts);
  if(newIdx>prevRankIdx){prevRankIdx=newIdx;showRankUp(RANKS[newIdx].name);rankBtnName.textContent=RANKS[newIdx].name;}
  if(modalOverlay.classList.contains('open')) updateRankUI(pts);
  rafId=requestAnimationFrame(rafTick);
}

function enterZen() { document.body.classList.add('zen'); }
function exitZen()  { document.body.classList.remove('zen'); }

document.body.addEventListener('click',function(e){
  if(!document.body.classList.contains('zen')) return;
  if(e.target!==pauseBtn) exitZen();
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&document.body.classList.contains('zen')) exitZen();
});

const display=document.getElementById('display'), pauseBtn=document.getElementById('pauseBtn'), resetBtn=document.getElementById('resetBtn');

pauseBtn.addEventListener('click',()=>{
  if(!running){
    running=true; startTime=performance.now();
    display.className='running'; pauseBtn.textContent='Pause';
    if(worker) worker.postMessage('start');
    rafId=requestAnimationFrame(rafTick);
    enterZen();
  } else {
    const delta=performance.now()-startTime;
    sessionMs+=delta; totalStudiedMs+=delta;
    running=false; cancelAnimationFrame(rafId);
    if(worker) worker.postMessage('stop');
    display.className='paused'; pauseBtn.textContent='Resume';
    exitZen(); scheduleSync();
  }
});

resetBtn.addEventListener('click',()=>{
  if(running){const delta=performance.now()-startTime;totalStudiedMs+=delta;}
  running=false; sessionMs=0; startTime=0; brokeDuring=false;
  cancelAnimationFrame(rafId); if(worker) worker.postMessage('stop');
  display.textContent='00:00:00'; display.className='paused'; pauseBtn.textContent='Start';
  rankBtnName.textContent=RANKS[getRankIndex(msToPoints(totalStudiedMs))].name;
  exitZen(); scheduleSync();
});

const settingsBtn=document.getElementById('settingsBtn'), settingsPopup=document.getElementById('settingsPopup'), logoutBtn=document.getElementById('logoutBtn');
settingsBtn.addEventListener('click',function(e){ e.stopPropagation(); settingsPopup.classList.toggle('open'); });
document.addEventListener('click',function(e){ if(!settingsPopup.contains(e.target)&&e.target!==settingsBtn) settingsPopup.classList.remove('open'); });
logoutBtn.addEventListener('click',function(){ if(typeof window.__logout==='function') window.__logout(); else window.location.href='index.html'; });

const identityOverlay=document.getElementById('identityOverlay'), usernameInput=document.getElementById('usernameInput');
const identityError=document.getElementById('identityError'), identityBeginBtn=document.getElementById('identityBeginBtn');
function showIdentityOverlay(){ identityOverlay.classList.add('visible'); setTimeout(()=>usernameInput.focus(),600); }
function hideIdentityOverlay(){ identityOverlay.style.transition='opacity 0.4s ease'; identityOverlay.style.opacity='0'; setTimeout(()=>{ identityOverlay.style.display='none'; },400); }
function showIdentityError(msg){ identityError.textContent=msg; identityError.classList.add('visible'); }
function clearIdentityError(){ identityError.classList.remove('visible'); }
usernameInput.addEventListener('input',()=>clearIdentityError());
usernameInput.addEventListener('keydown',e=>{ if(e.key==='Enter') identityBeginBtn.click(); });
identityBeginBtn.addEventListener('click',async()=>{
  const raw=usernameInput.value.trim();
  if(!/^[a-zA-Z0-9_]{3,16}$/.test(raw)){ showIdentityError('3–16 chars. Letters, numbers, underscore only.'); return; }
  identityBeginBtn.disabled=true; identityBeginBtn.textContent='...'; clearIdentityError();
  if(typeof window.__saveUsername==='function'){
    const result=await window.__saveUsername(raw);
    if(result.ok){ currentUsername=raw; hideIdentityOverlay(); }
    else{ showIdentityError(result.error||'Error. Try again.'); identityBeginBtn.disabled=false; identityBeginBtn.textContent='BEGIN'; }
  }
});

function scheduleSync(){
  if(!firestoreReady||!currentUid) return;
  clearTimeout(syncTimeout);
  syncTimeout=setTimeout(()=>{ if(typeof window.__syncProfile==='function') window.__syncProfile(); },2000);
}

window.__loadProfileData=function(data){
  if(!data) return;
  totalStudiedMs=(data.totalStudyTime||0)*3600000;
  highscore=(data.highScore||0)*3600000;
  prevRankIdx=getRankIndex(data.rankPoints||0);
  currentUsername=data.username||null;
  renderHS();
  rankBtnName.textContent=getRank(data.rankPoints||0);
  prevRankIdx=getRankIndex(data.rankPoints||0);
};

window.__getTimerState=function(){
  const liveTotal=totalStudiedMs+(running?(performance.now()-startTime):0);
  const pts=msToPoints(liveTotal);
  return { totalStudyTime:liveTotal/3600000, rankPoints:pts, currentRank:getRank(pts), highScore:Math.max(highscore,sessionMs)/3600000 };
};

window.__setFirestoreReady=function(uid){ currentUid=uid; firestoreReady=true; };

setInterval(()=>{ if(running&&firestoreReady) scheduleSync(); },60000);

/* ═══════════════════════════════════════════════
   THEME SYSTEM JAVASCRIPT — NEW CODE ONLY
   ═══════════════════════════════════════════════ */
(function() {
  const THEMES = ['dark', 'light', 'redbull'];
  const STORAGE_KEY = 'selectedTheme';

  function applyTheme(themeId) {
    if (!THEMES.includes(themeId)) themeId = 'dark';
    const root = document.documentElement;
    // Remove all theme attrs first
    root.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    // Apply: dark = no attribute (uses :root defaults), others get data-theme
    if (themeId !== 'dark') {
      root.setAttribute('data-theme', themeId);
    }
    // Update active card
    document.querySelectorAll('.theme-card').forEach(card => {
      card.classList.toggle('active', card.dataset.themeId === themeId);
    });
    // Persist
    try { localStorage.setItem(STORAGE_KEY, themeId); } catch(e) {}
  }

  function getSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY) || 'dark'; } catch(e) { return 'dark'; }
  }

  // Apply saved theme immediately on load
  applyTheme(getSavedTheme());

  // Theme modal open/close
  const themeModalOverlay = document.getElementById('themeModalOverlay');
  const themesBtn = document.getElementById('themesBtn');
  const themeModalClose = document.getElementById('themeModalClose');
  const settingsPopupEl = document.getElementById('settingsPopup');

  themesBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    settingsPopupEl.classList.remove('open');
    themeModalOverlay.classList.add('open');
  });

  themeModalClose.addEventListener('click', function() {
    themeModalOverlay.classList.remove('open');
  });

  themeModalOverlay.addEventListener('click', function(e) {
    if (e.target === themeModalOverlay) themeModalOverlay.classList.remove('open');
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') themeModalOverlay.classList.remove('open');
  });

  // Theme card clicks
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', function() {
      applyTheme(this.dataset.themeId);
    });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyTheme(this.dataset.themeId); }
    });
  });
})();

  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
  import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDOQZw95uqm6B4TP_qGKlwqt2LYKfvITXM",
    authDomain: "eternal-one-timer.firebaseapp.com",
    projectId: "eternal-one-timer",
    storageBucket: "eternal-one-timer.firebasestorage.app",
    messagingSenderId: "1010437979682",
    appId: "1:1010437979682:web:7a23edfd4e45439ba7547b",
    measurementId: "G-6JR43ZSEN3"
  };

  const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
  const syncDot=document.getElementById('syncDot');
  function setSyncState(s){ syncDot.className='sync-dot '+s; }

  onAuthStateChanged(auth,async user=>{
    if(!user){ window.location.href='index.html'; return; }
    window.__setFirestoreReady(user.uid);
    const userRef=doc(db,'users',user.uid), userSnap=await getDoc(userRef);
    if(!userSnap.exists()){
      await setDoc(userRef,{ username:null,usernameLower:null,rankPoints:0,currentRank:'Wanderer I',highScore:0,totalStudyTime:0,rankHistory:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp() });
      showIdentityOverlay();
    } else {
      const data=userSnap.data();
      if(!data.username) showIdentityOverlay(); else hideIdentityOverlay();
      if(typeof window.__loadProfileData==='function') window.__loadProfileData(data);
    }
  });

  function showIdentityOverlay(){ document.getElementById('identityOverlay').classList.add('visible'); setTimeout(()=>document.getElementById('usernameInput').focus(),600); }
  function hideIdentityOverlay(){ const el=document.getElementById('identityOverlay'); el.style.transition='opacity 0.4s ease'; el.style.opacity='0'; setTimeout(()=>{ el.style.display='none'; },400); }

  window.__saveUsername=async function(raw){
    const lower=raw.toLowerCase(), authUser=auth.currentUser;
    if(!authUser) return{ok:false,error:'Not authenticated.'};
    const q=query(collection(db,'users'),where('usernameLower','==',lower));
    const snap=await getDocs(q);
    if(!snap.empty) return{ok:false,error:'Identity already taken.'};
    await updateDoc(doc(db,'users',authUser.uid),{ username:raw,usernameLower:lower,updatedAt:serverTimestamp() });
    return{ok:true};
  };

  window.__syncProfile=async function(){
    const authUser=auth.currentUser;
    if(!authUser||typeof window.__getTimerState!=='function') return;
    setSyncState('syncing');
    try{
      const state=window.__getTimerState(), userRef=doc(db,'users',authUser.uid);
      const snap=await getDoc(userRef), existing=snap.exists()?snap.data():{};
      const updateData={ rankPoints:state.rankPoints,currentRank:state.currentRank,totalStudyTime:state.totalStudyTime,updatedAt:serverTimestamp() };
      if(state.highScore>(existing.highScore||0)) updateData.highScore=state.highScore;
      if(existing.currentRank&&existing.currentRank!==state.currentRank){
        const history=existing.rankHistory||[];
        history.push({rank:state.currentRank,at:new Date().toISOString()});
        updateData.rankHistory=history.slice(-50);
      }
      await updateDoc(userRef,updateData);
      setSyncState('synced'); setTimeout(()=>setSyncState(''),3000);
    } catch(e){ setSyncState('error'); setTimeout(()=>setSyncState(''),3000); console.error('Sync error:',e); }
  };

  window.__logout=async function(){
    if(typeof window.__syncProfile==='function') await window.__syncProfile();
    try{ await signOut(auth); } catch(e){}
    window.location.href='index.html';
  };