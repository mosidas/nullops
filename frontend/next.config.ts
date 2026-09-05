import type { NextConfig } from 'next';

/**
 * `next dev` が待ち受けるオリジン。`wails dev` の `frontend:dev:serverUrl: "auto"` が
 * 見付ける URL と同じであり、ポートを変えたときはここも合わせる。
 */
const devServerOrigin = 'http://localhost:3000';

/**
 * 開発時だけ assetPrefix を絶対 URL にする。
 *
 * `wails dev` の WebView はページを `wails://wails.localhost:34115/` から開く
 * （wails v2.15.0 の internal/frontend/desktop/darwin/frontend.go）。Next の HMR
 * クライアントは assetPrefix が空だと接続先を window.location から組み立て、
 * scheme が `http:` でないため `wss://wails.localhost:34115/_next/hmr` を選ぶ。
 * その先に TLS サーバは無く、接続は必ず失敗する。WebSocket の生成は
 * hydrateRoot より前（next/dist/client/app-index.js の hydrate()）で走るため、
 * ここで失敗するとハイドレーションごと止まり、画面は枠と見出しだけになる。
 *
 * assetPrefix に絶対 URL を置くと HMR の接続先が `ws://localhost:3000/_next/hmr`
 * になり、この経路を通らなくなる。配布ビルドは埋め込んだ資産を
 * `wails://wails/` から読むため、production では空のままにする。
 */
const assetPrefix = process.env.NODE_ENV === 'development' ? devServerOrigin : undefined;

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  assetPrefix,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
