"""스모크 테스트: python test_smoke.py [스크린샷폴더]  (playwright 필요)"""
import http.server, threading, functools, sys, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_port}/'

def save_file(p, name):  # shareFile로 넘어온 파일을 스크린샷 폴더에 저장
    if not OUT: return
    import base64
    b64 = p.evaluate("new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(_f)})")
    open(os.path.join(OUT, name), 'wb').write(base64.b64decode(b64))

def shot(p, name):
    if OUT: p.wait_for_timeout(300); p.screenshot(path=os.path.join(OUT, name + '.png'), full_page=True)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    errors = []
    p.on('pageerror', lambda e: errors.append(str(e)))
    p.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    p.on('dialog', lambda d: d.accept())
    p.goto(URL)

    # 프로그램 운동 이름이 전부 운동 목록에 있는지
    missing = p.evaluate("PROGRAMS.flatMap(p=>p.days.flatMap(d=>d[1].map(x=>x[0]))).filter(n=>!EX[n])")
    assert not missing, missing

    # 초성 검색
    assert p.evaluate("cho('벤치프레스')") == 'ㅂㅊㅍㄹㅅ'

    # 프로그램 가져오기 -> 루틴 시작
    p.click('[data-a="tab:routines"]'); p.click('[data-a="progs"]')
    p.click('[data-a="progAdd:1"]')  # StrongLifts
    assert p.evaluate('S.routines.length') == 2
    p.click('[data-a^="start:"] >> nth=0')
    assert p.evaluate('S.active.items.length') == 3

    # 첫 운동 세트 입력 + 체크 -> 휴식 타이머
    p.fill('[data-f="0:0:w"]', '100'); p.fill('[data-f="0:0:r"]', '5')
    p.click('[data-a="done:0:0"]')
    assert p.evaluate('!!S.timer'), 'rest timer not started'
    assert p.is_visible('#restleft')
    p.click('[data-a="restSkip"]')
    # 웜업 자동, 드롭 자동
    p.click('[data-a="imenu:0"]'); p.click('[data-a="warm:0"]')
    assert p.evaluate("S.active.items[0].sets.filter(s=>s.type==='W').length") == 3
    p.click('[data-a="imenu:0"]'); p.click('[data-a="drop:0"]')
    assert p.evaluate("S.active.items[0].sets.filter(s=>s.type==='D').length") == 2
    # 슈퍼세트: 0번과 1번 묶기 -> 0번 체크해도 휴식 안 시작
    p.click('[data-a="imenu:0"]'); p.click('[data-a="ss:0"]')
    assert p.evaluate('S.active.items[0].ss && S.active.items[0].ss===S.active.items[1].ss')
    p.fill('[data-f="0:4:w"]', '100'); p.fill('[data-f="0:4:r"]', '5')
    p.click('[data-a="done:0:4"]')
    assert not p.evaluate('S.timer'), p.evaluate('JSON.stringify([S.timer,S.active.items.map(i=>i.ss)])')
    # 원판 계산
    p.click('[data-a="imenu:0"]'); p.click('[data-a="plate:0"]')
    assert '25 + 15' in p.inner_text('#platesOut'), p.inner_text('#platesOut')  # 100kg = 20바 + 한쪽 40
    p.click('[data-a="close"]')
    # 운동 추가: 초성 검색
    p.click('[data-a="pickOpen"]')
    p.click('[data-a="pickF:cat:스트레칭"]'); p.click('[data-a="pickF:mus:햄스트링"]')
    assert '햄스트링 스트레칭' in p.inner_text('#picklist') and '바벨 백 스쿼트' not in p.inner_text('#picklist')
    p.click('[data-a="pickF:cat:맨몸"]'); p.click('[data-a="pickF:mus:전체"]'); p.click('[data-a="pickF:eq:맨몸"]')
    assert '다이아몬드 푸시업' in p.inner_text('#picklist') and '파워 클린' not in p.inner_text('#picklist')
    p.click('[data-a="pickF:cat:역도"]'); p.click('[data-a="pickF:eq:전체"]'); assert '스내치 밸런스' in p.inner_text('#picklist')
    p.click('[data-a="fav:%EC%8A%A4%EB%82%B4%EC%B9%98%20%EB%B0%B8%EB%9F%B0%EC%8A%A4"]')
    assert p.evaluate('S.set.fav') == ['스내치 밸런스'] and p.evaluate('ui.modal.sel.length') == 0
    p.click('[data-a="pickF:cat:전체"]'); p.click('[data-a="pickF:src:즐겨찾기"]'); assert p.locator('#picklist .pick').count() == 1
    shot(p, '0_picker'); p.click('[data-a="pickF:src:전체"]')
    p.fill('[data-in="pickq"]', 'ㄹㅍㄷ')
    assert '랫 풀다운' in p.inner_text('#picklist')
    # 사진 누르면 크게 보기 -> 거기서 선택
    p.click('#picklist [data-a="zoom:%EB%9E%AB%20%ED%92%80%EB%8B%A4%EC%9A%B4"]')
    assert p.is_visible('#zoom .anim') and p.evaluate('ui.modal.sel.length') == 0
    p.click('#zoom [data-a^="zoomPick:"]')
    assert not p.locator('#zoom').count() and p.evaluate('ui.modal.sel') == ['랫 풀다운']
    p.click('[data-a="pickDone"]')
    assert p.evaluate('S.active.items.at(-1).ex') == '랫 풀다운'
    shot(p, '1_workout')
    p.click('[data-a="finish"]')
    assert p.evaluate('S.workouts.length') == 1 and not p.evaluate('S.active')
    assert p.evaluate("S.workouts[0].items.every(it=>it.sets.every(s=>s.w>0))"), 'empty-weight sets recorded'
    # 루틴 세트 자동 업데이트
    assert p.evaluate("S.routines[0].items[0].sets.some(s=>s.w===100)")

    # 결과 화면: 요약/상세/월간 탭 + 이미지로 공유 (html-to-image)
    p.evaluate("window._f=null; shareFile=async f=>{window._f=f}")
    assert '세트' in p.inner_text('#rcard') and p.locator('#rcard polygon.p').count() > 0
    p.click('[data-a="rshot"]'); p.wait_for_function('window._f', timeout=30000)
    assert p.evaluate("_f.type") == 'image/png' and p.evaluate("_f.size") > 20000
    save_file(p, '6_card.png'); shot(p, '6_sum')
    p.click('[data-a="rtab:detail"]'); assert 'PR' in p.inner_text('#rcard'); shot(p, '6_detail')
    p.click('[data-a="rtab:month"]'); assert '리포트' in p.inner_text('#rcard'); shot(p, '6_month')
    p.evaluate("window._f=null"); p.click('[data-a="rshot"]'); p.wait_for_function('window._f', timeout=30000); save_file(p, '7_month.png')
    p.click('#modal [data-a="close"]')
    # 두 번째 운동: 더 무거우면 신기록
    p.click('[data-a="start:' + p.evaluate('S.routines[0].id') + '"]')
    p.evaluate("S.active.start=Date.now()+1000")
    p.fill('[data-f="0:3:w"]', '110')
    p.click('[data-a="finish"]')
    assert '신기록' in p.inner_text('#modal'), p.inner_text('#modal')
    assert p.locator('#modal .newb .medal').count() >= 1  # 신기록 등 새 업적
    shot(p, '2_summary')
    # 기록 수정 -> 저장 시 개수 유지
    wid = p.evaluate('S.workouts[0].id')
    p.click(f'[data-a="wedit:{wid}"]'); p.click('[data-a="finish"]')
    assert p.evaluate('S.workouts.length') == 2

    # 분석 / 신체 / 설정 탭
    p.click('#modal [data-a="close"]')
    p.click('[data-a="tab:stats"]'); assert '3대 운동' in p.inner_text('#app'); shot(p, '3_stats')
    p.click('[data-a^="monthRep:"]'); assert '총 운동 횟수' in p.inner_text('#modal'); p.click('[data-a="close"]')
    # 레벨 카드 + 업적
    p.click('[data-a="tab:home"]'); assert 'Lv.' in p.inner_text('.lvcard')
    p.click('.lvcard'); assert '첫걸음' in p.inner_text('#modal .special:not(.off)') and '???' in p.inner_text('#modal')
    p.click('[data-a="bcat:근력"]'); assert '3대 합계' in p.inner_text('#modal') and '꾸준함' not in p.inner_text('#modal .tracks')
    p.click('[data-a="bcat:특별"]'); p.click('[data-a="bpick:first"]'); assert p.evaluate('S.set.badge') == 'first'; shot(p, '8_level'); p.click('[data-a="close"]')
    p.click('[data-a="tab:stats"]')
    p.click('[data-a^="exd:"] >> nth=0'); assert '추정 1RM' in p.inner_text('#modal')
    # 운동 그림 + 근육 지도
    assert p.locator('#modal .anim img').count() == 2 and p.locator('#modal polygon.p').count() > 0
    assert '주동근' in p.inner_text('#modal')
    p.wait_for_function("[...document.querySelectorAll('#modal .anim img')].every(i=>i.complete&&i.naturalWidth>0)", timeout=15000)
    shot(p, '3b_exdetail'); p.click('[data-a="close"]')
    assert p.evaluate("Object.keys(EX).filter(n=>!MEDIA[n]).length") == 4
    assert p.evaluate("Object.values(MEDIA).filter(m=>m.length>3).length") == 0  # 애니메이션(비상업 라이선스) 안 씀
    p.click('[data-a="tab:body"]'); p.fill('#b_w', '75'); p.fill('#b_f', '15'); p.click('[data-a="bodyAdd"]')
    assert 'FFMI' in p.inner_text('#app'); shot(p, '4_body')
    p.click('[data-a="tab:settings"]'); p.check('[data-s="rpe"]')
    assert p.evaluate('S.set.rpe') is True
    # 설정 시트: 세트 템플릿 / 보유 덤벨 / 캘린더 시작 요일 / 웜업 볼륨
    p.click('[data-a="sOpen:template"]'); p.fill('[data-s="setN"]', '4'); p.fill('[data-s="setR"]', '12'); p.press('[data-s="setR"]', 'Tab'); p.click('[data-a="close"]')
    assert p.evaluate("newItem('스내치 밸런스', {items:[]}).sets.map(s=>s.r)") == [12, 12, 12, 12]
    assert '4세트 × 12회' in p.inner_text('#app')
    p.click('[data-a="sOpen:dbs"]'); p.fill('[data-s="dbs"]', '10,12.5,15'); p.press('[data-s="dbs"]', 'Tab'); p.click('[data-a="close"]')
    assert p.evaluate("roundW('덤벨 컬', 13.4)") == 12.5 and p.evaluate("roundW('바벨 컬', 13.4)") == 12.5 and p.evaluate("roundW('랫 풀다운', 13.4)") == 15
    p.click('[data-a="sOpen:weekStart"]'); p.select_option('[data-s="weekStart"]', '0'); p.click('[data-a="close"]')
    assert p.evaluate('S.set.weekStart') == 0 and '일요일' in p.inner_text('#app')
    vol = p.evaluate('wVol(S.workouts[0])'); p.uncheck('[data-s="warmEx"]')
    assert p.evaluate('wVol(S.workouts[0])') > vol; p.check('[data-s="warmEx"]')
    # 1RM 계산기
    p.click('[data-a="sOpen:rm"]'); p.fill('#rm_w', '100'); p.fill('#rm_r', '5')
    assert '116.7kg' in p.inner_text('#rmOut'); p.click('[data-a="close"]')
    # 인터벌 타이머: 1초 운동 · 0초 휴식 · 2라운드 -> 끝나면 정지
    p.click('[data-a="sOpen:interval"]'); p.fill('[data-s="ivWork"]', '1'); p.press('[data-s="ivWork"]', 'Tab'); p.fill('[data-s="ivRest"]', '0'); p.press('[data-s="ivRest"]', 'Tab')
    p.fill('[data-s="ivRounds"]', '2'); p.press('[data-s="ivRounds"]', 'Tab')
    p.click('[data-a="ivStart"]'); assert p.evaluate('IV.round') == 1
    p.wait_for_function('IV && IV.round === 2', timeout=5000); p.wait_for_function('!IV', timeout=5000); p.click('[data-a="close"]')
    shot(p, '9_settings')

    # 새로고침 후 유지
    p.reload(); assert p.evaluate('S.workouts.length') == 2
    p.click('[data-a="tab:home"]'); shot(p, '5_home')

    # 루틴 링크 공유 -> 다른 사람(새 브라우저 컨텍스트)이 열면 가져오기
    p.click('[data-a="tab:routines"]'); p.click('button[data-a^="redit:"] >> nth=0')
    p.evaluate("window._u=null; Object.defineProperty(navigator,'share',{value:undefined}); navigator.clipboard.writeText=async u=>{window._u=u}")
    p.click('[data-a="rshare"]'); p.wait_for_function('window._u')
    url, src = p.evaluate('window._u'), p.evaluate('JSON.stringify(ui.edit.items.map(it=>[it.ex,it.sets.map(s=>[s.w,s.r,s.type])]))')
    q = b.new_page(viewport={'width': 390, 'height': 844})
    q.on('pageerror', lambda e: errors.append(str(e))); q.on('dialog', lambda d: d.accept())
    q.goto(url)
    assert q.evaluate('S.routines.length') == 1 and q.evaluate("S.routines[0].folder") == '공유받음'
    assert q.evaluate('JSON.stringify(S.routines[0].items.map(it=>[it.ex,it.sets.map(s=>[s.w,s.r,s.type])]))') == src
    assert '#' not in q.url
    # 조작된 링크: 허용 안 된 부위 값은 버림
    import base64, json
    bad = base64.urlsafe_b64encode(json.dumps({'n': 'x', 'i': [{'ex': 'zz', 'sets': [{'w': '<b>', 'type': 'Q'}]}], 'c': [{'name': 'zz', 'part': '<img src=x onerror=alert(1)>', 'equip': '바벨', 'type': 'w'}]}).encode()).decode().rstrip('=')
    q.goto(URL + 'index.html#r=' + bad)
    assert q.evaluate('S.custom.length') == 0 and q.evaluate("S.routines.at(-1).items[0].sets[0]") == {'w': 0, 'r': '', 'type': 'N', 'rpe': '', 'done': False}
    q.close()
    assert not errors, errors
    b.close()
print('OK')
