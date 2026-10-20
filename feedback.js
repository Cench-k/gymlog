'use strict';
// 의견 보내기: Supabase gymlog_feedback 표에 저장. 개발자가 대시보드에서 status·reply를 고치면 "내 의견"에 보임
const FB_KIND = { bug: '버그', idea: '개선 아이디어', etc: '기타' };
const FB_STATUS = { new: '접수', seen: '확인함', done: '반영됨', wont: '보류' };
async function loadFeedback() {
  const m = ui.modal;
  try { m.mine = await api(`gymlog_feedback?select=id,kind,body,status,reply,created_at&user_id=eq.${SY.uid}&order=created_at.desc&limit=50`); }
  catch (e) { m.mine = []; m.err = e.message; }
  if (ui.modal === m) renderModal();
}
MODALS.fb = m => `<div class="between"><h3>의견 보내기</h3>${closeBtn}</div>
  <p class="muted">불편한 점, 버그, 있었으면 하는 기능을 알려 주세요. 반영되면 아래 "내 의견"에 답이 달려요.</p>
  <div class="chips" style="margin:8px 0">${Object.entries(FB_KIND).map(([k, t]) => `<button class="chip ${m.kind === k ? 'on' : ''}" data-a="fbKind:${k}">${t}</button>`).join('')}</div>
  <textarea id="fb_body" rows="5" maxlength="2000" placeholder="${m.kind === 'bug' ? '어느 화면에서 무엇을 했을 때 어떻게 됐는지 적어 주세요' : '자유롭게 적어 주세요'}">${esc(m.draft || '')}</textarea>
  <button class="pri wide" style="margin-top:8px" data-a="fbSend">보내기</button>
  <h3 style="margin:20px 0 6px">내 의견</h3>
  ${m.mine == null ? '<p class="muted">불러오는 중…</p>' : m.mine.length ? `<div class="list">${m.mine.map(f => `<div><div class="between"><span class="muted small">${FB_KIND[f.kind] || ''} · ${dateTxt(Date.parse(f.created_at))}</span><span class="fbst ${esc(f.status)} auto">${FB_STATUS[f.status] || esc(f.status)}</span></div>
    <div style="white-space:pre-wrap">${esc(f.body)}</div>${f.reply ? `<div class="fbreply">${esc(f.reply)}</div>` : ''}</div>`).join('')}</div>` : `<p class="muted">${m.err ? '불러오기 실패: ' + esc(m.err) : '아직 보낸 의견이 없어요.'}</p>`}`;
Object.assign(A, {
  fbOpen() {
    if (!SY.rt) return toast('설정에서 로그인하면 의견을 보낼 수 있어요');
    ui.modal = { type: 'fb', kind: 'idea' }; renderModal(); loadFeedback();
  },
  fbKind(k) { ui.modal.kind = k; ui.modal.draft = $('#fb_body').value; renderModal(); },
  async fbSend() {
    const m = ui.modal, body = $('#fb_body').value.trim();
    if (!body) return toast('내용을 입력하세요');
    try {
      await api('gymlog_feedback', 'POST', { user_id: SY.uid, kind: m.kind, body: body.slice(0, 2000), app_ver: APP_VER, ua: navigator.userAgent.slice(0, 200) }, 'return=minimal');
      S.set.didFeedback = true; save(); m.draft = ''; m.mine = null; renderModal(); toast('보냈어요. 고마워요!'); loadFeedback();
    } catch (e) { toast('보내기 실패: ' + e.message); }
  },
});
