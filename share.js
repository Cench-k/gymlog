'use strict';
// ---------- 공유 ----------
// 루틴 <-> 공유용 JSON. 남이 만든 데이터는 신뢰 못 할 입력이라 값 검사 후 들임
const packR = r => ({ n: r.name, i: r.items.map(it => ({ ex: it.ex, ss: it.ss, rest: it.rest, memo: it.memo, sets: it.sets.map(s => ({ w: s.w, r: s.r, type: s.type })) })) });
const packC = rs => { const names = new Set(rs.flatMap(r => r.items.map(it => it.ex))); return S.custom.filter(c => names.has(c.name)); };
const str = (v, n = 200) => String(v ?? '').slice(0, n);
const arr = v => Array.isArray(v) ? v : [];
function addCustom(list) {
  for (const c of arr(list)) if (str(c?.name) && !EX[str(c.name)] && PARTS.includes(c.part) && EQUIPS.includes(c.equip) && COLS[c.type]) S.custom.push({ name: str(c.name), part: c.part, equip: c.equip, type: c.type });
  indexEx();
}
function unpackR(x, folder) {
  const val = v => v === '' || v == null ? '' : num(v);
  return { id: uid(), name: str(x?.n, 60) || '공유받은 루틴', folder, items: arr(x?.i).filter(it => str(it?.ex)).slice(0, 50).map(it => ({ ex: str(it.ex), ss: it.ss ? str(it.ss) : 0, rest: num(it.rest) || null, memo: str(it.memo), sets: arr(it.sets).slice(0, 50).map(s => newSet({ w: val(s?.w), r: val(s?.r), type: TYPES[s?.type] ? s.type : 'N' })) })) };
}
async function shareFile(f) {
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
}

// 루틴 링크: 루틴 JSON을 링크 # 뒤에 담음 (서버 안 거침)
const b64u = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
function sharedReturn() {
  if (!location.hash.startsWith('#r=')) return;
  const code = location.hash.slice(3);
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const x = JSON.parse(unb64u(code)), r = unpackR(x, '공유받음');
    if (!Array.isArray(x.i) || !confirm(`공유받은 루틴 "${r.name}" (${r.items.length}개 운동)을 가져올까요?`)) return;
    addCustom(x.c); S.routines.push(r);
    save(); ui.tab = 'routines'; ui.view = S.active ? ui.view : null; render(); toast('루틴을 가져왔어요');
  } catch (e) { toast('공유 링크가 잘못됐어요'); }
}

// 프로그램 공유: 루틴 폴더 하나 = 프로그램. Supabase gymlog_programs 표에 올리고 로그인한 누구나 가져감
// ponytail: 최대 200개만 불러옴, 사용자 수백 명 넘으면 검색·페이지 나누기
const PROG_COLS = 'id,user_id,author,badge,photo,name,descr,days,uses,rating,ratings';
// 프로그램에 같이 올리는 프로필: 닉네임 + (사진 또는 대표 뱃지)
const PHOTO_OK = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const myProfile = () => ({ author: (S.set.nick || (SY.email || '').split('@')[0] || '익명').slice(0, 30), badge: S.set.avatar === 'badge' ? S.set.badge.slice(0, 80) : '', photo: S.set.avatar === 'photo' && PHOTO_OK.test(S.set.photo || '') ? S.set.photo : '' });
// 프로필을 바꾸면 이미 공유한 내 프로그램에도 반영
function profSync() { if (SY.rt) api(`gymlog_programs?user_id=eq.${SY.uid}`, 'PATCH', myProfile()).catch(() => { }); }
// 남이 올린 프로필 사진은 JPEG data URL만 그림 (그 외 문자열은 버림)
function progAvatar(p) {
  const ph = str(p.photo, 40000), b = badgeInfo(str(p.badge, 80));
  if (PHOTO_OK.test(ph)) return `<img class="avatar" src="${ph}" alt="">`;
  if (b) return `<span class="avatar">${medal(b.icon, b.tier)}</span>`;
  return `<span class="avatar ph">${esc(str(p.author, 30)[0] || '?')}</span>`;
}
const PROG_SORT = { 인기순: 'uses.desc,rating.desc.nullslast', 별점순: 'rating.desc.nullslast,ratings.desc', 최신순: 'updated_at.desc' };
const VOTE_URL = 'gymlog_program_votes?on_conflict=program_id,user_id';
async function loadShared() {
  const m = ui.modal; m.list = null; m.err = ''; m.sort ||= '인기순';
  try {
    const [list, my] = await Promise.all([
      api(`gymlog_programs_v?select=${PROG_COLS}&order=${PROG_SORT[m.sort]},updated_at.desc&limit=200`),
      api(`gymlog_program_votes?select=program_id,used,rating&user_id=eq.${SY.uid}`),
    ]);
    m.list = list; m.my = Object.fromEntries(my.map(v => [v.program_id, v]));
  } catch (e) { m.err = e.message; }
  if (ui.modal === m) renderModal();
}
const stars = (v, k) => [1, 2, 3, 4, 5].map(n => `<button class="rate ${n <= v ? 'on' : ''}" data-a="rate:${k}:${n}" aria-label="별점 ${n}">${STAR}</button>`).join('');
function sharedList(m) {
  if (!SY.rt) return '<p class="muted">설정에서 로그인하면 다른 사람이 공유한 프로그램을 볼 수 있어요.</p>';
  if (m.err) return `<p class="muted">불러오기 실패: ${esc(m.err)}</p><button data-a="progTab:shared">다시 시도</button>`;
  if (!m.list) return '<p class="muted">불러오는 중…</p>';
  const list = m.mine ? m.list.filter(p => p.user_id === SY.uid) : m.list;
  if (m.mine && !list.length) return '<p class="muted">아직 공유한 프로그램이 없어요. 루틴 탭에서 폴더 이름 옆 "공유"를 눌러 보세요.</p>';
  if (!m.list.length) return '<p class="muted">아직 공유된 프로그램이 없어요. 루틴 탭에서 폴더 이름 옆 "공유"를 눌러 첫 프로그램을 올려 보세요.</p>';
  return (m.mine ? '' : `<div class="chips" style="margin-bottom:10px">${Object.keys(PROG_SORT).map(k => `<button class="chip ${m.sort === k ? 'on' : ''}" data-a="progSort:${k}">${k}</button>`).join('')}</div><input data-in="progQ" value="${esc(m.q || '')}" placeholder="프로그램·작성자·운동 이름 검색 (초성 가능)" style="margin-bottom:10px">`)
    + `<div id="proglist">${progItems(m)}</div>`;
}
// 검색: 이름·작성자·설명·루틴 이름·운동 이름. 공백 무시, 초성 가능
// ponytail: 불러온 최대 200개 안에서만 찾음, 프로그램이 수백 개 넘으면 서버 검색(ilike)으로
const progText = p => [p.name, p.author, p.descr, ...arr(p.days?.r).flatMap(r => [r?.n, ...arr(r?.i).map(it => it?.ex)])].map(x => str(x)).join(' ').replace(/\s/g, '').toLowerCase();
function progItems(m) {
  const q = (m.q || '').replace(/\s/g, '').toLowerCase();
  let list = m.mine ? m.list.filter(p => p.user_id === SY.uid) : m.list;
  if (q) list = list.filter(p => { const t = progText(p); return t.includes(q) || cho(t).includes(q); });
  if (!list.length) return `<p class="muted" style="text-align:center;padding:20px 0">${q ? '검색 결과가 없어요.' : ''}</p>`;
  return list.map(p => { const k = m.list.indexOf(p);
    const mine = p.user_id === SY.uid, days = arr(p.days?.r), my = m.my?.[p.id];
    return `<div class="card prog" style="background:var(--card2)"><div class="progh">${progAvatar(p)}<div class="grow"><h3>${esc(str(p.name, 60))}</h3>
      <div class="muted">${p.ratings ? `<b class="gold">★ ${num(p.rating).toFixed(1)}</b> (${num(p.ratings)}) · ` : ''}${esc(str(p.author, 30))}${mine ? ' (나)' : ''} · ${days.length}일 루틴</div></div><span class="muted small auto">${num(p.uses)}명 가져감</span></div>
      ${p.descr ? `<div style="margin:6px 0;white-space:pre-wrap">${esc(str(p.descr, 500))}</div>` : ''}
      <div class="muted small">${days.map(r => esc(str(r?.n, 60))).join(' / ')}</div>
      ${my?.used && !mine ? `<div class="between" style="margin-top:8px"><span class="muted small">내 별점</span><div class="stars">${stars(my.rating, k)}</div></div>` : ''}
      <div class="row" style="margin-top:10px"><button class="pri" data-a="sharedAdd:${k}">${my?.used ? '다시 가져오기' : '가져오기'}</button>${mine ? '<button class="danger auto" data-a="pubDel:' + k + '">공유 중단</button>' : ''}</div></div>`;
  }).join('');
}
Object.assign(A, {
  progTab(k) { ui.modal.tab = k; renderModal(); if (k === 'shared' && SY.rt) loadShared(); },
  progSort(k) { ui.modal.sort = k; loadShared(); },
  progQ(v) { ui.modal.q = v; $('#proglist').innerHTML = progItems(ui.modal); },
  sharedAdd(k) {
    const p = ui.modal.list[k], folder = str(p.name, 60);
    addCustom(p.days?.c);
    for (const r of arr(p.days?.r).slice(0, 20)) S.routines.push(unpackR(r, folder));
    // 가져간 사람 기록 (사람당 1번만 셈). 실패해도 루틴 가져오기는 그대로
    if (p.user_id !== SY.uid) api(VOTE_URL, 'POST', { program_id: p.id, user_id: SY.uid, used: true }, 'resolution=merge-duplicates,return=minimal').catch(() => { });
    save(); ui.modal = null; render(); toast(`${folder} 가져옴. 써 보고 별점을 남겨 주세요`);
  },
  async rate(k, n) {
    const m = ui.modal, p = m.list[k];
    try {
      await api(VOTE_URL, 'POST', { program_id: p.id, user_id: SY.uid, rating: +n, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
      toast(`별점 ${n}점을 남겼어요`); loadShared();
    } catch (e) { toast('별점 실패: ' + e.message); }
  },
  async pubDel(k) {
    const p = ui.modal.list[k];
    if (!confirm(`"${p.name}" 공유를 중단할까요? 이미 가져간 사람의 루틴은 남아요.`)) return;
    try { await api(`gymlog_programs?id=eq.${p.id}`, 'DELETE'); toast('공유를 중단했어요'); loadShared(); } catch (e) { toast('실패: ' + e.message); }
  },
  pubOpen(f) {
    if (!SY.rt) return toast('설정에서 로그인하면 프로그램을 공유할 수 있어요');
    f = decodeURIComponent(f); const m = ui.modal = { type: 'pub', f }; renderModal();
    // 전에 같은 이름으로 공유했으면 설명 채움 (다시 공유할 때 빈 설명으로 덮지 않게)
    api(`gymlog_programs?select=descr&user_id=eq.${SY.uid}&name=eq.${encodeURIComponent(f)}`).then(r => {
      const el = $('#p_desc'); if (ui.modal === m && r?.[0] && el && !el.value) el.value = r[0].descr;
    }).catch(() => { });
  },
  async pubSave() {
    const f = ui.modal.f, name = $('#p_name').value.trim(), descr = $('#p_desc').value.trim(), nick = $('#p_nick').value.trim();
    if (!name) return toast('프로그램 이름을 입력하세요');
    if (!nick) return toast('표시할 이름을 입력하세요');
    const rs = S.routines.filter(r => (r.folder || '기본') === f);
    S.set.nick = nick; save();
    try {
      await api('gymlog_programs?on_conflict=user_id,name', 'POST', { user_id: SY.uid, ...myProfile(), author: nick.slice(0, 30), name: name.slice(0, 60), descr: descr.slice(0, 500), days: { r: rs.map(packR), c: packC(rs) }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
      A.close(); toast('프로그램을 공유했어요');
    } catch (e) { toast('공유 실패: ' + e.message); }
  },
});
MODALS.pub = m => {
  const rs = S.routines.filter(r => (r.folder || '기본') === m.f);
  return `<div class="between"><h3>프로그램으로 공유</h3>${closeBtn}</div>
    <p class="muted">짐로그에 로그인한 사람 누구나 "프로그램 가져오기 → 모두의 프로그램"에서 보고 가져갈 수 있어요. 같은 이름으로 다시 공유하면 내용이 바뀌어요.</p>
    <input id="p_name" value="${esc(m.f === '기본' ? '' : m.f)}" placeholder="프로그램 이름" maxlength="60" style="margin-bottom:6px">
    <textarea id="p_desc" placeholder="설명: 누구에게 맞는지, 주 몇 회, 무게 올리는 법" maxlength="500" rows="3" style="margin-bottom:6px"></textarea>
    <input id="p_nick" value="${esc(S.set.nick || (SY.email || '').split('@')[0])}" placeholder="표시할 이름" maxlength="30">
    <p class="muted small">포함 루틴 ${rs.length}개: ${rs.map(r => esc(r.name)).join(' / ')}</p>
    <button class="pri wide" data-a="pubSave">공유하기</button>`;
};

