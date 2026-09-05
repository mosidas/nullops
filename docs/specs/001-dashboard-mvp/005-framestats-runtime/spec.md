# framestats-runtime — 仕様

## 1. 目的と背景

`004-metrics-panels` で入れたフレーム間隔の計測器 (`frontend/src/lib/framestats.ts`) には、判断材料として使えない欠点が 2 つある。

1. **配布ビルドで動かない。** `const enabled = process.env.NODE_ENV !== 'production';` により、計測は開発ビルドでしか走らない。しかし開発ビルドは React Strict Mode が描画を 2 回呼び、JS も最小化されていないため、配布ビルドより悪い値が出る。判定したいのは「配布したアプリでカクつくか」(いずれかのパネルの p95 が 20 ms を継続して超えるか) であり、超えやすい側の環境で測っても判断できない。
2. **計測できるはずの `wails dev` の画面が壊れている。** `wails dev` で起動すると 6 枠の枠線と見出しだけが出て、パネルの中身が何も描画されない。配布ビルドでは 6 パネルすべてが正常に描画される。

本 unit は、(1) 配布ビルドで明示的に計測を有効化できる口を足し、(2) `wails dev` の表示不具合を直し、(3) 人間が配布ビルドで p95 を実測するための手順を残す。

`requestAnimationFrame` のループを 1 本へ共有するかどうかは、この unit では決めない。実測の結果を見てから別 unit で判断する。

## 2. スコープ

### 対象(やること)

- `frontend/src/lib/framestats.ts` に、実行時に計測を有効化・無効化する口を足す。既定は無効とし、ビルド種別 (`NODE_ENV`) で分岐しない。
- `wails dev` でパネルの中身が描画されない原因を切り分ける(**本 unit では原因の確定に至らず、修正を入れていない**。§8.1 を参照)。
- 配布ビルドの起動から p95 を読むまでの実測手順を、人間だけで再現できる形で `tasks.md` の Implementation Notes に残す。

### 対象外(やらないこと)

- **`requestAnimationFrame` のループを 1 本へ共有する変更。** 本 unit が用意する実測の結果を見てから、別 unit として判断する。
- **`LogStreamPanel` を計測対象に加えること。** このパネルは rAF のループを持たず、記録できるのはログイベントの到着間隔 (80〜400 ms) になるため、フレーム間隔の判定基準に載せられない。`004-metrics-panels` の除外の判断を据え置く。
- **凍結済みの `001-dashboard-shell`〜`004-metrics-panels` の spec.md の書き換え。** 受け入れ基準 12.5 (production で無効) は本 unit の Requirement 1 が上書きするが、書き換えではなく本書での明示的な差し替えとして扱う。
- **`frontend/next.config.ts` への `agentRules: false` の追加。** `wails dev` が `frontend/AGENTS.md` と `frontend/CLAUDE.md` を生成する件は別の申し送りであり、ハイドレーションの不具合とは原因が異なる。
- **計測結果を画面へ描画すること。** 判定は人間が DevTools のコンソールで読む(`004-metrics-panels` spec.md §9.2 の方針を据え置く)。
- **Windows・Linux での確認。**
- **可視化ライブラリなど新しい依存の追加。**

## 3. 前提(未検証の賭け)

- 配布ビルドの WebView (WKWebView) で Web インスペクタを開けること。`wails build -devtools` が production ビルドのまま開発者ツールだけを有効にすることは wails v2.15.0 の `pkg/commands/build/base.go`(`devtools` タグを足すが `debug` は足さない)で確認済み。ただしインスペクタを接続した状態が計測値そのものへ与える影響は評価していない。判定の境目が 16.7 ms 対 20 ms と狭いため、この影響が結論を左右しうる(§8.3 の残る弱点)。

## 4. 用語定義

- **計測器**: `frontend/src/lib/framestats.ts`。各パネルの rAF コールバック先頭で `recordFrame` を受け取り、パネルごとに直近 600 フレームの間隔を保ち、5 秒ごとに `n / mean / p95 / max` を `console.info` へ出す。
- **配布ビルド**: `wails build` が生成する `build/bin/nullops.app`。Next.js は production モードで静的エクスポートされ、`main.go` の `embed` で埋め込まれる。
- **開発ビルド**: `wails dev`。WebView は `wails://wails.localhost:34115/` を開き、資産は `next dev` (`http://localhost:3000`) から供給される。

## 5. 公開インターフェース(API)

### 5.1. `frontend/src/lib/framestats.ts`(既存の拡張)

```ts
export function recordFrame(panel: string, now: number): void;
export function frameReport(): string;
export function setFrameStatsEnabled(enabled: boolean): void;
```

- `setFrameStatsEnabled(true)`: 計測を有効にする。呼び出し以降の `recordFrame` が記録を積み、5 秒ごとの報告が出る。
- `setFrameStatsEnabled(false)`: 計測を無効にする。以降の `recordFrame` は何もしない。**貯めた標本は捨てる**(有効化した区間だけを測るため。無効な区間を跨いだ間隔が標本に混じると mean と max が壊れる)。

有効・無効を読み出す関数は置かない。有効化したかどうかは `enableFrameStats()` が出す `[framestats] enabled` の 1 行と、無効時に `frameReport()` が返す `[framestats] disabled` で分かるため、別の口を足す理由が無い（YAGNI）。
- `recordFrame` / `frameReport` のシグネチャと意味は既存のまま変えない。

いずれも事前条件を持たず、例外を投げない。

### 5.2. `window.nullops`(実行時の操作口)

計測器のモジュールが読み込まれた時点で、ブラウザ環境なら `window.nullops` に次の 3 つを載せる。DevTools のコンソールからこれを呼ぶのが、配布ビルドで計測を有効にする唯一の手段である。

```ts
type NullopsConsoleApi = {
  /** 計測を有効にする。既に有効なら何もしない。 */
  enableFrameStats(): void;
  /** 計測を無効にし、貯めた標本を捨てる。 */
  disableFrameStats(): void;
  /** その時点の n / mean / p95 / max を 1 行の文字列で返す。 */
  frameReport(): string;
};

declare global {
  interface Window {
    nullops?: Partial<NullopsConsoleApi>;
  }
}
```

型を `Partial` にするのは、`window.nullops ?? {}` で受けた時点では 3 つが未設定であり、`any` を使わずに組み立てるため。`window.nullops` は既存の値があれば上書きせず、その上へ 3 つのプロパティを載せる(Wails ランタイムが載せる `window.go` / `window.runtime` とは別の名前空間であり、衝突しない)。

## 6. データ構造

新しいデータ構造は導入しない。既存の `PanelStats`(`last` と `samples`)をそのまま使う。

有効・無効の状態はモジュールの寿命で持つ可変のフラグ 1 個 (`enabled: boolean`、初期値 `false`) とする。

## 7. 振る舞い(受け入れ基準)

### Requirement 1: 既定は無効

**ユーザーストーリー**: 利用者として、通常の起動では計測の負荷が一切かからないことを求める。

1.1. WHEN アプリを起動して何も操作しない THEN 計測器 SHALL 標本を 1 つも積まない。
1.2. WHEN アプリを起動して何も操作しない THEN 計測器 SHALL `console.info` へ報告を出さない。
1.3. 計測の有効・無効 SHALL `process.env.NODE_ENV` に依存しない。開発ビルドと配布ビルドで既定の挙動は同じである。
1.4. WHEN 計測が無効な状態で `recordFrame` が呼ばれる THEN 計測器 SHALL 直ちに戻る(標本の追加・時刻の更新・報告のいずれも行わない)。

### Requirement 2: 実行時の有効化

**ユーザーストーリー**: 計測する人として、配布ビルドで DevTools のコンソールから計測を始められることを求める。

2.1. WHEN DevTools のコンソールで `nullops.enableFrameStats()` を呼ぶ THEN 計測器 SHALL 以降の `recordFrame` の呼び出しから標本を積み始める。
2.2. WHEN 計測が有効な状態で 5 秒以上が経過し `recordFrame` が呼ばれる THEN 計測器 SHALL `console.info` へ `[framestats] <panel> n=… mean=… p95=… max=…` の形式で 1 行を出す。
2.3. WHEN DevTools のコンソールで `nullops.frameReport()` を呼ぶ THEN 計測器 SHALL その時点の報告を文字列で返す。
2.4. WHEN 計測が無効な状態で `nullops.frameReport()` を呼ぶ THEN 計測器 SHALL `[framestats] disabled` を返す。
2.5. WHEN `nullops.disableFrameStats()` を呼ぶ THEN 計測器 SHALL 以降の記録を止め、貯めた標本を捨てる。
2.6. WHEN 無効化のあとに再び有効化する THEN 計測器 SHALL 無効だった区間を跨ぐ間隔を標本に含めない。
2.7. `window.nullops` SHALL 配布ビルドでも存在する(`NODE_ENV` で消えない)。

### Requirement 3: 計測の対象

3.1. 計測の対象 SHALL `commit` / `depgraph` / `gauge` / `scatter` / `timeseries` の 5 パネルである(パネル名は各コンポーネントの `PANEL_NAME` 定数)(`004-metrics-panels` の判断を据え置く)。
3.2. `LogStreamPanel` SHALL `recordFrame` を呼ばない。

### Requirement 4: `wails dev` のハイドレーション【未達 / 別途の情報待ち】

**ユーザーストーリー**: 開発者として、`wails dev` の画面で 6 パネルの中身を見られることを求める。

4.1. WHEN `wails dev` で起動する THEN 画面 SHALL 6 パネルすべての中身(ログ行・コミットグラフ・折れ線・グラフビュー・タコメータ・3D 散布図)を描画する。

**本 unit ではこの要件を満たせていない。** §8.1 に記すとおり、原因を確定するには WebView のコンソールに最初に出る例外が要る。本セッションのホストは画面を撮れず、そのコンソールを読めない。誤った機序に基づく修正を入れるより、原因を確定してから直すほうが安い(§8.2 で、当初採った `assetPrefix` 案がコード上まったく効かないことが分かったため)。人間が §9 の「D. 原因の切り分け」を実行して情報を返すまで保留する。

### Requirement 5: 検証手段の成立(非機能)

5.1. WHEN `go vet ./...` を実行する THEN 終了コード SHALL 0 である。
5.2. WHEN `go test ./...` を実行する THEN 終了コード SHALL 0 である。
5.3. WHEN `cd frontend && npm run lint` を実行する THEN 終了コード SHALL 0 である。
5.4. WHEN `wails build` を実行する THEN 終了コード SHALL 0 である。
5.5. 実測の手順 SHALL 人間だけで再現できる形で `tasks.md` に残る(配布ビルドの起動から p95 を読むまで)。

## 8. 実現方針

### 8.1. `wails dev` の表示不具合の切り分け(原因は未確定)

本セッションで確かめた事実を順に置く。

1. **資産の配信は正常である。** `wails dev` を起動して `http://localhost:34115/` から HTML を取り、参照される 17 本の script/link をすべて取得したところ、全て `200` で `application/javascript` / `text/css` を返した。RSC のペイロード (`self.__next_f`) と `self.__next_r` も HTML に揃っている。**取得の失敗ではなく、取得できた JS の実行側の問題である。**
2. **ページのオリジンは `wails://wails.localhost:34115` である。** wails v2.15.0 の `internal/frontend/desktop/darwin/frontend.go` は `startURL = "wails://wails/"` を持ち、dev では host に `.localhost` とポートを足す(同ファイル 108〜110 行)。`starturl` を context へ入れる箇所は wails v2.15.0 の全体に存在しない(読み側 3 箇所のみ)。したがって darwin の dev ではこの URL が必ず使われ、scheme は `wails:` で `http:` ではない。
3. **Next の HMR は必ず `wss://wails.localhost:34115/_next/hmr` へ繋ぎに行く。** `next/dist/client/dev/hot-reloader/get-socket-url.js` の `getSocketProtocol` は、渡された `assetPrefix` が URL として解釈できなければ `window.location.protocol` を見て、`'http:'` でなければ `'wss:'` を選ぶ。そして `assetPrefix` には設定値ではなく `next/dist/client/asset-prefix.js` の `getAssetPrefix()` の戻り値が渡る(`app-bootstrap.js` 53・66 行)。`getAssetPrefix()` は `document.currentScript.src` の **pathname だけ**を見て `/_next/` の手前を返すため、**オリジンは必ず捨てられ、この構成では常に空文字列になる**。依頼者が観測した TLS エラーはこれで説明が付く。
4. **この WebSocket の生成は `hydrateRoot` より前に走る。** `next/dist/client/app-index.js` の `hydrate()` は `createWebSocket()`(246〜251 行)→ `await initialServerResponse`(253 行)→ `hydrateRoot`(302 行)の順である。ここで同期例外が出れば `hydrateRoot` は 1 度も呼ばれず、6 枠の中身がすべてクライアントコンポーネントである本アプリの画面は枠と見出しだけになる。この見え方と一致する。

**しかし 3 と 4 をつないで「HMR の TLS 失敗がハイドレーションを止めている」と結論することはできない。** `new WebSocket(url)` が同期例外を投げるのは URL の構文不正(SyntaxError)とブロックポート(SecurityError)に限られ、`wss://wails.localhost:34115/_next/hmr` はどちらにも当たらない。TLS の失敗は非同期の error イベントとして届くため、素直に読めば `hydrate()` は素通りして `hydrateRoot` に到達する。中継役の見立て(HMR の TLS 失敗が原因)は、**接続先が `wss://…` になる仕組みまでは裏が取れたが、それがハイドレーションを止める最終段は裏が取れていない。**

開発ビルドにしか無く、かつ `hydrateRoot` より前に走る経路は HMR の WebSocket だけではない。少なくとも次が残っている。

- `web-socket.js:41` の `if (!self.__next_r) throw InvariantError(E806)` — **同期例外を投げうる唯一の現実的な候補**。ただし `:34115` が返す HTML に `self.__next_r` は入っている(1 で確認済み)ため、WebView 側で先に消える経路があるかは未確認。
- `app-index.js:163-166` の `require('./dev/debug-channel')`(`__NEXT_REACT_DEBUG_CHANNEL` 条件付き)
- `app-next-turbopack.js` の `require('../lib/require-instrumentation-client')` と `renderAppDevOverlay`
- `asset-prefix.js` の `getAssetPrefix()` が投げる InvariantError E783 / E784(`document.currentScript` が script 要素でない場合)

**原因を確定するには、WebView のコンソールに最初に出る例外が要る。** 手順は §9 の「D. 原因の切り分け」に置く。

### 8.2. 検討して却下した直し方

| 案 | 内容 | 採否 |
| :-- | :-- | :-- |
| A | Wails 側の起動 URL を `http://localhost:3000` にする | 却下。darwin の dev では `starturl` を渡す口が wails v2.15.0 に無い(§8.1 の 2)。また WebView が Next の dev サーバを直接開くと、Wails が注入する `/wails/ipc.js`(`pkg/assetserver/assetserver.go` の `processIndexHTML`)を通らず、`frontend/src/lib/feed.ts` が使う `Snapshot` / `EventsOn` が消える |
| B | 開発時のみ `assetPrefix` を `http://localhost:3000` にする | **一度採用したが撤回した。** HTML の資産参照は絶対 URL になり、Next 16 の cross-origin 遮断にも当たらない(既定の許可リストに `**.localhost` が含まれ、host は `wails.localhost`)ことを実測で確かめたが、**HMR の接続先はまったく変わらない**。クライアントは `next.config.ts` の値ではなく `getAssetPrefix()` の戻り値(pathname のみ)を使うため(§8.1 の 3)、`getSocketUrl('')` は `window.location` へ落ち、URL は 1 文字も変わらない。効かない変更をポート結合の保守負担ごと残す理由が無いので取り消した |
| C | HMR を切る | 却下。`next dev` に HMR だけを止める設定は無い(`server/config-schema.js` の `hmr` 関連は `logging.fetches.hmrRefreshes` のみ) |
| D | 早い段階で `window.WebSocket` を差し替え、`wss://wails.localhost:34115` を `ws://localhost:3000` へ読み替える | 保留。§8.1 の最終段が未確定のまま入れると、効かなかったときに原因の切り分けを 1 段むずかしくする。原因を確定してから判断する |

**撤回した B の実測から残る事実**(次に誰かが assetPrefix を触るときの申し送り):

- `Referer: wails://wails.localhost:34115/` + `Sec-Fetch-Site: cross-site` / `Sec-Fetch-Mode: no-cors` を付けた JS・CSS の取得は `200` を返す。
- `Origin: wails://wails.localhost:34115` を付けた `ws://localhost:3000/_next/hmr` の handshake は `101 Switching Protocols` を返す。**dev サーバ側は Wails のオリジンからの HMR 接続を受理する。** 詰まっているのはクライアントが繋ぎ先を選ぶところだけである。

### 8.3. 計測の有効化の手段の選択

| 案 | 内容 | 採否 |
| :-- | :-- | :-- |
| A | `window` に載せた関数を DevTools のコンソールから呼ぶ | **採用** |
| B | `localStorage` のフラグを読んでモジュール読み込み時に決める | 却下 |
| C | URL のクエリ文字列 | 却下 |
| D | 隠しキー操作(キーボードショートカット) | 却下 |
| E | 報告を Go のバインディング経由でバックエンドへ送り、`wails` の標準出力で読む | 却下(ただし弱点は残る) |

- **C を却下する理由**: 配布ビルドのウィンドウにアドレスバーが無い。ページのオリジンは `wails://wails/` で、URL を人間が打ち込む手段が無いため、そもそも使えない。
- **B を却下する理由**: `localStorage` へ書くにも結局 DevTools のコンソールが要る。そのうえ (1) 書いた後にリロードが必要で手順が 1 段増え、(2) フラグが残るため次回以降の起動でも黙って計測が走り、「何もしなければ計測は動かない」を破る。
- **D を却下する理由**: キーハンドラを常時登録する必要があり、既定で無効という目的に対して常時の負荷と実装が増える。押した合図を画面に出せない(擬似ダッシュボードに本物の UI を混ぜない方針)ため、有効になったかを人間が確かめられない。
- **A を採る理由**: 報告の読み先がそもそも DevTools のコンソールなので、有効化も同じ場所で完結し、手順が最短になる。リロードを挟まないので、有効化の前後で同じ画面の状態を測れる。有効化したことが `[framestats] enabled` の 1 行で分かる。何も残らないので、次回の起動は必ず無効から始まる。

- **E を却下する理由**: 有効化の操作口が別に要る(結局 A か B が要る)うえ、Go 側に受け口を足すぶん配布ビルドへ常時のコードが増える。ただし A には「Web インスペクタを接続した状態で測ることになり、観測系がフレーム間隔そのものへ影響しうる」という弱点があり、E はそれを消せる唯一の案だった。**実測で p95 が 20 ms の境目付近に出た場合は、この弱点が結論を左右する。** そのときは E を別 unit として立て直す。

`NODE_ENV` による分岐は完全に外す。ビルド種別で挙動が変わらないほうが、開発ビルドで確かめた手順がそのまま配布ビルドで通る。無効時のコストは `recordFrame` の先頭の真偽値 1 個の判定であり、これは分岐を残した場合と変わらない。

### 8.4. 無効化で標本を捨てる理由

無効の区間を跨いだ `last` を残すと、再度の有効化で「無効だった数十秒」が 1 つの間隔として標本に入り、mean と max が壊れる。有効化のたびに測り直すほうが、判定 (p95 > 20 ms) の意味がはっきりする。

## 9. 検証

- 5.1〜5.4 はコマンドの終了コードで判定する。
- Requirement 1・2 のうち関数の契約(1.4・2.4・2.6 など)は、フロントエンドに単体テストの基盤が無いため、コードの読み合わせで判定する。テストランナーの導入は本 unit のスコープ外(新しい依存を足さない)。
- Requirement 3 は `recordFrame` の呼び出し元の `grep` と各コンポーネントの `PANEL_NAME` で判定する(本セッションで実行済み)。
- Requirement 2.7 は `wails build` が出力した最小化済み chunk に `window.nullops` の結線が残ることで判定する(本セッションで実行済み)。
- Requirement 1.1・1.2・2.1〜2.3・2.5 は画面と DevTools のコンソールを要するため **UNVERIFIED** とし、`tasks.md` の Implementation Notes に人間だけで再現できる手順を残す。
- Requirement 4.1 は **未達**。原因の切り分けに要る情報(WebView のコンソールの最初の例外)を本セッションでは取得できない。手順を `tasks.md` の「D. 原因の切り分け」に残し、結果を受けてから直す。
