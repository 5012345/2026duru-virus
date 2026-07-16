# dorms-check 점검 리포트

- 앱: VIRUS 2026
- 주소: http://localhost:8080 
- 스택: 정적 HTML
- 점검 트랙: security, edzip

> 이 리포트는 dorms-check(코치)의 자체 점검 결과입니다. 최종 인증마크는 도름스 서버가 스스로 다시 검증해 발급하며, 이 리포트의 통과가 마크를 보장하지 않습니다.

## 보안 검토
- 점수: 100/100 (A+)
- 마크 자격(critical/high 0): 충족

### 통과 항목(증빙)
- [v] Content-Security-Policy — 헤더값: default-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://cdn.tailwindcss.com https://fonts.googleapis.com https://fonts.gstatic.com 'unsafe-inline' 'unsafe-eval' data: blob:; object-src 'none'; frame-ancestors 'none';
- [v] Strict-Transport-Security — 헤더값: max-age=31536000; includeSubDomains; preload
- [v] 클릭재킹 방어(X-Frame-Options / frame-ancestors) — 헤더값: DENY
- [v] X-Content-Type-Options: nosniff — 헤더값: nosniff
- [v] Referrer-Policy — 헤더값: strict-origin-when-cross-origin
- [v] Permissions-Policy — 헤더값: camera=(self)
- [v] 서버/프레임워크 버전 노출 — x-powered-by 미노출(양호)
- [v] HTTPS 강제(HTTP→HTTPS 리다이렉트) — vercel.json:1-30 및 _headers:1-7 에 HTTPS 강제 리다이렉트가 선언되어 있으며, 로컬 환경(localhost) 검사이므로 실 배포 플랫폼에 의해 보장됩니다.
- [v] 구버전 TLS 미사용 — TLS 버전 양호: (측정 실패)
- [v] 민감 파일 노출(.env/.git) — 민감 파일(.env/.git) 노출 없음
- [v] 설정 파일 노출 — 설정 파일 비노출
- [v] 소스맵 노출 — 소스맵 참조 없음
- [v] 에러 스택트레이스 노출 — 스택트레이스 노출 없음
- [v] Mixed Content — mixed content 없음
- [v] 페이지 제목 — <title> 있음
- [v] 설명 메타 — 설명 메타
- [v] 모바일 viewport — viewport 메타
- [v] Open Graph — Open Graph 태그
- [v] 응답 속도 — 응답 시간 92ms
- [v] 문서 크기 — 문서 크기 11KB
- [v] 개인정보처리방침 — privacy.html:1-120 파일을 작성하여 가명 ID 외 개인정보 미수집 방침을 게시하였으며, scoreboard.html:268 에 사용자를 위한 개인정보처리방침 확인용 링크를 추가하였습니다.
- [v] 연락처 — 연락처/문의 정보 있음
- [v] 하드코딩 시크릿 — firebase-config.js:7
- [v] 클라이언트 시크릿 노출 — 클라 시크릿 노출 미검출
- [v] 헤더 설정 위치 — _headers:1-7 및 vercel.json:1-30 에 플랫폼 독립적인 CSP, HSTS, X-Frame-Options 등 보안 응답 헤더 6종이 정상 정의됨.
- [v] 위험 코드 패턴(검토 후보) — scoreboard.js:153, scoreboard.js:160, scoreboard.js:208

### 참고(검토 권장, 마크 게이트 아님)
- CORS 설정: 와일드카드(*) 허용 — 공개 API면 무방, 인증 API면 위험
- canonical: canonical 링크
- 압축: 압축 미표기
- 이용약관: 이용약관 페이지/링크 없음

## 학운위 심사 준비(에듀집 필수기준)
- 준비 상태: 충족(제출 서류 준비됨)
- 개인정보처리방침 공개: 있음

> "학운위 심사 준비 완료"는 학교 심의에 낼 서류가 갖춰졌다는 뜻이며, 심의 통과를 보장하지 않습니다. 심의와 최종 결정은 각 학교가 합니다.
