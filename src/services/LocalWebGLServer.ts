/**
 * Minimal HTTP server that serves the bundled Unity WebGL twin over localhost.
 *
 * Why not file://?  Android WebView blocks WebAssembly execution from file:// URIs.
 * Why no extra library?  We re-use react-native-tcp-socket (already installed) and
 *   expo-asset / expo-file-system (part of the Expo SDK) to read bundled assets.
 */

import TcpSocket from 'react-native-tcp-socket';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Buffer } from 'buffer';

/**
 * Resolve any Metro asset reference to a local file URI that expo-file-system
 * can read synchronously.
 *
 * Strategy (works in BOTH dev and production APK):
 *  - expo-asset's Asset.fromModule() + downloadAsync() handles all build
 *    environments correctly:
 *      Dev build   → downloads from the Metro HTTP server.
 *      Production  → extracts the bundled file into the app's cache folder.
 *  - Image.resolveAssetSource() was the old approach; it breaks in production
 *    because it returns a Metro localhost URL that doesn't exist without the
 *    dev server running.
 */
async function moduleToLocalUri(module: unknown, cacheKey: string): Promise<string | null> {
  try {
    const asset = Asset.fromModule(module as number);
    if (!asset.downloaded) {
      await asset.downloadAsync();
    }
    if (!asset.localUri) {
      console.warn('[WebGLServer] expo-asset returned no localUri for', cacheKey);
      return null;
    }

    // Copy to a stable, predictable cache path so subsequent loads are instant.
    const cacheUri = `${FileSystem.cacheDirectory}webgl_${cacheKey}`;
    const info = await FileSystem.getInfoAsync(cacheUri);
    if (!info.exists) {
      await FileSystem.copyAsync({ from: asset.localUri, to: cacheUri });
    }
    return cacheUri;
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
    // The .unityweb file is gzip-compressed WASM (Unity Decompression Fallback).
    // Serving as application/wasm causes WebAssembly.instantiateStreaming() to
    // reject the compressed bytes on stricter WebView versions.
    // Use application/octet-stream so Unity's JS loader decompresses first.
    urlPath:  '/Build/WebGLBuilMobile.wasm.unityweb',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module:   require('../../assets/webgl/Build/WebGLBuilMobile.wasm.unityweb'),
    mime:     'application/octet-stream',
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
  const failed: string[] = [];

  for (let i = 0; i < total; i++) {
    const entry = ASSET_ENTRIES[i];
    const localUri = await moduleToLocalUri(entry.module, entry.cacheKey);
    if (localUri) {
      map[entry.urlPath] = localUri;
      console.log('[WebGLServer] Prepared', entry.cacheKey, '→', localUri);
    } else {
      failed.push(entry.urlPath);
      console.warn('[WebGLServer] Could not resolve asset for', entry.urlPath);
    }
    onProgress?.(i + 1, total);
  }

  if (failed.length > 0) {
    throw new Error(`WebGL assets missing: ${failed.join(', ')}`);
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

/** Write a Buffer to a socket, resolving when the kernel accepted the data. */
function socketWrite(socket: any, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, undefined, (err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function serveRequest(socket: any, rawRequest: string): Promise<void> {
  const urlPath   = parseUrlPath(rawRequest);
  const localPath = urlPath === '/' ? '/index.html' : urlPath;
  const localUri  = getFileMap()[localPath];

  console.log('[WebGLServer] Request:', localPath, localUri ? 'found' : 'NOT FOUND');

  if (!localUri) {
    try { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); } catch { /* ignore */ }
    socket.destroy();
    return;
  }

  try {
    const b64  = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const body = Buffer.from(b64, 'base64');
    const mime = mimeFor(localPath);
    const header = Buffer.from(
      `HTTP/1.1 200 OK\r\n` +
      `Content-Type: ${mime}\r\n` +
      `Content-Length: ${body.length}\r\n` +
      `Access-Control-Allow-Origin: *\r\n` +
      `Connection: close\r\n\r\n`,
      'utf8',
    );

    console.log('[WebGLServer] Sending', localPath, body.length, 'bytes');

    // Send header first.
    await socketWrite(socket, header);

    // Stream body in 256 KB chunks.
    // A single socket.write(5 MB) callback fires when data enters the kernel
    // send buffer — NOT when the client has received it. If socket.destroy()
    // is called immediately after, Android sends an RST that aborts the large
    // transfer. Chunking + socket.end() (graceful FIN) prevents this.
    const CHUNK = 256 * 1024;
    for (let offset = 0; offset < body.length; offset += CHUNK) {
      await socketWrite(socket, body.slice(offset, Math.min(offset + CHUNK, body.length)));
    }

    // Graceful half-close: queues a FIN after the last chunk; the kernel
    // delivers all buffered data before the FIN reaches the client.
    socket.end();
  } catch (err) {
    console.warn('[WebGLServer] Failed to serve', localPath, err);
    try { socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n'); } catch { /* ignore */ }
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
      // EADDRINUSE means the native server is still bound from a previous JS
      // reload (Metro fast-refresh restarts the JS context but keeps the native
      // layer alive). The server is still serving on the port, so we can just
      // return the origin without creating a new listener.
      //
      // On Android, react-native-tcp-socket may surface this as:
      //   err.code    = undefined / 'bind failed'
      //   err.message = 'bind failed: EADDRINUSE (Address already in use)'
      // so we check both the code property AND the message string.
      const isAddrInUse =
        (err as NodeJS.ErrnoException).code === 'EADDRINUSE' ||
        err.message?.includes('EADDRINUSE');
      if (isAddrInUse) {
        console.log('[WebGLServer] Port already in use — reusing existing native server');
        resolve(WEBGL_ORIGIN);
      } else {
        reject(err);
      }
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
