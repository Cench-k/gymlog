"""동기화 테스트: 가짜 Supabase(auth + rest) 서버 + 두 기기(브라우저 컨텍스트). python test_sync.py"""
import http.server, threading, json, os, re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
RECS = {}  # (user_id, k) -> {k, v, u, at}  기록 표 gymlog_recs
LOCK = threading.Lock()
CLOCK = [0]
def tick():  # 서버 시각: 부를 때마다 1ms씩 증가
    CLOCK[0] += 1; return (datetime(2026, 10, 20, tzinfo=timezone.utc) + timedelta(milliseconds=CLOCK[0])).isoformat()
def server_recs(uid): return {k: r for (u, k), r in RECS.items() if u == uid and r['v'] is not None}
PROGS = []  # 공유 프로그램 표
VOTES = {}  # (program_id, user_id) -> {used, rating}
FB = []  # 의견
REPORTS = {}  # (program_id, user_id) -> reason

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(s, *a): pass
    def send(s, code, obj=None):
        b = json.dumps(obj).encode() if obj is not None else b''
        s.send_response(code); s.send_header('Content-Type', 'application/json'); s.end_headers(); s.wfile.write(b)
    def body(s): return json.loads(s.rfile.read(int(s.headers.get('Content-Length') or 0)) or b'{}')
    def uid(s):  # 토큰 't:<user id>', 구글 테스트 토큰 'gtok'
        t = (s.headers.get('Authorization') or '').replace('Bearer ', '')
        return 'u-g@x.com' if t == 'gtok' else t[2:]
    def q(s): return {k: v[0].split('.', 1)[-1] for k, v in parse_qs(urlparse(s.path).query).items() if k != 'select' and k != 'grant_type'}
    def do_POST(s):
        u, b = urlparse(s.path), s.body()
        if u.path.startswith('/auth/v1/'):
            email = b.get('email', 'a@x.com')
            if b.get('password') == 'wrong': return s.send(400, {'msg': 'Invalid login credentials'})
            return s.send(200, {'access_token': 't:u-' + email, 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u-' + email, 'email': email}})
        if u.path == '/rest/v1/rpc/gymlog_push':  # 서버보다 새 것(u가 큰 것)만 씀
            with LOCK:
                for r in b['rows']:
                    cur = RECS.get((s.uid(), r['k']))
                    if not cur or cur['u'] < r['u']: RECS[(s.uid(), r['k'])] = {'k': r['k'], 'v': r['v'], 'u': r['u'], 'at': tick()}
            return s.send(204)
        if u.path == '/rest/v1/gymlog_programs':
            old = next((x for x in PROGS if x['user_id'] == b['user_id'] and x['name'] == b['name']), None)
            if old: old.update(b)
            else: PROGS.append({'id': 'p%d' % len(PROGS), 'hidden': False, **b})
            return s.send(201)
        if u.path == '/rest/v1/gymlog_program_votes':
            v = VOTES.setdefault((b['program_id'], b['user_id']), {'used': False, 'rating': None})
            new = {**v, **{k: b[k] for k in ('used', 'rating') if k in b}}
            if new['rating'] is not None and not new['used']: return s.send(400, {'message': 'check violation'})
            v.update(new); return s.send(201)
        if u.path == '/rest/v1/gymlog_reports':  # 자기 프로그램은 신고 불가, 3명이면 숨김
            pr = next(x for x in PROGS if x['id'] == b['program_id'])
            if pr['user_id'] == b['user_id']: return s.send(403, {'message': 'own program'})
            REPORTS.setdefault((b['program_id'], b['user_id']), b['reason'])
            if sum(1 for (pid, _) in REPORTS if pid == pr['id']) >= 3: pr['hidden'] = True
            return s.send(201)
        if u.path == '/rest/v1/rpc/gymlog_delete_me':  # 계정과 딸린 데이터 전부 삭제
            me = s.uid()
            for key in [k for k in RECS if k[0] == me]: del RECS[key]
            PROGS[:] = [x for x in PROGS if x['user_id'] != me]
            for d in (VOTES, REPORTS):
                for key in [k for k in d if k[1] == me]: del d[key]
            FB[:] = [f for f in FB if f['user_id'] != me]
            return s.send(204)
        if u.path == '/rest/v1/gymlog_feedback':
            FB.append({'id': len(FB) + 1, 'status': 'new', 'reply': '', 'created_at': '2026-10-20T00:00:00Z', **b}); return s.send(201)
        s.send(404, {'message': 'unknown'})
    def do_PATCH(s):
        q, b = s.q(), s.body()
        if s.path.startswith('/rest/v1/gymlog_programs'):
            for x in PROGS:
                if x['user_id'] == q['user_id']: x.update(b)
            return s.send(204)
        s.send(404, {'message': 'unknown'})
    def do_DELETE(s):
        pid = s.q()['id']; PROGS[:] = [x for x in PROGS if x['id'] != pid]; s.send(204)
    def do_GET(s):
        if s.path.startswith('/auth/v1/user'):
            return s.send(200, {'id': 'u-g@x.com', 'email': 'g@x.com'}) if s.headers.get('Authorization') == 'Bearer gtok' else s.send(401, {'msg': 'bad jwt'})
        if s.path.startswith('/rest/v1/gymlog_programs_v'):
            out = []
            for x in PROGS:
                if x.get('hidden') and x['user_id'] != s.uid(): continue  # 숨긴 건 올린 사람만
                vs = [v for (pid, _), v in VOTES.items() if pid == x['id']]
                rs = [v['rating'] for v in vs if v['rating']]
                out.append({**x, 'uses': sum(v['used'] for v in vs), 'rating': round(sum(rs) / len(rs), 1) if rs else None, 'ratings': len(rs)})
            return s.send(200, out)
        if s.path.startswith('/rest/v1/gymlog_programs'):
            return s.send(200, PROGS)
        if s.path.startswith('/rest/v1/gymlog_program_votes'):
            me = s.q()['user_id']
            return s.send(200, [{'program_id': pid, **v} for (pid, uid), v in VOTES.items() if uid == me])
        if s.path.startswith('/rest/v1/gymlog_feedback'):
            me = s.q()['user_id']
            return s.send(200, [f for f in FB if f['user_id'] == me][::-1])
        if s.path.startswith('/rest/v1/gymlog_recs'):
            q = s.q(); since = datetime.fromisoformat(q['updated_at'].replace('Z', '+00:00'))
            with LOCK:
                rows = sorted((r for (u, k), r in RECS.items() if u == s.uid() and datetime.fromisoformat(r['at']) > since), key=lambda r: (r['at'], r['k']))
            off, lim = int(q.get('offset', 0)), int(q.get('limit', 1000))
            return s.send(200, rows[off:off + lim])
        super().do_GET()

srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_port}/'

def device(b):
    p = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block').new_page()  # 가짜 서버가 같은 주소라 SW가 API 응답을 캐시하지 않게
    p.errors = []
    p.on('pageerror', lambda e: p.errors.append(str(e)))
    p.on('dialog', lambda d: d.accept())
    p.goto(URL)
    return p

def login(p, pw='pw1234', email='me@x.com'):
    p.evaluate('A.close()'); p.click('[data-a="tab:settings"]'); p.click('[data-a="sOpen:account"]')
    p.evaluate(f"SY.url='{URL.rstrip('/')}'; SY.key='anon'")
    p.fill('#sy_email', email); p.fill('#sy_pw', pw)
    p.click('[data-a="login:in"]')

def sync(p): p.evaluate('sync(true)')
def workout(p, name, w):
    p.evaluate(f"""S.workouts.unshift({{id:uid(),name:'{name}',start:Date.now(),end:Date.now()+1,items:[{{ex:'바벨 벤치프레스',ss:0,sets:[newSet({{w:{w},r:5,done:true}})]}}]}}); save()""")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    A, Bd = device(b), device(b)

    # 로그인 실패 메시지
    login(A, 'wrong'); A.wait_for_timeout(300)
    assert A.evaluate('!SY.rt')

    # A: 로그인 전 기록 2개 + 키 180 -> 로그인 시 업로드
    workout(A, 'A1', 60); workout(A, 'A2', 70)
    A.evaluate("S.set.height=180; save()")
    login(A); A.wait_for_function('SY.last > 0')
    assert len(server_recs('u-me@x.com')) == 3  # 운동 2 + 설정

    # B: 새 기기 로그인 -> A 기록과 설정을 받음 (B의 기본 설정이 서버를 덮으면 안 됨)
    login(Bd); Bd.wait_for_function('SY.last > 0')
    assert Bd.evaluate('S.workouts.length') == 2
    assert Bd.evaluate('S.set.height') == 180, Bd.evaluate('S.set.height')

    # B: 기록 하나 삭제 + 신체 기록 / A: 루틴 추가 (서로 다른 변경)
    Bd.evaluate("S.workouts = S.workouts.filter(w=>w.name!=='A1'); S.body.push({date:'2026-10-19',w:75,m:'',f:''}); save()")
    A.evaluate("S.routines.push({id:uid(),name:'R1',folder:'',items:[]}); save()")
    sync(Bd); sync(A); sync(Bd)
    for p in (A, Bd):
        assert p.evaluate('S.workouts.map(w=>w.name)') == ['A2'], p.evaluate('S.workouts.map(w=>w.name)')
        assert p.evaluate('S.body.length') == 1 and p.evaluate("S.routines[0]?.name") == 'R1'

    # 같은 기록을 양쪽이 수정 -> 나중 수정이 이김
    A.evaluate("S.workouts[0].name='A쪽 수정'; save()"); sync(A)
    Bd.wait_for_timeout(5)
    Bd.evaluate("S.workouts[0].name='B쪽 수정'; save()"); sync(Bd); sync(A)
    assert A.evaluate('S.workouts[0].name') == 'B쪽 수정'

    # 양쪽이 따로 추가 -> 둘 다 살아남음, 바뀐 것만 오감
    workout(A, 'A3', 80); workout(Bd, 'B1', 90)
    sync(A); sync(Bd)
    n0 = CLOCK[0]; workout(A, 'A4', 85); sync(A)
    assert CLOCK[0] - n0 == 1  # 새 기록 하나만 올라감 (전체 문서 아님)
    sync(Bd)
    names = sorted(Bd.evaluate('S.workouts.map(w=>w.name)'))
    assert names == sorted(['B쪽 수정', 'A3', 'B1', 'A4']), names
    # 예전 수정 시각으로 올리면 서버의 새 기록을 못 덮음
    k = next(k for k, r in server_recs('u-me@x.com').items() if k.startswith('w:') and r['v']['name'] == 'A4')
    A.evaluate(f"api('rpc/gymlog_push','POST',{{rows:[{{k:'{k}',v:{{id:'x',name:'옛날',start:1,end:2,items:[]}},u:1}}]}})"); A.wait_for_timeout(200)
    assert server_recs('u-me@x.com')[k]['v']['name'] == 'A4'
    # 서버를 옮긴 것처럼 커서가 없어진 기기 -> 가진 기록 전부 다시 올림, 중복 안 생김
    RECS.clear(); A.evaluate('SY.cur=null; save()'); sync(A)
    assert len([k for k in server_recs('u-me@x.com') if k.startswith('w:')]) == 4
    Bd.evaluate('SY.cur=null'); sync(Bd)
    assert sorted(Bd.evaluate('S.workouts.map(w=>w.name)')) == names

    # 초기화는 서버를 지우지 않음
    A.evaluate('A.close()'); A.click('[data-a="tab:settings"]'); A.click('[data-a="resetAll"]')
    assert A.evaluate('S.workouts.length') == 0
    assert len([k for k in server_recs('u-me@x.com') if k.startswith('w:')]) == 4

    # 진행 중인 운동은 동기화 대상 아님 (기기별)
    Bd.evaluate("A.start('')"); sync(Bd)
    assert not any('active' in k for k in server_recs('u-me@x.com'))

    # 구글 로그인: 버튼 -> authorize 주소, 돌아오면 #토큰으로 로그인
    G = device(b)
    G.evaluate(f"localStorage.setItem('gymlog.sync', JSON.stringify({{url:'{URL.rstrip('/')}', key:'anon'}}))")
    G.reload(); G.click('[data-a="tab:settings"]'); G.click('[data-a="sOpen:account"]')
    G.route('**/auth/v1/authorize**', lambda r: r.fulfill(body='ok'))
    with G.expect_navigation(): G.click('[data-a="google"]')
    assert '/auth/v1/authorize?provider=google&redirect_to=' in G.url, G.url
    G.goto(URL + '#access_token=gtok&refresh_token=gr&expires_in=3600&token_type=bearer')
    G.wait_for_function('SY.uid === "u-g@x.com"')
    assert '#' not in G.url and G.evaluate('SY.email') == 'g@x.com'
    G.goto(URL + '?r=1#error=access_denied&error_description=cancel'); G.wait_for_timeout(300)
    assert 'cancel' in G.inner_text('#toast'), G.inner_text('#toast')
    assert not G.errors, G.errors

    # 프로그램 공유: A가 폴더를 프로그램으로 올림 -> 다른 사용자 F가 목록에서 가져감
    Bd.evaluate('S.active=null; ui.view=null; save(); render()')  # 위에서 시작한 운동 정리
    Bd.click('[data-a="tab:routines"]'); Bd.click('[data-a="progs"]'); Bd.click('[data-a="progAdd:1"]')
    Bd.click('[data-a="pubOpen:StrongLifts%205x5"]')
    assert Bd.input_value('#p_name') == 'StrongLifts 5x5' and Bd.input_value('#p_nick') == 'me'
    Bd.fill('#p_desc', '<b>초보</b> 주 3회'); Bd.click('[data-a="pubSave"]'); Bd.wait_for_timeout(200)
    assert len(PROGS) == 0 and '동의' in Bd.inner_text('#toast')  # 이용 규칙 동의 전엔 못 올림
    Bd.check('#p_agree'); Bd.fill('#p_desc', '토토 사이트 홍보'); Bd.click('[data-a="pubSave"]'); Bd.wait_for_timeout(200)
    assert len(PROGS) == 0 and '부적절' in Bd.inner_text('#toast')  # 금칙어
    Bd.fill('#p_desc', '<b>초보</b> 주 3회'); Bd.click('[data-a="pubSave"]'); Bd.wait_for_function('!ui.modal')
    assert len(PROGS) == 1 and len(PROGS[0]['days']['r']) == 2 and PROGS[0]['author'] == 'me'
    Bd.click('[data-a="pubOpen:StrongLifts%205x5"]'); Bd.wait_for_function("document.querySelector('#p_desc').value")  # 기존 설명 채워짐
    Bd.check('#p_agree'); Bd.click('[data-a="pubSave"]'); Bd.wait_for_function('!ui.modal')
    assert len(PROGS) == 1  # 같은 이름은 덮어씀
    # 프로필 사진을 바꾸면 이미 공유한 프로그램에도 반영, 남이 보는 목록에 사진이 뜸
    Bd.evaluate("S.set.photo='data:image/jpeg;base64,/9j/AAAA'; S.set.avatar='photo'; save(); profSync()"); Bd.wait_for_timeout(300)
    assert PROGS[0]['photo'].startswith('data:image/jpeg') and PROGS[0]['badge'] == ''
    F = device(b); login(F, email='f@x.com'); F.wait_for_function('SY.last > 0')
    F.click('[data-a="tab:routines"]'); F.click('[data-a="progs"]'); F.click('[data-a="progTab:shared"]')
    F.wait_for_selector('[data-a="sharedAdd:0"]')
    assert '<b>초보</b>' in F.inner_text('#modal') and '공유 중단' not in F.inner_text('#modal')
    assert F.locator('#modal .progh img.avatar').count() == 1
    # 검색: 운동 이름 초성, 작성자, 없는 말
    F.fill('[data-in="progQ"]', 'ㅂㅂㅅㅋㅌ'); assert F.locator('#proglist .prog').count() == 1
    F.fill('[data-in="progQ"]', 'me'); assert F.locator('#proglist .prog').count() == 1
    F.fill('[data-in="progQ"]', '없는프로그램'); assert F.locator('#proglist .prog').count() == 0 and '검색 결과가 없어요' in F.inner_text('#proglist')
    F.fill('[data-in="progQ"]', '')
    assert F.locator('[data-a^="rate:"]').count() == 0  # 가져가기 전엔 별점 없음
    F.click('[data-a="sharedAdd:0"]')
    assert F.evaluate("S.routines.filter(r=>r.folder==='StrongLifts 5x5').length") == 2
    assert F.evaluate("S.routines[0].items[0].ex") == '바벨 백 스쿼트'
    # 두 번 가져가도 1명, 가져간 뒤 별점
    F.click('[data-a="progs"]'); F.click('[data-a="progTab:shared"]'); F.wait_for_selector('[data-a="rate:0:4"]')
    assert '다시 가져오기' in F.inner_text('#modal') and '1명 가져감' in F.inner_text('#modal')
    F.click('[data-a="sharedAdd:0"]'); F.wait_for_timeout(200)
    assert sum(v['used'] for v in VOTES.values()) == 1
    F.click('[data-a="progs"]'); F.click('[data-a="progTab:shared"]'); F.click('[data-a="rate:0:4"]')
    F.wait_for_function("document.querySelector('#modal').innerText.includes('★ 4.0')")
    assert VOTES[('p0', 'u-f@x.com')] == {'used': True, 'rating': 4}
    # 의견 보내기 -> 내 의견에 답변 보임
    F.click('[data-a="close"]'); F.click('[data-a="tab:settings"]'); F.click('[data-a="fbOpen"]')
    F.click('[data-a="fbKind:bug"]'); F.fill('#fb_body', '<i>세트</i> 버튼이 안 눌려요'); F.click('[data-a="fbSend"]')
    F.wait_for_function("document.querySelector('#modal').innerText.includes('버튼이 안 눌려요')")
    assert FB[0]['kind'] == 'bug' and FB[0]['app_ver'] and FB[0]['user_id'] == 'u-f@x.com'
    FB[0].update(status='done', reply='고쳤어요'); F.click('[data-a="close"]'); F.click('[data-a="fbOpen"]')
    F.wait_for_function("document.querySelector('#modal').innerText.includes('고쳤어요')")
    assert '반영됨' in F.inner_text('#modal') and F.locator('#modal i').count() == 0
    F.click('[data-a="close"]')
    # 차단: F가 올린 사람(me)을 차단 -> 목록에서 사라짐, 설정에서 해제
    F.click('[data-a="tab:routines"]'); F.click('[data-a="progs"]'); F.click('[data-a="progTab:shared"]'); F.click('[data-a="reportOpen:0"]'); F.click('[data-a="blockUser"]')
    assert F.locator('#proglist .prog').count() == 0 and F.evaluate('S.set.blocked[0].name') == 'me'
    F.click('[data-a="close"]'); F.click('[data-a="tab:settings"]'); F.click('[data-a="sOpen:blocked"]'); F.click('[data-a^="unblock:"]')
    assert F.evaluate('S.set.blocked.length') == 0; F.click('[data-a="close"]')
    # 신고: F가 신고 -> 다른 두 명도 신고해 3명이 되면 숨김. 올린 사람에겐 '신고로 숨겨짐'
    F.click('[data-a="tab:routines"]'); F.click('[data-a="progs"]'); F.click('[data-a="progTab:shared"]'); F.click('[data-a="reportOpen:0"]')
    F.click('[data-a="reportReason:abuse"]'); F.fill('#r_note', '욕설'); F.click('[data-a="reportSend"]'); F.wait_for_timeout(300)
    assert REPORTS == {('p0', 'u-f@x.com'): 'abuse'} and not PROGS[0]['hidden']
    REPORTS[('p0', 'u-x')] = 'spam'; REPORTS[('p0', 'u-y')] = 'spam'; PROGS[0]['hidden'] = True
    F.click('[data-a="progTab:shared"]'); F.wait_for_timeout(300); assert F.locator('#proglist .prog').count() == 0
    F.click('[data-a="close"]')
    # 탈퇴: '탈퇴' 입력해야 진행, 서버의 내 기록·신고 삭제, 이 기기도 비움
    workout(F, 'F1', 50); sync(F); assert len(server_recs('u-f@x.com')) >= 2
    F.click('[data-a="tab:settings"]'); F.click('[data-a="sOpen:account"]'); F.click('[data-a="sOpen:deleteAcct"]')
    F.click('[data-a="deleteMe"]'); F.wait_for_timeout(200); assert F.evaluate('!!SY.rt')  # 입력 안 하면 안 지움
    F.fill('#d_word', '탈퇴'); F.click('[data-a="deleteMe"]'); F.wait_for_function('!SY.rt')
    assert server_recs('u-f@x.com') == {} and ('p0', 'u-f@x.com') not in REPORTS and F.evaluate('S.workouts.length') == 0
    Bd.click('[data-a="progs"]'); Bd.click('[data-a="progTab:shared"]'); Bd.wait_for_selector('[data-a="pubDel:0"]')
    assert '신고로 숨겨짐' in Bd.inner_text('#modal')
    Bd.click('[data-a="pubDel:0"]'); Bd.wait_for_function("document.querySelector('#modal').innerText.includes('아직 공유된')")
    assert PROGS == []
    assert not F.errors, F.errors

    assert not A.errors and not Bd.errors, A.errors + Bd.errors
    b.close()
print('OK')
