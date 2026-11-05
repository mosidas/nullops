# フレーム時間の計測

5 パネル(`commit`・`depgraph`・`gauge`・`scatter`・`timeseries`)のフレーム時間(n・mean・p95・max)を、配布ビルドで計測する手順である。描画の負荷を変える変更をした開発者が、変更の前後で行う。

## 前提

- Go・Node.js・Wails CLI がインストール済みである([README](../README.md) の「ソースからビルドする」の 1.)。
- 計測は配布ビルドで行う。`wails build` だけで作ったアプリはコンソールを開けないため、`-devtools` を付けてビルドする。

## 計測する

1. `wails build -devtools` を実行する。`build/bin` にアプリができる。
2. できたアプリを開く。ダッシュボードが表示される。
3. ⌘⇧F12 を押す。Web インスペクタが開く。
4. コンソールで `window.nullops.enableFrameStats()` を実行する。60 フレームごとに、5 パネルの n・mean・p95・max が出力される。

描画の負荷を増やす変更の設計の指針は、[ADR 0002](adr/0002-canvas2d-drawcall-budget-for-p95.md) に従う。
