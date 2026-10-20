'use strict';
// 설정 탭: 섹션별 목록. 켜고 끄는 항목은 줄에서 바로, 나머지는 눌러서 시트로. 편의 도구(1RM 계산기, 인터벌 타이머)도 여기

const SI = { // 줄 아이콘 (24 viewBox 선)
  chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
  disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/>',
  db: '<path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.5 2-4.5.3 1.5 1 2.5 2 2.5 0-3 0-5 1-8z"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 3h4"/>',
  step: '<path d="M5 12h14M12 5v14"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
  rpe: '<path d="M4 18h4V12H4zM10 18h4V8h-4zM16 18h4V4h-4z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4"/>',
  wave: '<path d="M3 12h3l2-5 4 10 3-7 2 2h4"/>',
  watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01"/>',
  loop: '<path d="M17 4l3 3-3 3M20 7H9a5 5 0 0 0-5 5M7 20l-3-3 3-3M4 17h11a5 5 0 0 0 5-5"/>',
  plate: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>',
};
const ROUTINE_UPD = { off: '끔', same: '해당 루틴만', all: '같은 운동 든 모든 루틴' };
// [섹션, [[키, 이름, 아이콘, 오른쪽 값 또는 'toggle', 누르면 할 동작(기본 sOpen:키)]]]
const SETTINGS = () => {
  const s = S.set, perm = window.Notification ? { granted: '켜짐', denied: '차단됨', default: '꺼짐' }[Notification.permission] : '미지원';
  return [
    ['지원', [['fb', '의견 보내기 · 문의', 'chat', '', 'fbOpen']]],
    ['내 정보', [['account', '계정 · 동기화', 'cloud', SY.rt ? esc(SY.email || '로그인됨') : '로그인 안 됨'], ['profile', '프로필', 'user', esc(s.nick || `키 ${s.height}cm`)]]],
    ['운동', [
      ['template', '세트 템플릿', 'list', `${s.setN}세트 × ${s.setR}회`],
      ['plates', '가지고 있는 원판', 'disc', `바 ${s.bar}kg`],
      ['dbs', '가지고 있는 덤벨', 'db', s.dbs ? `${s.dbs.split(',').filter(x => num(x) > 0).length}개` : '설정 안 함'],
      ['warmEx', '웜업 세트 볼륨 제외', 'flame', 'toggle'],
      ['rest', '세트별 휴식 시간', 'timer', `${s.rest}초 · 웜업 ${s.restW}초`],
      ['step', '무게 변경 단위', 'step', `${s.stepB} · ${s.stepD} · ${s.stepM}kg`],
      ['autoRoutine', '루틴 세트 자동 업데이트', 'sync', ROUTINE_UPD[s.autoRoutine]],
      ['rpe', 'RPE 입력칸', 'rpe', 'toggle'],
      ['wake', '운동 중 화면 켜두기', 'sun', 'toggle'],
    ]],
    ['휴식 알림', [['sound', '휴식 타이머 알림음', 'bell', 'toggle'], ['vibrate', '휴식 타이머 진동', 'wave', 'toggle'], ['notify', '워치 · 푸시 알림', 'watch', perm]]],
    ['편의', [['rm', '1RM 계산기', 'calc', ''], ['interval', '인터벌 타이머', 'loop', ''], ['plateCalc', '원판 계산기', 'plate', '', 'plateOpen']]],
    ['소셜', [['myProgs', '내가 공유한 프로그램', 'share', '', 'myProgs']]],
    ['기타', [['weekStart', '캘린더 시작 요일', 'cal', s.weekStart ? '월요일' : '일요일'], ['backup', '백업 · 복원', 'box', `운동 ${S.workouts.length}회`]]],
  ];
};
VIEWS.settings = () => `<h1>설정</h1>${SETTINGS().map(([sec, rows]) => `<h2>${sec}</h2><div class="card slist">${rows.map(([k, t, icon, v, act]) =>
  v === 'toggle' ? `<label class="srow"><span class="sic"><svg viewBox="0 0 24 24">${SI[icon]}</svg></span><span class="grow">${t}</span><span class="tg"><input type="checkbox" data-s="${k}" ${S.set[k] ? 'checked' : ''}></span></label>`
    : `<button class="srow" data-a="${act || 'sOpen:' + k}"><span class="sic"><svg viewBox="0 0 24 24">${SI[icon]}</svg></span><span class="grow">${t}</span><span class="muted sval">${v}</span><span class="chev">›</span></button>`).join('')}</div>`).join('')}
  <div class="sfoot">${SY.rt ? '<button class="ghost" data-a="logout">로그아웃</button>' : ''}<button class="ghost danger" data-a="resetAll">전체 초기화</button></div>
  <p class="muted small" style="text-align:center">짐로그 ${APP_VER} · 운동 애니메이션: ExerciseDB · 운동 사진: free-exercise-db (Unlicense) · 근육 지도: react-body-highlighter (MIT, © 2020 GV79)</p>`;

// 설정 시트
const fld = (label, k, o = {}) => `<label class="sw">${label}<input data-s="${k}" value="${esc(S.set[k])}" inputmode="${o.mode || 'decimal'}" placeholder="${o.ph || ''}" style="width:${o.w || 90}px"></label>`;
const sel = (label, k, opts) => `<label class="sw">${label}<select data-s="${k}">${Object.entries(opts).map(([v, t]) => `<option value="${v}" ${String(S.set[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
const SHEETS = {
  account: ['계정 · 동기화', () => syncCard()],
  profile: ['프로필', () => `<div class="card">${fld('닉네임 (프로그램 공유 때 표시)', 'nick', { mode: 'text', w: 130 })}${fld('키 (cm)', 'height')}</div><p class="muted small">키는 BMI·FFMI 계산에, 칼로리는 신체 탭의 최근 체중으로 계산해요.</p>`],
  template: ['세트 템플릿', () => `<div class="card">${fld('기본 세트 수', 'setN', { mode: 'numeric' })}${fld('기본 횟수', 'setR', { mode: 'numeric' })}</div><p class="muted small">처음 하는 운동을 추가할 때 이 세트로 시작해요. 해 본 운동은 지난번 세트를 불러와요.</p>`],
  plates: ['가지고 있는 원판', () => `<div class="card">${fld('바벨 무게 (kg)', 'bar')}${fld('원판 (kg, 쉼표로)', 'plates', { w: 170 })}</div><p class="muted small">원판 계산기와 웜업 세트 계산에 써요.</p>`],
  dbs: ['가지고 있는 덤벨', () => `<div class="card">${fld('덤벨 (kg, 쉼표로)', 'dbs', { w: 170, ph: '2,4,6,8,10,12.5' })}</div><p class="muted small">입력하면 덤벨 운동의 웜업·피라미드·드롭 세트 무게를 가진 덤벨 중 가장 가까운 무게로 맞춰요. 비우면 무게 변경 단위로 반올림해요.</p>`],
  rest: ['세트별 휴식 시간', () => `<div class="card">${fld('본세트 뒤 (초)', 'rest', { mode: 'numeric' })}${fld('웜업 세트 뒤 (초)', 'restW', { mode: 'numeric' })}</div><p class="muted small">운동별 휴식 시간은 운동 카드의 ⋯ 메뉴에서 따로 정할 수 있어요.</p>`],
  step: ['무게 변경 단위', () => `<div class="card">${fld('바벨 · 기타 (kg)', 'stepB')}${fld('덤벨 (kg)', 'stepD')}${fld('머신 · 케이블 (kg)', 'stepM')}</div><p class="muted small">웜업·피라미드·드롭 세트를 자동으로 만들 때 이 단위로 반올림해요.</p>`],
  autoRoutine: ['루틴 세트 자동 업데이트', () => `<div class="card">${sel('운동 끝나면', 'autoRoutine', ROUTINE_UPD)}</div><p class="muted small">운동을 마치면 한 무게·횟수로 루틴의 세트를 바꿔 다음에 그대로 이어서 할 수 있어요.</p>`],
  notify: ['워치 · 푸시 알림', () => `<p class="muted">알림을 켜면 휴식 끝 알림이 폰에 연결된 워치(갤럭시워치·애플워치 등)로도 진동과 함께 가요. 아이폰은 홈 화면에 추가한 앱에서만 알림이 돼요.</p>
    <div class="row"><button data-a="notifyOn">알림 켜기</button><button data-a="testAlarm">5초 뒤 테스트</button></div>`],
  weekStart: ['캘린더 시작 요일', () => `<div class="card">${sel('한 주 시작', 'weekStart', { 1: '월요일', 0: '일요일' })}</div>`],
  backup: ['백업 · 복원', () => `<p class="muted">${SY.rt ? '로그인돼 있어 기록이 서버에 자동 백업돼요. 파일로도 따로 보관할 수 있어요.' : '로그인하지 않으면 기록은 이 기기에만 있어요. 폰 바꾸거나 앱 지우기 전에 내보내세요.'}</p>
    <div class="row"><button data-a="exportData">내보내기</button><button data-a="importData">가져오기</button></div>
    <input type="file" id="importFile" accept=".json,application/json" hidden>
    <p class="muted small">운동 ${S.workouts.length}회 · 루틴 ${S.routines.length}개 · ${f1((localStorage.getItem(KEY) || '').length / 1024)}KB</p>`],
  rm: ['1RM 계산기', m => `<div class="row" style="margin:8px 0"><input inputmode="decimal" placeholder="무게 (kg)" data-in="rmIn" id="rm_w" value="${esc(m.w || '')}"><input inputmode="numeric" placeholder="횟수" data-in="rmIn" id="rm_r" value="${esc(m.r || '')}"></div><div id="rmOut">${rmTable(m)}</div>`],
  interval: ['인터벌 타이머', () => ivHTML()],
};
MODALS.sset = m => { const [t, f] = SHEETS[m.k]; return `<div class="between"><h3>${t}</h3>${closeBtn}</div>${f(m)}`; };

// 1RM 계산기: Epley 공식. 퍼센트별 무게와 그 무게로 가능한 횟수
function rmTable(m) {
  const rm = e1rm(num(m.w), Math.round(num(m.r)));
  if (!rm) return '<p class="muted">들었던 무게와 횟수를 넣으면 추정 1RM과 퍼센트별 무게가 나와요.</p>';
  return `<div class="stat" style="background:var(--card2);margin-bottom:10px"><span class="muted">추정 1RM</span><b>${f1(rm)}kg</b></div>
    <table class="sets"><thead><tr><th>%</th><th>무게</th><th>가능 횟수</th></tr></thead><tbody>${[100, 95, 90, 85, 80, 75, 70, 65, 60, 50].map(p =>
      `<tr><td>${p}%</td><td class="num">${f1(rm * p / 100)}kg</td><td>${p === 100 ? 1 : Math.round(30 * (100 / p - 1))}회</td></tr>`).join('')}</tbody></table>`;
}

// 인터벌 타이머: 운동·휴식 반복. 상태는 IV, 화면은 매 0.25초 갱신
let IV = null, ivT;
const ivHTML = () => IV ? `<div class="ivbox ${IV.phase}"><div class="lbl">${IV.phase === 'work' ? '운동' : '휴식'} · ${IV.round}/${IV.rounds} 라운드</div><div class="big num" id="ivBig">${hms(Math.ceil((IV.end - Date.now()) / 1000))}</div></div>
  <button class="pri wide" data-a="ivStop">정지</button>`
  : `<div class="card">${fld('운동 (초)', 'ivWork', { mode: 'numeric' })}${fld('휴식 (초)', 'ivRest', { mode: 'numeric' })}${fld('라운드', 'ivRounds', { mode: 'numeric' })}</div>
  <button class="pri wide" data-a="ivStart">시작</button><p class="muted small">타바타는 20초 운동 · 10초 휴식 · 8라운드예요. 구간이 바뀔 때 소리와 진동으로 알려요.</p>`;
function ivTick() {
  if (!IV) return;
  if (Date.now() >= IV.end) {
    const rest = num(S.set.ivRest);
    if (IV.phase === 'work' && IV.round >= IV.rounds) { A.ivStop(); navigator.vibrate?.([400, 150, 400]); if (S.set.sound) beep(); return toast('인터벌 끝'); }
    if (IV.phase === 'work' && rest > 0) Object.assign(IV, { phase: 'rest', end: Date.now() + rest * 1000 });
    else Object.assign(IV, { phase: 'work', round: IV.round + 1, end: Date.now() + num(S.set.ivWork) * 1000 });
    navigator.vibrate?.(300); if (S.set.sound) beep();
    if (ui.modal?.k === 'interval') renderModal();
  }
  const el = $('#ivBig'); if (el) el.textContent = hms(Math.ceil((IV.end - Date.now()) / 1000));
}

Object.assign(A, {
  sOpen(k) { ui.modal = { type: 'sset', k }; renderModal(); },
  rmIn() { const m = ui.modal; m.w = $('#rm_w').value; m.r = $('#rm_r').value; $('#rmOut').innerHTML = rmTable(m); },
  ivStart() {
    if (!(num(S.set.ivWork) > 0 && num(S.set.ivRounds) > 0)) return toast('운동 시간과 라운드를 입력하세요');
    unlockAudio(); IV = { phase: 'work', round: 1, rounds: num(S.set.ivRounds), end: Date.now() + num(S.set.ivWork) * 1000 };
    clearInterval(ivT); ivT = setInterval(ivTick, 250); wake(true); renderModal();
  },
  ivStop() { IV = null; clearInterval(ivT); if (ui.view !== 'workout') wake(false); if (ui.modal?.k === 'interval') renderModal(); },
  plateOpen() { ui.modal = { type: 'plate', w: '' }; renderModal(); },
  myProgs() {
    if (!SY.rt) return toast('설정에서 로그인하면 볼 수 있어요');
    ui.modal = { type: 'progs', tab: 'shared', mine: true }; renderModal(); loadShared();
  },
});
