/* =====================================================================
   scoreboard.js  —  시민 vs 좀비 PC 전광판 메인 로직  (v1.1 버그픽스)
   ===================================================================== */

'use strict';

// ── Firebase 초기화 ──────────────────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// DB 레퍼런스
const REF = {
  players:      db.ref('players'),
  gameState:    db.ref('game_state'),
  interactions: db.ref('interactions'),
};

// ── 상태 ─────────────────────────────────────────────────────────────
const state = {
  players:      {},
  timeLeft:     1200,
  isActive:     false,
  localTimer:   null,
  localTimeLeft:1200,
  // 알람 발화 추적 — 키를 Number로 통일
  alarmFired: { 960: false, 720: false, 480: false, 240: false, 0: false },
  currentBannerKey: null,
  lastSyncedTime:   1200,
};

// ── DOM 요소 캐시 ────────────────────────────────────────────────────
const DOM = {
  timerDisplay:      document.getElementById('timer-display'),
  progressBar:       document.getElementById('progress-bar'),
  elapsedDisplay:    document.getElementById('elapsed-display'),
  citizenCount:      document.getElementById('citizen-count'),
  zombieCount:       document.getElementById('zombie-count'),
  ratioCitizen:      document.getElementById('ratio-citizen'),
  ratioZombie:       document.getElementById('ratio-zombie'),
  playerGrid:        document.getElementById('player-grid'),
  btnStartStop:      document.getElementById('btn-start-stop'),
  btnReset:          document.getElementById('btn-reset'),
  connDot:           document.getElementById('conn-dot'),
  connText:          document.getElementById('conn-text'),

  alarmOverlay:      document.getElementById('alarm-overlay'),
  popupCitizenCount: document.getElementById('popup-citizen-count'),
  popupZombieCount:  document.getElementById('popup-zombie-count'),
  popupLabel:        document.getElementById('popup-label'),

  sideBanner:        document.getElementById('side-banner'),
  bannerCitizen:     document.getElementById('banner-citizen-count'),
  bannerZombie:      document.getElementById('banner-zombie-count'),
  bannerLabel:       document.getElementById('banner-label'),

  gameOverOverlay:   document.getElementById('game-over-overlay'),
  finalCitizen:      document.getElementById('final-citizen'),
  finalZombie:       document.getElementById('final-zombie'),

  resetModal:        document.getElementById('reset-confirm-modal'),
  flashOverlay:      document.getElementById('flash-overlay'),

  alarmRows: {
    960: document.getElementById('alarm-row-16'),
    720: document.getElementById('alarm-row-12'),
    480: document.getElementById('alarm-row-8'),
    240: document.getElementById('alarm-row-4'),
    0:   document.getElementById('alarm-row-0'),
  },
  alarmDots: {
    960: document.getElementById('alarm-dot-16'),
    720: document.getElementById('alarm-dot-12'),
    480: document.getElementById('alarm-dot-8'),
    240: document.getElementById('alarm-dot-4'),
    0:   document.getElementById('alarm-dot-0'),
  },
};

// ── 알람 라벨 맵 ─────────────────────────────────────────────────────
const ALARM_LABELS = {
  960: '남은 시간 16분',
  720: '남은 시간 12분',
  480: '남은 시간 8분',
  240: '남은 시간 4분',
  0:   '게임 종료!',
};

// ══════════════════════════════════════════════════════════════════════
// 파티클 배경
// ══════════════════════════════════════════════════════════════════════
(function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const COUNT = 60;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      r:     Math.random() * 1.8 + 0.3,
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.4 + 0.1,
      hue:   Math.random() < 0.6 ? 195 : 0,
    });
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},80%,65%,${p.alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(loop);
  }
  loop();
})();

// ══════════════════════════════════════════════════════════════════════
// 플레이어 그리드 초기 빌드 (player-grid DOM이 없으면 무시)
// ══════════════════════════════════════════════════════════════════════
function buildPlayerGrid() {
  const grid = DOM.playerGrid;
  if (!grid) return; // 플레이어 현황 섹션이 없는 경우 안전 처리
  grid.innerHTML = '';
  for (let i = 1; i <= 30; i++) {
    const pid  = `P${i}`;
    const cell = document.createElement('div');
    cell.id        = `cell-${pid}`;
    cell.className = 'player-cell player-citizen rounded-xl p-2 flex flex-col items-center gap-0.5 cursor-default';
    cell.innerHTML = `
      <span class="font-orbitron font-bold text-xs text-slate-400">${pid}</span>
      <span id="cell-role-${pid}" class="text-base">👤</span>
      <span id="cell-score-${pid}" class="font-orbitron text-xs text-cyan-400/70">0</span>
    `;
    grid.appendChild(cell);
  }
}

function updatePlayerCell(pid, data) {
  const cell    = document.getElementById(`cell-${pid}`);
  const roleEl  = document.getElementById(`cell-role-${pid}`);
  const scoreEl = document.getElementById(`cell-score-${pid}`);
  if (!cell || !roleEl || !scoreEl) return;

  const isZombie = data.role === 'zombie';
  cell.className  = `player-cell ${isZombie ? 'player-zombie' : 'player-citizen'} rounded-xl p-2 flex flex-col items-center gap-0.5 cursor-default`;
  roleEl.textContent  = isZombie ? '🧟' : '👤';
  scoreEl.textContent = data.score ?? 0;
  scoreEl.className   = `font-orbitron text-xs ${isZombie ? 'text-red-400/70' : 'text-cyan-400/70'}`;
}

function updateCounts() {
  let citizens = 0;
  let zombies  = 0;
  for (const data of Object.values(state.players)) {
    if (data.role === 'zombie') zombies++;
    else citizens++;
  }
  DOM.citizenCount.textContent = citizens;
  DOM.zombieCount.textContent  = zombies;

  const total = (citizens + zombies) || 30;
  DOM.ratioCitizen.style.width = (citizens / total * 100).toFixed(1) + '%';
  DOM.ratioZombie.style.width  = (zombies  / total * 100).toFixed(1) + '%';

  return { citizens, zombies };
}

// ══════════════════════════════════════════════════════════════════════
// 타이머
// ══════════════════════════════════════════════════════════════════════
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderTimer(seconds) {
  DOM.timerDisplay.textContent   = formatTime(seconds);
  DOM.elapsedDisplay.textContent = 1200 - seconds;
  DOM.progressBar.style.width    = (seconds / 1200 * 100).toFixed(2) + '%';

  if (seconds <= 300) {
    DOM.timerDisplay.classList.add('timer-danger');
    DOM.progressBar.classList.add('progress-danger');
  } else {
    DOM.timerDisplay.classList.remove('timer-danger');
    DOM.progressBar.classList.remove('progress-danger');
  }
}

// ── 버튼 스타일 ──────────────────────────────────────────────────────
function setStartBtnStyle(active) {
  const btn = DOM.btnStartStop;
  if (active) {
    btn.style.backgroundImage = 'linear-gradient(to right, #f59e0b, #ea580c)';
    btn.style.boxShadow       = '0 4px 16px rgba(245,158,11,0.25)';
    btn.textContent           = '⏸\u00a0 게임 정지';
  } else {
    btn.style.backgroundImage = 'linear-gradient(to right, #10b981, #0d9488)';
    btn.style.boxShadow       = '0 4px 16px rgba(16,185,129,0.25)';
    btn.textContent           = '▶\u00a0 게임 시작';
  }
}

// ══════════════════════════════════════════════════════════════════════
// 로컬 카운트다운
// ══════════════════════════════════════════════════════════════════════
let tickCount = 0;

function startLocalTimer() {
  stopLocalTimer();
  tickCount = 0;
  state.localTimer = setInterval(() => {
    if (!state.isActive) { stopLocalTimer(); return; }

    state.localTimeLeft = Math.max(0, state.localTimeLeft - 1);
    renderTimer(state.localTimeLeft);
    checkAlarms(state.localTimeLeft);
    tickCount++;

    // 10초마다 DB 동기화
    if (tickCount % 10 === 0 || state.localTimeLeft === 0) {
      REF.gameState.update({ time_left: state.localTimeLeft });
    }

    if (state.localTimeLeft === 0) {
      stopLocalTimer();
      REF.gameState.update({ is_active: false, time_left: 0 });
    }
  }, 1000);
}

function stopLocalTimer() {
  if (state.localTimer) {
    clearInterval(state.localTimer);
    state.localTimer = null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// 알람 시스템
// ══════════════════════════════════════════════════════════════════════
const ALARM_POINTS = [960, 720, 480, 240, 0];

function checkAlarms(timeLeft) {
  for (const point of ALARM_POINTS) {
    // ✅ FIX: Number(point) 비교로 타입 통일
    if (timeLeft === Number(point) && !state.alarmFired[point]) {
      state.alarmFired[point] = true;
      triggerAlarm(point);
    }
  }
}

function triggerAlarm(timePoint) {
  const { citizens, zombies } = updateCounts();
  const label = ALARM_LABELS[timePoint] || '';

  flashScreen();
  showAlarmPopup(citizens, zombies, label);
  markAlarmDone(timePoint);

  if (timePoint === 0) {
    setTimeout(() => showGameOver(citizens, zombies), 3000);
  }
}

function flashScreen() {
  const overlay = DOM.flashOverlay;
  overlay.classList.remove('hidden');
  overlay.classList.add('screen-flash');
  overlay.style.opacity = '0.75';
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('screen-flash');
    overlay.style.opacity = '0';
  }, 1500);
}

function showAlarmPopup(citizens, zombies, label) {
  DOM.popupCitizenCount.textContent = citizens;
  DOM.popupZombieCount.textContent  = zombies;
  DOM.popupLabel.textContent        = label;

  DOM.bannerCitizen.textContent = citizens;
  DOM.bannerZombie.textContent  = zombies;
  DOM.bannerLabel.textContent   = label;

  DOM.alarmOverlay.classList.remove('hidden');

  const popup = document.getElementById('alarm-popup');
  if (label === ALARM_LABELS[0]) {
    popup.style.borderColor = 'rgba(239,68,68,0.9)';
  } else {
    popup.style.borderColor = 'rgba(250,204,21,0.8)';
  }

  // 애니메이션 재실행
  popup.classList.remove('alarm-popup');
  void popup.offsetWidth;
  popup.classList.add('alarm-popup');
}

function closeAlarmPopup() {
  DOM.alarmOverlay.classList.add('hidden');
  showSideBanner();
}

function showSideBanner() {
  const banner = DOM.sideBanner;
  banner.classList.remove('hidden');
  const inner = banner.firstElementChild;
  if (inner) {
    inner.classList.remove('side-banner');
    void inner.offsetWidth;
    inner.classList.add('side-banner');
  }
}

function markAlarmDone(timePoint) {
  const row = DOM.alarmRows[timePoint];
  const dot = DOM.alarmDots[timePoint];
  if (row) row.classList.add('alarm-done');
  if (dot) dot.classList.add('alarm-dot-done');
}

// ══════════════════════════════════════════════════════════════════════
// 게임 오버
// ══════════════════════════════════════════════════════════════════════
function showGameOver(citizens, zombies) {
  DOM.finalCitizen.textContent = citizens;
  DOM.finalZombie.textContent  = zombies;
  DOM.gameOverOverlay.classList.remove('hidden');
}

function closeGameOver() {
  DOM.gameOverOverlay.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════════
// 리셋
// ══════════════════════════════════════════════════════════════════════
function cancelReset() {
  DOM.resetModal.classList.add('hidden');
}

function confirmReset() {
  DOM.resetModal.classList.add('hidden');
  performReset();
}

function performReset() {
  stopLocalTimer();

  const groups = [
    [1,2,3,4,5],
    [6,7,8,9,10],
    [11,12,13,14,15],
    [16,17,18,19,20],
    [21,22,23,24,25],
    [26,27,28,29,30],
  ];

  const zombieSet = new Set();
  for (const group of groups) {
    zombieSet.add(group[Math.floor(Math.random() * group.length)]);
  }

  const playersUpdate = {};
  for (let i = 1; i <= 30; i++) {
    playersUpdate[`P${i}`] = {
      role:  zombieSet.has(i) ? 'zombie' : 'citizen',
      score: 0,
    };
  }

  // ✅ FIX: interactions는 set(null)로 별도 삭제, 나머지는 update
  const rootUpdates = {
    players:    playersUpdate,
    game_state: { time_left: 1200, is_active: false },
  };

  db.ref('/').update(rootUpdates)
    .then(() => REF.interactions.set(null))
    .then(() => {
      console.log('[RESET] 초기화 완료');
      // ✅ FIX: Number 키로 통일하여 알람 상태 초기화
      ALARM_POINTS.forEach(p => { state.alarmFired[p] = false; });
      state.localTimeLeft = 1200;
      state.timeLeft      = 1200;
      state.isActive      = false;
      renderTimer(1200);
      DOM.sideBanner.classList.add('hidden');
      DOM.gameOverOverlay.classList.add('hidden');
      DOM.alarmOverlay.classList.add('hidden');
      // 알람 타임라인 초기화
      ALARM_POINTS.forEach(p => {
        const row = DOM.alarmRows[p];
        const dot = DOM.alarmDots[p];
        if (row) row.classList.remove('alarm-done');
        if (dot) dot.classList.remove('alarm-dot-done');
      });
    })
    .catch(err => console.error('[RESET ERROR]', err));
}

// ══════════════════════════════════════════════════════════════════════
// 게임 시작/정지 버튼
// ══════════════════════════════════════════════════════════════════════
DOM.btnStartStop.addEventListener('click', () => {
  const nowActive = !state.isActive;
  // is_active만 토글 (time_left는 건드리지 않음)
  REF.gameState.update({ is_active: nowActive });
});

DOM.btnReset.addEventListener('click', () => {
  DOM.resetModal.classList.remove('hidden');
});

// ══════════════════════════════════════════════════════════════════════
// Firebase 실시간 리스너
// ══════════════════════════════════════════════════════════════════════

// ── 플레이어 리스너 ──────────────────────────────────────────────────
REF.players.on('value', snapshot => {
  const data = snapshot.val();
  if (!data) return;
  state.players = data;
  for (const [pid, pdata] of Object.entries(data)) {
    updatePlayerCell(pid, pdata);
  }
  updateCounts();
});

// ── 게임 상태 리스너 (단 1회만 등록) ────────────────────────────────
REF.gameState.on('value', snapshot => {
  const data = snapshot.val();
  if (!data) return;

  const wasActive   = state.isActive;
  state.isActive    = data.is_active  ?? false;
  state.timeLeft    = data.time_left  ?? 1200;

  // 서버 시간과 로컬 시간이 5초 이상 차이나면 보정
  if (Math.abs(state.localTimeLeft - state.timeLeft) > 5) {
    state.localTimeLeft = state.timeLeft;
  }

  setStartBtnStyle(state.isActive);

  if (state.isActive && !wasActive) {
    // false → true: 타이머 시작
    state.localTimeLeft = state.timeLeft;
    startLocalTimer();
  }

  if (!state.isActive) {
    // 정지 상태: 타이머 멈추고 서버 기준값 표시
    stopLocalTimer();
    renderTimer(state.timeLeft);
  }
});

// ── 연결 상태 ────────────────────────────────────────────────────────
db.ref('.info/connected').on('value', snapshot => {
  if (snapshot.val() === true) {
    DOM.connDot.style.cssText = 'background:#4ade80;box-shadow:0 0 6px #4ade80;';
    DOM.connText.textContent  = 'Firebase 연결됨';
    DOM.connText.style.color  = '#86efac';
  } else {
    DOM.connDot.style.cssText = 'background:#ef4444;box-shadow:0 0 6px #ef4444;';
    DOM.connText.textContent  = '연결 끊김';
    DOM.connText.style.color  = '#fca5a5';
  }
});

// ══════════════════════════════════════════════════════════════════════
// 초기화: DB에 데이터 없으면 자동 생성
// ══════════════════════════════════════════════════════════════════════
REF.players.once('value', snapshot => {
  if (!snapshot.exists()) {
    console.log('[INIT] 플레이어 데이터 없음 → 자동 초기화');
    performReset();
  }
});

REF.gameState.once('value', snapshot => {
  if (!snapshot.exists()) {
    REF.gameState.set({ time_left: 1200, is_active: false });
  }
});

// ── 첫 빌드 ──────────────────────────────────────────────────────────
// buildPlayerGrid()는 player-grid가 HTML에 있을 때만 동작 (null-safe)
buildPlayerGrid();
renderTimer(1200);
