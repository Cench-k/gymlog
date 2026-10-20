'use strict';
// 레벨 · 경험치 · 업적. 저장하지 않고 운동 기록에서 매번 계산 (기기 간 자동 일치, 규칙 바꿔도 소급 적용)

// 운동 1회 경험치: 기본 50 + 세트당 3 + 볼륨 200kg당 1(최대 100) + 3분당 1(최대 30)
const xpOf = w => 50 + 3 * wSets(w) + Math.min(100, Math.round(wVol(w) / 200)) + Math.min(30, Math.round((w.end - w.start) / 180000));
const xpNeed = L => 50 * L * (L - 1); // 레벨 L 시작 경험치: 2레벨 100, 3레벨 300, 4레벨 600 ...
const levelOf = xp => Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2);
const totalXP = ws => sum(ws, xpOf);

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

// 업적: [이름, 설명, 조건]
const BADGES = [
  ['첫걸음', '첫 운동 기록', st => st.n >= 1],
  ['꾸준함 10', '운동 10회', st => st.n >= 10],
  ['꾸준함 50', '운동 50회', st => st.n >= 50],
  ['꾸준함 100', '운동 100회', st => st.n >= 100],
  ['300회 클럽', '운동 300회', st => st.n >= 300],
  ['한 달 개근', '4주 연속 운동', st => st.best >= 4],
  ['석 달 개근', '12주 연속 운동', st => st.best >= 12],
  ['1년 개근', '52주 연속 운동', st => st.best >= 52],
  ['10톤', '총 볼륨 10,000kg', st => st.vol >= 1e4],
  ['100톤', '총 볼륨 100,000kg', st => st.vol >= 1e5],
  ['1000톤', '총 볼륨 1,000,000kg', st => st.vol >= 1e6],
  ['3대 300', '스쿼트·벤치·데드 추정 1RM 합 300kg', st => st.big3 >= 300],
  ['3대 400', '추정 1RM 합 400kg', st => st.big3 >= 400],
  ['3대 500', '추정 1RM 합 500kg', st => st.big3 >= 500],
  ['새벽형 인간', '오전 7시 전에 운동 시작', st => st.dawn],
  ['철인', '한 번에 2시간 넘게 운동', st => st.long],
  ['스트레칭 습관', '스트레칭 10회 기록', st => st.stretch >= 10],
];
function playerStats() {
  const ws = S.workouts, xp = totalXP(ws), L = levelOf(xp), { cur, best } = streaks(ws);
  const st = {
    n: ws.length, xp, L, cur, best, vol: sum(ws, wVol), big3: sum([SQ, B, DL], n => bestOf(n).e1),
    dawn: ws.some(w => new Date(w.start).getHours() < 7), long: ws.some(w => w.end - w.start > 2 * 3600e3),
    stretch: sum(ws, w => w.items.filter(it => ex(it.ex).cat === '스트레칭').length),
  };
  st.badges = BADGES.map(([name, desc, ok]) => ({ name, desc, ok: !!ok(st) }));
  return st;
}
const lvBar = st => { const a = xpNeed(st.L), b = xpNeed(st.L + 1); return Math.round((st.xp - a) / (b - a) * 100); };

function levelCard() {
  const st = playerStats();
  return `<div class="card lvcard" data-a="levelOpen"><div class="between"><div><span class="lvnum num">Lv.${st.L}</span></div>
    <span class="muted small">${st.cur ? `${st.cur}주 연속 · ` : ''}업적 ${st.badges.filter(b => b.ok).length}/${BADGES.length}</span></div>
    <div class="lvbar"><div style="width:${lvBar(st)}%"></div></div>
    <div class="muted small">다음 레벨까지 ${(xpNeed(st.L + 1) - st.xp).toLocaleString('ko-KR')} XP</div></div>`;
}
MODALS.level = () => {
  const st = playerStats();
  return `<div class="between"><h3>Lv.${st.L}</h3>${closeBtn}</div>
    <div class="lvbar" style="margin:12px 0 4px"><div style="width:${lvBar(st)}%"></div></div>
    <div class="muted small">${st.xp.toLocaleString('ko-KR')} / ${xpNeed(st.L + 1).toLocaleString('ko-KR')} XP · 연속 ${st.cur}주 (최고 ${st.best}주)</div>
    <h3 style="margin:18px 0 8px">업적</h3>
    <div class="badges">${st.badges.map(b => `<div class="badge ${b.ok ? 'ok' : ''}"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`).join('')}</div>
    <p class="muted small" style="margin-top:14px">경험치: 운동 1회 50 + 세트당 3 + 볼륨 200kg당 1(최대 100) + 3분당 1(최대 30).</p>`;
};
A.levelOpen = () => { ui.modal = { type: 'level' }; renderModal(); };
