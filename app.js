'use strict';
// 짐로그: 운동 기록 PWA. 상태 전부 localStorage 한 키에 JSON으로 저장.
// ponytail: localStorage 약 5MB 한도(운동 기록 수년치는 충분), 넘치면 IndexedDB로 이전.

const KEY = 'gymlog.v1';
const DEF = { height: 175, rest: 90, vibrate: true, sound: true, wake: true, autoRoutine: 'same', rpe: false, bar: 20, plates: '25,20,15,10,5,2.5,1.25' };
const TYPES = { N: '일반', W: '웜업', D: '드롭', F: '실패', P: '피더', R: '레스트-퍼즈' };
const TYPE_DESC = { N: '본세트', W: '볼륨·1RM 집계 제외', D: '무게 낮춰 바로 이어서', F: '실패 지점까지', P: '가벼운 무게로 펌핑', R: '짧게 쉬고 이어서 반복' };
const COLS = { w: ['kg', '회'], b: ['+kg', '회'], t: [null, '초'], c: ['km', '분'] };
const PARTS = Object.keys(EXERCISES);
const EQUIPS = ['바벨', '덤벨', '머신', '케이블', '맨몸', '스미스', '케틀벨', '기타'];
const DOW = '일월화수목금토';

const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const f1 = v => (Math.round(v * 10) / 10).toLocaleString('ko-KR');
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const pad = n => String(n).padStart(2, '0');
const ymd = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const md = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
const dateTxt = ts => { const d = new Date(ts); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
const hms = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60); };
const short = v => v >= 10000 ? Math.round(v / 1000) + 'k' : f1(v);
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = s => [...s].map(c => { const k = c.charCodeAt(0) - 0xAC00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c; }).join('');

// ---------- 상태 ----------
function blank() { return { v: 1, custom: [], routines: [], workouts: [], body: [], active: null, timer: null, set: { ...DEF } }; }
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return { ...blank(), ...s, set: { ...DEF, ...s.set } }; } catch (e) { }
  return blank();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('저장 실패: ' + e.message); } scheduleSync(); }

let S = load();
const ui = { tab: 'home', view: S.active ? 'workout' : null, edit: null, modal: null, month: 0, range: 1, histN: 10 };
let EX = {};
function indexEx() {
  EX = {};
  for (const [part, list] of Object.entries(EXERCISES)) for (const [name, equip, type] of list) EX[name] = { name, part, equip, type };
  for (const c of S.custom) EX[c.name] = { ...c, custom: true };
}
indexEx();
const ex = n => EX[n] || { name: n, part: '기타', equip: '기타', type: 'w' };
const doc = () => ui.view === 'workout' ? S.active : ui.edit;

// ---------- 계산 ----------
const e1rm = (w, r) => w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0; // Epley
const counts = s => s.type !== 'W';
const setVol = (e, s) => (e.type === 'w' || e.type === 'b') && counts(s) ? num(s.w) * num(s.r) : 0;
const wVol = w => sum(w.items, it => sum(it.sets, s => setVol(ex(it.ex), s)));
const wSets = w => sum(w.items, it => it.sets.filter(counts).length);
function sessStats(sets, e) {
  const r = { e1: 0, w: 0, r: 0, vol: 0 };
  for (const s of sets) {
    if (!counts(s)) continue;
    const w = num(s.w), n = num(s.r);
    r.e1 = Math.max(r.e1, e.type === 'w' || e.type === 'b' ? e1rm(w, n) : 0);
    r.w = Math.max(r.w, w); r.r = Math.max(r.r, n); r.vol += setVol(e, s);
  }
  return r;
}
// 이 운동의 과거 최고치. before 이전, exclude(수정 중인 기록) 제외
function bestOf(name, before = Infinity, exclude) {
  const r = { e1: 0, w: 0, r: 0, vol: 0, n: 0 }, e = ex(name);
  for (const w of S.workouts) {
    if (w.start >= before || w.id === exclude) continue;
    for (const it of w.items) if (it.ex === name) {
      const s = sessStats(it.sets, e); r.n++;
      for (const k of ['e1', 'w', 'r', 'vol']) r[k] = Math.max(r[k], s[k]);
    }
  }
  return r;
}
function prevSets(name, d) {
  for (const w of S.workouts) { // 최신순 정렬 유지
    if (w.id === d.editId || w.start >= (d.start || Infinity)) continue;
    const it = w.items.find(x => x.ex === name);
    if (it) return it.sets;
  }
  return null;
}
function exHistory(name) { const out = []; for (const w of S.workouts) for (const it of w.items) if (it.ex === name) out.push({ w, sets: it.sets }); return out; }
function best1rm(name) {
  const d = doc(), it = d?.items.find(x => x.ex === name);
  return Math.max(bestOf(name).e1, it ? sessStats(it.sets, ex(name)).e1 : 0);
}
const stepOf = name => ({ 덤벨: 2, 케틀벨: 4 }[ex(name).equip] || 2.5); // ponytail: 증량 단위 고정, 체육관마다 다르면 설정으로
const rnd = (v, st) => Math.round(v / st) * st;
const newSet = (o = {}) => ({ w: '', r: '', type: 'N', rpe: '', done: false, ...o });
function newItem(name, d) {
  const p = prevSets(name, d);
  return { ex: name, ss: 0, rest: null, memo: '', sets: p ? p.map(s => newSet({ w: s.w, r: s.r, type: s.type })) : [newSet(), newSet(), newSet()] };
}
// 슈퍼세트: 이웃과 그룹 공유 안 하면 해제
function normSS(d) { d.items.forEach((it, i) => { if (it.ss && d.items[i - 1]?.ss !== it.ss && d.items[i + 1]?.ss !== it.ss) it.ss = 0; }); }
function prevTxt(e, p) {
  return { w: `${p.w}×${p.r}`, b: num(p.w) ? `+${p.w}×${p.r}` : `${p.r}회`, t: `${p.r}초`, c: `${p.w}km ${p.r}분` }[e.type];
}
function parseSpec(spec, ref) {
  if (spec[0] === '%') {
    const tm = best1rm(ref) * 0.9;
    return spec.slice(1).split(',').map(x => { const [p, r] = x.split('x'); return newSet({ w: tm ? rnd(tm * num(p) / 100, 2.5) : '', r: num(r) || '' }); });
  }
  const [n, r] = spec.split('x').map(Number);
  return Array.from({ length: n }, () => newSet({ r: r || '' }));
}

// ---------- 휴식 타이머 / 알림 ----------
let actx;
function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { } }
function beep() {
  if (!actx) return;
  [0, 0.25, 0.5].forEach(t => {
    const o = actx.createOscillator(), g = actx.createGain(), at = actx.currentTime + t;
    o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.3, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.2); o.start(at); o.stop(at + 0.2);
  });
}
function alarm(force) {
  if (S.set.vibrate) navigator.vibrate?.([400, 150, 400]);
  if (S.set.sound) beep();
  // 폰 알림은 연결된 워치(갤럭시워치·애플워치 등)로 미러링됨
  if ((force || document.hidden) && window.Notification?.permission === 'granted')
    navigator.serviceWorker?.ready.then(r => r.showNotification('휴식 끝 💪', { body: '다음 세트 시작', tag: 'rest', renotify: true, vibrate: [400, 150, 400] }));
  else toast('휴식 끝 💪');
}
function startRest(sec) { S.timer = { end: Date.now() + sec * 1000, total: sec }; save(); renderRest(); }
function tick() {
  const el = $('#elapsed'); if (el && S.active) el.textContent = hms((Date.now() - S.active.start) / 1000);
  const t = S.timer; if (!t) return;
  const left = (t.end - Date.now()) / 1000;
  if (left <= 0) { S.timer = null; save(); alarm(); renderRest(); return; }
  const l = $('#restleft'); if (l) { l.textContent = hms(Math.ceil(left)); $('#restbar').style.width = Math.min(100, left / t.total * 100) + '%'; }
}
setInterval(tick, 250);
let wl = null;
async function wake(on) {
  try {
    if (on && S.set.wake && 'wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.onrelease = () => { wl = null; }; }
    else if (!on && wl) { wl.release(); wl = null; }
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.view === 'workout') wake(true); });

// ---------- 차트 ----------
function chart(pts, bar, unit = '') {
  if (!bar) pts = pts.filter(p => p.v > 0);
  if (!pts.length) return '<p class="muted">데이터 없음</p>';
  const W = 340, H = 150, L = 36, R = 10, T = 12, Bt = 22, n = pts.length;
  const vs = pts.map(p => p.v), mx = Math.max(...vs), mn = bar ? 0 : Math.min(...vs), rg = mx - mn || 1;
  const X = i => bar ? L + (i + 0.5) * (W - L - R) / n : n < 2 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1);
  const Y = v => T + (1 - (v - mn) / rg) * (H - T - Bt);
  let g = `<line x1="${L}" x2="${W - R}" y1="${Y(mx)}" y2="${Y(mx)}" style="stroke:var(--line)"/><line x1="${L}" x2="${W - R}" y1="${Y(mn)}" y2="${Y(mn)}" style="stroke:var(--line)"/>
    <text x="${L - 4}" y="${Y(mx) + 3}" text-anchor="end">${short(mx)}</text><text x="${L - 4}" y="${Y(mn) + 3}" text-anchor="end">${short(mn)}</text>`;
  if (bar) { const bw = Math.max(2, (W - L - R) / n * 0.6); g += pts.map((p, i) => `<rect x="${X(i) - bw / 2}" y="${Y(p.v)}" width="${bw}" height="${Math.max(0, Y(mn) - Y(p.v))}" rx="2" style="fill:var(--acc)"><title>${p.l} ${f1(p.v)}${unit}</title></rect>`).join(''); }
  else g += `<polyline points="${pts.map((p, i) => X(i) + ',' + Y(p.v)).join(' ')}" style="fill:none;stroke:var(--acc);stroke-width:2"/>` + pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="2.5" style="fill:var(--acc)"><title>${p.l} ${f1(p.v)}${unit}</title></circle>`).join('');
  const lab = bar && n <= 12 ? pts.map((p, i) => [i, p.l]) : [[0, pts[0].l], [n - 1, pts[n - 1].l]];
  g += lab.map(([i, l]) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${bar || n < 2 ? 'middle' : i ? 'end' : 'start'}">${esc(l)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

// ---------- 렌더 ----------
function render() {
  document.body.classList.toggle('full', !!ui.view);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.a === 'tab:' + ui.tab));
  $('#app').innerHTML = ui.view === 'workout' ? workoutView() : ui.view === 'routine' ? routineEditView() : VIEWS[ui.tab]();
  renderModal(); renderRest(); tick();
}
function renderModal() { const m = ui.modal; $('#modal').innerHTML = m ? `<div class="sheet">${MODALS[m.type](m)}</div>` : ''; }
function renderRest() {
  const el = $('#rest');
  if (ui.view !== 'workout') { el.hidden = true; return; }
  el.hidden = false;
  if (!S.timer) {
    const d = { items: S.active.items.map(it => ({ ...it, sets: it.sets.filter(s => s.done) })) };
    el.innerHTML = `<div class="inner between"><span class="muted">${wSets(d)}세트 · ${f1(wVol(d))}kg</span><button class="auto" data-a="restStart">⏱ 휴식 ${S.set.rest}초</button></div>`;
    return;
  }
  el.innerHTML = `<div class="inner"><div class="bar"><div id="restbar"></div></div><div class="row"><span class="big" id="restleft"></span><button data-a="restAdd:-15">-15</button><button data-a="restAdd:15">+15</button><button class="pri" data-a="restSkip">건너뛰기</button></div></div>`;
}

function cardHTML(d, it, i, mode) {
  const e = ex(it.ex), cols = COLS[e.type], W = mode === 'w';
  const prev = W ? prevSets(it.ex, d) : null;
  let rm = '';
  if (W && (e.type === 'w' || e.type === 'b')) {
    const cur = sessStats(it.sets, e).e1, best = bestOf(it.ex, d.start, d.editId).e1;
    if (cur) rm = ` · 1RM ${f1(cur)}kg ${best ? cur > best + 0.01 ? '<span class="up">▲</span>' : cur < best - 0.01 ? '<span class="down">▼</span>' : '' : ''}`;
  }
  let n = 0;
  const rows = it.sets.map((s, j) => {
    const p = prev?.[j], ph = k => p && p[k] !== '' && p[k] != null ? `placeholder="${esc(p[k])}"` : '';
    const lab = s.type === 'N' ? ++n : (s.type === 'W' ? 'W' : (++n, s.type));
    return `<tr class="${W && s.done ? 'done' : ''}">
      <td><button class="stype t-${s.type}" data-a="stype:${i}:${j}">${lab}</button></td>
      ${W ? `<td><button class="prev" data-a="usePrev:${i}:${j}">${p ? prevTxt(e, p) : '-'}</button></td>` : ''}
      ${cols[0] ? `<td><input inputmode="decimal" value="${esc(s.w)}" ${W ? ph('w') : ''} data-f="${i}:${j}:w"></td>` : ''}
      <td><input inputmode="numeric" value="${esc(s.r)}" ${W ? ph('r') : ''} data-f="${i}:${j}:r"></td>
      ${S.set.rpe ? `<td><select data-f="${i}:${j}:rpe"><option value="">-</option>${[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(v => `<option ${num(s.rpe) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>` : ''}
      ${W ? `<td><button class="chk" data-a="done:${i}:${j}">✓</button></td>` : ''}</tr>`;
  }).join('');
  return `<div class="ex ${it.ss ? 'ss' : ''}">
    ${it.ss && d.items[i - 1]?.ss === it.ss ? '<div class="muted small">↳ 슈퍼세트</div>' : ''}
    <div class="between"><div><div class="name" data-a="exd:${encodeURIComponent(it.ex)}">${esc(it.ex)}</div>
      <div class="muted">${e.part} · ${e.equip}${it.rest ? ` · 휴식 ${it.rest}초` : ''}${rm}</div></div>
      <button class="ghost auto" data-a="imenu:${i}" style="font-size:20px">⋯</button></div>
    <table class="sets"><colgroup><col style="width:40px">${W ? '<col>' : ''}${cols[0] ? '<col>' : ''}<col>${S.set.rpe ? '<col style="width:58px">' : ''}${W ? '<col style="width:46px">' : ''}</colgroup>
      <thead><tr><th>세트</th>${W ? '<th>이전</th>' : ''}${cols[0] ? `<th>${cols[0]}</th>` : ''}<th>${cols[1]}</th>${S.set.rpe ? '<th>RPE</th>' : ''}${W ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table>
    <button style="margin-top:6px;width:100%" data-a="addSet:${i}">+ 세트 추가</button>
    <textarea data-f="${i}:-1:memo" placeholder="메모" rows="1" style="margin-top:6px">${esc(it.memo || '')}</textarea>
  </div>`;
}
const editorHTML = (d, mode) => d.items.length ? d.items.map((it, i) => cardHTML(d, it, i, mode)).join('') : '<p class="muted" style="text-align:center;padding:30px 0">운동을 추가하세요</p>';

function workoutView() {
  const d = S.active;
  return `<div class="whead between"><button class="ghost auto" data-a="minimize">⌄ 내리기</button>
    <b id="${d.editId ? '' : 'elapsed'}">${d.editId ? '기록 수정' : ''}</b><button class="pri auto" data-a="finish">완료</button></div>
    <input value="${esc(d.name)}" data-f="name" placeholder="운동 이름" style="font-size:18px;font-weight:700;margin-bottom:12px">
    ${editorHTML(d, 'w')}
    <button class="wide" data-a="pickOpen">+ 운동 추가</button>
    <button class="wide ghost danger" data-a="discard" style="margin-top:8px">${d.editId ? '수정 취소' : '운동 취소'}</button>`;
}
function routineEditView() {
  const r = ui.edit, folders = [...new Set(S.routines.map(x => x.folder).filter(Boolean))];
  return `<div class="whead between"><button class="ghost auto" data-a="rcancel">취소</button><b>루틴 편집</b><button class="pri auto" data-a="rsave">저장</button></div>
    <input value="${esc(r.name)}" data-f="name" placeholder="루틴 이름" style="font-size:18px;font-weight:700">
    <input value="${esc(r.folder)}" data-f="folder" list="folders" placeholder="폴더 (선택)" style="margin:8px 0 12px">
    <datalist id="folders">${folders.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    ${editorHTML(r, 'r')}
    <button class="wide" data-a="pickOpen">+ 운동 추가</button>
    ${S.routines.some(x => x.id === r.id) ? '<button class="wide ghost danger" data-a="rdel" style="margin-top:8px">루틴 삭제</button>' : ''}`;
}
const exSummary = items => esc(items.map(it => it.ex).join(', '));

const VIEWS = {
  home() {
    const a = S.active, now = new Date(), mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    const days = new Set(S.workouts.map(w => ymd(w.start)));
    const week = Array.from({ length: 7 }, (_, k) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + k));
    const routines = [...S.routines].sort((x, y) => (y.used || 0) - (x.used || 0)).slice(0, 6);
    const hist = S.workouts.slice(0, ui.histN);
    return `<h1>운동</h1>
      ${a ? `<div class="card" style="background:var(--acc2)"><div class="between"><div><b>${a.editId ? '기록 수정 중' : '운동 진행 중'}</b><div class="muted">${esc(a.name)} · ${a.items.length}개 운동</div></div><button class="pri auto" data-a="resume">이어하기</button></div></div>`
        : '<button class="pri wide" data-a="start:">빈 운동 시작</button>'}
      <h2>루틴으로 시작</h2>
      ${routines.length ? `<div class="card list">${routines.map(r => `<div class="between"><div style="min-width:0"><b>${esc(r.name)}</b><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${exSummary(r.items)}</div></div><button class="auto" data-a="start:${r.id}">시작</button></div>`).join('')}</div>`
        : '<p class="muted">루틴 탭에서 루틴을 만들거나 프로그램을 가져오세요.</p>'}
      <h2>이번 주 ${week.filter(d => days.has(ymd(d))).length}회</h2>
      <div class="cal">${week.map(d => `<div class="${days.has(ymd(d)) ? 'w' : ''} ${ymd(d) === ymd(now) ? 'today' : ''}" ${days.has(ymd(d)) ? `data-a="calday:${ymd(d)}"` : ''}>${DOW[d.getDay()]}<br>${d.getDate()}</div>`).join('')}</div>
      <h2>기록</h2>
      ${hist.length ? `<div class="card list">${hist.map(w => `<div class="between" data-a="wopen:${w.id}"><div><b>${esc(w.name)}</b><div class="muted">${dateTxt(w.start)} · ${dur(w.end - w.start)}</div></div><div class="muted auto">${f1(wVol(w))}kg</div></div>`).join('')}</div>
        ${S.workouts.length > ui.histN ? '<button class="wide ghost" data-a="more">더 보기</button>' : ''}` : '<p class="muted">아직 기록이 없어요.</p>'}`;
  },
  routines() {
    const groups = {};
    for (const r of S.routines) (groups[r.folder || '기본'] ||= []).push(r);
    return `<h1>루틴</h1><div class="row"><button class="pri" data-a="rnew">+ 새 루틴</button><button data-a="progs">📚 프로그램</button></div>
      ${Object.entries(groups).map(([f, rs]) => `<h2>📁 ${esc(f)}</h2><div class="card list">${rs.map(r => `<div class="between"><div style="min-width:0" data-a="redit:${r.id}"><b>${esc(r.name)}</b><div class="muted">${r.items.length}개 운동 · ${sum(r.items, it => it.sets.length)}세트</div><div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${exSummary(r.items)}</div></div><button class="auto" data-a="redit:${r.id}">편집</button><button class="auto pri" data-a="start:${r.id}">시작</button></div>`).join('')}</div>`).join('')
      || '<p class="muted" style="margin-top:20px">루틴이 없어요. 새로 만들거나 📚 프로그램에서 가져오세요.</p>'}`;
  },
  stats() {
    const now = new Date(), base = new Date(now.getFullYear(), now.getMonth() + ui.month, 1);
    const mstat = d0 => { const a = d0.getTime(), b = new Date(d0.getFullYear(), d0.getMonth() + 1, 1).getTime(), ws = S.workouts.filter(w => w.start >= a && w.start < b); return { ws, n: ws.length, time: sum(ws, w => w.end - w.start), vol: sum(ws, wVol), sets: sum(ws, wSets) }; };
    const cur = mstat(base), prv = mstat(new Date(base.getFullYear(), base.getMonth() - 1, 1));
    const diff = (a, b) => b ? `<span class="${a >= b ? 'up' : 'down'} small">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}%</span>` : '';
    // 캘린더
    const days = {}; for (const w of cur.ws) days[new Date(w.start).getDate()] = 1;
    const first = base.getDay(), dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const cal = [...DOW].map(c => `<div class="hd">${c}</div>`).join('') + '<div></div>'.repeat(first) +
      Array.from({ length: dim }, (_, k) => { const dd = k + 1, ds = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(dd)}`; return `<div class="${days[dd] ? 'w' : ''} ${ds === ymd(now) ? 'today' : ''}" ${days[dd] ? `data-a="calday:${ds}"` : ''}>${dd}</div>`; }).join('');
    // 월별 볼륨 12개월
    const months = Array.from({ length: 12 }, (_, k) => new Date(now.getFullYear(), now.getMonth() - 11 + k, 1));
    const mv = months.map(d => ({ l: d.getMonth() + 1 + '월', v: mstat(d).vol }));
    // 부위별 성장률
    const t2 = Date.now(), t1 = new Date(now.getFullYear(), now.getMonth() - ui.range, now.getDate()).getTime(), t0 = new Date(now.getFullYear(), now.getMonth() - ui.range * 2, now.getDate()).getTime();
    const pc = partStats(t1, t2), pp = partStats(t0, t1);
    const parts = PARTS.filter(p => pc[p] || pp[p]);
    // 3대
    const big = [SQ, B, DL].map(n => ({ n, e1: bestOf(n).e1 }));
    // 운동별
    const cnt = {}; for (const w of S.workouts) for (const it of w.items) cnt[it.ex] = (cnt[it.ex] || 0) + 1;
    const exs = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    return `<h1>분석</h1>
      <div class="between" style="margin-bottom:10px"><button class="auto" data-a="month:-1">‹</button><b>${base.getFullYear()}년 ${base.getMonth() + 1}월</b><button class="auto" data-a="month:1" ${ui.month >= 0 ? 'disabled style="opacity:.3"' : ''}>›</button></div>
      <div class="grid2">
        <div class="stat"><span class="muted">운동 횟수</span><b>${cur.n}회</b>${diff(cur.n, prv.n)}</div>
        <div class="stat"><span class="muted">총 시간</span><b>${dur(cur.time)}</b>${diff(cur.time, prv.time)}</div>
        <div class="stat"><span class="muted">총 볼륨</span><b>${f1(cur.vol)}kg</b>${diff(cur.vol, prv.vol)}</div>
        <div class="stat"><span class="muted">총 세트</span><b>${cur.sets}</b>${diff(cur.sets, prv.sets)}</div>
      </div>
      <div class="card" style="margin-top:12px"><div class="cal">${cal}</div></div>
      <h2>월별 총 볼륨</h2><div class="card">${chart(mv, true, 'kg')}</div>
      <h2>부위별 성장률</h2>
      <div class="chips">${[1, 3, 6].map(r => `<button class="chip ${ui.range === r ? 'on' : ''}" data-a="range:${r}">최근 ${r}개월</button>`).join('')}</div>
      <div class="card" style="margin-top:8px">${parts.length ? `<table class="sets"><thead><tr><th style="text-align:left">부위</th><th>세트</th><th>볼륨</th><th>이전 대비</th></tr></thead><tbody>${parts.map(p => { const c = pc[p] || { sets: 0, vol: 0 }, q = pp[p] || { sets: 0, vol: 0 }, a = c.vol || c.sets, b = q.vol || q.sets; return `<tr><td style="text-align:left">${p}</td><td>${c.sets}</td><td>${short(c.vol)}</td><td>${b ? diff(a, b) : '<span class="muted small">신규</span>'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">데이터 없음</p>'}</div>
      <h2>3대 운동 (추정 1RM)</h2>
      <div class="card list">${big.map(x => `<div class="between" data-a="exd:${encodeURIComponent(x.n)}"><span>${x.n}</span><b class="auto">${x.e1 ? f1(x.e1) + 'kg' : '-'}</b></div>`).join('')}<div class="between"><b>합계</b><b class="auto">${f1(sum(big, x => x.e1))}kg</b></div></div>
      <h2>운동별 기록</h2>
      ${exs.length ? `<div class="card list">${exs.map(([n, c]) => `<div class="between" data-a="exd:${encodeURIComponent(n)}"><span>${esc(n)}</span><span class="muted auto">${c}회${bestOf(n).e1 ? ` · 1RM ${f1(bestOf(n).e1)}kg` : ''}</span></div>`).join('')}</div>` : '<p class="muted">기록 없음</p>'}`;
  },
  body() {
    const h = S.set.height / 100, last = S.body[0], asc = [...S.body].reverse();
    const ff = b => b.f ? b.w * (1 - b.f / 100) / (h * h) + 6.1 * (1.8 - h) : 0;
    return `<h1>신체</h1>
      <div class="card"><div class="grid2">
        <label class="muted">날짜<input type="date" id="b_date" value="${ymd(Date.now())}"></label>
        <label class="muted">체중 (kg)<input id="b_w" inputmode="decimal"></label>
        <label class="muted">골격근량 (kg)<input id="b_m" inputmode="decimal"></label>
        <label class="muted">체지방률 (%)<input id="b_f" inputmode="decimal"></label></div>
        <button class="pri wide" style="margin-top:10px" data-a="bodyAdd">기록</button></div>
      ${last ? `<div class="grid3"><div class="stat"><span class="muted">체중</span><b>${f1(last.w)}</b></div><div class="stat"><span class="muted">BMI</span><b>${last.w ? f1(last.w / (h * h)) : '-'}</b></div><div class="stat"><span class="muted">FFMI</span><b>${ff(last) ? f1(ff(last)) : '-'}</b></div></div>
        <p class="muted small">키 ${S.set.height}cm 기준 (설정에서 변경). FFMI는 체지방률 입력 시 계산.</p>` : ''}
      <h2>체중</h2><div class="card">${chart(asc.map(b => ({ l: b.date.slice(5), v: num(b.w) })), false, 'kg')}</div>
      <h2>골격근량</h2><div class="card">${chart(asc.map(b => ({ l: b.date.slice(5), v: num(b.m) })), false, 'kg')}</div>
      <h2>체지방률</h2><div class="card">${chart(asc.map(b => ({ l: b.date.slice(5), v: num(b.f) })), false, '%')}</div>
      ${S.body.length ? `<h2>기록</h2><div class="card list">${S.body.map(b => `<div class="between"><span>${b.date}</span><span class="muted">${b.w || '-'}kg · 근육 ${b.m || '-'} · 지방 ${b.f || '-'}%</span><button class="ghost auto danger" data-a="bdel:${b.date}">삭제</button></div>`).join('')}</div>` : ''}`;
  },
  settings() {
    const s = S.set, perm = window.Notification ? { granted: '허용됨', denied: '차단됨 (브라우저 설정에서 변경)', default: '켜기' }[Notification.permission] : '미지원';
    const inp = (k, w = 80) => `<input data-s="${k}" value="${esc(s[k])}" inputmode="decimal" style="width:${w}px">`;
    const chk = k => `<input type="checkbox" data-s="${k}" ${s[k] ? 'checked' : ''}>`;
    return `<h1>설정</h1>${syncCard()}
      <div class="card">
        <label class="sw">키 (cm)${inp('height')}</label>
        <label class="sw">기본 휴식 시간 (초)${inp('rest')}</label>
        <label class="sw">휴식 끝 진동${chk('vibrate')}</label>
        <label class="sw">휴식 끝 소리${chk('sound')}</label>
        <label class="sw">운동 중 화면 켜두기${chk('wake')}</label>
        <label class="sw">RPE 입력칸 표시${chk('rpe')}</label>
        <label class="sw">루틴 세트 자동 업데이트<select data-s="autoRoutine" style="width:auto">${[['off', '끔'], ['same', '해당 루틴만'], ['all', '같은 운동 든 모든 루틴']].map(([v, t]) => `<option value="${v}" ${s.autoRoutine === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="sw">바벨 무게 (kg)${inp('bar')}</label>
        <label class="sw">보유 원판 (kg)${inp('plates', 170)}</label>
      </div>
      <div class="card"><b>워치 · 알림</b><p class="muted">알림을 켜면 휴식 끝 알림이 폰에 연결된 워치(갤럭시워치·애플워치 등)로도 진동과 함께 갑니다. 아이폰은 홈 화면에 추가한 앱에서만 알림 가능.</p>
        <div class="row"><button data-a="notifyOn">알림: ${perm}</button><button data-a="testAlarm">5초 뒤 테스트</button></div></div>
      <div class="card"><b>백업</b><p class="muted">기록은 이 기기에만 저장됩니다. 폰 바꾸거나 앱 지우기 전에 내보내세요.</p>
        <div class="row"><button data-a="exportData">내보내기</button><button data-a="importData">가져오기</button></div>
        <input type="file" id="importFile" accept=".json,application/json" hidden>
        <p class="muted small">운동 ${S.workouts.length}회 · 루틴 ${S.routines.length}개 · ${f1((localStorage.getItem(KEY) || '').length / 1024)}KB</p></div>
      <button class="wide ghost danger" data-a="resetAll">전체 초기화</button>`;
  },
};
function partStats(from, to) {
  const r = {};
  for (const w of S.workouts) {
    if (w.start < from || w.start >= to) continue;
    for (const it of w.items) { const e = ex(it.ex), p = r[e.part] ||= { sets: 0, vol: 0 }; for (const s of it.sets) if (counts(s)) { p.sets++; p.vol += setVol(e, s); } }
  }
  return r;
}

// ---------- 모달 ----------
const closeBtn = '<button class="ghost auto" data-a="close">닫기</button>';
function pickList(m) {
  const q = m.q.replace(/\s/g, '').toLowerCase();
  let names = Object.keys(EX);
  if (m.part === '최근') names = [...new Set(S.workouts.flatMap(w => w.items.map(it => it.ex)))].filter(n => EX[n]).slice(0, 40);
  else if (m.part !== '전체') names = names.filter(n => EX[n].part === m.part);
  if (q) names = names.filter(n => { const k = n.replace(/\s/g, '').toLowerCase(); return k.includes(q) || cho(k).includes(q); });
  return names.map(n => `<div class="pick ${m.sel.includes(n) ? 'on' : ''}" data-a="pickTog:${encodeURIComponent(n)}"><div><div>${esc(n)}</div><div class="muted small">${EX[n].part} · ${EX[n].equip}${EX[n].custom ? ' · 직접 추가' : ''}</div></div><b class="auto">${m.sel.includes(n) ? '✓' : ''}</b></div>`).join('') || '<p class="muted">결과 없음</p>';
}
function platesTxt(w) {
  const bar = S.set.bar, list = S.set.plates.split(',').map(num).filter(x => x > 0).sort((a, b) => b - a);
  let side = (w - bar) / 2; if (side < 0) return `<p class="muted">바벨(${bar}kg)보다 가벼움</p>`;
  const out = [];
  for (const p of list) while (side >= p - 1e-9) { out.push(p); side -= p; }
  return `<p style="font-size:18px"><b>한쪽: ${out.length ? out.join(' + ') : '없음'}</b></p><p class="muted">바벨 ${bar}kg${side > 0.01 ? ` · 남는 무게 한쪽 ${f1(side)}kg (원판 부족)` : ''}</p>`;
}
const MODALS = {
  pick: m => `<div class="between"><h3>${m.rep != null ? '운동 교체' : '운동 추가'}</h3>${closeBtn}</div>
    <input placeholder="검색 (초성 가능: ㅂㅊㅍ)" data-in="pickq" value="${esc(m.q)}" style="margin:10px 0">
    <div class="chips">${['전체', '최근', ...PARTS].map(p => `<button class="chip ${m.part === p ? 'on' : ''}" data-a="pickPart:${p}">${p}</button>`).join('')}</div>
    <div id="picklist">${pickList(m)}</div>
    <button class="ghost wide" data-a="customNew">+ 직접 운동 만들기</button>
    ${m.rep == null ? `<div style="position:sticky;bottom:0;padding-top:8px;background:var(--card)"><button class="pri wide" data-a="pickDone" id="pickbtn">추가 (${m.sel.length})</button></div>` : ''}`,
  custom: () => `<h3>직접 운동 만들기</h3>
    <input id="c_name" placeholder="운동 이름" style="margin:10px 0">
    <div class="grid3"><select id="c_part">${PARTS.map(p => `<option>${p}</option>`).join('')}</select>
    <select id="c_equip">${EQUIPS.map(p => `<option>${p}</option>`).join('')}</select>
    <select id="c_type"><option value="w">무게×횟수</option><option value="b">맨몸×횟수</option><option value="t">시간</option><option value="c">유산소(km·분)</option></select></div>
    <div class="row" style="margin-top:12px"><button data-a="pickBack">취소</button><button class="pri" data-a="customSave">만들기</button></div>`,
  stype: m => `<h3>세트</h3>${Object.entries(TYPES).map(([k, v]) => `<button class="opt" data-a="setType:${m.i}:${m.j}:${k}"><b class="t-${k}">${k === 'N' ? '1' : k}</b> ${v} <span class="muted">${TYPE_DESC[k]}</span></button>`).join('')}
    <button class="opt" data-a="dupSet:${m.i}:${m.j}">⧉ 세트 복제</button><button class="opt danger" data-a="delSet:${m.i}:${m.j}">🗑 세트 삭제</button>`,
  imenu: m => {
    const d = doc(), it = d.items[m.i], next = d.items[m.i + 1], linked = it.ss && next?.ss === it.ss;
    return `<h3>${esc(it.ex)}</h3>
      <button class="opt" data-a="warm:${m.i}">🔥 웜업 세트 자동 추가</button>
      <button class="opt" data-a="pyr:${m.i}">🔺 피라미드 세트 자동 (1RM 기준)</button>
      <button class="opt" data-a="drop:${m.i}">⬇️ 드롭 세트 자동 추가</button>
      <button class="opt" data-a="plate:${m.i}">🏋️ 원판 계산</button>
      <button class="opt" data-a="restSet:${m.i}">⏱ 휴식 시간 (${it.rest || S.set.rest}초)</button>
      ${next ? `<button class="opt" data-a="ss:${m.i}">🔗 ${linked ? '다음 운동과 슈퍼세트 해제' : '다음 운동과 슈퍼세트'}</button>` : ''}
      <div class="row"><button class="opt" data-a="mv:${m.i}:-1">↑ 위로</button><button class="opt" data-a="mv:${m.i}:1">↓ 아래로</button></div>
      <button class="opt" data-a="swap:${m.i}">🔄 운동 교체</button>
      <button class="opt" data-a="exd:${encodeURIComponent(it.ex)}">📊 기록 보기</button>
      <a class="opt" style="color:inherit;text-decoration:none" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(it.ex + ' 자세')}">▶️ 자세 가이드 영상</a>
      <button class="opt danger" data-a="del:${m.i}">🗑 운동 삭제</button>`;
  },
  plate: m => `<div class="between"><h3>원판 계산</h3>${closeBtn}</div>
    <input inputmode="decimal" data-in="plateW" value="${esc(m.w)}" placeholder="목표 무게 (kg)" style="margin:10px 0;font-size:18px">
    <div id="platesOut">${platesTxt(num(m.w))}</div><p class="muted small">원판·바벨 무게는 설정에서 변경</p>`,
  progs: () => `<div class="between"><h3>프로그램</h3>${closeBtn}</div><p class="muted">가져오면 루틴 탭에 폴더로 추가됩니다. % 기반 프로그램은 기존 기록의 추정 1RM×0.9로 무게 계산.</p>
    ${PROGRAMS.map((p, k) => `<div class="card" style="background:var(--card2)"><b>${p.name}</b><div class="muted">${p.desc}</div><div class="muted small">${p.days.map(d => esc(d[0])).join(' / ')}</div><button class="pri" style="margin-top:8px" data-a="progAdd:${k}">가져오기</button></div>`).join('')}`,
  wopen: m => {
    const w = S.workouts.find(x => x.id === m.id); if (!w) return closeBtn;
    return `${m.prs?.length ? `<div class="card" style="background:var(--acc2)"><b>🏆 신기록!</b>${m.prs.map(p => `<div>${esc(p)}</div>`).join('')}</div>` : ''}
      <div class="between"><h3>${esc(w.name)}</h3>${closeBtn}</div><div class="muted">${dateTxt(w.start)} · ${dur(w.end - w.start)}</div>
      <div class="grid3" style="margin:10px 0"><div class="stat"><span class="muted">볼륨</span><b>${f1(wVol(w))}</b></div><div class="stat"><span class="muted">세트</span><b>${wSets(w)}</b></div><div class="stat"><span class="muted">운동</span><b>${w.items.length}</b></div></div>
      <div class="list">${w.items.map(it => { const e = ex(it.ex); return `<div><b data-a="exd:${encodeURIComponent(it.ex)}">${esc(it.ex)}</b>${it.ss ? ' <span class="muted small">슈퍼세트</span>' : ''}<div class="muted">${it.sets.map(s => (s.type !== 'N' ? `<span class="t-${s.type}">${s.type}</span> ` : '') + prevTxt(e, s) + (s.rpe ? ` @${s.rpe}` : '')).join(' · ')}</div>${it.memo ? `<div class="small">📝 ${esc(it.memo)}</div>` : ''}</div>`; }).join('')}</div>
      <div class="grid2" style="margin-top:12px"><button data-a="wedit:${w.id}">수정</button><button data-a="again:${w.id}">다시 하기</button><button data-a="toRoutine:${w.id}">루틴으로 저장</button><button class="danger" data-a="wdel:${w.id}">삭제</button></div>`;
  },
  day: m => `<div class="between"><h3>${m.ds}</h3>${closeBtn}</div><div class="list">${S.workouts.filter(w => ymd(w.start) === m.ds).map(w => `<div class="between" data-a="wopen:${w.id}"><b>${esc(w.name)}</b><span class="muted auto">${dur(w.end - w.start)} · ${f1(wVol(w))}kg</span></div>`).join('')}</div>`,
  exd: m => {
    const n = m.n, e = ex(n), h = exHistory(n), asc = h.slice(0, 40).reverse(), b = bestOf(n), heavy = e.type === 'w' || e.type === 'b';
    const pts = k => asc.map(x => ({ l: md(x.w.start), v: sessStats(x.sets, e)[k] }));
    return `<div class="between"><h3>${esc(n)}</h3>${closeBtn}</div><div class="muted">${e.part} · ${e.equip} · ${h.length}회 수행</div>
      ${heavy ? `<div class="grid3" style="margin:10px 0"><div class="stat"><span class="muted">추정 1RM</span><b>${f1(b.e1)}</b></div><div class="stat"><span class="muted">최고 중량</span><b>${f1(b.w)}</b></div><div class="stat"><span class="muted">최고 볼륨</span><b>${short(b.vol)}</b></div></div>
        <b>추정 1RM</b>${chart(pts('e1'), false, 'kg')}<b>최고 중량</b>${chart(pts('w'), false, 'kg')}<b>볼륨</b>${chart(pts('vol'), true, 'kg')}`
        : `<b>${COLS[e.type][1]}</b>${chart(pts('r'), false)}`}
      <p><a style="color:var(--acc)" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(n + ' 자세')}">▶️ 자세 가이드 영상</a></p>
      <div class="list">${h.slice(0, 20).map(x => `<div><span class="muted">${dateTxt(x.w.start)}</span><div>${x.sets.map(s => prevTxt(e, s)).join(' · ')}</div></div>`).join('')}</div>
      ${e.custom ? `<button class="wide ghost danger" data-a="customDel:${encodeURIComponent(n)}">직접 만든 운동 삭제</button>` : ''}`;
  },
};

// ---------- 액션 ----------
function persistDoc() { if (ui.view === 'workout') save(); }
function after() { persistDoc(); ui.modal = null; render(); }
function begin(name, items, routineId) {
  if (S.active) { ui.view = 'workout'; render(); return toast('진행 중인 운동이 있어요'); }
  const now = new Date();
  S.active = { id: uid(), name: name || `${now.getMonth() + 1}/${now.getDate()} ${['새벽', '아침', '점심', '오후', '저녁', '밤'][Math.floor(now.getHours() / 4)]} 운동`, start: Date.now(), routineId, items: clone(items).map(it => ({ ...it, sets: it.sets.map(s => newSet({ ...s, done: false })) })) };
  save(); ui.view = 'workout'; ui.modal = null; wake(true); scrollTo(0, 0); render();
}
function findPRs(d) {
  return d.items.flatMap(it => {
    const e = ex(it.ex); if (e.type !== 'w' && e.type !== 'b') return [];
    const b = bestOf(it.ex, d.start, d.editId); if (!b.n) return [];
    const c = sessStats(it.sets, e), out = [];
    if (c.e1 > b.e1 + 0.01) out.push(`${it.ex} 추정 1RM ${f1(c.e1)}kg (+${f1(c.e1 - b.e1)})`);
    if (c.w > b.w) out.push(`${it.ex} 최고 중량 ${f1(c.w)}kg`);
    return out;
  });
}
function updateRoutines(w) {
  const mode = S.set.autoRoutine; if (mode === 'off') return;
  for (const r of S.routines) {
    if (mode === 'same' && r.id !== w.routineId) continue;
    for (const it of r.items) { const src = w.items.find(x => x.ex === it.ex); if (src) it.sets = src.sets.map(s => newSet({ w: s.w, r: s.r, type: s.type })); }
  }
}
function setField(el) {
  const d = doc(); if (!d) return;
  const f = el.dataset.f;
  if (f === 'name' || f === 'folder') d[f] = el.value;
  else {
    const [i, j, k] = f.split(':'), it = d.items[i];
    if (j === '-1') it[k] = el.value; else it.sets[j][k] = el.value === '' ? '' : num(el.value);
  }
  persistDoc();
}

const A = {
  tab(t) { ui.tab = t; ui.view = null; ui.modal = null; scrollTo(0, 0); render(); },
  close() { ui.modal = null; renderModal(); },
  more() { ui.histN += 20; render(); },
  start(rid) { const r = S.routines.find(x => x.id === rid); if (r && !S.active) { r.used = Date.now(); } begin(r?.name, r?.items || [], r?.id || null); },
  resume() { ui.view = 'workout'; wake(true); render(); },
  minimize() { ui.view = null; wake(false); render(); },
  discard() {
    if (!confirm(S.active.editId ? '수정을 취소할까요?' : '이 운동 기록을 버릴까요?')) return;
    S.active = null; S.timer = null; save(); ui.view = null; wake(false); render();
  },
  finish() {
    const d = S.active;
    // 체크한 세트만 기록. 체크 안 했지만 값이 있는 세트는 물어봄 (루틴에서 미리 채워진 값이 섞이지 않게)
    const filled = (it, s) => !s.done && num(s.r) > 0 && (ex(it.ex).type !== 'w' || num(s.w) > 0);
    const n = sum(d.items, it => it.sets.filter(s => filled(it, s)).length);
    const keepUnchecked = n > 0 && confirm(`체크 안 한 세트 ${n}개가 있어요.\n확인: 기록에 포함 / 취소: 버리기`);
    for (const it of d.items) { it.sets = it.sets.filter(s => s.done || keepUnchecked && filled(it, s)); it.sets.forEach(s => { s.done = true; }); }
    d.items = d.items.filter(it => it.sets.length);
    if (!d.items.length) { if (confirm('기록된 세트가 없어요. 운동을 버릴까요?')) { S.active = null; S.timer = null; save(); ui.view = null; render(); } else render(); return; }
    normSS(d);
    const prs = findPRs(d), w = { ...d };
    delete w.editId;
    if (!d.editId) { w.end = Date.now(); updateRoutines(w); }
    S.workouts = S.workouts.filter(x => x.id !== w.id); S.workouts.push(w); S.workouts.sort((a, b) => b.start - a.start);
    S.active = null; S.timer = null; save(); wake(false);
    ui.view = null; ui.tab = 'home'; ui.modal = { type: 'wopen', id: w.id, prs }; scrollTo(0, 0); render();
  },
  // 세트
  done(i, j) {
    const d = S.active, it = d.items[i], s = it.sets[j];
    s.done = !s.done;
    if (s.done) {
      const p = prevSets(it.ex, d)?.[j];
      if (p) { if (s.w === '') s.w = p.w; if (s.r === '') s.r = p.r; }
      navigator.vibrate?.(30);
      const next = d.items[+i + 1];
      if (!(it.ss && next?.ss === it.ss)) startRest(it.rest || S.set.rest); // 슈퍼세트는 묶음 마지막 운동 뒤에만 휴식
    }
    save(); render();
  },
  usePrev(i, j) { const d = S.active, it = d.items[i], p = prevSets(it.ex, d)?.[j]; if (p) { Object.assign(it.sets[j], { w: p.w, r: p.r }); save(); render(); } },
  addSet(i) { const it = doc().items[i], last = it.sets.at(-1); it.sets.push(newSet(last ? { w: last.w, r: last.r, type: last.type === 'W' ? 'N' : last.type } : {})); persistDoc(); render(); },
  stype(i, j) { ui.modal = { type: 'stype', i, j }; renderModal(); },
  setType(i, j, k) { doc().items[i].sets[j].type = k; after(); },
  dupSet(i, j) { const sets = doc().items[i].sets; sets.splice(+j + 1, 0, { ...sets[j], done: false }); after(); },
  delSet(i, j) { doc().items[i].sets.splice(j, 1); after(); },
  // 운동 메뉴
  imenu(i) { ui.modal = { type: 'imenu', i: +i }; renderModal(); },
  warm(i) {
    const it = doc().items[i], ws = it.sets.find(s => s.type !== 'W' && num(s.w) > 0);
    const W = ws ? num(ws.w) : best1rm(it.ex) * 0.75;
    if (!W) return toast('본세트 무게를 먼저 입력하세요');
    const st = stepOf(it.ex), bar = ex(it.ex).equip === '바벨' ? S.set.bar : 0;
    it.sets = [...[[0.5, 10], [0.7, 5], [0.85, 3]].map(([p, r]) => newSet({ w: Math.max(bar, rnd(W * p, st)), r, type: 'W' })), ...it.sets.filter(s => s.type !== 'W')];
    after();
  },
  pyr(i) {
    const it = doc().items[i], rm = best1rm(it.ex);
    if (!rm) return toast('1RM 계산할 기록이 없어요. 무게×횟수를 먼저 입력하세요');
    const st = stepOf(it.ex);
    it.sets = [...it.sets.filter(s => s.type === 'W'), ...[[0.6, 12], [0.7, 10], [0.8, 8], [0.85, 6]].map(([p, r]) => newSet({ w: rnd(rm * p, st), r }))];
    after();
  },
  drop(i) {
    const it = doc().items[i], last = [...it.sets].reverse().find(s => s.type !== 'W' && num(s.w) > 0);
    if (!last) return toast('본세트 무게를 먼저 입력하세요');
    const st = stepOf(it.ex);
    it.sets.push(...[0.8, 0.6].map(p => newSet({ w: rnd(num(last.w) * p, st), r: last.r, type: 'D' })));
    after();
  },
  plate(i) { const it = doc().items[i]; ui.modal = { type: 'plate', w: Math.max(0, ...it.sets.map(s => num(s.w))) || '' }; renderModal(); },
  plateW(v) { ui.modal.w = v; $('#platesOut').innerHTML = platesTxt(num(v)); },
  restSet(i) { const it = doc().items[i], v = prompt('이 운동 휴식 시간 (초)', it.rest || S.set.rest); if (v !== null) { it.rest = num(v) || null; after(); } },
  ss(i) {
    const d = doc(), it = d.items[i], next = d.items[+i + 1];
    if (it.ss && next.ss === it.ss) next.ss = 0; else { const g = it.ss || uid(); it.ss = g; next.ss = g; }
    normSS(d); after();
  },
  mv(i, dir) { const d = doc(), j = +i + +dir; if (j < 0 || j >= d.items.length) return; [d.items[i], d.items[j]] = [d.items[j], d.items[i]]; normSS(d); after(); },
  swap(i) { A.pickOpen(i); },
  del(i) { const d = doc(); if (!confirm(`${d.items[i].ex} 삭제할까요?`)) return; d.items.splice(i, 1); normSS(d); after(); },
  // 운동 선택
  pickOpen(rep) { ui.modal = { type: 'pick', q: '', part: '전체', sel: [], rep: rep === undefined ? null : +rep }; renderModal(); $('#modal input')?.focus(); },
  pickq(v) { ui.modal.q = v; $('#picklist').innerHTML = pickList(ui.modal); },
  pickPart(p) { ui.modal.part = p; $('#picklist').innerHTML = pickList(ui.modal); document.querySelectorAll('#modal .chip').forEach(c => c.classList.toggle('on', c.textContent === p)); },
  pickTog(n) {
    n = decodeURIComponent(n); const m = ui.modal, d = doc();
    if (m.rep != null) { const it = d.items[m.rep]; if (ex(it.ex).type !== ex(n).type) it.sets = newItem(n, d).sets; it.ex = n; return after(); }
    m.sel = m.sel.includes(n) ? m.sel.filter(x => x !== n) : [...m.sel, n];
    $('#picklist').innerHTML = pickList(m); $('#pickbtn').textContent = `추가 (${m.sel.length})`;
  },
  pickDone() { const d = doc(); for (const n of ui.modal.sel) d.items.push(newItem(n, d)); after(); },
  pickBack() { ui.modal = ui.pickSaved; renderModal(); },
  customNew() { ui.pickSaved = ui.modal; ui.modal = { type: 'custom' }; renderModal(); },
  customSave() {
    const name = $('#c_name').value.trim();
    if (!name) return toast('이름을 입력하세요');
    if (EX[name]) return toast('이미 있는 운동이에요');
    S.custom.push({ name, part: $('#c_part').value, equip: $('#c_equip').value, type: $('#c_type').value }); indexEx(); save();
    ui.modal = ui.pickSaved; ui.modal.q = name; if (ui.modal.rep == null) ui.modal.sel.push(name); renderModal();
  },
  customDel(n) {
    n = decodeURIComponent(n);
    if (exHistory(n).length && !confirm('기록이 있는 운동이에요. 목록에서만 지울까요? (기록은 남음)')) return;
    S.custom = S.custom.filter(c => c.name !== n); indexEx(); save(); A.close();
  },
  // 휴식
  restStart() { startRest(S.set.rest); },
  restAdd(n) { const t = S.timer; if (!t) return; t.end += n * 1000; t.total = Math.max(t.total, (t.end - Date.now()) / 1000); save(); tick(); },
  restSkip() { S.timer = null; save(); renderRest(); },
  // 기록
  wopen(id) { ui.modal = { type: 'wopen', id }; renderModal(); },
  wedit(id) {
    if (S.active) return toast('진행 중인 운동을 먼저 끝내세요');
    const w = S.workouts.find(x => x.id === id);
    S.active = { ...clone(w), editId: w.id }; save(); ui.modal = null; ui.view = 'workout'; scrollTo(0, 0); render();
  },
  again(id) { const w = S.workouts.find(x => x.id === id); begin(w.name, w.items, w.routineId); },
  toRoutine(id) {
    const w = S.workouts.find(x => x.id === id);
    S.routines.push({ id: uid(), name: w.name, folder: '', items: w.items.map(it => ({ ...clone(it), sets: it.sets.map(s => newSet({ w: s.w, r: s.r, type: s.type })) })) });
    save(); toast('루틴으로 저장했어요');
  },
  wdel(id) { if (!confirm('이 기록을 삭제할까요?')) return; S.workouts = S.workouts.filter(x => x.id !== id); save(); ui.modal = null; render(); },
  calday(ds) { ui.modal = { type: 'day', ds }; renderModal(); },
  exd(n) { ui.modal = { type: 'exd', n: decodeURIComponent(n) }; renderModal(); },
  month(n) { ui.month = Math.min(0, ui.month + +n); render(); },
  range(r) { ui.range = +r; render(); },
  // 루틴
  rnew() { ui.edit = { id: uid(), name: '', folder: '', items: [] }; ui.view = 'routine'; scrollTo(0, 0); render(); },
  redit(id) { ui.edit = clone(S.routines.find(x => x.id === id)); ui.view = 'routine'; scrollTo(0, 0); render(); },
  rcancel() { ui.view = null; ui.edit = null; render(); },
  rsave() {
    const r = ui.edit;
    if (!r.name.trim()) return toast('루틴 이름을 입력하세요');
    const k = S.routines.findIndex(x => x.id === r.id);
    if (k >= 0) S.routines[k] = r; else S.routines.push(r);
    save(); ui.view = null; ui.edit = null; render();
  },
  rdel() { if (!confirm('루틴을 삭제할까요?')) return; S.routines = S.routines.filter(x => x.id !== ui.edit.id); save(); A.rcancel(); },
  progs() { ui.modal = { type: 'progs' }; renderModal(); },
  progAdd(k) {
    const p = PROGRAMS[k];
    for (const [name, items] of p.days)
      S.routines.push({ id: uid(), name, folder: p.name, items: items.map(([n, spec, ref]) => ({ ex: n, ss: 0, rest: null, memo: spec.includes('+') ? '+ 표시 세트(마지막)는 가능한 만큼 최대 반복' : '', sets: parseSpec(spec, ref || n) })) });
    save(); ui.modal = null; render(); toast(`${p.name} 가져옴`);
  },
  // 신체
  bodyAdd() {
    const e = { date: $('#b_date').value || ymd(Date.now()), w: num($('#b_w').value) || '', m: num($('#b_m').value) || '', f: num($('#b_f').value) || '' };
    if (!e.w && !e.m && !e.f) return toast('값을 입력하세요');
    S.body = [...S.body.filter(b => b.date !== e.date), e].sort((a, b) => b.date.localeCompare(a.date));
    save(); render(); toast('기록했어요');
  },
  bdel(date) { S.body = S.body.filter(b => b.date !== date); save(); render(); },
  // 설정
  async notifyOn() { if (!window.Notification) return toast('이 브라우저는 알림 미지원 (아이폰은 홈 화면에 추가 후)'); await Notification.requestPermission(); render(); },
  testAlarm() { toast('5초 뒤 알림. 화면 꺼도 됨'); setTimeout(() => alarm(true), 5000); },
  async exportData() {
    const f = new File([JSON.stringify(S)], `gymlog-${ymd(Date.now())}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
  },
  importData() { $('#importFile').click(); },
  resetAll() {
    if (!confirm(`이 기기의 모든 기록·루틴·설정을 지웁니다.${SY.rt ? ' 서버 기록은 남기고 로그아웃해요.' : ' 되돌릴 수 없어요.'} 계속할까요?`)) return;
    Object.assign(SY, { at: null, rt: null, exp: 0, base: null, last: 0 }); sySave(); S = blank(); save(); indexEx(); render();
  },
};

// ---------- 이벤트 ----------
document.addEventListener('click', e => {
  unlockAudio();
  if (e.target.id === 'modal') return A.close();
  const el = e.target.closest('[data-a]'); if (!el) return;
  const [fn, ...args] = el.dataset.a.split(':');
  A[fn]?.(...args);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f != null) setField(el);
  else if (el.dataset.in) A[el.dataset.in](el.value);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.s) {
    const k = el.dataset.s;
    S.set[k] = el.type === 'checkbox' ? el.checked : typeof DEF[k] === 'number' ? num(el.value) || DEF[k] : el.value;
    save();
  }
  if (el.id === 'importFile' && el.files[0]) {
    el.files[0].text().then(t => {
      const x = JSON.parse(t);
      if (!Array.isArray(x.workouts)) throw new Error('짐로그 백업 파일이 아님');
      if (!confirm(`운동 ${x.workouts.length}회 기록을 불러옵니다. 현재 기록은 덮어씌워져요.`)) return;
      S = { ...blank(), ...x, set: { ...DEF, ...x.set } }; save(); indexEx(); render(); toast('불러왔어요');
    }).catch(err => toast('불러오기 실패: ' + err.message));
  }
});

// ---------- 동기화 (Supabase) ----------
// 유저당 한 행(jsonb)에 레코드 맵 저장. 레코드별 수정시각 u로 병합, 삭제는 묘비(del).
// 로컬 변경 감지는 지난 동기화 때 레코드 해시(base)와 비교. 업로드는 rev 낙관적 잠금.
// ponytail: 매번 전체 문서 업로드, 기록이 수 MB 넘으면 레코드별 행으로 분리
const SB_URL = 'https://kbotdssaktcsdbvqlwvq.supabase.co', SB_KEY = 'sb_publishable_u73Kts_nTertn0MowIiV1A_r3DG7WBY'; // 공개용 키 (RLS로 본인 행만 접근)
const SKEY = 'gymlog.sync';
let SY = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
SY.url ||= SB_URL; SY.key ||= SB_KEY;
const sySave = () => localStorage.setItem(SKEY, JSON.stringify(SY));
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
function recs() {
  const r = { set: S.set };
  for (const w of S.workouts) r['w:' + w.id] = w;
  for (const x of S.routines) r['r:' + x.id] = x;
  for (const b of S.body) r['b:' + b.date] = b;
  for (const c of S.custom) r['c:' + c.name] = c;
  return r;
}
function fromRecs(M) {
  const out = { w: [], r: [], b: [], c: [] };
  for (const [k, v] of Object.entries(M)) if (k === 'set') S.set = { ...DEF, ...v }; else out[k[0]].push(v);
  S.workouts = out.w.sort((a, b) => b.start - a.start);
  S.routines = out.r.sort((a, b) => a.id < b.id ? -1 : 1); // uid 앞부분이 생성 시각
  S.body = out.b.sort((a, b) => b.date.localeCompare(a.date));
  S.custom = out.c;
  indexEx();
}
async function authCall(path, body) {
  const r = await fetch(`${SY.url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SY.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'HTTP ' + r.status);
  return j;
}
function setSession(j) { Object.assign(SY, { at: j.access_token, rt: j.refresh_token, exp: Date.now() + j.expires_in * 1000, uid: j.user?.id || SY.uid, email: j.user?.email || SY.email }); sySave(); }
async function api(path, method = 'GET', body, prefer) {
  if (!SY.exp || SY.exp - 60000 < Date.now()) {
    try { setSession(await authCall('token?grant_type=refresh_token', { refresh_token: SY.rt })); }
    catch (e) { if (navigator.onLine) { SY.rt = null; sySave(); } throw e; }
  }
  const r = await fetch(SY.url + '/rest/v1/' + path, { method, body: body && JSON.stringify(body), headers: { apikey: SY.key, Authorization: 'Bearer ' + SY.at, 'Content-Type': 'application/json', ...(prefer && { Prefer: prefer }) } });
  if (r.status === 409) return null; // 동시 생성 충돌 -> 재시도
  if (!r.ok) throw new Error((await r.text()).slice(0, 200));
  return r.status === 204 || r.status === 201 ? [] : r.json();
}
let syncing = false, syncT;
function scheduleSync() { if (SY.rt) { clearTimeout(syncT); syncT = setTimeout(sync, 4000); } }
async function sync(force) {
  if (!SY.rt || syncing) return;
  syncing = true; SY.state = '동기화 중…';
  try {
    for (let tries = 0; tries < 4; tries++) {
      const now = Date.now(), loc = recs(), first = !SY.base, base = SY.base || {}, del = {};
      let dirty = false;
      if (!first) {
        for (const [k, v] of Object.entries(loc)) if (base[k] !== hash(JSON.stringify(v))) { v.u = now; dirty = true; }
        for (const k in base) if (!(k in loc)) { del[k] = now; dirty = true; }
      }
      if (!dirty && !force && !first && now - (SY.last || 0) < 30000) break;
      const before = hash(JSON.stringify(loc));
      const row = (await api(`gymlog?select=data,rev&user_id=eq.${SY.uid}`))[0];
      const R = row?.data || { recs: {}, del: {} }, D = { ...R.del }, M = {};
      for (const k in del) D[k] = Math.max(D[k] || 0, del[k]);
      for (const k of new Set([...Object.keys(loc), ...Object.keys(R.recs)])) {
        const a = loc[k], b = R.recs[k], pick = !a ? b : !b ? a : (a.u || 0) > (b.u || 0) ? a : b; // 동률이면 서버 우선
        if (!(D[k] >= (pick.u || 0))) M[k] = pick;
      }
      const data = { recs: M, del: D }, changedRemote = JSON.stringify(data) !== JSON.stringify(R);
      if (changedRemote) {
        const ok = row
          ? (await api(`gymlog?user_id=eq.${SY.uid}&rev=eq.${row.rev}`, 'PATCH', { data, rev: row.rev + 1, updated_at: new Date().toISOString() }, 'return=representation'))?.length
          : await api('gymlog', 'POST', { user_id: SY.uid, data, rev: 1 }, 'return=minimal');
        if (!ok) continue; // 다른 기기가 먼저 올림 -> 다시 받아서 병합
      }
      if (hash(JSON.stringify(recs())) !== before) continue; // 동기화 중 로컬이 바뀜 -> 다시
      const changedLocal = JSON.stringify(M) !== JSON.stringify(loc);
      fromRecs(M);
      SY.base = Object.fromEntries(Object.entries(M).map(([k, v]) => [k, hash(JSON.stringify(v))]));
      SY.last = Date.now();
      localStorage.setItem(KEY, JSON.stringify(S));
      if (changedLocal && !ui.view && !ui.modal && !document.activeElement?.matches('input,textarea')) render();
      break;
    }
    SY.state = '';
  } catch (e) { SY.state = navigator.onLine ? '실패: ' + e.message : '오프라인 (나중에 자동 동기화)'; }
  syncing = false; sySave();
  if (ui.tab === 'settings' && !ui.view) { const el = $('#syncState'); if (el) el.textContent = syncLine(); }
}
const syncLine = () => SY.state || (SY.last ? `마지막 동기화 ${dateTxt(SY.last)}` : '');
Object.assign(A, {
  async login(kind) {
    SY.url = ($('#sb_url')?.value || SY.url).trim().replace(/\/$/, ''); SY.key = ($('#sb_key')?.value || SY.key).trim();
    const email = $('#sy_email').value.trim(), password = $('#sy_pw').value;
    if (!SY.url || !SY.key) return toast('Supabase URL·키를 입력하세요');
    try {
      const j = await authCall(kind === 'up' ? 'signup' : 'token?grant_type=password', { email, password });
      if (!j.access_token) { sySave(); return toast('가입 확인 메일을 확인한 뒤 로그인하세요'); }
      await afterLogin(j);
    } catch (e) { toast('실패: ' + e.message); }
  },
  logout() { if (!confirm('로그아웃할까요? 이 기기의 기록은 그대로 남아요.')) return; Object.assign(SY, { at: null, rt: null, exp: 0, last: 0 }); sySave(); render(); },
  google() {
    if (!SY.url || !SY.key) return toast('Supabase URL·키를 입력하세요');
    sySave(); location.href = `${SY.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`;
  },
  async syncNow() { await sync(true); render(); toast(SY.state || '동기화 완료'); },
});
async function afterLogin(j) {
  const prev = SY.uid; setSession(j); if (SY.uid !== prev) SY.base = null;
  await sync(true); render(); toast('로그인했어요. 동기화 켜짐');
}
// 구글 로그인 후 돌아오면 주소 #뒤에 토큰이 붙어 옴
async function oauthReturn() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('access_token') && !h.has('error')) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (h.has('error')) return toast('구글 로그인 실패: ' + (h.get('error_description') || h.get('error')));
  try {
    const r = await fetch(SY.url + '/auth/v1/user', { headers: { apikey: SY.key, Authorization: 'Bearer ' + h.get('access_token') } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await afterLogin({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600, user: await r.json() });
  } catch (e) { toast('구글 로그인 실패: ' + e.message); }
}
function syncCard() {
  if (SY.rt) return `<div class="card"><b>☁️ 동기화</b><p class="muted">${esc(SY.email)} 로그인됨 · 기록이 자동으로 서버에 백업되고 다른 기기와 합쳐져요.</p>
    <p class="muted small" id="syncState">${esc(syncLine())}</p><div class="row"><button data-a="syncNow">지금 동기화</button><button data-a="logout">로그아웃</button></div></div>`;
  return `<div class="card"><b>☁️ 동기화</b><p class="muted">로그인하면 기록이 서버에 백업되고 폰·태블릿·PC에서 같이 보여요. 오프라인이면 나중에 자동으로 올라가요.</p>
    <button class="wide" data-a="google" style="background:#fff;color:#222;font-weight:700;margin-bottom:10px">G&nbsp; Google로 계속하기</button>
    <p class="muted small" style="text-align:center;margin:0 0 8px">또는 이메일</p>
    ${SB_URL ? '' : `<input id="sb_url" placeholder="Supabase URL (https://xxx.supabase.co)" value="${esc(SY.url)}" style="margin-bottom:6px"><input id="sb_key" placeholder="anon / publishable 키" value="${esc(SY.key)}" style="margin-bottom:6px">`}
    <input id="sy_email" type="email" autocomplete="email" placeholder="이메일" value="${esc(SY.email || '')}" style="margin-bottom:6px">
    <input id="sy_pw" type="password" autocomplete="current-password" placeholder="비밀번호 (6자 이상)">
    <div class="row" style="margin-top:8px"><button class="pri" data-a="login:in">로그인</button><button data-a="login:up">가입</button></div>
    ${SY.state ? `<p class="muted small">${esc(SY.state)}</p>` : ''}</div>`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
addEventListener('online', () => sync());

let tt;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2200); }

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
navigator.storage?.persist?.();
if (S.active) wake(true);
render();
oauthReturn().then(() => sync());
