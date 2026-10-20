# 짐로그 (gymlog)

운동 기록 PWA. 빌드 도구 없음: 정적 파일을 GitHub Pages(https://cench-k.github.io/gymlog/)로 배포. 서버는 Supabase(프로젝트 ref `kbotdssaktcsdbvqlwvq`) 하나.

## 파일

스크립트는 일반 `<script>`로 index.html 순서대로 읽고 전역을 공유한다. 뒤 파일이 앞 파일의 `A`(버튼 동작), `MODALS`(팝업), `VIEWS`(탭 화면)에 항목을 추가하는 방식.

| 파일 | 역할 |
|---|---|
| data.js | 내장 운동 목록(부위별), 역도 종목 `OLYMPIC`, 기본 프로그램 `PROGRAMS` |
| media.js | 운동 사진·애니메이션 id와 주동근/보조근 `MEDIA`, 근육 지도 폴리곤 `BODY` |
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

- **운동 추가**: data.js 해당 부위에 `[이름, 장비, 타입]` (타입 w=무게×횟수, b=맨몸×횟수, t=시간, c=유산소). media.js `MEDIA`에 `[free-exercise-db 사진 id, 주동근, 보조근, ExerciseDB 애니메이션 id]` (영문 근육명, MUSCLE_KO 참고). 운동 종류는 부위·장비로 자동 (core.js `meta`).
- **업적 추가**: level.js `BADGES`에 한 줄.
- **DB 변경**: supabase.sql에 추가 → Supabase SQL Editor에서 실행 → test_sync.py 가짜 서버도 같은 동작으로 맞춤.
- **배포**: core.js `APP_VER` 올림 → 테스트 → `git push` (Pages가 main에서 바로 배포). 폰은 앱을 두 번째 열 때 새 버전.

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
- static.exercisedb.dev 애니메이션은 CORS가 없어 결과 카드 이미지에는 free-exercise-db 사진(`still`)을 쓴다.
- Supabase 프로젝트 `ojmfrsikzaengqjjxzxx`는 다른 앱 DB라 절대 쓰지 않는다.
