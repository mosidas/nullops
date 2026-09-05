import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 開発サーバの gzip 圧縮を切る。wails dev のプロキシが Next 開発サーバの応答を
  // 展開したうえで Content-Encoding: gzip を付け直し、Content-Length に圧縮時の
  // 長さを入れるため、展開後の HTML が先頭で打ち切られる。末尾にある
  // self.__next_f.push(...) が届かず、ハイドレーションが始まらない。
  // 圧縮を切ればプロキシが壊す対象が無くなる。output: 'export' のため配布物には
  // 影響しない(この設定は開発サーバにしか効かない)。
  compress: false,
  output: 'export',
  distDir: 'dist',
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // React の debug channel(既定 true)を切る。Next 16 は開発時、RSC の
    // デバッグ情報を HMR の WebSocket(/_next/hmr)に多重化して流し、React Flight
    // クライアントは debug channel の readable がある限り、参照先チャンクの解決を
    // その到着まで待つ。wails dev の WebView は wails://wails.localhost:34115 で
    // 開かれ、Next は location.protocol が http: でないため wss:// で接続しに行く
    // が、:34115 に TLS は無く必ず失敗する。debug channel に何も届かないので
    // 初回の RSC ペイロードが解決されず、hydrateRoot まで到達しない。
    // 枠と見出し(サーバ描画分)だけが出て中身が空になるのはこのため。
    // 詳細と却下した代替案は docs/adr/0001-wails-dev-react-debug-channel.md を参照。
    // この設定は開発サーバ(__NEXT_DEV_SERVER)でしか効かず、配布物に影響しない。
    reactDebugChannel: false,
  },
};

export default nextConfig;
