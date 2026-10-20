'use strict';
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
  await sync(true); if (ui.modal?.k === 'account') ui.modal = null; render(); toast('로그인했어요. 동기화 켜짐');
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
  if (SY.rt) return `<div class="card"><h3>동기화</h3><p class="muted">${esc(SY.email)} 로그인됨 · 기록이 자동으로 서버에 백업되고 다른 기기와 합쳐져요.</p>
    <p class="muted small" id="syncState">${esc(syncLine())}</p><div class="row"><button data-a="syncNow">지금 동기화</button><button data-a="logout">로그아웃</button></div></div>`;
  return `<div class="card"><h3>동기화</h3><p class="muted">로그인하면 기록이 서버에 백업되고 폰·태블릿·PC에서 같이 보여요. 오프라인이면 나중에 자동으로 올라가요.</p>
    <button class="wide gbtn" data-a="google">Google로 계속하기</button>
    <p class="muted small" style="text-align:center;margin:0 0 8px">또는 이메일</p>
    ${SB_URL ? '' : `<input id="sb_url" placeholder="Supabase URL (https://xxx.supabase.co)" value="${esc(SY.url)}" style="margin-bottom:6px"><input id="sb_key" placeholder="anon / publishable 키" value="${esc(SY.key)}" style="margin-bottom:6px">`}
    <input id="sy_email" type="email" autocomplete="email" placeholder="이메일" value="${esc(SY.email || '')}" style="margin-bottom:6px">
    <input id="sy_pw" type="password" autocomplete="current-password" placeholder="비밀번호 (6자 이상)">
    <div class="row" style="margin-top:8px"><button class="pri" data-a="login:in">로그인</button><button data-a="login:up">가입</button></div>
    ${SY.state ? `<p class="muted small">${esc(SY.state)}</p>` : ''}</div>`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
addEventListener('online', () => sync());
