const fs = require('fs');

async function main() {
  const apiBaseUrl = process.env.BENCHMARK_API_URL || 'http://localhost:3002';
  const email = process.env.BENCHMARK_EMAIL || 'dev@ship.local';
  const password = process.env.BENCHMARK_PASSWORD || 'admin123';

  const tokenRes = await fetch(`${apiBaseUrl}/api/csrf-token`);
  const tokenJson = await tokenRes.json();

  const csrfSetCookie = tokenRes.headers.get('set-cookie') || '';
  const connectSid = (csrfSetCookie.split(';')[0] || '').trim();

  const loginRes = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': tokenJson.token,
      Cookie: connectSid,
    },
    body: JSON.stringify({ email, password }),
  });

  const loginBody = await loginRes.text();
  console.log(`login status: ${loginRes.status}`);
  console.log(loginBody);

  if (!loginRes.ok) {
    process.exit(1);
  }

  const loginSetCookie = loginRes.headers.get('set-cookie') || '';
  const sessionCookie = loginSetCookie
    .split(',')
    .find((part) => part.includes('session_id=')) || '';

  const sessionId = (sessionCookie.split(';')[0] || '').trim();
  const cookieHeader = [connectSid, sessionId].filter(Boolean).join('; ');

  fs.writeFileSync('/tmp/ship-cookie-header.txt', cookieHeader);
  console.log('saved cookie header to /tmp/ship-cookie-header.txt');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
