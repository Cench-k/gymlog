'use strict';
// ---------- 동기화 (Supabase) ----------
// 기록(운동·루틴·신체·직접 만든 운동·설정)을 레코드 단위로 서버 gymlog_recs 표와 맞춤 (아래 sync 설명 참고).
// 로컬 변경 감지는 지난 동기화 때 레코드 해시(base)와 비교. SY.cur = 마지막으로 받은 서버 시각
const SB_URL = 'https://biixaxptjizezwethdsr.supabase.co', SB_KEY = 'sb_publishable_mqhk75nb2ezNo1-Be0e2_g_ZkkRlvV8'; // 공개용 키 (RLS로 본인 행만 접근)
const SKEY = 'gymlog.sync';
let SY = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
// 서버를 옮기면(예전 supabase.co 주소가 저장된 기기) 새 주소로 바꾸고 로그인을 새로 받음. 기록은 기기에 남아 있다가 다시 로그인하면 전부 올라감
if (/\.supabase\.co$/.test(SY.url || '') && SY.url !== SB_URL) Object.assign(SY, { url: SB_URL, key: SB_KEY, at: null, rt: null, exp: 0, cur: null, base: null, state: '서버를 옮겼어요. 다시 로그인해 주세요' });
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
// 레코드 단위 동기화: 기록 하나 = 서버 gymlog_recs 한 행. 바뀐 것만 올리고, 지난번 이후 바뀐 것만 받음.
// 충돌은 레코드별 수정 시각 u가 큰 쪽이 이김 (서버 함수 gymlog_push가 비교해서 더 새 것만 씀). 삭제는 v=null.
// 처음 동기화하는 기기는 가진 기록을 전부 올림 (서버에 더 새 것이 있으면 서버가 이김) → 서버를 옮겨도 기기에서 복구됨
const PULL_OVERLAP = 120e3; // 커밋 순서가 뒤바뀌어도 놓치지 않게 지난 커서보다 2분 앞부터 다시 받음
async function sync(force) {
  if (!SY.rt || syncing) return;
  syncing = true; SY.state = '동기화 중…';
  try {
    for (let tries = 0; tries < 3; tries++) {
      const now = Date.now(), loc = recs(), base = SY.base || {}, first = !SY.cur, out = [];
      for (const [k, v] of Object.entries(loc)) {
        if (first) out.push({ k, v, u: v.u || 1 });
        else if (base[k] !== hash(JSON.stringify(v))) { v.u = now; out.push({ k, v, u: now }); }
      }
      if (!first) for (const k in base) if (!(k in loc)) out.push({ k, v: null, u: now });
      if (!out.length && !force && !first && now - (SY.last || 0) < 30000) break;
      const before = hash(JSON.stringify(loc));
      for (let i = 0; i < out.length; i += 500) await api('rpc/gymlog_push', 'POST', { rows: out.slice(i, i + 500) });
      // 받기: 지난 커서 이후 바뀐 행 (1000개씩)
      const since = first ? 0 : Date.parse(SY.cur) - PULL_OVERLAP, rows = [];
      for (let off = 0; ; off += 1000) {
        const page = await api(`gymlog_recs?select=k,v,u,at:updated_at&updated_at=gt.${new Date(since).toISOString()}&order=updated_at.asc,k.asc&limit=1000&offset=${off}`);
        rows.push(...page); if (page.length < 1000) break;
      }
      if (hash(JSON.stringify(recs())) !== before) continue; // 동기화 중 로컬이 바뀜 -> 다시
      const M = { ...loc };
      let changed = false;
      for (const r of rows) {
        const cur = M[r.k];
        if (cur && (cur.u || 0) >= r.u) continue;
        if (r.v === null) { if (cur) { delete M[r.k]; changed = true; } }
        else { M[r.k] = r.v; changed = true; }
      }
      if (changed) fromRecs(M);
      SY.base = Object.fromEntries(Object.entries(M).map(([k, v]) => [k, hash(JSON.stringify(v))]));
      SY.cur = new Date(rows.reduce((m, r) => Math.max(m, Date.parse(r.at) || 0), Date.parse(SY.cur) || 0)).toISOString();
      SY.last = Date.now();
      localStorage.setItem(KEY, JSON.stringify(S));
      if (changed && !ui.view && !ui.modal && !document.activeElement?.matches('input,textarea')) render();
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
  logout() { if (!confirm('로그아웃할까요? 이 기기의 기록은 그대로 남아요.')) return; Object.assign(SY, { at: null, rt: null, exp: 0, last: 0, cur: null }); sySave(); render(); },
  google() {
    if (!SY.url || !SY.key) return toast('Supabase URL·키를 입력하세요');
    sySave(); location.href = `${SY.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`;
  },
  async deleteMe() {
    if ($('#d_word').value.trim() !== '탈퇴') return toast('탈퇴 라고 입력해 주세요');
    const wipe = $('#d_local').checked;
    try { await api('rpc/gymlog_delete_me', 'POST', {}); }
    catch (e) { return toast('삭제 실패: ' + e.message); }
    Object.assign(SY, { at: null, rt: null, exp: 0, base: null, last: 0, cur: null, uid: null, email: null }); sySave();
    if (wipe) S = blank();
    save(); indexEx(); ui.modal = null; render(); toast('계정을 삭제했어요');
  },
  async syncNow() { await sync(true); render(); toast(SY.state || '동기화 완료'); },
});
async function afterLogin(j) {
  const prev = SY.uid; setSession(j); if (SY.uid !== prev) { SY.base = null; SY.cur = null; }
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
    <p class="muted small" id="syncState">${esc(syncLine())}</p><div class="row"><button data-a="syncNow">지금 동기화</button><button data-a="logout">로그아웃</button></div><button class="ghost danger" style="margin-top:8px" data-a="sOpen:deleteAcct">계정 삭제 (탈퇴)</button></div>`;
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
