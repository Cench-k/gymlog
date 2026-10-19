"""동기화 테스트: 가짜 Supabase(auth + rest) 서버 + 두 기기(브라우저 컨텍스트). python test_sync.py"""
import http.server, threading, json, os, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
ROWS = {}  # user_id -> {data, rev}
LOCK = threading.Lock()
RACE = {'on': False, 'patches': 0}  # on: GET 직후 다른 기기가 올린 것처럼 rev 올림

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(s, *a): pass
    def send(s, code, obj=None):
        b = json.dumps(obj).encode() if obj is not None else b''
        s.send_response(code); s.send_header('Content-Type', 'application/json'); s.end_headers(); s.wfile.write(b)
    def body(s): return json.loads(s.rfile.read(int(s.headers.get('Content-Length') or 0)) or b'{}')
    def q(s): return {k: v[0].split('.', 1)[1] for k, v in parse_qs(urlparse(s.path).query).items() if k != 'select' and k != 'grant_type'}
    def do_POST(s):
        u, b = urlparse(s.path), s.body()
        if u.path.startswith('/auth/v1/'):
            email = b.get('email', 'a@x.com')
            if b.get('password') == 'wrong': return s.send(400, {'msg': 'Invalid login credentials'})
            return s.send(200, {'access_token': 't', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u-' + email, 'email': email}})
        with LOCK:
            if b['user_id'] in ROWS: return s.send(409, {'message': 'duplicate'})
            ROWS[b['user_id']] = {'data': b['data'], 'rev': b['rev']}
        s.send(201)
    def do_PATCH(s):
        q, b = s.q(), s.body()
        with LOCK:
            row = ROWS.get(q['user_id'])
            if not row or row['rev'] != int(q['rev']): return s.send(200, [])
            RACE['patches'] += 1; row.update(data=b['data'], rev=b['rev'])
            s.send(200, [row])
    def do_GET(s):
        if s.path.startswith('/auth/v1/user'):
            return s.send(200, {'id': 'u-g@x.com', 'email': 'g@x.com'}) if s.headers.get('Authorization') == 'Bearer gtok' else s.send(401, {'msg': 'bad jwt'})
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
    p = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    p.errors = []
    p.on('pageerror', lambda e: p.errors.append(str(e)))
    p.on('dialog', lambda d: d.accept())
    p.goto(URL)
    return p

def login(p, pw='pw1234'):
    p.click('[data-a="tab:settings"]')
    p.evaluate(f"SY.url='{URL.rstrip('/')}'; SY.key='anon'")
    p.fill('#sy_email', 'me@x.com'); p.fill('#sy_pw', pw)
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
    A.click('[data-a="tab:settings"]'); A.click('[data-a="resetAll"]')
    assert A.evaluate('S.workouts.length') == 0
    assert len([k for k in ROWS['u-me@x.com']['data']['recs'] if k.startswith('w:')]) == 5

    # 진행 중인 운동은 동기화 대상 아님 (기기별)
    Bd.evaluate("A.start('')"); sync(Bd)
    assert 'active' not in json.dumps(ROWS['u-me@x.com']['data']['recs'].keys().__repr__())

    # 구글 로그인: 버튼 -> authorize 주소, 돌아오면 #토큰으로 로그인
    G = device(b)
    G.evaluate(f"localStorage.setItem('gymlog.sync', JSON.stringify({{url:'{URL.rstrip('/')}', key:'anon'}}))")
    G.reload(); G.click('[data-a="tab:settings"]')
    G.route('**/auth/v1/authorize**', lambda r: r.fulfill(body='ok'))
    with G.expect_navigation(): G.click('[data-a="google"]')
    assert '/auth/v1/authorize?provider=google&redirect_to=' in G.url, G.url
    G.goto(URL + '#access_token=gtok&refresh_token=gr&expires_in=3600&token_type=bearer')
    G.wait_for_function('SY.uid === "u-g@x.com"')
    assert '#' not in G.url and G.evaluate('SY.email') == 'g@x.com'
    G.goto(URL + '?r=1#error=access_denied&error_description=cancel'); G.wait_for_timeout(300)
    assert 'cancel' in G.inner_text('#toast'), G.inner_text('#toast')
    assert not G.errors, G.errors

    assert not A.errors and not Bd.errors, A.errors + Bd.errors
    b.close()
print('OK')
