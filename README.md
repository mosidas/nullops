# nullops

実際の処理は何も実行せずに、作業中に見えるダッシュボードを表示するデスクトップアプリ。次の 6 つのパネルを 1 画面に並べる。

- 擬似的な作業ログのストリーム
- 折れ線グラフ
- タコメータ
- 3D 散布図
- グラフビュー
- コミットグラフ

## 動作環境

- macOS(Apple Silicon と Intel)。Releases の配布物は macOS 版だけである
- Windows と Linux。ソースからビルドする

## インストール

### Releases から

1. [Releases](https://github.com/mosidas/nullops/releases) から `nullops-<バージョン>.zip` をダウンロードして展開する。
2. `nullops.app` を `/Applications` へ移す。
3. 配布物はアドホック署名だけで公証していないため、初回の起動は Gatekeeper に止められる。ターミナルで `xattr -dr com.apple.quarantine /Applications/nullops.app` を実行し、隔離属性を外す。
4. `nullops.app` を開く。

### ソースからビルドする

1. Go 1.26 以上・Node.js 24 以上・[Wails CLI](https://wails.io/docs/gettingstarted/installation) v2 をインストールする。
2. macOS では `scripts/bundle.sh` を実行する。`build/bin/nullops.app` ができる。
3. macOS では `nullops.app` を `/Applications` へコピーして開く。
4. Windows と Linux では、2. と 3. の代わりに `wails build` を実行する。`build/bin` に実行ファイルができる。
5. Windows と Linux では、`build/bin` の実行ファイルを開く。

## 使い方

nullops を開いたままにする。

## 開発

`go test` は `frontend/dist` を埋め込むため、先に `wails build` を実行する。

```sh
wails dev                  # ホットリロードで動かす
wails build
go test ./...
cd frontend && npm test
```

描画の負荷を変えたときは、[フレーム時間の計測](docs/frame-stats.md) の手順で p95 を測る。

## ライセンス

[MIT License](LICENSE)
