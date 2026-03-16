/**
 * Minimal HTTP server that serves the bundled Unity WebGL twin over localhost.
 *
 * Why not file://?  Android WebView blocks WebAssembly execution from file:// URIs.
 * Why no extra library?  We re-use react-native-tcp-socket (already installed) and
 *   expo-asset / expo-file-system (part of the Expo SDK) to read bundled assets.
 */

import TcpSocket from 'react-native-tcp-socket';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import { Buffer } from 'buffer';

/**
 * Resolve any Metro asset reference (number ID or descriptor object) to a
 * local file URI that expo-file-system can read.
 *
 * Strategy:
 *  - Image.resolveAssetSource() works for every asset type and returns the
 *    correct Metro HTTP URL in dev builds (http://10.0.2.2:8081/assets/…).
 *  - We download that URL once into cacheDirectory using a stable filename
 *    derived from the cache key, then reuse it on subsequent calls.
 *  - For production builds the URI may be a file:// path; we copyAsync in
 *    that case.
 */
async function moduleToLocalUri(module: unknown, cacheKey: string): Promise<string | null> {
  try {
    const source = Image.resolveAssetSource(module as Parameters<typeof Image.resolveAssetSource>[0]);
    if (!source?.uri) {
      console.warn('[WebGLServer] resolveAssetSource returned no URI for', cacheKey);
      return null;
    }

    const cacheUri = `${FileSystem.cacheDirectory}webgl_${cacheKey}`;

    const info = await FileSystem.getInfoAsync(cacheUri);
    if (info.exists) {
      return cacheUri;
    }

    if (source.uri.startsWith('http')) {
      const result = await FileSystem.downloadAsync(source.uri, cacheUri);
      return result.uri;
    } else {
      await FileSystem.copyAsync({ from: source.uri, to: cacheUri });
      return cacheUri;
    }
  } catch (e) {
    console.warn('[WebGLServer] moduleToLocalUri failed for', cacheKey, ':', e);
    return null;
  }
}

export const WEBGL_SERVER_PORT = 8788;
const WEBGL_ORIGIN = `http://localhost:${WEBGL_SERVER_PORT}`;

// ── Asset manifest ────────────────────────────────────────────────────────────
// Each entry maps a URL path → Metro require() + MIME type + stable cache key.
// metro.config.js must list "unityweb" in assetExts for the binary files.
const ASSET_ENTRIES = [
  {
    urlPath:  '/index.html',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module:   require('../../assets/webgl/index.html'),
    mime:     'text/html; charset=utf-8',
    cacheKey: 'index.html',
  },
  {
    // URL path stays as .js — that's what index.html's <script> tag requests.
    // The file is renamed to .unityweb so Metro treats it as a binary asset
    // (Metro would execute .js files as code instead of serving them as assets).
    urlPath:  '/Build/WebGLBuilMobile.loader.js',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module:   require('../../assets/webgl/Build/WebGLBuilMobile.loader.unityweb'),
    mime:     'application/javascript',
    cacheKey: 'loader.unityweb',
  },
  {
    urlPath:  '/Build/WebGLBuilMobile.data.unityweb',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module:   require('../../assets/webgl/Build/WebGLBuilMobile.data.unityweb'),
    mime:     'application/octet-stream',
    cacheKey: 'data.unityweb',
  },
  {
    urlPath:  '/Build/WebGLBuilMobile.framework.js.unityweb',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module:   require('../../assets/webgl/Build/WebGLBuilMobile.framework.js.unityweb'),
    mime:     'application/octet-stream',
    cacheKey: 'framework.unityweb',
  },
  {
    urlPath:  '/Build/WebGLBuilMobile.wasm.unityweb',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module:   require('../../assets/webgl/Build/WebGLBuilMobile.wasm.unityweb'),
    mime:     'application/wasm',
    cacheKey: 'wasm.unityweb',
  },
];

// ── Internal state ────────────────────────────────────────────────────────────
// Stored on `global` so they survive JS hot-reloads (Metro fast-refresh).
// Without this, the native TCP server stays bound to port 8788 across reloads
// but the JS reference is lost, causing EADDRINUSE on the next startWebGLServer call.
declare global {
  // eslint-disable-next-line no-var
  var __webGLFileMap: Record<string, string> | undefined;
  // eslint-disable-next-line no-var
  var __webGLAssetsReady: boolean | undefined;
  // eslint-disable-next-line no-var
  var __webGLServer: ReturnType<typeof TcpSocket.createServer> | null | undefined;
}
global.__webGLFileMap    = global.__webGLFileMap    ?? {};
global.__webGLAssetsReady = global.__webGLAssetsReady ?? false;
global.__webGLServer     = global.__webGLServer     ?? null;

const getFileMap    = ()  => global.__webGLFileMap!;
const setFileMap    = (m: Record<string, string>) => { global.__webGLFileMap = m; };
const isAssetsReady = ()  => !!global.__webGLAssetsReady;
const setAssetsReady = (v: boolean) => { global.__webGLAssetsReady = v; };
const getServer     = ()  => global.__webGLServer ?? null;
const setServer     = (s: ReturnType<typeof TcpSocket.createServer> | null) => { global.__webGLServer = s; };

// ── Asset preparation ─────────────────────────────────────────────────────────
/**
 * Downloads/copies every WebGL file from the Metro bundle into the device's
 * local cache so expo-file-system can read them as regular files.
 * Safe to call multiple times — skips files already cached.
 */
export async function prepareWebGLAssets(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (isAssetsReady()) return;

  const map: Record<string, string> = {};
  const total = ASSET_ENTRIES.length;
  for (let i = 0; i < total; i++) {
    const entry = ASSET_ENTRIES[i];
    const localUri = await moduleToLocalUri(entry.module, entry.cacheKey);
    if (localUri) {
      map[entry.urlPath] = localUri;
    } else {
      console.warn('[WebGLServer] Could not resolve asset for', entry.urlPath);
    }
    onProgress?.(i + 1, total);
  }
  setFileMap(map);
  setAssetsReady(true);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function parseUrlPath(rawRequest: string): string {
  const line = rawRequest.split('\r\n')[0];       // "GET /path HTTP/1.1"
  const parts = line.split(' ');
  if (parts.length < 2) return '/';
  return parts[1].split('?')[0];                  // strip query string
}

function mimeFor(urlPath: string): string {
  const entry = ASSET_ENTRIES.find(e => e.urlPath === urlPath);
  return entry?.mime ?? 'application/octet-stream';
}

async function serveRequest(socket: any, rawRequest: string): Promise<void> {
  const urlPath   = parseUrlPath(rawRequest);
  const localPath = urlPath === '/' ? '/index.html' : urlPath;
  const localUri  = getFileMap()[localPath];

  console.log('[WebGLServer] Request:', localPath, localUri ? 'found' : 'NOT FOUND');

  if (!localUri) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  try {
    const b64   = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const body  = Buffer.from(b64, 'base64');
    const mime  = mimeFor(localPath);
    const header = Buffer.from(
      `HTTP/1.1 200 OK\r\n` +
      `Content-Type: ${mime}\r\n` +
      `Content-Length: ${body.length}\r\n` +
      `Access-Control-Allow-Origin: *\r\n` +
      `Connection: close\r\n\r\n`,
      'utf8',
    );

    console.log('[WebGLServer] Sending', localPath, body.length, 'bytes');

    // Combine header + body in one write so socket.destroy() only fires
    // after ALL bytes are confirmed flushed to the native layer.
    await new Promise<void>((resolve, reject) => {
      socket.write(Buffer.concat([header, body]), undefined, (err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    console.warn('[WebGLServer] Failed to serve', localPath, err);
    try {
      socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n');
    } catch { /* ignore */ }
  } finally {
    socket.destroy();
  }
}

// ── Server lifecycle ──────────────────────────────────────────────────────────
export async function startWebGLServer(): Promise<string> {
  if (getServer()) return WEBGL_ORIGIN; // already running (survives hot-reload)

  await prepareWebGLAssets();

  return new Promise((resolve, reject) => {
    const server = TcpSocket.createServer((socket: any) => {
      let requestBuf = '';

      socket.on('data', (chunk: Buffer | string) => {
        requestBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (requestBuf.includes('\r\n\r\n')) {
          serveRequest(socket, requestBuf).catch(() => socket.destroy());
        }
      });

      socket.on('error', () => { try { socket.destroy(); } catch { /* ignore */ } });
    });

    server.listen({ port: WEBGL_SERVER_PORT, host: '127.0.0.1' }, () => {
      setServer(server);
      console.log(`[WebGLServer] Listening on ${WEBGL_ORIGIN}`);
      resolve(WEBGL_ORIGIN);
    });

    server.on('error', (err: Error) => {
      setServer(null);
      reject(err);
    });
  });
}

export function stopWebGLServer(): void {
  const server = getServer();
  if (!server) return;
  try { server.close(); } catch { /* ignore */ }
  setServer(null);
  setAssetsReady(false);
  setFileMap({});
  console.log('[WebGLServer] Stopped');
}

export { WEBGL_ORIGIN };
