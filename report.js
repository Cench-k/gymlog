'use strict';
// 운동 결과 화면: 요약 · 상세 · 월간 리포트 카드. 카드는 HTML로 그리고 html-to-image로 PNG 만들어 공유

// ---------- 계산 ----------
const bodyW = () => num(S.body.find(b => num(b.w))?.w) || 70;
// ponytail: 칼로리 = MET 6 고정 × 체중 × 시간. 운동 종류별 MET가 필요하면 EX에 met 추가
const kcalOf = w => Math.round(6 * bodyW() * Math.max(0, w.end - w.start) / 3600000);
const prevSame = w => S.workouts.find(x => x.start < w.start && x.name === w.name); // S.workouts는 최신순
// 운동 하나의 합계: 무게 운동은 볼륨, 맨몸은 횟수, 시간은 초, 유산소는 km
function exTotal(e, sets) {
  const ss = sets.filter(counts);
  if (e.type === 'w') return { v: sum(ss, s => num(s.w) * num(s.r)), u: 'kg' };
  if (e.type === 'b') return { v: sum(ss, s => num(s.r)), u: '회' };
  if (e.type === 't') return { v: sum(ss, s => num(s.r)), u: '초' };
  return { v: sum(ss, s => num(s.w)), u: 'km' };
}
function workedMuscles(items) {
  const p = new Set(), s = new Set();
  for (const it of items) { const m = exMedia(it.ex); m.p.forEach(x => p.add(x)); m.s.forEach(x => s.add(x)); }
  return [[...p], [...s].filter(x => !p.has(x))];
}
function monthStats(y, m) {
  const a = new Date(y, m, 1).getTime(), b = new Date(y, m + 1, 1).getTime();
  const ws = S.workouts.filter(w => w.start >= a && w.start < b).reverse(); // 오래된 순
  return { ws, a, days: new Date(y, m + 1, 0).getDate(), time: sum(ws, w => w.end - w.start), vol: sum(ws, wVol), sets: sum(ws, wSets), kcal: sum(ws, kcalOf) };
}

// ---------- 그리기 ----------
const IC = {
  time: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.5"/>',
  sets: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  kcal: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.5 2-4.5.3 1.5 1 2.5 2 2.5 0-3 0-5 1-8z"/>',
  vol: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
};
const ic = k => `<svg class="ic" viewBox="0 0 24 24">${IC[k]}</svg>`;
// 카드 이미지에 넣을 정지 사진 (애니메이션 서버는 CORS가 없어 이미지로 못 뽑음)
const still = n => { const m = exMedia(n); return m.img ? `<img class="thumb" src="${m.img}0.jpg" alt="" crossorigin="anonymous">` : `<span class="thumb ph">${esc(ex(n).part[0])}</span>`; };
const delta = (v, u = '') => v ? `<span class="${v > 0 ? 'up' : 'down'}">(${v > 0 ? '+' : '-'}${f1(Math.abs(v))}${u})</span>` : '';
const setChip = (e, s) => `<span class="schip t-${s.type}">${e.type === 'w' ? `${f1(num(s.w))}×${num(s.r)}` : e.type === 'b' ? (num(s.w) ? `+${f1(num(s.w))}×${num(s.r)}` : num(s.r)) : e.type === 't' ? `${num(s.r)}초` : `${f1(num(s.w))}km`}</span>`;
const stamp = ts => { const d = new Date(ts); return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const brand = '<div class="rbrand">짐로그</div>';

function sumCard(w) {
  const [p, s] = workedMuscles(w.items), pv = prevSame(w), vol = wVol(w);
  return `<div class="rcard" id="rcard">
    <div class="rhead"><div class="grow"><div class="rdate">${stamp(w.start)}</div><div class="rname">${esc(w.name)}</div>
      <div class="rchips"><span>${ic('time')}${dur(w.end - w.start)}</span><span>${ic('sets')}${wSets(w)}세트</span><span>${ic('kcal')}${kcalOf(w)} kcal</span>${vol ? `<span>${ic('vol')}${f1(vol)}kg ${pv ? delta(vol - wVol(pv)) : ''}</span>` : ''}</div></div>
      ${bodyMap(p, s)}</div>
    <div class="rgrid">${w.items.map(it => {
      const e = ex(it.ex), t = exTotal(e, it.sets), before = prevSets(it.ex, { start: w.start }), bt = before && exTotal(e, before);
      const arrow = bt && t.v !== bt.v ? `<span class="${t.v > bt.v ? 'up' : 'down'}">${t.v > bt.v ? '↑' : '↓'}</span> ` : '';
      return `<div class="rex"><div class="exhead">${still(it.ex)}<div><b>${esc(it.ex)}</b><div class="muted">${arrow}${f1(t.v)}${t.u}</div></div></div><div class="schips">${it.sets.map(s => setChip(e, s)).join('')}</div></div>`;
    }).join('')}</div>${brand}</div>`;
}
function detailCard(w) {
  return `<div class="rcard" id="rcard"><div class="rdate">${stamp(w.start)}</div><div class="rname" style="margin-bottom:6px">${esc(w.name)}</div>
    ${w.items.map(it => {
      const e = ex(it.ex), t = exTotal(e, it.sets), before = prevSets(it.ex, { start: w.start }), bt = before ? exTotal(e, before).v : 0;
      const heavy = e.type === 'w' || e.type === 'b', b0 = bestOf(it.ex, w.start), cur = sessStats(it.sets, e);
      const pr = heavy && cur.e1 ? `PR ${f1(cur.e1)}kg ${b0.n ? delta(cur.e1 - b0.e1, 'kg') : ''}` : e.type === 't' || e.type === 'b' ? `최고 ${cur.r}${COLS[e.type][1]} ${b0.n ? delta(cur.r - b0.r) : ''}` : '';
      return `<div class="rdet"><div class="exhead">${still(it.ex)}<div><b>${esc(it.ex)}</b><div class="small"><b class="up">${f1(t.v)}${t.u} ${bt ? delta(t.v - bt) : ''}</b>${pr ? ` · <span class="muted">${pr}</span>` : ''}</div></div></div>
        <ol class="rsets">${it.sets.map(s => `<li>${setChip(e, s)}${s.rpe ? `<span class="muted small"> RPE ${s.rpe}</span>` : ''}</li>`).join('')}</ol></div>`;
    }).join('')}${brand}</div>`;
}
const TOD = [[6, '새벽'], [10, '아침'], [14, '점심'], [18, '오후'], [22, '저녁'], [24, '밤']];
function monthCard(y, m) {
  const c = monthStats(y, m), pv = monthStats(y, m - 1), n = c.ws.length;
  // 요일별(월 시작), 날짜별, 시간대별, 운동별, 부위별 집계
  const dow = Array(7).fill(0), days = new Set(), tod = {}, exN = {}, partN = {};
  for (const w of c.ws) {
    const d = new Date(w.start); dow[dayOff(d)]++; days.add(d.getDate());
    const t = TOD.find(([h]) => d.getHours() < h)[1]; tod[t] = (tod[t] || 0) + 1;
    for (const it of w.items) { exN[it.ex] = (exN[it.ex] || 0) + 1; const pt = ex(it.ex).part; partN[pt] = (partN[pt] || 0) + it.sets.filter(counts).length; }
  }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topEx = top(exN), topPart = top(partN), topTod = top(tod), first = dayOff(new Date(y, m, 1));
  // 누적 볼륨 선: 이번 달 vs 지난 달
  const cum = st => { let t = 0; return Array.from({ length: 31 }, (_, k) => { t += sum(st.ws.filter(w => new Date(w.start).getDate() === k + 1), wVol); return t; }).slice(0, st.days); };
  const a = cum(c), b = cum(pv), mx = Math.max(1, ...a, ...b), today = new Date();
  const lastDay = y === today.getFullYear() && m === today.getMonth() ? today.getDate() : c.days;
  const line = (arr, k) => `<polyline class="${k}" points="${arr.slice(0, k === 'cur' ? lastDay : arr.length).map((v, i) => `${i / 30 * 200},${78 - v / mx * 70}`).join(' ')}"/>`;
  const hm = ms => { const mm = Math.round(ms / 60000); return `${Math.floor(mm / 60)}<small>시간</small> ${mm % 60}<small>분</small>`; };
  return `<div class="rcard month" id="rcard"><div class="mgrid">
    <div class="t" style="grid-area:title"><div class="lbl">${y}</div><b class="big2">${m + 1}월</b><div class="lbl">리포트</div></div>
    <div class="t" style="grid-area:time"><div class="lbl">총 운동 시간</div><b class="num big2">${hm(c.time)}</b></div>
    <div class="t" style="grid-area:heat"><div class="heat">${'<i></i>'.repeat(first)}${Array.from({ length: c.days }, (_, k) => `<i class="${days.has(k + 1) ? 'on' : 'off'}"></i>`).join('')}</div>
      <div class="cnt"><div class="lbl">총 운동 횟수</div><b class="num">${n}</b></div></div>
    <div class="t" style="grid-area:dow"><div class="lbl">요일별 운동 횟수</div><div class="dow">${weekDays().map((wd, k) => `<div><b>${DOW[wd]}</b><span>${'●'.repeat(Math.min(dow[k], 5))}${'·'.repeat(Math.max(0, 5 - dow[k]))}</span></div>`).join('')}</div></div>
    <div class="t" style="grid-area:tex"><div class="lbl">제일 많이 한 운동</div>${topEx ? `${still(topEx)}<div class="small">${esc(topEx)}</div>` : '<div class="lbl">-</div>'}</div>
    <div class="t" style="grid-area:tpart"><div class="lbl">제일 많이 한 부위</div>${topPart ? `${bodyMap((PART_MUSCLE[topPart] || PART_MUSCLE.기타)[0].split(',').filter(Boolean), [])}<div class="small">${esc(topPart)}</div>` : '<div class="lbl">-</div>'}</div>
    <div class="t" style="grid-area:vol"><div class="lbl">총 볼륨</div><b class="num big2">${f1(c.vol)}<small>kg</small></b><div class="small">${pv.vol ? delta(c.vol - pv.vol, 'kg') : ''}</div>
      <svg class="cum" viewBox="0 0 200 80" preserveAspectRatio="none">${line(b, 'prev')}${line(a, 'cur')}</svg><div class="lbl" style="text-align:right">실선 ${m + 1}월 · 점선 ${(m + 11) % 12 + 1}월</div></div>
    <div class="t" style="grid-area:tod">${topTod ? `<div class="tod">주로<br><b>${topTod}</b>에<br>운동했어요</div>` : '<div class="lbl">기록 없음</div>'}</div>
    <div class="t" style="grid-area:kcal"><div class="lbl">총 소모 칼로리</div><b class="num big2">${c.kcal.toLocaleString('ko-KR')}</b></div>
    <div class="t" style="grid-area:sets"><div class="lbl">총 세트</div><b class="num big2">${c.sets}</b></div>
  </div>${brand}</div>`;
}

// ---------- 이미지로 공유 ----------
let h2i;
const loadH2I = () => h2i ||= new Promise((ok, no) => document.head.appendChild(Object.assign(document.createElement('script'), { src: 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js', onload: () => ok(window.htmlToImage), onerror: () => { h2i = null; no(new Error('이미지 도구를 못 불러왔어요 (인터넷 확인)')); } })));
async function snapCard(name) {
  const el = $('#rcard'); if (!el) return;
  const lib = await loadH2I();
  const blob = await lib.toBlob(el, { pixelRatio: 3, backgroundColor: getComputedStyle(el).backgroundColor, imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
  await shareFile(new File([blob], name, { type: 'image/png' }));
}
Object.assign(A, {
  rtab(t) { ui.modal.tab = t; renderModal(); },
  rshot() {
    const m = ui.modal, w = S.workouts.find(x => x.id === m.id);
    const name = m.type === 'month' ? `gymlog-${m.y}-${pad(m.m + 1)}.png` : `gymlog-${ymd(w.start)}-${m.tab || 'sum'}.png`;
    snapCard(name).catch(e => toast('이미지 만들기 실패: ' + e.message));
  },
  monthRep(y, m) { ui.modal = { type: 'month', y: +y, m: +m }; renderModal(); },
});
MODALS.month = m => `<div class="between"><h3>월간 리포트</h3>${closeBtn}</div>
  <div class="between" style="margin:8px 0"><button class="mnav auto" data-a="monthRep:${new Date(m.y, m.m - 1).getFullYear()}:${new Date(m.y, m.m - 1).getMonth()}" aria-label="이전 달">‹</button><b>${m.y}년 ${m.m + 1}월</b><button class="mnav auto" data-a="monthRep:${new Date(m.y, m.m + 1).getFullYear()}:${new Date(m.y, m.m + 1).getMonth()}" aria-label="다음 달">›</button></div>
  ${monthCard(m.y, m.m)}<button class="pri wide" style="margin-top:12px" data-a="rshot">이미지로 공유</button>`;
