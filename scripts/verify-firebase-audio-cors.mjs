#!/usr/bin/env node

function parseArgs(argv) {
  const origins = [];
  let url = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--url') {
      url = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (arg === '--origin') {
      const origin = argv[index + 1];
      if (origin) {
        origins.push(origin);
      }
      index += 1;
    }
  }

  return { url, origins };
}

function normalizeHeaderValue(value) {
  return value ? value.trim().toLowerCase() : '';
}

function originAllowed(headerValue, origin) {
  if (!headerValue) {
    return false;
  }

  return headerValue === '*' || headerValue === origin;
}

function headerIncludesToken(headerValue, token) {
  if (!headerValue) {
    return false;
  }

  return headerValue
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .includes(token.toLowerCase());
}

async function requestWithOrigin(url, init, origin) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Origin: origin,
    },
  });

  return {
    status: response.status,
    ok: response.ok,
    acao: response.headers.get('access-control-allow-origin'),
    acam: response.headers.get('access-control-allow-methods'),
    acah: response.headers.get('access-control-allow-headers'),
    acceptRanges: response.headers.get('accept-ranges'),
    contentLength: response.headers.get('content-length'),
    contentType: response.headers.get('content-type'),
    response,
  };
}

function printResult(method, origin, result, checks) {
  const passLabel = checks.every(Boolean) ? 'PASS' : 'FAIL';
  console.log(`\n[${passLabel}] ${method} ${origin}`);
  console.log(`status=${result.status}`);
  if (result.acao) console.log(`access-control-allow-origin=${result.acao}`);
  if (result.acam) console.log(`access-control-allow-methods=${result.acam}`);
  if (result.acah) console.log(`access-control-allow-headers=${result.acah}`);
  if (result.acceptRanges) console.log(`accept-ranges=${result.acceptRanges}`);
  if (result.contentLength) console.log(`content-length=${result.contentLength}`);
  if (result.contentType) console.log(`content-type=${result.contentType}`);
}

async function verifyOrigin(url, origin) {
  const headResult = await requestWithOrigin(url, { method: 'HEAD' }, origin);
  const getResult = await requestWithOrigin(url, { method: 'GET' }, origin);
  await getResult.response.body?.cancel();
  const optionsResult = await requestWithOrigin(url, {
    method: 'OPTIONS',
    headers: {
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'range',
    },
  }, origin);
  await optionsResult.response.body?.cancel();

  const headChecks = [
    headResult.ok,
    originAllowed(normalizeHeaderValue(headResult.acao), origin.toLowerCase()),
  ];
  const getChecks = [
    getResult.ok,
    originAllowed(normalizeHeaderValue(getResult.acao), origin.toLowerCase()),
  ];
  const optionsChecks = [
    optionsResult.ok,
    originAllowed(normalizeHeaderValue(optionsResult.acao), origin.toLowerCase()),
    headerIncludesToken(optionsResult.acam, 'GET'),
    headerIncludesToken(optionsResult.acah, 'range'),
  ];

  printResult('HEAD', origin, headResult, headChecks);
  printResult('GET', origin, getResult, getChecks);
  printResult('OPTIONS', origin, optionsResult, optionsChecks);

  return {
    origin,
    passed: [...headChecks, ...getChecks, ...optionsChecks].every(Boolean),
  };
}

async function main() {
  const { url, origins } = parseArgs(process.argv.slice(2));

  if (!url || origins.length === 0) {
    console.error('Usage: node scripts/verify-firebase-audio-cors.mjs --url <firebase-or-gcs-url> --origin <origin> [--origin <origin>]');
    process.exit(1);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.error('Invalid --url value');
    process.exit(1);
  }

  const allowedHosts = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);
  if (!allowedHosts.has(parsedUrl.hostname)) {
    console.error(`Unsupported host "${parsedUrl.hostname}". Expected Firebase Storage or GCS.`);
    process.exit(1);
  }

  console.log(`Checking ${parsedUrl.hostname} CORS for ${origins.length} origin(s)...`);

  const results = [];
  for (const origin of origins) {
    results.push(await verifyOrigin(url, origin));
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    console.error(`\nCORS verification failed for: ${failed.map((result) => result.origin).join(', ')}`);
    process.exit(2);
  }

  console.log('\nAll origins passed Firebase/GCS audio CORS verification.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
