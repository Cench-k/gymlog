# 짐로그 (gymlog)

운동 기록 PWA. 빌드 도구 없음: 정적 파일을 GitHub Pages(https://cench-k.github.io/gymlog/)로 배포. 서버는 Supabase(프로젝트 ref `biixaxptjizezwethdsr`, 서울) 하나.

## 세션 규칙 (PC 여러 대에서 번갈아 작업)

- 세션을 시작하면 먼저 `git pull`로 다른 PC에서 한 작업을 받는다.
- 작업 단위가 끝나면 테스트 통과 확인 후 커밋하고 push한다. 사용자가 PC를 옮겨도 이어지게, 커밋 안 한 채로 끝내지 않는다.
- push는 곧 웹 배포다 (GitHub Pages). 배포하면 안 되는 미완성 작업은 브랜치에서 하고 main에 합치지 않는다.

## 새 PC에서 이어서 하기

1. `git clone https://github.com/Cench-k/gymlog.git` (GitHub 로그인: `gh auth login`)
2. `npm install` (Capacitor 도구)
3. 테스트용: `pip install playwright` → `python -m playwright install chromium`
4. 앱 빌드용: Android Studio 설치 (SDK 포함). iOS는 Mac 또는 GitHub Actions macOS
5. 의견함 스크립트를 쓸 거면 Supabase 대시보드에서 비밀 키를 새로 만들어 `%USERPROFILE%\.gymlog-admin.env`에 `SUPABASE_SECRET_KEY=...` (키 파일은 PC끼리 복사하지 말고 PC마다 새로 만들고, 안 쓰는 PC의 키는 대시보드에서 지움)

## 배경 · 결정 사항

- 목표: 라이즈(RISE) 운동 기록 앱의 장점을 모은 앱. 처음엔 지인 10명, 이후 양쪽 스토어 출시. 수익은 AdMob 광고만 (구독 없음)
- 서버: Supabase 프로젝트 `gymlog` (ref `biixaxptjizezwethdsr`, 서울, 무료). 2026-10-20 시드니(`kbotdssaktcsdbvqlwvq`, 데이터 0건)에서 옮김. 공개 키는 sync.js에 있음 (RLS로 보호). 다른 프로젝트 `ojmfrsikzaengqjjxzxx`는 다른 앱 DB라 절대 쓰지 않음
- 로그인: 이메일 + 구글 (Google Cloud 프로젝트 `gymlog-512108`의 OAuth 웹 클라이언트, Supabase Auth에 연결). Supabase site_url은 Pages 주소, 허용 주소에 `http://localhost:3000/**`도 있음 (PC 테스트용: `python -m http.server 3000`)
- 동기화: 기록 하나 = `gymlog_recs` 한 행. 바뀐 것만 올리고(`rpc/gymlog_push`, 수정 시각 u가 큰 쪽이 이김) 커서 이후 바뀐 것만 받음. 커서 없는 기기는 가진 기록을 전부 올리므로 서버를 옮겨도 기기에서 복구됨
- 레벨은 숫자만 (등급 이름 없음). 운동 이미지는 퍼블릭 도메인 사진만 (아래 주의 참고)
- 출시 순서: Capacitor 안드로이드 빌드 → AdMob(테스트 광고) + 휴식 알림을 앱 알림으로 → 앱 안 계정 삭제·개인정보처리방침·Apple 로그인·앱용 구글 로그인 → iOS
- 진행 상황은 `git log`로 확인

## 파일

스크립트는 일반 `<script>`로 index.html 순서대로 읽고 전역을 공유한다. 뒤 파일이 앞 파일의 `A`(버튼 동작), `MODALS`(팝업), `VIEWS`(탭 화면)에 항목을 추가하는 방식.

| 파일 | 역할 |
|---|---|
| data.js | 내장 운동 목록(부위별), 역도 종목 `OLYMPIC`, 기본 프로그램 `PROGRAMS` |
| media.js | 운동 사진·애니메이션 id와 주동근/보조근 `MEDIA`, 근육 지도 폴리곤 `BODY` |
| style.css | 전체 스타일. 색·글꼴은 맨 위 `:root` 변수만 바꾸면 전체 적용 (밝은 바탕 + 파란 포인트 `--pri`) |
| core.js | 상수, 유틸, 상태 `S`(localStorage `gymlog.v1`), 운동 메타 `EX`(종류·주동근), 계산(1RM·볼륨), 휴식 타이머, 근육 지도, 차트, `APP_VER` |
| ui.js | `render()`, 탭 화면, 운동 기록 화면, 팝업, 버튼 동작 `A`, 입력 이벤트 |
| sync.js | Supabase 로그인(이메일·구글)과 기록 동기화 |
| share.js | 루틴 링크 공유, 프로그램 공유·가져오기·별점 |
| level.js | 레벨·경험치·업적 (기록에서 매번 계산, 저장 안 함) |
| report.js | 운동 결과 요약·상세·월간 리포트 카드, 이미지로 공유(html-to-image) |
| feedback.js | 의견 보내기 · 내 의견 |
| settings.js | 설정 탭(섹션별 목록 `SETTINGS`, 시트 `SHEETS`), 1RM 계산기, 인터벌 타이머. 새 설정은 core.js `DEF`에 기본값 + 여기 한 줄 |
| app.js | 시작 (서비스 워커 등록, 첫 화면) |
| sw.js | 오프라인 캐시. 새 js 파일을 만들면 `addAll` 목록에도 추가 |
| supabase.sql | DB 표·권한 전체. SQL Editor에 통째로 붙여 실행 (여러 번 실행해도 안전) |

버튼은 `data-a="동작:인자1:인자2"` → `A.동작(인자1, 인자2)`. 인자에 `:`나 공백이 들어갈 수 있으면 `encodeURIComponent`.

## 자주 하는 작업

- **운동 추가**: data.js 해당 부위에 `[이름, 장비, 타입]` (타입 w=무게×횟수, b=맨몸×횟수, t=시간, c=유산소). media.js `MEDIA`에 `[free-exercise-db 사진 id, 주동근, 보조근]` (영문 근육명, MUSCLE_KO 참고). 운동 종류는 부위·장비로 자동 (core.js `meta`).
- **업적 추가**: level.js `TRACKS`(브론즈~다이아 5단계) 또는 `SPECIALS`(한 번, 숨김 가능)에 한 줄. 필요한 수치는 `gameStats()`에서 계산. 운동별 숙련 업적은 운동 목록에서 자동 생성 (운동 추가하면 업적도 늘어남)
- **프로필 사진**: `S.set.avatar`가 'photo'(160px JPEG를 설정에 저장, 동기화됨) 또는 'badge'(`S.set.badge` 업적 id). 공유 프로그램에는 사진 말고 뱃지만 보냄
- **DB 변경**: supabase.sql에 추가 → Supabase SQL Editor에서 실행 → test_sync.py 가짜 서버도 같은 동작으로 맞춤.
- **배포**: core.js `APP_VER` 올림 → 테스트 → `git push` (Pages가 main에서 바로 배포). 폰은 앱을 두 번째 열 때 새 버전.

## 앱 (Capacitor 8, 안드로이드·iOS)

같은 웹 코드를 앱으로 감싼다. 웹은 그대로 GitHub Pages, 앱은 스토어.
- `npm run build`: sw.js의 캐시 목록대로 파일을 `www/`로 복사 (앱에 들어갈 파일 목록은 sw.js 한 곳에서만 관리)
- `npm run sync`: build + `npx cap sync` (android/ios 폴더에 반영). 웹 코드를 고친 뒤 앱 빌드 전에 항상 실행
- `npm run android`: sync 후 Android Studio 열기 → 실행·서명·AAB 빌드
- 앱 ID `com.cenchk.gymlog` (스토어 첫 업로드 후엔 못 바꿈). 아이콘·스플래시 원본은 `assets/`, 바꾸면 `npx capacitor-assets generate --android`
- 앱 안에서는 서비스 워커를 끈다 (app.js). `window.Capacitor?.isNativePlatform?.()`로 앱/웹 구분
- 웹뷰 안 구글 로그인은 구글이 막는다 → 앱에서는 네이티브 로그인 플러그인 필요 (출시 전 작업)

## 의견 반영 흐름

사용자가 설정 → 의견 보내기로 쓴 글은 `gymlog_feedback` 표에 쌓인다 (앱 버전·기기 정보 포함). `status`(new·seen·done·wont)와 `reply`를 고치면 사용자의 "내 의견"에 그대로 보인다.

- `python feedback_admin.py`: 처리 안 한 의견 목록 (보낸 사람 이메일 포함)
- `python feedback_admin.py set <id> done "답변"`: 상태·답변 달기
- 관리자 키는 저장소 밖 `%USERPROFILE%\.gymlog-admin.env`의 `SUPABASE_SECRET_KEY=`에만 둔다. 절대 커밋하지 않는다.
- 세션에서 "의견함 확인해서 반영해줘"라고 하면: 목록 보기 → 고칠 것 고치고 테스트 → 배포 → `set <id> done "답변"`.

## 테스트

- `python test_smoke.py [스크린샷폴더]`: 화면 흐름 전체 (Playwright, 폰 크기)
- `python test_sync.py`: 가짜 Supabase 서버로 동기화·프로그램 공유·별점·의견
- 바꿀 때마다 둘 다 돌린다. 새 기능은 둘 중 맞는 곳에 확인 몇 줄 추가.

## 주의

- 남이 올린 데이터(공유 링크, 프로그램)는 `unpackR`/`addCustom`에서 값 검사 후 들인다. 화면에 넣는 문자열은 전부 `esc()`.
- 운동 이미지는 free-exercise-db 사진만 쓴다 (퍼블릭 도메인). ExerciseDB(AscendAPI) 무료 애니메이션은 비상업용 라이선스라 광고 붙는 앱에 못 씀. 애니메이션을 다시 넣으려면 상업 라이선스(예: ExerciseDB.io 구매) 먼저.
- 근육 지도(react-body-highlighter)는 MIT: 설정 화면의 저작권 표시를 지우지 않는다.
- Supabase 프로젝트 `ojmfrsikzaengqjjxzxx`는 다른 앱 DB라 절대 쓰지 않는다.
