'use strict';
// 화면: 렌더 · 각 탭 화면 · 모달 · 버튼 동작(A) · 입력 이벤트
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
    el.innerHTML = `<div class="inner between"><span><b class="num" style="font-size:22px">${wSets(d)}</b> <span class="muted">세트</span> &nbsp;<b class="num" style="font-size:22px">${f1(wVol(d))}</b> <span class="muted">kg</span></span><button class="auto" data-a="restStart">휴식 ${S.set.rest}초</button></div>`;
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
      ${W ? `<td><button class="chk" data-a="done:${i}:${j}" aria-label="완료"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></td>` : ''}</tr>`;
  }).join('');
  return `<div class="ex ${it.ss ? 'ss' : ''}">
    ${it.ss && d.items[i - 1]?.ss === it.ss ? '<div class="sslab">위 운동과 슈퍼세트</div>' : ''}
    <div class="between"><div class="exhead" data-a="exd:${encodeURIComponent(it.ex)}">${thumb(it.ex)}<div><div class="name">${esc(it.ex)}</div>
      <div class="muted">${e.part} · ${e.equip}${it.rest ? ` · 휴식 ${it.rest}초` : ''}${rm}</div></div></div>
      <button class="more auto" data-a="imenu:${i}" aria-label="메뉴"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>
    <table class="sets"><colgroup><col style="width:40px">${W ? '<col>' : ''}${cols[0] ? '<col>' : ''}<col>${S.set.rpe ? '<col style="width:58px">' : ''}${W ? '<col style="width:46px">' : ''}</colgroup>
      <thead><tr><th>세트</th>${W ? '<th>이전</th>' : ''}${cols[0] ? `<th>${cols[0]}</th>` : ''}<th>${cols[1]}</th>${S.set.rpe ? '<th>RPE</th>' : ''}${W ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table>
    <button class="addset" data-a="addSet:${i}">+ 세트 추가</button>
    <textarea class="memo" data-f="${i}:-1:memo" placeholder="메모 남기기" rows="1">${esc(it.memo || '')}</textarea>
  </div>`;
}
const editorHTML = (d, mode) => d.items.length ? d.items.map((it, i) => cardHTML(d, it, i, mode)).join('') : '<p class="muted" style="text-align:center;padding:30px 0">운동을 추가하세요</p>';

function workoutView() {
  const d = S.active;
  return `<div class="whead between"><button class="ghost auto" data-a="minimize">내리기</button>
    <b id="${d.editId ? '' : 'elapsed'}">${d.editId ? '기록 수정' : ''}</b><button class="pri auto" data-a="finish">완료</button></div>
    <input class="title-in" value="${esc(d.name)}" data-f="name" placeholder="운동 이름">
    ${editorHTML(d, 'w')}
    <button class="wide" data-a="pickOpen">+ 운동 추가</button>
    <button class="wide ghost danger" data-a="discard" style="margin-top:8px">${d.editId ? '수정 취소' : '운동 취소'}</button>`;
}
function routineEditView() {
  const r = ui.edit, folders = [...new Set(S.routines.map(x => x.folder).filter(Boolean))];
  return `<div class="whead between"><button class="ghost auto" data-a="rcancel">취소</button><b>루틴 편집</b><button class="pri auto" data-a="rsave">저장</button></div>
    <input class="title-in" value="${esc(r.name)}" data-f="name" placeholder="루틴 이름" style="margin-bottom:4px">
    <input value="${esc(r.folder)}" data-f="folder" list="folders" placeholder="폴더 (선택)" style="margin-bottom:12px">
    <datalist id="folders">${folders.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    ${editorHTML(r, 'r')}
    <button class="wide" data-a="pickOpen">+ 운동 추가</button>
    ${S.routines.some(x => x.id === r.id) ? '<button class="wide" data-a="rshare" style="margin-top:8px;background:var(--card)">링크로 공유</button><button class="wide ghost danger" data-a="rdel" style="margin-top:8px">루틴 삭제</button>' : ''}`;
}
const exSummary = items => esc(items.map(it => it.ex).join(', '));

const VIEWS = {
  home() {
    const a = S.active, now = new Date(), mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOff(now));
    const days = new Set(S.workouts.map(w => ymd(w.start)));
    const week = Array.from({ length: 7 }, (_, k) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + k));
    const routines = [...S.routines].sort((x, y) => (y.used || 0) - (x.used || 0)).slice(0, 6);
    const hist = S.workouts.slice(0, ui.histN);
    const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    return `<div class="between"><div><div class="date">${now.getMonth() + 1}월 ${now.getDate()}일 ${DOW[now.getDay()]}요일</div><h1>운동</h1></div><button class="avbtn auto" data-a="sOpen:profile" aria-label="프로필">${avatar('md')}</button></div>
      ${levelCard()}
      <div class="card"><div class="between"><h3>이번 주</h3><span class="muted"><b class="num" style="font-size:20px;color:var(--text)">${week.filter(d => days.has(ymd(d))).length}</b>회 운동</span></div>
        <div class="week">${week.map(d => `<div class="${days.has(ymd(d)) ? 'w' : ''} ${ymd(d) === ymd(now) ? 'today' : ''}" ${days.has(ymd(d)) ? `data-a="calday:${ymd(d)}"` : ''}>${DOW[d.getDay()]}<b>${d.getDate()}</b></div>`).join('')}</div></div>
      ${a ? `<div class="card live"><div class="between"><div class="grow"><b>${a.editId ? '기록 수정 중' : '운동 진행 중'}</b><div class="muted ell">${esc(a.name)} · ${a.items.length}개 운동</div></div><button class="auto" data-a="resume">이어하기</button></div></div>`
        : '<button class="pri wide" data-a="start:">빈 운동 시작</button>'}
      <h2>루틴으로 시작</h2>
      ${routines.length ? `<div class="card list">${routines.map(r => `<div class="between"><div class="grow"><b>${esc(r.name)}</b><div class="muted ell">${exSummary(r.items)}</div></div><button class="go auto" data-a="start:${r.id}">시작</button></div>`).join('')}</div>`
        : '<p class="muted">루틴 탭에서 루틴을 만들거나 프로그램을 가져오세요.</p>'}
      <h2>기록</h2>
      ${hist.length ? `<div class="card list">${hist.map(w => { const d = new Date(w.start); return `<div class="hrow" data-a="wopen:${w.id}"><div class="dbadge"><b>${d.getDate()}</b><span>${d.getMonth() + 1}월 ${DOW[d.getDay()]}</span></div><div class="grow"><b class="ell" style="display:block">${esc(w.name)}</b><div class="muted">${hm(w.start)} · ${dur(w.end - w.start)} · ${wSets(w)}세트</div></div><div class="num vol">${f1(wVol(w))}<small>kg</small></div></div>`; }).join('')}</div>
        ${S.workouts.length > ui.histN ? '<button class="wide ghost" data-a="more">더 보기</button>' : ''}` : '<p class="muted">아직 기록이 없어요. 첫 운동을 시작해 보세요.</p>'}`;
  },
  routines() {
    const groups = {};
    for (const r of S.routines) (groups[r.folder || '기본'] ||= []).push(r);
    return `<h1>루틴</h1><div class="row"><button class="pri" data-a="rnew">+ 새 루틴</button><button style="background:var(--card)" data-a="progs">프로그램 가져오기</button></div>
      ${Object.entries(groups).map(([f, rs]) => `<div class="between"><h2>${esc(f)}</h2><button class="ghost auto" style="margin-top:16px" data-a="pubOpen:${encodeURIComponent(f)}">공유</button></div><div class="card list">${rs.map(r => `<div class="between"><div class="grow" data-a="redit:${r.id}"><b>${esc(r.name)}</b><div class="muted">${r.items.length}개 운동 · ${sum(r.items, it => it.sets.length)}세트</div><div class="muted small ell">${exSummary(r.items)}</div></div><button class="ghost auto" data-a="redit:${r.id}">편집</button><button class="go auto" data-a="start:${r.id}">시작</button></div>`).join('')}</div>`).join('')
      || '<p class="muted" style="margin-top:20px">루틴이 없어요. 새로 만들거나 프로그램을 가져오세요.</p>'}`;
  },
  stats() {
    const now = new Date(), base = new Date(now.getFullYear(), now.getMonth() + ui.month, 1);
    const mstat = d0 => { const a = d0.getTime(), b = new Date(d0.getFullYear(), d0.getMonth() + 1, 1).getTime(), ws = S.workouts.filter(w => w.start >= a && w.start < b); return { ws, n: ws.length, time: sum(ws, w => w.end - w.start), vol: sum(ws, wVol), sets: sum(ws, wSets) }; };
    const cur = mstat(base), prv = mstat(new Date(base.getFullYear(), base.getMonth() - 1, 1));
    const diff = (a, b) => b ? `<span class="${a >= b ? 'up' : 'down'} small">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}%</span>` : '';
    // 캘린더
    const days = {}; for (const w of cur.ws) days[new Date(w.start).getDate()] = 1;
    const first = dayOff(base), dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const cal = weekDays().map(k => `<div class="hd">${DOW[k]}</div>`).join('') + '<div></div>'.repeat(first) +
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
      <div class="between" style="margin-bottom:10px"><button class="mnav auto" data-a="month:-1" aria-label="이전 달">‹</button><b style="font-size:17px">${base.getFullYear()}년 ${base.getMonth() + 1}월</b><button class="mnav auto" data-a="month:1" aria-label="다음 달" ${ui.month >= 0 ? 'disabled style="opacity:.3"' : ''}>›</button></div>
      <div class="grid2">
        <div class="stat"><span class="muted">운동 횟수</span><b>${cur.n}회</b>${diff(cur.n, prv.n)}</div>
        <div class="stat"><span class="muted">총 시간</span><b>${dur(cur.time)}</b>${diff(cur.time, prv.time)}</div>
        <div class="stat"><span class="muted">총 볼륨</span><b>${f1(cur.vol)}kg</b>${diff(cur.vol, prv.vol)}</div>
        <div class="stat"><span class="muted">총 세트</span><b>${cur.sets}</b>${diff(cur.sets, prv.sets)}</div>
      </div>
      <div class="card" style="margin-top:8px"><div class="cal">${cal}</div><button class="ghost" style="display:block;margin:8px auto 0" data-a="monthRep:${base.getFullYear()}:${base.getMonth()}">${base.getMonth() + 1}월 리포트 보기</button></div>
      <h2>월별 총 볼륨</h2><div class="card">${chart(mv, true, 'kg')}</div>
      <h2>부위별 성장률</h2>
      <div class="chips">${[1, 3, 6].map(r => `<button class="chip ${ui.range === r ? 'on' : ''}" data-a="range:${r}">최근 ${r}개월</button>`).join('')}</div>
      <div class="card" style="margin-top:8px">${parts.length ? `<table class="sets"><thead><tr><th style="text-align:left">부위</th><th>세트</th><th>볼륨</th><th>이전 대비</th></tr></thead><tbody>${parts.map(p => { const c = pc[p] || { sets: 0, vol: 0 }, q = pp[p] || { sets: 0, vol: 0 }, a = c.vol || c.sets, b = q.vol || q.sets; return `<tr><td style="text-align:left">${p}</td><td>${c.sets}</td><td>${short(c.vol)}</td><td>${b ? diff(a, b) : '<span class="muted small">신규</span>'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">데이터 없음</p>'}</div>
      <h2>3대 운동 (추정 1RM)</h2>
      <div class="card list">${big.map(x => `<div class="between" data-a="exd:${encodeURIComponent(x.n)}"><span>${x.n}</span><b class="num auto" style="font-size:20px">${x.e1 ? f1(x.e1) + 'kg' : '-'}</b></div>`).join('')}<div class="between"><b>합계</b><b class="num auto" style="font-size:24px">${f1(sum(big, x => x.e1))}kg</b></div></div>
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
      ${S.body.length ? `<h2>기록</h2><div class="card list">${S.body.map(b => `<div class="between"><span class="num">${b.date}</span><span class="muted">${b.w || '-'}kg · 근육 ${b.m || '-'} · 지방 ${b.f || '-'}%</span><button class="ghost auto danger" data-a="bdel:${b.date}">삭제</button></div>`).join('')}</div>` : ''}`;
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
// 운동 선택 필터 4줄: 모음 / 종류 / 세부 근육 / 기구. 줄마다 '전체' 포함
const PICK_ROWS = [['src', ['즐겨찾기', '최근', '커스텀']], ['cat', CATS], ['mus', MUSCLES], ['eq', EQUIPS]];
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const isFav = n => S.set.fav.includes(n);
function pickList(m) {
  const q = m.q.replace(/\s/g, '').toLowerCase(), f = m.f;
  let names = Object.keys(EX);
  if (f.src === '최근') names = [...new Set(S.workouts.flatMap(w => w.items.map(it => it.ex)))].filter(n => EX[n]).slice(0, 40);
  else if (f.src === '즐겨찾기') names = S.set.fav.filter(n => EX[n]);
  else if (f.src === '커스텀') names = names.filter(n => EX[n].custom);
  names = names.filter(n => { const e = EX[n]; return (f.cat === '전체' || e.cat === f.cat) && (f.mus === '전체' || e.mus.includes(f.mus)) && (f.eq === '전체' || e.equip === f.eq); });
  if (q) names = names.filter(n => { const k = n.replace(/\s/g, '').toLowerCase(); return k.includes(q) || cho(k).includes(q); });
  return names.map(n => `<div class="pick ${m.sel.includes(n) ? 'on' : ''}" data-a="pickTog:${encodeURIComponent(n)}"><div class="exhead">${thumb(n, true)}<div><div>${esc(n)}</div><div class="muted small">${esc(EX[n].mus.join(', ') || EX[n].part)} · ${esc(EX[n].equip)}${EX[n].custom ? ' · 커스텀' : ''}</div></div></div>
    <button class="star auto ${isFav(n) ? 'on' : ''}" data-a="fav:${encodeURIComponent(n)}" aria-label="즐겨찾기">${STAR}</button><span class="tick"></span></div>`).join('')
    || `<p class="muted" style="padding:20px 0;text-align:center">${m.f.src === '즐겨찾기' ? '별을 눌러 자주 하는 운동을 모아 두세요.' : '조건에 맞는 운동이 없어요.'}</p>`;
}
const pickChips = m => PICK_ROWS.map(([k, vals]) => `<div class="chips">${['전체', ...vals].map(v => `<button class="chip ${m.f[k] === v ? 'on' : ''}" data-a="pickF:${k}:${v}">${v}</button>`).join('')}</div>`).join('');
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
    <div id="pickchips">${pickChips(m)}</div>
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
    <button class="opt" data-a="dupSet:${m.i}:${m.j}">세트 복제</button><button class="opt danger" data-a="delSet:${m.i}:${m.j}">세트 삭제</button>`,
  imenu: m => {
    const d = doc(), it = d.items[m.i], next = d.items[m.i + 1], linked = it.ss && next?.ss === it.ss;
    return `<h3>${esc(it.ex)}</h3>
      <button class="opt" data-a="warm:${m.i}">웜업 세트 자동 추가</button>
      <button class="opt" data-a="pyr:${m.i}">피라미드 세트 자동 (1RM 기준)</button>
      <button class="opt" data-a="drop:${m.i}">드롭 세트 자동 추가</button>
      <button class="opt" data-a="plate:${m.i}">원판 계산</button>
      <button class="opt" data-a="restSet:${m.i}">휴식 시간 (${it.rest || S.set.rest}초)</button>
      ${next ? `<button class="opt" data-a="ss:${m.i}">${linked ? '다음 운동과 슈퍼세트 해제' : '다음 운동과 슈퍼세트'}</button>` : ''}
      <div class="row"><button class="opt" data-a="mv:${m.i}:-1">위로 이동</button><button class="opt" data-a="mv:${m.i}:1">아래로 이동</button></div>
      <button class="opt" data-a="swap:${m.i}">운동 교체</button>
      <button class="opt" data-a="exd:${encodeURIComponent(it.ex)}">기록 보기</button>
      <a class="opt" style="color:inherit;text-decoration:none" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(it.ex + ' 자세')}">자세 가이드 영상 (YouTube)</a>
      <button class="opt danger" data-a="del:${m.i}">운동 삭제</button>`;
  },
  plate: m => `<div class="between"><h3>원판 계산</h3>${closeBtn}</div>
    <input inputmode="decimal" data-in="plateW" value="${esc(m.w)}" placeholder="목표 무게 (kg)" style="margin:10px 0;font-size:18px">
    <div id="platesOut">${platesTxt(num(m.w))}</div><p class="muted small">원판·바벨 무게는 설정에서 변경</p>`,
  progs: m => `<div class="between"><h3>프로그램</h3>${closeBtn}</div>
    <div class="chips" style="margin:6px 0 12px">${[['base', '기본 프로그램'], ['shared', '모두의 프로그램']].map(([k, t]) => `<button class="chip ${m.tab === k ? 'on' : ''}" data-a="progTab:${k}">${t}</button>`).join('')}</div>
    ${m.tab === 'shared' ? sharedList(m) : `<p class="muted">가져오면 루틴 탭에 폴더로 추가됩니다. % 기반 프로그램은 기존 기록의 추정 1RM×0.9로 무게 계산.</p>
    ${PROGRAMS.map((p, k) => `<div class="card" style="background:var(--card2)"><h3>${p.name}</h3><div class="muted">${p.desc}</div><div class="muted small">${p.days.map(d => esc(d[0])).join(' / ')}</div><button class="pri" style="margin-top:8px" data-a="progAdd:${k}">가져오기</button></div>`).join('')}`}`,
  wopen: m => {
    const w = S.workouts.find(x => x.id === m.id); if (!w) return closeBtn;
    const d = new Date(w.start), tab = m.tab || 'sum';
    return `${m.lv ? `<div class="lvup"><b>레벨 업!</b> Lv.${m.lv} 달성</div>` : ''}${newBadgeHTML(m.nb || [])}${m.prs?.length ? `<div class="pr"><b>신기록</b>${m.prs.map(p => `<div>${esc(p)}</div>`).join('')}</div>` : ''}
      <div class="between"><h3>${esc(w.name)}</h3>${closeBtn}</div>
      <div class="seg">${[['sum', '요약'], ['detail', '상세'], ['month', `${d.getMonth() + 1}월`]].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-a="rtab:${k}">${t}</button>`).join('')}</div>
      ${tab === 'detail' ? detailCard(w) : tab === 'month' ? monthCard(d.getFullYear(), d.getMonth()) : sumCard(w)}
      <button class="pri wide" style="margin-top:12px" data-a="rshot">이미지로 공유</button>
      <div class="grid2" style="margin-top:8px"><button data-a="wedit:${w.id}">수정</button><button data-a="again:${w.id}">다시 하기</button><button data-a="toRoutine:${w.id}">루틴으로 저장</button><button class="danger" data-a="wdel:${w.id}">삭제</button></div>`;
  },
  day: m => `<div class="between"><h3>${m.ds}</h3>${closeBtn}</div><div class="list">${S.workouts.filter(w => ymd(w.start) === m.ds).map(w => `<div class="between" data-a="wopen:${w.id}"><b>${esc(w.name)}</b><span class="muted auto">${dur(w.end - w.start)} · ${f1(wVol(w))}kg</span></div>`).join('')}</div>`,
  exd: m => {
    const n = m.n, e = ex(n), h = exHistory(n), asc = h.slice(0, 40).reverse(), b = bestOf(n), heavy = e.type === 'w' || e.type === 'b';
    const pts = k => asc.map(x => ({ l: md(x.w.start), v: sessStats(x.sets, e)[k] }));
    return `<div class="between"><h3>${esc(n)}</h3><button class="star auto ${isFav(n) ? 'on' : ''}" data-a="fav:${encodeURIComponent(n)}" aria-label="즐겨찾기">${STAR}</button>${closeBtn}</div><div class="muted">${esc(e.cat)} · ${esc(e.mus.join(', '))} · ${esc(e.equip)} · ${h.length}회 수행</div>
      ${mediaHTML(n)}
      ${heavy ? `<div class="grid3" style="margin:10px 0"><div class="stat"><span class="muted">추정 1RM</span><b>${f1(b.e1)}</b></div><div class="stat"><span class="muted">최고 중량</span><b>${f1(b.w)}</b></div><div class="stat"><span class="muted">최고 볼륨</span><b>${short(b.vol)}</b></div></div>
        <b>추정 1RM</b>${chart(pts('e1'), false, 'kg')}<b>최고 중량</b>${chart(pts('w'), false, 'kg')}<b>볼륨</b>${chart(pts('vol'), true, 'kg')}`
        : `<b>${COLS[e.type][1]}</b>${chart(pts('r'), false)}`}
      <p><a style="color:var(--acc)" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(n + ' 자세')}">자세 가이드 영상 (YouTube)</a></p>
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
    const prs = findPRs(d), w = { ...d }, P0 = playerStats();
    delete w.editId;
    if (!d.editId) { w.end = Date.now(); updateRoutines(w); }
    S.workouts = S.workouts.filter(x => x.id !== w.id); S.workouts.push(w); S.workouts.sort((a, b) => b.start - a.start);
    S.active = null; S.timer = null; save(); wake(false);
    const P1 = playerStats(), nb = d.editId ? [] : newBadges(P0, P1);
    ui.view = null; ui.tab = 'home'; ui.modal = { type: 'wopen', id: w.id, prs, nb, lv: !d.editId && P1.L > P0.L ? P1.L : 0 }; scrollTo(0, 0); render();
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
      if (!(it.ss && next?.ss === it.ss)) startRest(s.type === 'W' ? num(S.set.restW) || S.set.rest : it.rest || S.set.rest); // 슈퍼세트는 묶음 마지막 운동 뒤에만 휴식. 웜업 뒤는 웜업 휴식
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
    const bar = ex(it.ex).equip === '바벨' ? S.set.bar : 0;
    it.sets = [...[[0.5, 10], [0.7, 5], [0.85, 3]].map(([p, r]) => newSet({ w: Math.max(bar, roundW(it.ex, W * p)), r, type: 'W' })), ...it.sets.filter(s => s.type !== 'W')];
    after();
  },
  pyr(i) {
    const it = doc().items[i], rm = best1rm(it.ex);
    if (!rm) return toast('1RM 계산할 기록이 없어요. 무게×횟수를 먼저 입력하세요');
    it.sets = [...it.sets.filter(s => s.type === 'W'), ...[[0.6, 12], [0.7, 10], [0.8, 8], [0.85, 6]].map(([p, r]) => newSet({ w: roundW(it.ex, rm * p), r }))];
    after();
  },
  drop(i) {
    const it = doc().items[i], last = [...it.sets].reverse().find(s => s.type !== 'W' && num(s.w) > 0);
    if (!last) return toast('본세트 무게를 먼저 입력하세요');
    it.sets.push(...[0.8, 0.6].map(p => newSet({ w: roundW(it.ex, num(last.w) * p), r: last.r, type: 'D' })));
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
  pickOpen(rep) { ui.modal = { type: 'pick', q: '', f: { src: '전체', cat: '전체', mus: '전체', eq: '전체' }, sel: [], rep: rep === undefined ? null : +rep }; renderModal(); $('#modal input')?.focus(); },
  pickq(v) { ui.modal.q = v; $('#picklist').innerHTML = pickList(ui.modal); },
  pickF(k, v) { const m = ui.modal; m.f[k] = v; $('#pickchips').innerHTML = pickChips(m); $('#picklist').innerHTML = pickList(m); },
  fav(n) {
    n = decodeURIComponent(n); S.set.fav = isFav(n) ? S.set.fav.filter(x => x !== n) : [...S.set.fav, n]; save();
    if (ui.modal?.type === 'pick') $('#picklist').innerHTML = pickList(ui.modal); else renderModal();
  },
  pickTog(n) {
    n = decodeURIComponent(n); const m = ui.modal, d = doc();
    if (m.rep != null) { const it = d.items[m.rep]; if (ex(it.ex).type !== ex(n).type) it.sets = newItem(n, d).sets; it.ex = n; return after(); }
    m.sel = m.sel.includes(n) ? m.sel.filter(x => x !== n) : [...m.sel, n];
    $('#picklist').innerHTML = pickList(m); $('#pickbtn').textContent = `추가 (${m.sel.length})`;
  },
  // 운동 선택 중 사진 크게 보기 (선택 목록 위에 겹쳐 띄움)
  zoom(n) {
    n = decodeURIComponent(n); const on = ui.modal?.sel?.includes(n), add = ui.modal?.type === 'pick';
    const el = $('#zoom') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'zoom' }));
    el.innerHTML = `<div class="sheet"><div class="between"><h3>${esc(n)}</h3><button class="ghost auto" data-a="zoomClose">닫기</button></div>
      <div class="muted">${ex(n).part} · ${ex(n).equip}</div>${mediaHTML(n)}
      ${add ? `<button class="${on ? '' : 'pri'} wide" data-a="zoomPick:${encodeURIComponent(n)}">${on ? '선택 해제' : '이 운동 선택'}</button>` : ''}</div>`;
  },
  zoomClose() { $('#zoom')?.remove(); },
  zoomPick(n) { A.zoomClose(); A.pickTog(n); },
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
  async rshare() {
    const r = ui.edit, url = location.origin + location.pathname + '#r=' + b64u(JSON.stringify({ ...packR(r), c: packC([r]) }));
    if (navigator.share) { try { await navigator.share({ title: `짐로그 루틴: ${r.name}`, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요'); } catch (e) { prompt('이 링크를 복사해 보내세요', url); }
  },
  rdel() { if (!confirm('루틴을 삭제할까요?')) return; S.routines = S.routines.filter(x => x.id !== ui.edit.id); save(); A.rcancel(); },
  progs() { ui.modal = { type: 'progs', tab: 'base' }; renderModal(); },
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
    S.set.didBackup = true; save();
    await shareFile(new File([JSON.stringify(S)], `gymlog-${ymd(Date.now())}.json`, { type: 'application/json' }));
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
  if (e.target.id === 'zoom') return A.zoomClose();
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
    S.set[k] = el.type === 'checkbox' ? el.checked : typeof DEF[k] === 'number' ? (el.value.trim() !== '' && isFinite(el.value) ? num(el.value) : DEF[k]) : el.value;
    save(); if (ui.tab === 'settings' && !ui.view) $('#app').innerHTML = VIEWS.settings(); // 뒤 목록 값만 갱신 (열린 시트 입력은 그대로)
  }
  if (el.id === 'photoFile' && el.files[0]) setPhoto(el.files[0]);
  if (el.id === 'importFile' && el.files[0]) {
    el.files[0].text().then(t => {
      const x = JSON.parse(t);
      if (!Array.isArray(x.workouts)) throw new Error('짐로그 백업 파일이 아님');
      if (!confirm(`운동 ${x.workouts.length}회 기록을 불러옵니다. 현재 기록은 덮어씌워져요.`)) return;
      S = { ...blank(), ...x, set: { ...DEF, ...x.set } }; save(); indexEx(); render(); toast('불러왔어요');
    }).catch(err => toast('불러오기 실패: ' + err.message));
  }
});
