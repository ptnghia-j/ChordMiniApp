const PYODIDE_VERSION = '0.26.2';
const YTDLP_VERSION = '2026.3.17';
const PACKAGE_PROXY_URL = `${self.location.origin}/api/pyodide-package-proxy/yt_dlp-2026.3.17-py3-none-any.whl`;
const PROXY_URL = '/api/youtube-media-proxy';

let pyodide = null;
let ready = false;
let initPromise = null;

function postStatus(message) {
  self.postMessage({ type: 'status', message });
}

function proxied(url) {
  return `${PROXY_URL}?url=${encodeURIComponent(url)}`;
}

function shouldProxy(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));
}

function installProxyInterceptors() {
  const OriginalXHR = self.XMLHttpRequest;

  class ProxiedXHR extends OriginalXHR {
    open(method, url, async = true, user, password) {
      const target = shouldProxy(url) ? proxied(url) : url;
      return super.open(method, target, async, user, password);
    }
  }

  self.XMLHttpRequest = ProxiedXHR;
}

async function init() {
  if (ready) {
    self.postMessage({ type: 'ready' });
    return;
  }

  if (initPromise) {
    await initPromise;
    self.postMessage({ type: 'ready' });
    return;
  }

  initPromise = (async () => {
    postStatus('Loading Python runtime...');
    importScripts(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`);

    pyodide = await loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
    });

    postStatus('Installing yt-dlp...');
    await pyodide.loadPackage(['micropip', 'ssl']);
    await pyodide.runPythonAsync(`
import micropip
await micropip.install('${PACKAGE_PROXY_URL}')
    `);

    installProxyInterceptors();

    await pyodide.runPythonAsync(`
import js, io

_XHR_SKIP = frozenset([
    'host', 'content-length', 'transfer-encoding', 'connection',
    'te', 'trailer', 'upgrade', 'accept-encoding',
])

def _do_xhr(method, url, headers, body):
    xhr = js.XMLHttpRequest.new()
    xhr.open(method, url, False)

    for key, val in (headers or {}).items():
        lower = key.lower()
        if lower in _XHR_SKIP:
            continue
        if lower == 'referer':
            xhr.setRequestHeader('X-Override-Referer', str(val))
        elif lower == 'origin':
            xhr.setRequestHeader('X-Override-Origin', str(val))
        elif lower == 'user-agent':
            xhr.setRequestHeader('X-Override-User-Agent', str(val))
        elif lower == 'range':
            xhr.setRequestHeader('X-Override-Range', str(val))
        else:
            try:
                xhr.setRequestHeader(key, str(val))
            except Exception:
                pass

    xhr.setRequestHeader('X-Skip-YouTube-Auth', '1')
    xhr.responseType = 'arraybuffer'
    if body is not None:
        if isinstance(body, (bytes, bytearray, memoryview)):
            xhr.send(js.Uint8Array.new(bytes(body)))
        else:
            xhr.send(str(body))
    else:
        xhr.send()
    return xhr

def _parse_xhr_headers(xhr):
    headers = {}
    for line in (xhr.getAllResponseHeaders() or '').strip().split('\\r\\n'):
        if ':' in line:
            key, _, value = line.partition(':')
            headers[key.strip()] = value.strip()
    for key in ('content-encoding', 'Content-Encoding', 'content-length', 'Content-Length'):
        headers.pop(key, None)
    return headers
    `);

    await pyodide.runPythonAsync(`
from yt_dlp.networking.common import Response
from yt_dlp.networking.exceptions import HTTPError, TransportError

def _pyodide_urlopen(req):
    xhr = _do_xhr(req.method, req.url, dict(req.headers), req.data)
    status = xhr.status
    if status == 0:
        raise TransportError(cause=Exception(f"XHR status 0 for {req.url}"))

    content = bytes(js.Uint8Array.new(xhr.response)) if xhr.response else b''
    response = Response(
        fp=io.BytesIO(content),
        url=xhr.responseURL or req.url,
        headers=_parse_xhr_headers(xhr),
        status=status,
    )
    if status >= 400:
        raise HTTPError(response)
    return response
    `);

    ready = true;
  })();

  try {
    await initPromise;
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: `Browser yt-dlp initialization failed: ${error && error.message ? error.message : String(error)}`,
    });
  }
}

async function extract(url) {
  if (!ready) {
    await init();
  }

  postStatus('Fetching YouTube audio stream...');
  pyodide.globals.set('_url', url);

  const resultJson = await pyodide.runPythonAsync(`
import json
from yt_dlp import YoutubeDL

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

ydl_opts = {
    'format': 'best/bestaudio',
    'quiet': True,
    'no_warnings': True,
    'noplaylist': True,
    'socket_timeout': 30,
    'http_headers': {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    'extractor_args': {
        'youtube': {
            'player_client': ['android'],
            'player_skip': ['webpage', 'configs'],
        },
    },
}

with YoutubeDL(ydl_opts) as ydl:
    ydl.urlopen = _pyodide_urlopen
    info = ydl.extract_info(_url, download=False)

formats = info.get('requested_formats') or []
chosen = None
if formats:
    chosen = next((fmt for fmt in formats if fmt.get('acodec') != 'none' and fmt.get('url')), None)
if chosen is None and info.get('url'):
    chosen = info
if chosen is None and info.get('formats'):
    chosen = next((fmt for fmt in reversed(info['formats']) if fmt.get('acodec') != 'none' and fmt.get('url')), None)
if chosen is None and info.get('formats'):
    chosen = next((fmt for fmt in reversed(info['formats']) if fmt.get('url')), None)

if chosen is None or not chosen.get('url'):
    raise RuntimeError('yt-dlp returned no downloadable media stream.')

stream_url = chosen['url']
ext = chosen.get('ext') or 'm4a'
if '.m3u8' in stream_url.lower() or 'm3u8' in ext.lower():
    raise RuntimeError('HLS audio streams are not supported by browser extraction.')

headers = dict(chosen.get('http_headers') or info.get('http_headers') or {})
headers['X-Skip-YouTube-Auth'] = '1'

json.dumps({
    'streamUrl': stream_url,
    'streamHeaders': headers,
    'ext': ext,
    'title': info.get('title') or 'YouTube Video',
    'duration': info.get('duration') or 0,
})
  `);

  self.postMessage({ type: 'extracted', data: JSON.parse(resultJson) });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      await init();
      return;
    }

    if (data.type === 'extract') {
      await extract(data.url);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error),
    });
  }
};
