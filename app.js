'use strict';
// 시작: 서비스 워커 등록 후 첫 화면. 스크립트 순서는 index.html 참고
// 앱(Capacitor) 안에서는 파일이 앱에 들어 있어 오프라인 캐시(서비스 워커)가 필요 없고, 옛 버전이 남는 문제만 생김
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.Capacitor?.isNativePlatform?.()) navigator.serviceWorker.register('sw.js').catch(() => { });
navigator.storage?.persist?.();
if (S.active) wake(true);
render();
sharedReturn();
oauthReturn().then(() => sync());
