"""동기화 테스트: 가짜 Supabase(auth + rest) 서버 + 두 기기(브라우저 컨텍스트). python test_sync.py"""
import http.server, threading, json, os, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
ROWS = {}  # user_id -> {data, rev}
LOCK = threading.Lock()
RACE = {'on': False, 'patches': 0}
PROGS = []  # 공유 프로그램 표
VOTES = {}  # (program_id, user_id) -> {used, rating}
FB = []  # 의견  # on: GET 직후 다른 기기가 올린 것처럼 rev 올림

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(s, *a): pass
    def send(s, code, obj=None):
        b = json.dumps(obj).encode() if obj is not None else b''
        s.send_response(code); s.send_header('Content-Type', 'application/json'); s.end_headers(); s.wfile.write(b)
    def body(s): return json.loads(s.rfile.read(int(s.headers.get('Content-Length') or 0)) or b'{}')
    def q(s): return {k: v[0].split('.', 1)[-1] for k, v in parse_qs(urlparse(s.path).query).items() if k != 'select' and k != 'grant_type'}
    def do_POST(s):
        u, b = urlparse(s.path), s.body()
        if u.path.startswith('/auth/v1/'):
            email = b.get('email', 'a@x.com')
            if b.get('password') == 'wrong': return s.send(400, {'msg': 'Invalid login credentials'})
            return s.send(200, {'access_token': 't', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u-' + email, 'email': email}})
        if u.path == '/rest/v1/gymlog_programs':
            old = next((x for x in PROGS if x['user_id'] == b['user_id'] and x['name'] == b['name']), None)
            if old: old.update(b)
            else: PROGS.append({'id': 'p%d' % len(PROGS), **b})
            return s.send(201)
        if u.path == '/rest/v1/gymlog_program_votes':
            v = VOTES.setdefault((b['program_id'], b['user_id']), {'used': False, 'rating': None})
            new = {**v, **{k: b[k] for k in ('used', 'rating') if k in b}}
            if new['rating'] is not None and not new['used']: return s.send(400, {'message': 'check violation'})
            v.update(new); return s.send(201)
        if u.path == '/rest/v1/gymlog_feedback':
            FB.append({'id': len(FB) + 1, 'status': 'new', 'reply': '', 'created_at': '2026-10-20T00:00:00Z', **b}); return s.send(201)
        with LOCK:
            if b['user_id'] in ROWS: return s.send(409, {'message': 'duplicate'})
            ROWS[b['user_id']] = {'data': b['data'], 'rev': b['rev']}
        s.send(201)
    def do_PATCH(s):
        q, b = s.q(), s.body()
        if s.path.startswith('/rest/v1/gymlog_programs'):
            for x in PROGS:
                if x['user_id'] == q['user_id']: x.update(b)
            return s.send(204)
        with LOCK:
            row = ROWS.get(q['user_id'])
            if not row or row['rev'] != int(q['rev']): return s.send(200, [])
            RACE['patches'] += 1; row.update(data=b['data'], rev=b['rev'])
            s.send(200, [row])
    def do_DELETE(s):
        pid = s.q()['id']; PROGS[:] = [x for x in PROGS if x['id'] != pid]; s.send(204)
    def do_GET(s):
        if s.path.startswith('/auth/v1/user'):
            return s.send(200, {'id': 'u-g@x.com', 'email': 'g@x.com'}) if s.headers.get('Authorization') == 'Bearer gtok' else s.send(401, {'msg': 'bad jwt'})
        if s.path.startswith('/rest/v1/gymlog_programs_v'):
            out = []
            for x in PROGS:
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
        if s.path.startswith('/rest/v1/'):
            row = ROWS.get(s.q()['user_id'])
            s.send(200, [row] if row else [])
            if row and RACE['on']: RACE['on'] = False; row['data']['recs']['w:other'] = {'id': 'other', 'name': 'C1', 'start': 1, 'end': 2, 'items': []}; row['rev'] += 1
            return
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
    assert len(ROWS['u-me@x.com']['data']['recs']) == 3

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

    # 동시 업로드 (rev 충돌) -> 둘 다 살아남음
    workout(A, 'A3', 80); workout(Bd, 'B1', 90)
    sync(A)
    RACE['on'] = True; sync(Bd)  # B가 받은 직후 제3기기가 C1을 올림 -> B의 PATCH 실패 -> 재시도
    assert not RACE['on']
    workout(A, 'A4', 85); sync(A); sync(Bd)
    names = sorted(Bd.evaluate('S.workouts.map(w=>w.name)'))
    assert names == sorted(['B쪽 수정', 'A3', 'B1', 'A4', 'C1']), names

    # 초기화는 서버를 지우지 않음
    A.evaluate('A.close()'); A.click('[data-a="tab:settings"]'); A.click('[data-a="resetAll"]')
    assert A.evaluate('S.workouts.length') == 0
    assert len([k for k in ROWS['u-me@x.com']['data']['recs'] if k.startswith('w:')]) == 5

    # 진행 중인 운동은 동기화 대상 아님 (기기별)
    Bd.evaluate("A.start('')"); sync(Bd)
    assert 'active' not in json.dumps(ROWS['u-me@x.com']['data']['recs'].keys().__repr__())

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
    Bd.fill('#p_desc', '<b>초보</b> 주 3회'); Bd.click('[data-a="pubSave"]'); Bd.wait_for_function('!ui.modal')
    assert len(PROGS) == 1 and len(PROGS[0]['days']['r']) == 2 and PROGS[0]['author'] == 'me'
    Bd.click('[data-a="pubOpen:StrongLifts%205x5"]'); Bd.wait_for_function("document.querySelector('#p_desc').value")  # 기존 설명 채워짐
    Bd.click('[data-a="pubSave"]'); Bd.wait_for_function('!ui.modal')
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
    F.fill('[data-in="progQ"]', ''), F.inner_text('#modal')
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
    Bd.click('[data-a="progs"]'); Bd.click('[data-a="progTab:shared"]'); Bd.wait_for_selector('[data-a="pubDel:0"]')
    Bd.click('[data-a="pubDel:0"]'); Bd.wait_for_function("document.querySelector('#modal').innerText.includes('아직 공유된')")
    assert PROGS == []
    assert not F.errors, F.errors

    assert not A.errors and not Bd.errors, A.errors + Bd.errors
    b.close()
print('OK')
