'use strict';
// 시작: 서비스 워커 등록 후 첫 화면. 스크립트 순서는 index.html 참고
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
navigator.storage?.persist?.();
if (S.active) wake(true);
render();
sharedReturn();
oauthReturn().then(() => sync());
