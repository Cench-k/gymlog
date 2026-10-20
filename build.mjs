// 앱(Capacitor)용 웹 파일을 www/로 복사. 복사할 목록은 sw.js 오프라인 캐시 목록과 같음 (한 곳에서만 관리)
import { readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';

const list = readFileSync('sw.js', 'utf8').match(/addAll\(\[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)).filter(f => f !== './');
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of [...list, 'sw.js']) copyFileSync(f, `www/${f}`);
console.log(`www/ ← ${list.length + 1}개 파일`);
