"""스모크 테스트: python test_smoke.py [스크린샷폴더]  (playwright 필요)"""
import http.server, threading, functools, sys, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_port}/'

def shot(p, name):
    if OUT: p.screenshot(path=os.path.join(OUT, name + '.png'), full_page=True)

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
    p.click('[data-a="pickOpen"]'); p.fill('[data-in="pickq"]', 'ㄹㅍㄷ')
    assert '랫 풀다운' in p.inner_text('#picklist')
    p.click('[data-a="pickTog:' + '%EB%9E%AB%20%ED%92%80%EB%8B%A4%EC%9A%B4' + '"]'); p.click('[data-a="pickDone"]')
    assert p.evaluate('S.active.items.at(-1).ex') == '랫 풀다운'
    shot(p, '1_workout')
    p.click('[data-a="finish"]')
    assert p.evaluate('S.workouts.length') == 1 and not p.evaluate('S.active')
    assert p.evaluate("S.workouts[0].items.every(it=>it.sets.every(s=>s.w>0))"), 'empty-weight sets recorded'
    # 루틴 세트 자동 업데이트
    assert p.evaluate("S.routines[0].items[0].sets.some(s=>s.w===100)")
    p.click('#modal [data-a="close"]')

    # 두 번째 운동: 더 무거우면 신기록
    p.click('[data-a="start:' + p.evaluate('S.routines[0].id') + '"]')
    p.evaluate("S.active.start=Date.now()+1000")
    p.fill('[data-f="0:3:w"]', '110')
    p.click('[data-a="finish"]')
    assert '신기록' in p.inner_text('#modal'), p.inner_text('#modal')
    shot(p, '2_summary')
    # 기록 수정 -> 저장 시 개수 유지
    wid = p.evaluate('S.workouts[0].id')
    p.click(f'[data-a="wedit:{wid}"]'); p.click('[data-a="finish"]')
    assert p.evaluate('S.workouts.length') == 2

    # 분석 / 신체 / 설정 탭
    p.click('#modal [data-a="close"]')
    p.click('[data-a="tab:stats"]'); assert '3대 운동' in p.inner_text('#app'); shot(p, '3_stats')
    p.click('[data-a^="exd:"] >> nth=0'); assert '추정 1RM' in p.inner_text('#modal')
    # 운동 그림 + 근육 지도
    assert p.locator('#modal .anim img').count() == 2 and p.locator('#modal polygon.p').count() > 0
    assert '주동근' in p.inner_text('#modal')
    p.wait_for_function("[...document.querySelectorAll('#modal .anim img')].every(i=>i.complete&&i.naturalWidth>0)", timeout=15000)
    shot(p, '3b_exdetail'); p.click('[data-a="close"]')
    assert p.evaluate("Object.keys(EX).filter(n=>!MEDIA[n]).length") == 5
    p.click('[data-a="tab:body"]'); p.fill('#b_w', '75'); p.fill('#b_f', '15'); p.click('[data-a="bodyAdd"]')
    assert 'FFMI' in p.inner_text('#app'); shot(p, '4_body')
    p.click('[data-a="tab:settings"]'); p.check('[data-s="rpe"]')
    assert p.evaluate('S.set.rpe') is True

    # 새로고침 후 유지
    p.reload(); assert p.evaluate('S.workouts.length') == 2
    p.click('[data-a="tab:home"]'); shot(p, '5_home')
    assert not errors, errors
    b.close()
print('OK')
