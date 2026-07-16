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
  maxPlayers:   30, // 기본 최대 30명
  initialZombieCount: 6, // 리셋 시 생성된 초기 좀비 수 저장용
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

  btnPlayerDec:      document.getElementById('btn-player-dec'),
  btnPlayerInc:      document.getElementById('btn-player-inc'),
  playerCountDisplay:document.getElementById('player-count-display'),
  btnForceEnd:       document.getElementById('btn-force-end'),

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
  const count = state.maxPlayers || 30;
  for (let i = 1; i <= count; i++) {
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

// 실제 인원 우는 진원 카운트 (그손 게스X)
function countPlayers() {
  let citizens = 0;
  let zombies  = 0;
  for (const data of Object.values(state.players)) {
    if (data.role === 'zombie') zombies++;
    else citizens++;
  }
  return { citizens, zombies };
}

// 우승팀 판정: 시민 수 < 최초 좀비 수 * 2 이면 좀비 승리, 아니면 시민 승리
function judgeWinner(citizens) {
  const threshold = (state.initialZombieCount || 6) * 2;
  if (citizens < threshold) {
    return 'zombie'; // 좀비 승리
  } else {
    return 'citizen'; // 시민 승리
  }
}

// 이모지 그리드 렌더
// emoji: '🧑' or '🧟', count: 표시할 인원 수
function renderEmojiGrid(containerId, emoji, count) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.style.cssText = 'font-size:1.4rem; line-height:1.5; transition:all 0.3s;';
    el.appendChild(span);
  }
}

// 생존 현황 화면 업데이트 (수, 이모지, 비율 바 동시)
function renderSurvivalDisplay(citizens, zombies) {
  DOM.citizenCount.textContent = citizens;
  DOM.zombieCount.textContent  = zombies;

  const total = (citizens + zombies) || 30;
  DOM.ratioCitizen.style.width = (citizens / total * 100).toFixed(1) + '%';
  DOM.ratioZombie.style.width  = (zombies  / total * 100).toFixed(1) + '%';

  renderEmojiGrid('citizen-emoji-grid', '🧑', citizens);
  renderEmojiGrid('zombie-emoji-grid',  '🧟', zombies);
}

// 구 함수 이름 유지 (호환성): triggerAlarm에서 사용
function updateCounts() {
  const counts = countPlayers();
  return counts;
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
      REF.gameState.update({ is_active: false, time_left: 0 })
        .then(() => {
          const { citizens, zombies } = countPlayers();
          const winner = judgeWinner(citizens);
          showGameOver(citizens, zombies, winner);
        });
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
  // 알람 시점에 실제 현황을 실시간 조회하여 화면에 표시
  const { citizens, zombies } = countPlayers();
  renderSurvivalDisplay(citizens, zombies); // ← 고정된 화면 업데이트
  const label = ALARM_LABELS[timePoint] || '';

  flashScreen();
  showAlarmPopup(citizens, zombies, label);
  markAlarmDone(timePoint);

  if (timePoint === 0) {
    setTimeout(() => {
      const winner = judgeWinner(citizens);
      showGameOver(citizens, zombies, winner);
    }, 3000);
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
function showGameOver(citizens, zombies, winner) {
  DOM.finalCitizen.textContent = citizens;
  DOM.finalZombie.textContent  = zombies;
  
  const winnerDisplay = document.getElementById('winner-display');
  if (winnerDisplay) {
    if (winner === 'zombie') {
      winnerDisplay.textContent = '🧟 좀비 승리! (최초 좀비 지정자 우승)';
      winnerDisplay.style.color = '#f87171'; // 빨간색 톤
      winnerDisplay.className = winnerDisplay.className.replace(/glow-(cyan|red|yellow)/g, '') + ' glow-red';
    } else {
      winnerDisplay.textContent = '🧑 시민 승리!';
      winnerDisplay.style.color = '#38bdf8'; // 파란색 톤
      winnerDisplay.className = winnerDisplay.className.replace(/glow-(cyan|red|yellow)/g, '') + ' glow-cyan';
    }
  }
  
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

  const n = state.maxPlayers || 30;
  
  // 좀비 비율 계산 규칙: n/6 <= Z <= n/5
  let zMin = Math.ceil(n / 6);
  let zMax = Math.floor(n / 5);
  let zombieCount = 0;
  if (zMin <= zMax) {
    // 해당 범위 내 정수 선택
    zombieCount = zMin + Math.floor(Math.random() * (zMax - zMin + 1));
  } else {
    // 정수가 존재하지 않는 특수한 경우, 가장 비율에 근접한 정수 선택 (최소 1명)
    zombieCount = Math.max(1, Math.round(n / 5.5));
  }

  // 1부터 n까지 번호 생성 후 셔플
  const list = [];
  for (let i = 1; i <= n; i++) {
    list.push(i);
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = list[i];
    list[i] = list[j];
    list[j] = temp;
  }

  // 앞의 zombieCount 만큼을 좀비로 설정
  const zombieIndices = new Set(list.slice(0, zombieCount));

  const playersUpdate = {};
  for (let i = 1; i <= n; i++) {
    playersUpdate[`P${i}`] = {
      role:  zombieIndices.has(i) ? 'zombie' : 'citizen',
      score: 0,
    };
  }

  // players 노드를 완전히 set()으로 덮어씀 (N명 초과의 이전 데이터가 남지 않도록)
  db.ref('players').set(playersUpdate)
    .then(() => db.ref('game_state').set({
      time_left: 1200,
      is_active: false,
      max_players: n,
      initial_zombie_count: zombieCount // 최초 좀비 수 저장
    }))
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

// ── 플레이어 리스너 ──────────────────────────────────────────────────────────
REF.players.on('value', snapshot => {
  const data = snapshot.val();
  if (!data) return;
  state.players = data;

  // 플레이어 그리드 (팝업용) 는 항상 업데이트
  for (const [pid, pdata] of Object.entries(data)) {
    updatePlayerCell(pid, pdata);
  }

  const { citizens, zombies } = countPlayers();

  // 생존 현황 표시는 게임 중에는 고정:
  // 게임이 비활성(시작 전 or 종료 후)일 때만 실시간 반영
  if (!state.isActive) {
    renderSurvivalDisplay(citizens, zombies);
  } else {
    // 💡 진행 중 좀비 승리 조건 실시간 실시간 감시
    if (state.initialZombieCount > 0) {
      const threshold = state.initialZombieCount * 2;
      if (citizens < threshold) {
        stopLocalTimer();
        REF.gameState.update({ is_active: false, time_left: 0 })
          .then(() => {
            showGameOver(citizens, zombies, 'zombie');
          });
        return;
      }
    }
  }
});

// ── 게임 상태 리스너 (단 1회만 등록) ────────────────────────────────
REF.gameState.on('value', snapshot => {
  const data = snapshot.val();
  if (!data) return;

  const wasActive   = state.isActive;
  state.isActive    = data.is_active  ?? false;
  state.timeLeft    = data.time_left  ?? 1200;

  // 최초 좀비 수 동기화
  state.initialZombieCount = data.initial_zombie_count ?? 6;

  // max_players 동기화
  const oldMaxPlayers = state.maxPlayers;
  state.maxPlayers = data.max_players ?? 30;
  if (DOM.playerCountDisplay) {
    DOM.playerCountDisplay.textContent = `${state.maxPlayers}명`;
  }

  // 인원수가 변경되었으면 그리드 다시 그리기
  if (oldMaxPlayers !== state.maxPlayers) {
    buildPlayerGrid();
    for (const [pid, pdata] of Object.entries(state.players)) {
      updatePlayerCell(pid, pdata);
    }
    const { citizens, zombies } = countPlayers();
    renderSurvivalDisplay(citizens, zombies);
  }

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
    REF.gameState.set({ time_left: 1200, is_active: false, max_players: 30, initial_zombie_count: 6 });
  }
});

// ── 인원 조절 클릭 이벤트 바인딩 ──────────────────────────────────────
if (DOM.btnPlayerDec && DOM.btnPlayerInc && DOM.playerCountDisplay) {
  DOM.btnPlayerDec.addEventListener('click', () => {
    if (state.isActive) {
      alert('게임 중에는 참가 인원을 변경할 수 없습니다.');
      return;
    }
    if (state.maxPlayers > 5) {
      const newCount = state.maxPlayers - 1;
      REF.gameState.update({ max_players: newCount });
    }
  });

  DOM.btnPlayerInc.addEventListener('click', () => {
    if (state.isActive) {
      alert('게임 중에는 참가 인원을 변경할 수 없습니다.');
      return;
    }
    if (state.maxPlayers < 30) {
      const newCount = state.maxPlayers + 1;
      REF.gameState.update({ max_players: newCount });
    }
  });
}

// ── 타이머 즉시 종료 클릭 이벤트 바인딩 ──────────────────────────────────
if (DOM.btnForceEnd) {
  DOM.btnForceEnd.addEventListener('click', () => {
    if (!state.isActive) {
      alert('게임이 시작되지 않았습니다.');
      return;
    }
    if (confirm('타이머를 즉시 종료하고 게임 결과를 판정하시겠습니까?')) {
      stopLocalTimer();
      REF.gameState.update({ is_active: false, time_left: 0 })
        .then(() => {
          const { citizens, zombies } = countPlayers();
          const winner = judgeWinner(citizens);
          showGameOver(citizens, zombies, winner);
        });
    }
  });
}

// ── 첫 빌드 ──────────────────────────────────────────────────────────
// buildPlayerGrid()는 player-grid가 HTML에 있을 때만 동작 (null-safe)
buildPlayerGrid();
renderTimer(1200);

// ══════════════════════════════════════════════════════════════════════
// 플레이어 현황 팝업 제어 (전역 함수 — HTML onclick에서 호출함)
// ══════════════════════════════════════════════════════════════════════
function openPlayerPopup() {
  const popup = document.getElementById('player-popup');
  if (!popup) return;
  // 팝업 열 때 플레이어 그리드 재빌드 (player-grid가 팝업 안에 있음)
  buildPlayerGrid();
  // 현재 플레이어 상태를 반영
  for (const [pid, pdata] of Object.entries(state.players)) {
    updatePlayerCell(pid, pdata);
  }
  popup.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePlayerPopup() {
  const popup = document.getElementById('player-popup');
  if (!popup) return;
  popup.classList.add('hidden');
  document.body.style.overflow = '';
}

// ESC 키로 팝업 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePlayerPopup();
});
