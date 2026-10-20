"""의견함 관리: 사용자 의견 보기 · 상태/답변 달기 (Supabase gymlog_feedback)

  python feedback_admin.py              # 처리 안 한 의견 (접수·확인함)
  python feedback_admin.py all          # 전부
  python feedback_admin.py set 12 done "다음 버전에서 고쳤어요"   # 상태: new seen done wont

관리자 키는 저장소 밖 파일에만 둔다 (GitHub에 올라가면 안 됨):
  %USERPROFILE%\\.gymlog-admin.env  안에  SUPABASE_SECRET_KEY=sb_secret_...
  키 만들기: Supabase 대시보드 > gymlog 프로젝트 > Settings > API Keys > Secret keys > New secret key
"""
import json, os, sys, urllib.request, urllib.parse
from pathlib import Path

URL = 'https://kbotdssaktcsdbvqlwvq.supabase.co'
KIND = {'bug': '버그', 'idea': '아이디어', 'etc': '기타'}
STATUS = {'new': '접수', 'seen': '확인함', 'done': '반영됨', 'wont': '보류'}


def secret():
    key = os.environ.get('SUPABASE_SECRET_KEY')
    f = Path.home() / '.gymlog-admin.env'
    if not key and f.exists():
        for line in f.read_text(encoding='utf-8').splitlines():
            if line.startswith('SUPABASE_SECRET_KEY='): key = line.split('=', 1)[1].strip()
    if not key: sys.exit(f'관리자 키 없음: {f} 에 SUPABASE_SECRET_KEY=... 를 넣으세요 (사용법은 파일 맨 위 설명)')
    return key


def call(path, method='GET', body=None):
    req = urllib.request.Request(f'{URL}/{path}', method=method, data=body and json.dumps(body).encode(),
                                 headers={'apikey': secret(), 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b'null')


def email(uid, cache={}):
    if uid not in cache:
        try: cache[uid] = call(f'auth/v1/admin/users/{uid}').get('email', '')
        except Exception: cache[uid] = uid[:8]
    return cache[uid]


def show(everything):
    q = 'select=*&order=created_at.desc' + ('' if everything else '&status=in.(new,seen)')
    rows = call('rest/v1/gymlog_feedback?' + q)
    if not rows: return print('새 의견 없음')
    for f in rows:
        print(f"#{f['id']} [{STATUS.get(f['status'], f['status'])}] {KIND.get(f['kind'], f['kind'])} · {f['created_at'][:16].replace('T', ' ')} · {email(f['user_id'])} · v{f['app_ver']}")
        print('  ' + f['body'].replace('\n', '\n  '))
        if f['reply']: print('  → 답변: ' + f['reply'])
        print()


def set_status(fid, status, reply):
    if status not in STATUS: sys.exit(f'상태는 {", ".join(STATUS)} 중 하나')
    body = {'status': status, **({'reply': reply} if reply else {})}
    r = call(f'rest/v1/gymlog_feedback?id=eq.{int(fid)}', 'PATCH', body)
    print(f'#{fid} → {STATUS[status]}' + (f' (답변: {reply})' if reply else '') if r else f'#{fid} 없음')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')
    a = sys.argv[1:]
    if a[:1] == ['set'] and len(a) >= 3: set_status(a[1], a[2], ' '.join(a[3:]))
    elif a in ([], ['all']): show(a == ['all'])
    else: print(__doc__)
