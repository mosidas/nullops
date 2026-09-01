import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'nullops',
  description: '作業中に見えるダッシュボードを表示するデスクトップアプリ。実際の処理は何も実行しない。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Google Fonts を読み込むフォント最適化は使わない。ビルド時に外部からフォントを取得し、wails build がネットワークに依存するため。
  // 既定の書体は globals.css の --default-font-family で決める。
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
