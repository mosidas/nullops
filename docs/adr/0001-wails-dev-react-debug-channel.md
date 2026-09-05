# 0001. wails dev では Next の React debug channel を切る

## Status

Accepted(2026-09-06)

## Context

`wails dev` で起動すると、6 枠の枠線と見出し(サーバ描画分)だけが出て、パネルの中身(クライアントコンポーネント)が描かれない。配布ビルド(`wails build`)は正常。同じ Next 開発サーバを普通のブラウザで `http://localhost:34115` から開くと正常に描画される。差はオリジンだけで、WebView は `wails://wails.localhost:34115` で開かれる(Wails v2.15.0 `internal/frontend/desktop/darwin/frontend.go` の `startURL` は設定で変えられない)。

### 原因(Next 16.3.3 / React 19.2.8 のソースで確定)

ハイドレーションは、HMR の WebSocket に多重化された **React debug channel** の到着を待ったまま止まっている。連鎖は次のとおり。

1. `next/dist/client/app-index.js`: `process.env.__NEXT_DEV_SERVER && process.env.__NEXT_REACT_DEBUG_CHANNEL` のとき `createDebugChannel()` を作り、`createFromReadableStream(readable, { debugChannel })` に渡す。`__NEXT_REACT_DEBUG_CHANNEL` は `next/dist/build/define-env.js` で `config.experimental.reactDebugChannel` から決まり、既定は `true`(`next/dist/server/config-shared.js`)。
2. `next/dist/client/dev/debug-channel.js` `getOrCreateDebugChannelReadableWriterPair()`: debug channel の readable は `TransformStream` で、書き込み側は HMR の WebSocket メッセージ `REACT_DEBUG_CHUNK` を受けた `hot-reloader-app.js`(`processMessage`)だけが持つ。つまり **debug channel のデータは `/_next/hmr` の WebSocket 経由でしか届かない**。
3. `next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.browser.development.js` `waitForReference()`: `response._debugChannel.hasReadable` が真なら、参照先チャンクが pending の間その解決を待つ(readable が無いときだけ待たずに進む)。`case 68`('D' 行)も同様に、readable があるとデバッグチャンクを blocked のまま保持する。よって debug channel に何も届かなければ初回の RSC ペイロードは解決されず、`app-index.js` の `await initialServerResponse` から先(`hydrateRoot`)へ進まない。
4. `next/dist/client/dev/hot-reloader/get-socket-url.js` `getSocketProtocol()`: `window.location.protocol` が `http:` でなければ `wss:` を選ぶ。WebView では `wails:` なので `wss://wails.localhost:34115/_next/hmr?id=…` へ接続し、`:34115` に TLS サーバは無いため必ず失敗する(コンソールの `A TLS error caused the secure connection to fail`)。
5. 結果として debug channel は空のまま、React はエラーも出さずに待ち続ける。`document.documentElement.id` は空(`__next_error__` ではない)、host 要素に `__reactFiber$…` が付かない、HTML と chunk は完全に届いている、という観測とすべて整合する。

`hydrate()` は `createWebSocket()` まで到達している(WebSocket の URL に `?id=<self.__next_r>` が入っている)。止まっているのはその直後の `await initialServerResponse` である。

Turbopack のランタイム自体は HMR の接続を待たない。「ハイドレーションが HMR の接続確立を待つ」という当初の仮説は結果として正しいが、待っているのは Turbopack ではなく Next の debug channel と React Flight クライアントである。

## Decision

`frontend/next.config.ts` に `experimental.reactDebugChannel: false` を置き、開発時の debug channel を作らせない。readable が無ければ React Flight クライアントは参照先を待たずに解決し、`hydrateRoot` に到達する。

この設定は `__NEXT_DEV_SERVER` の分岐の中でしか参照されないため、`wails build`(`next build` + `output: 'export'`)の生成物には影響しない。

## Consequences

- `wails dev` の WebView で 6 パネルの中身が描かれる。
- 開発時に React DevTools へ流れる Server Components のデバッグ情報(owner stack・サーバ側のタイミング等)が無くなる。本アプリは擬似データを描くだけで、この情報に依存する開発をしていない。
- HMR の WebSocket は WebView からは依然として繋がらない。ファイル変更の自動反映は WebView では効かない(ブラウザで `http://localhost:34115` を開けば効く)。また `web-socket.js` の `handleDisconnect()` は再接続が `WEB_SOCKET_MAX_RECONNECTIONS`(12)を超えると `window.location.reload()` を呼ぶため、WebView は 45 秒前後ごとにページを再読み込みする。これは本 ADR 以前から起きていた挙動で、本 ADR の対処では変わらない。

## 却下した候補

再び試さずに済むよう、理由とともに残す。

- **`assetPrefix` を開発時だけ絶対 URL(`http://localhost:34115`)にする。** クライアントは `next.config.ts` の値を使わない。`next/dist/client/asset-prefix.js` `getAssetPrefix()` は `document.currentScript.src` の pathname だけを返すため、`getSocketUrl()` は常に `window.location` から組み立てる。接続先は 1 文字も変わらない(実測済み)。
- **`compress: false`(main 済み)。** 別の欠陥(プロキシが `Content-Encoding` を付け直す)への対処であり、本件には効かない。ただし消してはいけない。
- **WebView の読み込み先を `http://localhost:34115` にする。** Wails v2.15.0 は `starturl` を外から設定できない。Wails へのパッチが必要になる。
- **ページ側で `window.WebSocket` を差し替えて `wss://wails.localhost:34115` を `ws://localhost:34115` に書き換える(`beforeInteractive` の inline script)。** Wails の devserver(`internal/frontend/devserver/devserver.go`)は Upgrade を Next へ中継するので経路は成立し得る。しかし (a) Next の `blockCrossSiteDEV`(`server/lib/router-utils/block-cross-site-dev.js`)が `Origin: wails://…` を弾くため `allowedDevOrigins: ['wails.localhost']` が要り、origin が opaque(`null`)なら許可の手段が無い、(b) WebKit がカスタムスキームからの `ws:` を mixed content として扱うかが不明、(c) 画面を見ずに検証できない、の 3 点で不確定要素が多い。HMR を WebView でも効かせたくなったときに、次の候補として検討する。
- **Wails の devserver に TLS を足す / Wails を fork する。** 出荷物に関係のない開発時の問題に対して重すぎる。
