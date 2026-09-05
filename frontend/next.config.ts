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
};

export default nextConfig;
