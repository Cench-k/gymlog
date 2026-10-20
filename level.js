'use strict';
// 레벨 · 경험치 · 업적 · 뱃지. 저장하지 않고 운동 기록에서 매번 계산 (기기 간 자동 일치, 규칙 바꿔도 소급 적용)
// 업적 추가: TRACKS(단계형) 또는 SPECIALS(한 번) 에 한 줄. 필요한 수치는 gameStats()에서 계산

// 운동 1회 경험치: 기본 50 + 세트당 3 + 볼륨 200kg당 1(최대 100) + 3분당 1(최대 30). 업적 단계마다 보너스
const xpOf = w => 50 + 3 * wSets(w) + Math.min(100, Math.round(wVol(w) / 200)) + Math.min(30, Math.round((w.end - w.start) / 180000));
const xpNeed = L => 50 * L * (L - 1); // 레벨 L 시작 경험치: 2레벨 100, 3레벨 300, 4레벨 600 ...
const levelOf = xp => Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2);

// 주 단위 연속 기록 (월요일 시작). 이번 주가 비어 있으면 지난주부터 셈
const weekKey = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
function streaks(ws) {
  const weeks = new Set(ws.map(w => weekKey(w.start))), WK = 7 * 864e5;
  let best = 0, run = 0, prev = null;
  for (const k of [...weeks].sort((a, b) => a - b)) { run = prev !== null && Math.round((k - prev) / WK) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  let cur = 0, k = weekKey(Date.now());
  if (!weeks.has(k)) k -= WK;
  while (weeks.has(k)) { cur++; k -= WK; }
  return { cur, best };
}

// ---------- 업적 정의 ----------
const TIERS = [['브론즈', '#C2814F'], ['실버', '#8E99A6'], ['골드', '#E8A800'], ['플래티넘', '#14A6A0'], ['다이아', '#7C5CFF']];
const TIER_XP = [20, 50, 100, 200, 500];
const BI = { // 메달 안 그림 (24 viewBox 선)
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.5 2-4.5.3 1.5 1 2.5 2 2.5 0-3 0-5 1-8z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  db: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  mount: '<path d="M3 19l6-10 4 6 2-3 6 7z"/>',
  layers: '<path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  up: '<path d="M4 18l6-6 4 4 6-8M15 8h5v5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  body: '<circle cx="12" cy="5" r="2"/><path d="M6 9h12M12 9v6M12 15l-3 6M12 15l3 6"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
  leaf: '<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2"/>',
  hour: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S9 9 12 9c3 0 6 1 6-1.5S14 5 12 9"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9 10a4 4 0 0 1 6 0l-3 3z"/>',
  link: '<path d="M8 12h8M6 8H5a4 4 0 0 0 0 8h1M18 8h1a4 4 0 0 1 0 8h-1"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>',
  chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
// [id, 분류, 이름, 그림, 단위, 단계별 기준 5개, 설명]
const TRACKS = [
  ['n', '꾸준함', '운동 횟수', 'flame', '회', [10, 50, 100, 300, 1000], '운동을 기록한 횟수'],
  ['week', '꾸준함', '주간 연속', 'chain', '주', [2, 4, 12, 26, 52], '매주 한 번 이상 운동한 최장 연속 주'],
  ['day', '꾸준함', '매일 운동', 'cal', '일', [2, 3, 5, 7, 14], '하루도 안 쉬고 운동한 최장 연속 일'],
  ['month', '꾸준함', '한 달 출석', 'grid', '회', [8, 12, 16, 20, 25], '한 달에 운동한 최다 횟수'],
  ['vol', '볼륨', '누적 볼륨', 'mount', 'kg', [1e4, 1e5, 5e5, 1e6, 5e6], '들어 올린 무게 × 횟수의 합'],
  ['maxVol', '볼륨', '하루 볼륨', 'bolt', 'kg', [3000, 5000, 10000, 15000, 25000], '한 번 운동의 최대 볼륨'],
  ['sets', '볼륨', '누적 세트', 'layers', '세트', [100, 500, 1000, 5000, 10000], '완료한 세트 수'],
  ['hours', '볼륨', '누적 운동 시간', 'clock', '시간', [10, 50, 100, 300, 1000], '운동한 시간의 합'],
  ['bench', '근력', '벤치프레스', 'db', 'kg', [60, 80, 100, 120, 140], '바벨 벤치프레스 추정 1RM'],
  ['squat', '근력', '스쿼트', 'db', 'kg', [80, 100, 140, 180, 220], '바벨 백 스쿼트 추정 1RM'],
  ['dead', '근력', '데드리프트', 'db', 'kg', [100, 140, 180, 220, 260], '데드리프트 추정 1RM'],
  ['ohp', '근력', '오버헤드 프레스', 'db', 'kg', [40, 50, 60, 80, 100], '오버헤드 프레스 추정 1RM'],
  ['big3', '근력', '3대 합계', 'trophy', 'kg', [200, 300, 400, 500, 600], '스쿼트·벤치·데드 추정 1RM 합'],
  ['pullup', '근력', '풀업', 'body', '회', [5, 10, 15, 20, 30], '풀업 한 세트 최다 횟수'],
  ['pushup', '근력', '푸시업', 'body', '회', [20, 30, 50, 70, 100], '푸시업 한 세트 최다 횟수'],
  ['prs', '성장', '신기록', 'up', '번', [5, 20, 50, 100, 300], '운동별 추정 1RM을 경신한 횟수'],
  ['kinds', '성장', '운동 수집가', 'star', '종', [10, 25, 50, 80, 120], '해 본 운동 종류'],
  ['p가슴', '부위', '가슴', 'body', '세트', [50, 200, 500, 1000, 2000], '가슴 운동 누적 세트'],
  ['p등', '부위', '등', 'body', '세트', [50, 200, 500, 1000, 2000], '등 운동 누적 세트'],
  ['p어깨', '부위', '어깨', 'body', '세트', [50, 200, 500, 1000, 2000], '어깨 운동 누적 세트'],
  ['p하체', '부위', '하체', 'body', '세트', [50, 200, 500, 1000, 2000], '하체 운동 누적 세트'],
  ['p팔', '부위', '팔', 'body', '세트', [50, 200, 500, 1000, 2000], '팔 운동 누적 세트'],
  ['p복근', '부위', '복근', 'body', '세트', [30, 100, 300, 600, 1200], '복근 운동 누적 세트'],
  ['km', '부위', '유산소 거리', 'route', 'km', [10, 50, 100, 300, 1000], '유산소 누적 거리'],
  ['stretch', '부위', '스트레칭', 'leaf', '회', [5, 20, 50, 100, 300], '스트레칭 운동 기록 수'],
  ['dawn', '생활', '새벽형 인간', 'sun', '회', [1, 5, 20, 50, 100], '오전 7시 전에 시작한 운동'],
  ['night', '생활', '올빼미', 'moon', '회', [1, 5, 20, 50, 100], '밤 10시 이후 시작한 운동'],
  ['weekend', '생활', '주말 전사', 'sofa', '회', [5, 20, 50, 100, 200], '토·일요일 운동'],
  ['long', '생활', '철인', 'hour', '회', [1, 5, 20, 50, 100], '90분 넘게 한 운동'],
  ['lunch', '생활', '점심 운동', 'sun', '회', [1, 5, 20, 50, 100], '오전 11시~오후 2시에 시작한 운동'],
  ...[...'월화수목금토일'].map((d, k) => [`dow${(k + 1) % 7}`, '생활', `${d}요일 운동`, 'cal', '회', [5, 20, 50, 100, 200], `${d}요일에 한 운동`]),
  ['year', '꾸준함', '올해 운동 일수', 'cal', '일', [30, 60, 100, 150, 200], '올해 운동한 날 수'],
  ['benchBW', '근력', '체중 대비 벤치', 'db', '배', [0.5, 0.75, 1, 1.25, 1.5], '벤치 추정 1RM ÷ 체중'],
  ['squatBW', '근력', '체중 대비 스쿼트', 'db', '배', [0.75, 1, 1.5, 1.75, 2], '스쿼트 추정 1RM ÷ 체중'],
  ['deadBW', '근력', '체중 대비 데드', 'db', '배', [1, 1.25, 1.75, 2, 2.5], '데드리프트 추정 1RM ÷ 체중'],
  ['drops', '성장', '드롭 세트', 'drop', '세트', [10, 50, 100, 300, 1000], '기록한 드롭 세트'],
  ['warms', '성장', '웜업 세트', 'flame', '세트', [20, 100, 300, 1000, 3000], '기록한 웜업 세트'],
  ['ssN', '성장', '슈퍼세트', 'link', '번', [5, 20, 50, 100, 300], '슈퍼세트로 한 운동'],
  ['memos', '성장', '메모', 'pen', '개', [5, 20, 50, 100, 300], '운동에 남긴 메모'],
  ['routines', '성장', '루틴', 'list', '개', [1, 3, 5, 10, 20], '만든 루틴'],
  ['cardioH', '부위', '유산소 시간', 'route', '시간', [5, 20, 50, 100, 300], '유산소 누적 시간'],
  ['bodyN', '몸', '신체 기록', 'scale', '회', [5, 20, 50, 100, 200], '체중·근육·체지방 기록 수'],
  ['fatDown', '몸', '체지방 감량', 'drop', '%p', [1, 2, 3, 5, 8], '처음 기록보다 줄어든 체지방률'],
  ['muscleUp', '몸', '근육량 증가', 'body', 'kg', [0.5, 1, 2, 3, 5], '처음 기록보다 늘어난 골격근량'],
  ['weightMove', '몸', '체중 관리', 'scale', 'kg', [1, 2, 3, 5, 10], '처음 기록에서 변한 체중 (증량·감량 모두)'],
];
// 운동 하나하나 숙련도 (해 본 횟수). 운동 목록에서 자동 생성, 경험치는 작게
const EX_TH = [5, 20, 50, 100, 200], EX_XP = [5, 10, 20, 40, 80];
const exIcon = n => ({ 유산소: 'route', 스트레칭: 'leaf', 맨몸: 'body', 역도: 'bolt' }[ex(n).cat] || 'db');
// [id, 이름, 그림, 설명, 조건, 숨김] 숨김 업적은 달성 전엔 이름이 ??? 로 보임
const SPECIALS = [
  ['first', '첫걸음', 'star', '첫 운동 기록', st => st.n >= 1],
  ['club100', '100kg 클럽', 'trophy', '한 세트에 100kg 이상', st => st.maxW >= 100],
  ['ss', '슈퍼세트', 'link', '슈퍼세트로 운동', st => st.ss],
  ['drop', '드롭 마스터', 'drop', '드롭 세트 기록', st => st.dropSet],
  ['warm', '부상 방지', 'flame', '웜업 세트 기록', st => st.warmSet],
  ['rpe', '자기 객관화', 'up', 'RPE 기록', st => st.rpe],
  ['memo', '기록광', 'pen', '메모 10개 남기기', st => st.memos >= 10],
  ['routine', '루틴 설계자', 'list', '루틴 3개 만들기', st => S.routines.length >= 3],
  ['body', '몸 관리', 'scale', '신체 기록 10회', st => S.body.length >= 10],
  ['full', '풀코스', 'grid', '한 번에 운동 10종목 이상', st => st.maxItems >= 10, 1],
  ['twice', '하루 두 탕', 'bolt', '하루에 두 번 운동', st => st.twice, 1],
  ['newyear', '새해 첫 땀', 'gift', '1월 1일에 운동', st => st.newyear, 1],
  ['xmas', '메리 크리스마스', 'gift', '12월 25일에 운동', st => st.xmas, 1],
  ['midnight', '자정의 철인', 'moon', '자정을 넘겨 운동', st => st.midnight, 1],
  ['benchBW1', '체중 벤치', 'db', '체중만큼 벤치프레스 (추정 1RM)', st => st.benchBW >= 1],
  ['deadBW2', '체중 두 배 데드', 'db', '체중 두 배 데드리프트 (추정 1RM)', st => st.deadBW >= 2],
  ['double', '두 배 성장', 'up', '한 운동의 추정 1RM이 처음의 두 배', st => st.double],
  ['allParts', '전신 정복', 'body', '하루에 가슴·등·어깨·하체·팔·복근 모두', st => st.allParts],
  ['allCats', '팔방미인', 'grid', '근력·맨몸·유산소·스트레칭·역도 모두 해 보기', st => st.cats >= 5],
  ['olympic', '역도인', 'bolt', '역도 종목 기록', st => st.olympic],
  ['pr5', '신기록 축제', 'trophy', '하루에 신기록 5개', st => st.prDay >= 5],
  ['cardio10', '땀범벅', 'route', '하루에 유산소 10km', st => st.kmDay >= 10],
  ['rpe10', '한계 돌파', 'flame', 'RPE 10 세트 기록', st => st.rpe10],
  ['regular', '단골 루틴', 'list', '같은 이름 운동 10번', st => st.sameName >= 10],
  ['fav10', '최애 운동', 'star', '즐겨찾기 10개', () => S.set.fav.length >= 10],
  ['custom', '창작자', 'pen', '직접 운동 만들기', () => S.custom.length >= 1],
  ['backup', '유비무환', 'box', '기록 백업 내보내기', () => !!S.set.didBackup],
  ['feedback', '개발 기여자', 'chat', '의견 보내기', () => !!S.set.didFeedback],
  ['avatar', '내 얼굴', 'user', '프로필 사진이나 뱃지 걸기', () => !!S.set.avatar],
  ['heavy200', '200kg 클럽', 'trophy', '한 세트에 200kg 이상', st => st.maxW >= 200],
  ['marathon', '마라톤 세션', 'hour', '한 번에 4시간 넘게 운동', st => st.marathon, 1],
  ['dawn5', '새벽 5시', 'sun', '새벽 5시 전에 운동 시작', st => st.dawn5, 1],
  ['valentine', '발렌타인 펌핑', 'gift', '2월 14일에 운동', st => st.valentine, 1],
  ['fri13', '13일의 금요일', 'moon', '13일의 금요일에 운동', st => st.fri13, 1],
  ['allYear', '한 해 개근', 'cal', '올해 열두 달 모두 운동', st => st.allMonths, 1],
];

// ---------- 계산 ----------
function gameStats() {
  const ws = [...S.workouts].sort((a, b) => a.start - b.start), DAY = 864e5, yr = String(new Date().getFullYear());
  const st = { n: ws.length, vol: 0, maxVol: 0, sets: 0, hours: 0, prs: 0, km: 0, stretch: 0, dawn: 0, night: 0, weekend: 0, long: 0, lunch: 0, maxW: 0, memos: 0, maxItems: 0,
    pullup: 0, pushup: 0, drops: 0, warms: 0, ssN: 0, cardioH: 0, routines: S.routines.length, bodyN: S.body.length };
  const best = {}, first = {}, kinds = new Set(), months = {}, days = new Set(), yearDays = new Set(), names = {}, exN = {}, cats = new Set(), dayPR = {}, dayKm = {};
  for (let k = 0; k < 7; k++) st['dow' + k] = 0;
  for (const w of ws) {
    const d = new Date(w.start), h = d.getHours(), v = wVol(w), dk = ymd(w.start), parts = new Set();
    st.vol += v; st.maxVol = Math.max(st.maxVol, v); st.sets += wSets(w); st.hours += (w.end - w.start) / 3600e3;
    st.dawn += h < 7; st.night += h >= 22; st.lunch += h >= 11 && h < 14; st.weekend += d.getDay() % 6 === 0; st.long += w.end - w.start > 90 * 6e4; st['dow' + d.getDay()]++;
    st.maxItems = Math.max(st.maxItems, w.items.length);
    if (days.has(dk)) st.twice = true;
    days.add(dk); if (dk.startsWith(yr)) yearDays.add(dk);
    months[dk.slice(0, 7)] = (months[dk.slice(0, 7)] || 0) + 1;
    names[w.name] = (names[w.name] || 0) + 1;
    if (dk.endsWith('-01-01')) st.newyear = true;
    if (dk.endsWith('-12-25')) st.xmas = true;
    if (dk.endsWith('-02-14')) st.valentine = true;
    if (d.getDate() === 13 && d.getDay() === 5) st.fri13 = true;
    if (h < 5) st.dawn5 = true;
    if (w.end - w.start > 4 * 3600e3) st.marathon = true;
    if (ymd(w.end) !== dk && w.end - w.start < 6 * 3600e3) st.midnight = true;
    for (const it of w.items) {
      const e = ex(it.ex), cs = it.sets.filter(counts), s = sessStats(it.sets, e);
      kinds.add(it.ex); exN[it.ex] = (exN[it.ex] || 0) + 1; cats.add(e.cat); parts.add(e.part);
      st['p' + e.part] = (st['p' + e.part] || 0) + cs.length;
      if (e.type === 'c') { const km = sum(cs, x => num(x.w)); st.km += km; dayKm[dk] = (dayKm[dk] || 0) + km; st.cardioH += sum(cs, x => num(x.r)) / 60; }
      if (e.cat === '스트레칭') st.stretch++;
      if (e.cat === '역도') st.olympic = true;
      if (it.memo) st.memos++;
      if (it.ss) { st.ss = true; st.ssN++; }
      st.drops += it.sets.filter(x => x.type === 'D').length; st.warms += it.sets.filter(x => x.type === 'W').length;
      if (it.sets.some(x => x.rpe)) st.rpe = true;
      if (it.sets.some(x => num(x.rpe) >= 10)) st.rpe10 = true;
      if (e.type === 'w') st.maxW = Math.max(st.maxW, ...cs.map(x => num(x.w)));
      if (it.ex === '풀업') st.pullup = Math.max(st.pullup, s.r);
      if (it.ex === '푸시업') st.pushup = Math.max(st.pushup, s.r);
      if (s.e1 && !first[it.ex]) first[it.ex] = s.e1;
      if (s.e1 && s.e1 >= first[it.ex] * 2) st.double = true;
      if (s.e1 > (best[it.ex] || 0)) { if (best[it.ex]) { st.prs++; dayPR[dk] = (dayPR[dk] || 0) + 1; } best[it.ex] = s.e1; }
    }
    if (['가슴', '등', '어깨', '하체', '팔', '복근'].every(p => parts.has(p))) st.allParts = true;
  }
  // 매일 연속 최장
  let run = 0, prev = 0;
  for (const dk of [...days].sort()) { const t = Date.parse(dk); run = t - prev === DAY ? run + 1 : 1; st.day = Math.max(st.day || 0, run); prev = t; }
  st.day ||= 0;
  const { cur, best: bw } = streaks(ws), mx = o => Math.max(0, ...Object.values(o));
  Object.assign(st, { cur, week: bw, month: mx(months), kinds: kinds.size, hours: Math.floor(st.hours), cardioH: Math.floor(st.cardioH),
    year: yearDays.size, exN, cats: cats.size, sameName: mx(names), prDay: mx(dayPR), kmDay: mx(dayKm),
    allMonths: Object.keys(months).filter(m => m.startsWith(yr)).length >= 12,
    bench: best[B] || 0, squat: best[SQ] || 0, dead: best[DL] || 0, ohp: best[OHP] || 0 });
  st.big3 = st.bench + st.squat + st.dead;
  // 신체 기록: 처음과 마지막 비교 (S.body는 최신순)
  const old = [...S.body].reverse(), fv = k => num(old.find(x => num(x[k]))?.[k]), lv = k => num(S.body.find(x => num(x[k]))?.[k]);
  st.fatDown = Math.max(0, fv('f') - lv('f')); st.muscleUp = Math.max(0, lv('m') - fv('m')); st.weightMove = Math.abs(lv('w') - fv('w'));
  const bwt = lv('w');
  for (const [k, l] of [['benchBW', 'bench'], ['squatBW', 'squat'], ['deadBW', 'dead']]) st[k] = bwt ? Math.round(st[l] / bwt * 100) / 100 : 0;
  return st;
}
// 업적 상태 + 레벨. earned: 달성한 업적 id 모음 (단계형은 "id:단계")
function playerStats() {
  const st = gameStats(), earned = new Set();
  st.tracks = TRACKS.map(([id, cat, name, icon, unit, th, desc]) => {
    const v = st[id] || 0, tier = th.filter(t => v >= t).length;
    for (let k = 1; k <= tier; k++) earned.add(`${id}:${k}`);
    return { id, cat, name, icon, unit, th, desc, v, tier };
  });
  st.exTracks = Object.keys(EX).map(n => {
    const v = st.exN[n] || 0, tier = EX_TH.filter(t => v >= t).length, id = 'x_' + n;
    for (let k = 1; k <= tier; k++) earned.add(`${id}:${k}`);
    return { id, cat: '운동별', name: n, icon: exIcon(n), unit: '회', th: EX_TH, desc: '해 본 횟수', v, tier };
  });
  st.specials = SPECIALS.map(([id, name, icon, desc, ok, hidden]) => { const got = !!ok(st); if (got) earned.add(id); return { id, name, icon, desc, got, hidden }; });
  st.earned = earned;
  st.badgeXP = sum(st.tracks, t => sum(TIER_XP.slice(0, t.tier), x => x)) + sum(st.exTracks, t => sum(EX_XP.slice(0, t.tier), x => x)) + 50 * st.specials.filter(s => s.got).length;
  st.xp = sum(S.workouts, xpOf) + st.badgeXP; st.L = levelOf(st.xp);
  st.total = (TRACKS.length + st.exTracks.length) * 5 + SPECIALS.length;
  return st;
}
const lvBar = st => { const a = xpNeed(st.L), b = xpNeed(st.L + 1); return Math.round((st.xp - a) / (b - a) * 100); };

// ---------- 그리기 ----------
// 메달: 단계 색 테두리 + 그림. 못 딴 건 회색
const medal = (icon, tier, cls = '') => `<span class="medal ${tier ? '' : 'off'} ${cls}" style="--mc:${tier ? TIERS[tier - 1][1] : '#C9C3BC'}"><svg viewBox="0 0 24 24">${BI[icon] || BI.star}</svg>${tier ? `<i>${'★'.repeat(Math.min(tier, 5))}</i>` : ''}</span>`;
const fmtV = (v, u) => u === 'kg' && v >= 1e4 ? `${f1(v / 1000)}톤` : `${f1(v)}${u}`;
// 업적 id → 표시용 {이름, 그림, 단계}. 단계형은 "id:단계", 운동별은 "x_운동이름:단계"
function badgeInfo(id) {
  const i = String(id).lastIndexOf(':'), tid = i > 0 ? id.slice(0, i) : id, k = i > 0 ? +id.slice(i + 1) : 0;
  if (k >= 1 && k <= 5) {
    if (tid.startsWith('x_') && EX[tid.slice(2)]) return { name: `${tid.slice(2)} ${TIERS[k - 1][0]}`, icon: exIcon(tid.slice(2)), tier: k };
    const t = TRACKS.find(x => x[0] === tid);
    if (t) return { name: `${t[2]} ${TIERS[k - 1][0]}`, icon: t[3], tier: k };
  }
  const s = SPECIALS.find(x => x[0] === id);
  return s ? { name: s[1], icon: s[2], tier: 3 } : null;
}

// 프로필 사진: 사진 > 대표 뱃지 > 닉네임 첫 글자 (S.set.avatar = 'photo' | 'badge' | '')
function avatar(cls = '') {
  const b = S.set.badge && badgeInfo(S.set.badge);
  if (S.set.avatar === 'photo' && S.set.photo?.startsWith('data:image/')) return `<img class="avatar ${cls}" src="${S.set.photo}" alt="프로필 사진">`;
  if (S.set.avatar === 'badge' && b) return `<span class="avatar ${cls}">${medal(b.icon, b.tier)}</span>`;
  return `<span class="avatar ph ${cls}">${esc((S.set.nick || '나')[0])}</span>`;
}

function levelCard() {
  const st = playerStats();
  return `<div class="card lvcard" data-a="levelOpen"><div class="between"><span class="lvnum num">Lv.${st.L}</span>
    <span class="muted small">${st.cur ? `${st.cur}주 연속 · ` : ''}업적 ${st.earned.size.toLocaleString('ko-KR')}개</span></div>
    <div class="lvbar"><div style="width:${lvBar(st)}%"></div></div>
    <div class="muted small">다음 레벨까지 ${(xpNeed(st.L + 1) - st.xp).toLocaleString('ko-KR')} XP</div></div>`;
}
const BCATS = ['전체', '꾸준함', '볼륨', '근력', '성장', '부위', '몸', '생활', '운동별', '특별'];
const trackHTML = t => {
  const next = t.th[t.tier], prevT = t.tier ? t.th[t.tier - 1] : 0, pct = next ? Math.min(100, Math.round((t.v - prevT) / (next - prevT) * 100)) : 100;
  return `<div class="track" data-a="bpick:${t.tier ? encodeURIComponent(`${t.id}:${t.tier}`) : ''}">${medal(t.icon, t.tier)}<div class="grow"><div class="between"><b>${esc(t.name)}</b><span class="tier" style="color:${t.tier ? TIERS[t.tier - 1][1] : 'var(--muted)'}">${t.tier ? TIERS[t.tier - 1][0] : '도전 전'}</span></div>
    <div class="muted small">${esc(t.desc)}</div><div class="tbar"><div style="width:${pct}%;background:${TIERS[Math.min(t.tier, 4)][1]}"></div></div>
    <div class="muted small">${next ? `${fmtV(t.v, t.unit)} / ${fmtV(next, t.unit)} → ${TIERS[t.tier][0]}` : `${fmtV(t.v, t.unit)} · 최고 단계 달성`}</div></div></div>`;
};
MODALS.level = m => {
  const st = playerStats(), cat = m.cat || '전체';
  const started = st.exTracks.filter(t => t.v).sort((a, b) => b.v - a.v);
  const tracks = cat === '운동별' ? started : st.tracks.filter(t => cat === '전체' || t.cat === cat);
  const specials = cat === '전체' || cat === '특별' ? st.specials : [];
  return `<div class="between"><h3>Lv.${st.L} · 업적 ${st.earned.size.toLocaleString('ko-KR')} / ${st.total.toLocaleString('ko-KR')}</h3>${closeBtn}</div>
    <div class="lvbar" style="margin:12px 0 4px"><div style="width:${lvBar(st)}%"></div></div>
    <div class="muted small">${st.xp.toLocaleString('ko-KR')} / ${xpNeed(st.L + 1).toLocaleString('ko-KR')} XP · 업적 보너스 ${st.badgeXP.toLocaleString('ko-KR')} XP · 연속 ${st.cur}주</div>
    <div class="chips" style="margin:14px 0 10px">${BCATS.map(c => `<button class="chip ${cat === c ? 'on' : ''}" data-a="bcat:${c}">${c}</button>`).join('')}</div>
    ${cat === '운동별' ? `<p class="muted">운동 ${st.exTracks.length}종마다 5단계 (5·20·50·100·200회). 지금 ${started.length}종 도전 중</p>${started.length ? '' : '<p class="muted">운동을 기록하면 여기 쌓여요.</p>'}` : ''}
    ${tracks.length ? `<div class="tracks">${tracks.map(trackHTML).join('')}</div>` : ''}
    ${specials.length ? `<h3 style="margin:18px 0 10px">특별 업적</h3><div class="specials">${specials.map(s => `<div class="special ${s.got ? '' : 'off'}" data-a="bpick:${s.got ? s.id : ''}">${medal(s.got || !s.hidden ? s.icon : 'lock', s.got ? 3 : 0)}<b>${s.got || !s.hidden ? esc(s.name) : '???'}</b><span>${s.got || !s.hidden ? esc(s.desc) : '숨겨진 업적'}</span></div>`).join('')}</div>` : ''}
    <p class="muted small" style="margin-top:16px">딴 메달을 누르면 프로필 사진으로 걸려요. 업적 보너스: 브론즈 20 · 실버 50 · 골드 100 · 플래티넘 200 · 다이아 500 · 특별 50 XP (운동별은 5~80 XP)</p>`;
};
Object.assign(A, {
  levelOpen() { ui.modal = { type: 'level' }; renderModal(); },
  bcat(c) { ui.modal.cat = c; renderModal(); },
  bpick(...a) {
    const id = decodeURIComponent(a.join(':'));
    if (!id) return toast('아직 못 딴 업적이에요');
    S.set.badge = id; S.set.avatar = 'badge'; save(); profSync(); toast(`프로필 뱃지: ${badgeInfo(id).name}`); render();
  },
});
// 운동 끝낼 때 새로 딴 업적 (ui.js finish에서 전후 비교)
const newBadges = (before, after) => [...after.earned].filter(id => !before.earned.has(id)).map(badgeInfo).filter(Boolean);
const newBadgeHTML = list => list.length ? `<div class="newb"><b>새 업적 ${list.length}개!</b><div class="newbl">${list.slice(0, 8).map(b => `<div>${medal(b.icon, b.tier, 'sm')}<span>${esc(b.name)}</span></div>`).join('')}${list.length > 8 ? `<div><span>외 ${list.length - 8}개</span></div>` : ''}</div></div>` : '';
