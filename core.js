'use strict';
// 짐로그: 운동 기록 PWA. 상태 전부 localStorage 한 키에 JSON으로 저장.
// ponytail: localStorage 약 5MB 한도(운동 기록 수년치는 충분), 넘치면 IndexedDB로 이전.

const APP_VER = '2026.10.20'; // 배포할 때 올림. 의견 보내기에 같이 저장돼 어느 버전 문제인지 앎
const KEY = 'gymlog.v1';
const DEF = { height: 175, rest: 90, vibrate: true, sound: true, wake: true, autoRoutine: 'same', rpe: false, nick: '', fav: [], setN: 3, setR: 10, dbs: '', stepB: 2.5, stepD: 2, stepM: 5, restW: 60, warmEx: true, weekStart: 1, ivWork: 20, ivRest: 10, ivRounds: 8, bar: 20, plates: '25,20,15,10,5,2.5,1.25' };
const TYPES = { N: '일반', W: '웜업', D: '드롭', F: '실패', P: '피더', R: '레스트-퍼즈' };
const TYPE_DESC = { N: '본세트', W: '볼륨·1RM 집계 제외', D: '무게 낮춰 바로 이어서', F: '실패 지점까지', P: '가벼운 무게로 펌핑', R: '짧게 쉬고 이어서 반복' };
const COLS = { w: ['kg', '회'], b: ['+kg', '회'], t: [null, '초'], c: ['km', '분'] };
const PARTS = Object.keys(EXERCISES);
const EQUIPS = ['바벨', '덤벨', '머신', '스미스머신', '케이블', '케틀벨', '밴드', '맨몸', '폼롤러', '기타'];
const CATS = ['근력', '맨몸', '유산소', '스트레칭', '역도']; // 운동 종류
const MUSCLE_KO = { chest: '가슴', shoulders: '어깨', triceps: '삼두', biceps: '이두', lats: '광배', 'middle back': '등 중앙', 'lower back': '허리', traps: '승모근', abdominals: '복근', quadriceps: '대퇴사두', hamstrings: '햄스트링', glutes: '둔근', calves: '종아리', forearms: '전완', adductors: '내전근', abductors: '외전근', neck: '목' };
const MUSCLES = ['chest', 'lats', 'middle back', 'traps', 'lower back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck'].map(m => MUSCLE_KO[m]);
const PART_MUSCLE = { 가슴: ['chest', 'shoulders,triceps'], 등: ['lats,middle back', 'biceps,lower back'], 어깨: ['shoulders', 'triceps,traps'], 하체: ['quadriceps,glutes', 'hamstrings,calves'], 팔: ['biceps,triceps', 'forearms'], 복근: ['abdominals', ''], 유산소: ['quadriceps,calves', 'hamstrings,glutes'], 전신: ['quadriceps,glutes,shoulders', 'hamstrings,lower back,traps'], 스트레칭: ['hamstrings', 'lower back'], 기타: ['', ''] };
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
  for (const [part, list] of Object.entries(EXERCISES)) for (const [name, equip, type] of list) EX[name] = meta({ name, part, equip, type });
  for (const c of S.custom) EX[c.name] = meta({ ...c, equip: c.equip === '스미스' ? '스미스머신' : c.equip, custom: true });
}
// 운동 종류(cat)와 주동근(mus, 한글) 붙임. 주동근은 media.js, 없으면 부위 기본값
function meta(e) {
  const m = MEDIA[e.name], p = m?.[1] || (PART_MUSCLE[e.part] || PART_MUSCLE.기타)[0];
  e.cat = e.part === '유산소' || e.part === '스트레칭' ? e.part : OLYMPIC.includes(e.name) ? '역도' : e.equip === '맨몸' ? '맨몸' : '근력';
  e.mus = p ? p.split(',').map(x => MUSCLE_KO[x] || x) : [];
  return e;
}
indexEx();
const ex = n => EX[n] || { name: n, part: '기타', equip: '기타', type: 'w', cat: '근력', mus: [] };
const doc = () => ui.view === 'workout' ? S.active : ui.edit;

// ---------- 계산 ----------
const e1rm = (w, r) => w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0; // Epley
const counts = s => s.type !== 'W' || !S.set.warmEx; // 웜업 세트는 설정에 따라 볼륨·1RM·세트 수에서 뺌
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
const stepOf = name => { const q = ex(name).equip; return num(q === '덤벨' ? S.set.stepD : q === '머신' || q === '케이블' ? S.set.stepM : q === '케틀벨' ? 4 : S.set.stepB) || 2.5; };
// 자동 무게(웜업·피라미드·드롭): 덤벨은 가진 덤벨 중 가장 가까운 무게, 나머지는 증량 단위로 반올림
function roundW(name, v) {
  const dbs = ex(name).equip === '덤벨' ? S.set.dbs.split(',').map(num).filter(x => x > 0) : [];
  return dbs.length ? dbs.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a) : rnd(v, stepOf(name));
}
// 캘린더 시작 요일 (1=월, 0=일): 요일 칸 순서와 1일 앞 빈칸 수
const weekDays = () => Array.from({ length: 7 }, (_, k) => (k + S.set.weekStart) % 7);
const dayOff = d => (d.getDay() - S.set.weekStart + 7) % 7;
const rnd = (v, st) => Math.round(v / st) * st;
const newSet = (o = {}) => ({ w: '', r: '', type: 'N', rpe: '', done: false, ...o });
function newItem(name, d) {
  const p = prevSets(name, d);
  return { ex: name, ss: 0, rest: null, memo: '', sets: p ? p.map(s => newSet({ w: s.w, r: s.r, type: s.type })) : Array.from({ length: Math.max(1, num(S.set.setN)) }, () => newSet({ r: num(S.set.setR) || '' })) };
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

// ---------- 운동 그림 · 근육 지도 ----------
const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/';
const GIF_BASE = 'https://static.exercisedb.dev/media/'; // ExerciseDB 무료 V1 애니메이션. 실패하면 사진으로 대체
const MUSCLE_POLY = { chest: ['chest'], shoulders: ['front-deltoids', 'back-deltoids'], triceps: ['triceps'], biceps: ['biceps'], lats: ['upper-back'], 'middle back': ['upper-back'], 'lower back': ['lower-back'], traps: ['trapezius'], abdominals: ['abs', 'obliques'], quadriceps: ['quadriceps'], hamstrings: ['hamstring'], glutes: ['gluteal'], calves: ['calves', 'left-soleus', 'right-soleus'], forearms: ['forearm'], adductors: ['adductor'], abductors: ['abductors'], neck: ['neck'] };
function exMedia(name) {
  const m = MEDIA[name], [p, s] = m?.[1] ? [m[1], m[2]] : PART_MUSCLE[ex(name).part] || ['', ''];
  return { img: m?.[0] && IMG_BASE + m[0] + '/', gif: m?.[3] && GIF_BASE + m[3] + '.gif', p: p ? p.split(',') : [], s: s ? s.split(',') : [] };
}
function bodyMap(p, s) {
  const hi = {};
  for (const m of s) for (const k of MUSCLE_POLY[m] || []) hi[k] = 's';
  for (const m of p) for (const k of MUSCLE_POLY[m] || []) hi[k] = 'p';
  const svg = (side, h) => `<svg viewBox="0 0 1000 ${h}" class="body">${BODY[side].map(([k, ps]) => ps.map(pt => `<polygon points="${pt}" class="m ${hi[k] || ''}"/>`).join('')).join('')}</svg>`;
  return `<div class="bodymap">${svg('front', 1955)}${svg('back', 2200)}</div>`;
}
// ponytail: 썸네일도 원본 jpg(약 70KB)를 씀, 목록이 무거우면 썸네일 생성 서버/빌드로
const thumb = (name, zoom) => {
  const m = exMedia(name), a = zoom ? ` data-a="zoom:${encodeURIComponent(name)}"` : '';
  if (m.gif) return `<img class="thumb" loading="lazy" src="${m.gif}" alt=""${a} onerror="${m.img ? `this.onerror=null;this.src='${m.img}0.jpg'` : 'this.style.visibility=`hidden`'}">`;
  return m.img ? `<img class="thumb" loading="lazy" src="${m.img}0.jpg" alt=""${a}>` : `<span class="thumb ph"${a}>${esc(ex(name).part[0])}</span>`;
};
const ko = l => l.map(m => MUSCLE_KO[m] || m).join(', ');
const mediaHTML = n => {
  const m = exMedia(n);
  return (m.gif ? `<div class="anim gif"><img src="${m.gif}" alt="" onerror="${m.img ? `this.onerror=null;this.src='${m.img}0.jpg'` : 'this.parentNode.remove()'}"></div>` : m.img ? `<div class="anim"><img src="${m.img}0.jpg" alt=""><img src="${m.img}1.jpg" alt=""></div>` : '') +
    (m.p.length ? `${bodyMap(m.p, m.s)}<p style="text-align:center;margin:4px 0 12px"><span class="dot p"></span>주동근 <b>${ko(m.p)}</b>${m.s.length ? ` &nbsp;<span class="dot s"></span>보조 ${ko(m.s)}` : ''}</p>` : '');
};

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
  if (bar) { const bw = Math.max(2, (W - L - R) / n * 0.6); g += pts.map((p, i) => `<rect x="${X(i) - bw / 2}" y="${Y(p.v)}" width="${bw}" height="${Math.max(0, Y(mn) - Y(p.v))}" rx="2" style="fill:var(--ink)"><title>${p.l} ${f1(p.v)}${unit}</title></rect>`).join(''); }
  else g += `<polyline points="${pts.map((p, i) => X(i) + ',' + Y(p.v)).join(' ')}" style="fill:none;stroke:var(--ink);stroke-width:2"/>` + pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="2.5" style="fill:var(--ink)"><title>${p.l} ${f1(p.v)}${unit}</title></circle>`).join('');
  const lab = bar && n <= 12 ? pts.map((p, i) => [i, p.l]) : [[0, pts[0].l], [n - 1, pts[n - 1].l]];
  g += lab.map(([i, l]) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${bar || n < 2 ? 'middle' : i ? 'end' : 'start'}">${esc(l)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}


let tt;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2200); }
