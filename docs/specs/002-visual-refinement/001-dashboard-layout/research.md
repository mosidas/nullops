# dashboard-layout — 配置案の調査ノート(research.md)

作成日: 2026-09-06。仕様フェーズ(dev-spec Step 1〜2)で行った既存ダッシュボードの配置の調査と、それに基づく配置案の記録。spec.md はユーザーが案を選んだ後に書く。本書は spec.md §9 から参照される。

## 1. 調べたこと

問い: 「6 個前後の異なる種類の可視化を 1 画面へ並べるとき、どの区画にどの種類を置き、どの区画を大きく取るか」。色・タイポグラフィは対象外(request.md §2.1)。

### 1.1. 出典

| # | 出典 | 確認した内容 |
| :- | :- | :- |
| S1 | Grafana docs「Dashboard JSON model」 https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/ | `gridPos`: 幅は 24 列(`w`: 1–24)、高さの単位は 30 px(`h`)。 |
| S2 | Grafana Labs「Node Exporter Full」(ID 1860)の JSON https://grafana.com/api/dashboards/1860/revisions/latest/download | 最上段の row「Quick CPU / Mem / Disk」は gauge × 5(各 w3 h4)+ bargauge + stat × 5(w2 h2)。その下の row「Basic CPU / Mem / Net / Disk」は timeseries が w12 h7 で 2 枚並ぶ。すなわち上に小さな状態表示(ゲージ・数値)、下に大きな時系列。 |
| S3 | Grafana docs「Best practices for creating dashboards」 https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/ | 配置の一般規則は無く、RED メソッドの例「request and error rate on the left, latency duration on the right, one row per service」のみ。 |
| S4 | Datadog docs「Dashboards」 https://docs.datadoghq.com/dashboards/ | Dashboards はグリッド配置で最大幅 12 グリッド。Screenboards は自由配置。推奨の配置型は書かれていない。 |
| S5 | IGC「Dashboard Layout: Visual Hierarchy People Actually Use」 https://www.intelligentgraphicandcode.com/design/dashboard-design/dashboard-layout | Z パターン(要素 4〜6 個の画面。上段を左→右、対角に左下、下段を左→右)、F パターン(密な運用画面)。逆ピラミッド: 第 1 層 = 状態(KPI カード)、第 2 層 = 傾向(折れ線)、第 3 層 = 詳細(表)。最重要は左上(「top-left is where the eye lands first」)。 |
| S6 | btop README(raw) https://raw.githubusercontent.com/aristocratos/btop/main/README.md | 既定の `shown_boxes = "cpu mem net proc"`。位置オプション `cpu_bottom`(CPU 箱を上から下へ)、`proc_left`(プロセス箱を右から左へ)、`mem_below_net`。→ 既定は CPU が上の全幅の帯、下は mem/net を積んだ列とプロセス一覧の列。 |
| S7 | lazygit `docs/Config.md`(raw) https://raw.githubusercontent.com/jesseduffield/lazygit/master/docs/Config.md | `sidePanelWidth` 既定 0.3333(左側の区画に画面幅の 1/3)。`portraitMode`(縦長では積み重ねる)。`enlargedSideViewLocation` は left / top。→ 左 1/3 に小さな区画を縦に積み、右 2/3 を主区画にする型。 |
| S8 | htop(1) man page https://man7.org/linux/man-pages/man1/htop.1.html | 「configure the meters displayed at the top of the screen」。メーター群は画面上部、プロセス一覧がその下(列数の記述は無し)。 |
| S9 | Craft Wall「Video wall for NOC: a reference architecture」 https://craftwall.pro/en/articles/video-wall-for-noc-reference-architecture/ | 待機時の基本配置「NMS on the centre, Grafana along the top, SIEM bottom-left, CCTV bottom-right」。→ 中央に主役、上に帯、隅に補助。 |
| S10 | Wikipedia「LCARS」 https://en.wikipedia.org/wiki/LCARS | 設計思想「the instrument panels not have a great deal of activity on them」。配置の型は文章として得られず(左右の帯と elbow は画像でのみ確認)。案の根拠には使わない。 |
| S11 | k9s README(raw) https://raw.githubusercontent.com/derailed/k9s/master/README.md | `:pulses` ビューの存在は確認したが、格子の構成は文章として無い(動画のみ)。案の根拠には使わない。 |

取得できなかったもの: k9s の pulses ページ(404)、BMC Helix「NOC View」(403)、Medium の FUI 記事(403)。

### 1.2. 型の抽出

出典から、6 枠前後の配置の型は次の 3 つに集約できる。

| 型 | 由来 | 骨格 |
| :- | :- | :- |
| 三段型(状態 → 傾向 → 詳細) | S2・S5・S8 | 上段に小さな状態表示、中段に大きなグラフ、下段に詳細の一覧。視線は Z パターン。 |
| 側柱型(サイドバー + 主区画) | S7・S6 | 一方の側に細い列(1/3 前後)、他方に主区画。btop はこれに上の帯を足す。 |
| 中央主役型(ミッションコントロール) | S9 | 中央に最も大きい 1 枠、上に帯、周囲に補助。 |

### 1.3. 既存コードから分かる各パネルの「向き」

配置案の難点を判定するための事実(2026-09-06 に実物で確認)。

| 枠 | 枠の形の得手・不得手 | 根拠 |
| :- | :- | :- |
| LOG | 縦に長いほど行数が増える。横幅は固定列(時刻 80 px・ツール 64 px・レベル 48 px)を引いた残りが本文で、狭いと `break-all` で折り返しが増える。 | `LogStreamPanel.tsx` `renderLine` |
| COMMIT | 行の高さが固定で縦に並ぶため、縦長が向く。レーン幅は枠幅の 4 割まで。横長にしても見える行数は増えない。 | `lib/commitgraph.ts` `commitRowLayout` |
| TIME | 横長が向く(時間軸が横)。凡例は上端。 | `TimeseriesPanel.tsx` |
| DEP | 正方形に近い形が向く(円環の錨 + ドリフト)。 | `DependencyGraphPanel.tsx`・`graphsource.go` |
| 3D | 正方形に近い形が向く(点の半径が `min(width, height)` 比)。 | `Scatter3DPanel.tsx` |
| GAUGE | ダイヤル 1 個。半径が `min(width, height)` 比なので、横長の帯に置くとダイヤルが小さくなる。複数ダイヤルの横並びは現状の描画に無い。 | `lib/metrics.ts` `dialGeometry`・`metricsource.go`(`gaugeLabel = "utilization"` の 1 系列) |
| 共通 | 6 枠は `DashboardGrid` の `grid-cols-3 grid-rows-2` の自動配置。`Panel` は `h2` + 区切り線 + 本文。ウィンドウは 1440×900 で始まり 1100×720 より小さくできない(`main.go`)。 | `DashboardGrid.tsx`・`Panel.tsx`・`main.go` |

## 2. 配置案

すべて 12 列 × 16 行の格子(Datadog の 12 グリッドに合わせた。Grafana の 24 列でも表せる)。図は `layout-figures.py` が格子の定義から生成する(列 1 つ = 5 文字、行 1 つ = 1 行)。ピクセルの目安は 1440×900 で 1 列 ≈ 118 px・1 行 ≈ 55 px、下限 1100×720 で 1 列 ≈ 90 px・1 行 ≈ 44 px(余白と隙間を除いた概算)。

### 案 A: 側柱型(ユーザーの出発点)

```text
+-------------------+---------------------------------------+
| LOG               | TIME                                  |
|                   |                                       |
|                   |                                       |
|                   |                                       |
|                   |                                       |
|                   +---------+--------------+--------------+
|                   | COMMIT  | DEP          | 3D           |
|                   |         |              |              |
|                   |         |              |              |
|                   |         |              |              |
|                   |         |              |              |
|                   |         |              |              |
|                   +---------+--------------+--------------+
|                   | GAUGE                                 |
|                   |                                       |
+-------------------+---------------------------------------+
```

- **格子**: LOG(0,0,4,16)・TIME(4,0,8,6)・COMMIT(4,6,2,7)・DEP(6,6,3,7)・3D(9,6,3,7)・GAUGE(4,13,8,3)。
- **出所**: request.md §2.1 の出発点「ログ縦長・グラフ大・タコメータ下部横並び」。型としては lazygit の左 1/3 側柱(S7)と、btop の「一覧の列 + 積んだ列」(S6)を左右反転したもの。
- **働き**: 主は左の LOG(常に流れ続ける)と右上の TIME。視線は左の流れに留まり、時々右へ移る。下の GAUGE の帯は「計器盤」として視野の隅に置かれる。
- **難点**: (1) GAUGE の帯(約 950×165 px、下限で 900×130 px)にダイヤル 1 個を置くと半径 ≈ 55 px と小さい。横並びにするには複数ダイヤルの描画が要り、roadmap 3 節「4 パネルは枠の大きさと位置が変わるだけで描画の中身は変えない」と衝突する(論点 2)。(2) LOG の本文幅 ≈ 230 px で折り返しが多い。(3) COMMIT は 237×385 px と細いが、コミットグラフは縦長向きなので致命ではない。CSS グリッドでは `grid-template-areas` で素直に表せる。

### 案 B: 三段型(Grafana の Node Exporter Full 型)

```text
+--------------+--------------------------------------------+
| GAUGE        | TIME                                       |
|              |                                            |
|              |                                            |
+--------------+-------------------+------------------------+
| COMMIT       | DEP               | 3D                     |
|              |                   |                        |
|              |                   |                        |
|              |                   |                        |
|              |                   |                        |
|              |                   |                        |
+--------------+-------------------+------------------------+
| LOG                                                       |
|                                                           |
|                                                           |
|                                                           |
+-----------------------------------------------------------+
```

- **格子**: GAUGE(0,0,3,4)・TIME(3,0,9,4)・COMMIT(0,4,3,7)・DEP(3,4,4,7)・3D(7,4,5,7)・LOG(0,11,12,5)。
- **出所**: Node Exporter Full の「上段にゲージと数値、その下に大きな時系列」(S2)と、逆ピラミッド「状態 → 傾向 → 詳細」(S5)。ログを下段の全幅に置くのは htop のメーター上・一覧下(S8)の並びと同じ向き。
- **働き**: 視線は Z パターン。左上の GAUGE(いま健全か)→ 上段の TIME(傾向)→ 中段の DEP・3D(構造)→ 下段の LOG(詳細)。主は中段の 2 枠で、3D を最大(594×385 px)に取る。
- **難点**: (1) LOG が 5 行分 ≈ 275 px(約 13 行)しか見えず、「ログが流れる画面」としての存在感は薄い。(2) TIME は 1068×220 px と薄いが折れ線には向く。(3) 極端に細い枠は無い。`grid-template-areas` で表せる。

### 案 C: btop 型(上に帯、下に列、一覧を最大に)

```text
+---------+-------------------------------------------------+
| GAUGE   | TIME                                            |
|         |                                                 |
|         |                                                 |
|         |                                                 |
+---------+-------------------+-----------------------------+
| COMMIT  | DEP               | LOG                         |
|         |                   |                             |
|         |                   |                             |
|         |                   |                             |
|         |                   |                             |
|         +-------------------+                             |
|         | 3D                |                             |
|         |                   |                             |
|         |                   |                             |
|         |                   |                             |
+---------+-------------------+-----------------------------+
```

- **格子**: GAUGE(0,0,2,5)・TIME(2,0,10,5)・COMMIT(0,5,2,11)・DEP(2,5,4,6)・3D(2,11,4,5)・LOG(6,5,6,11)。
- **出所**: btop の既定配置「CPU の帯が上、下は mem/net を積んだ列とプロセス一覧」(S6)。CPU の帯 → TIME、mem/net の列 → DEP/3D、プロセス一覧 → LOG。
- **働き**: 主は右下の LOG(712×605 px、約 30 行、本文幅 ≈ 470 px で折り返しが少ない)と上の TIME の帯。左の COMMIT の細い列(237×605 px)はコミットの縦の流れを見せる。視線は上の帯を左→右に走ってから右下の LOG に落ち着く。
- **難点**: (1) 3D が 475×275 px の横長で、正方形向きの散布図としては小さい(unit #2 でドラッグ操作を持つ枠としては窮屈)。(2) GAUGE が左上 237×275 px でダイヤル半径 ≈ 90 px。(3) `grid-template-areas` で表せる。

### 案 D: 中央主役型(ミッションコントロール型)

```text
+-------------------------------------------------+---------+
| TIME                                            | GAUGE   |
|                                                 |         |
|                                                 |         |
+-------------------+------------------------+----+---------+
| LOG               | 3D                     | DEP          |
|                   |                        |              |
|                   |                        |              |
|                   |                        |              |
|                   |                        |              |
|                   |                        +--------------+
|                   |                        | COMMIT       |
|                   |                        |              |
|                   |                        |              |
|                   |                        |              |
|                   |                        |              |
+-------------------+------------------------+--------------+
```

- **格子**: TIME(0,0,10,4)・GAUGE(10,0,2,4)・LOG(0,4,4,12)・3D(4,4,5,12)・DEP(9,4,3,6)・COMMIT(9,10,3,6)。
- **出所**: NOC のビデオウォールの基本配置「中央に NMS、上に Grafana の帯、隅に補助」(S9)。中央を 3D にするのは、6 枠のうち唯一の操作(unit #2 のドラッグ)を持ち、常に回転する枠だから。
- **働き**: 主は中央の 3D(594×660 px)。上の TIME の帯が流れ、左の LOG が縦に流れ、右の DEP・COMMIT が構造を添える。視線は中央に置かれ、周辺の動きを周辺視で拾う。
- **難点**: (1) 3D の枠が縦長(594×660 px)で、投影の見た目は正方形に近づけるほうがよい(枠内で正方形を取ると左右に余白)。(2) LOG の本文幅 ≈ 230 px で折り返しが多い(案 A と同じ)。(3) 右列の DEP・COMMIT は 356×330 px で、DEP はやや小さい。`grid-template-areas` で表せる。

### 2.1. 案の比較(枠の概算 px、1440×900)

| 枠 | 案 A | 案 B | 案 C | 案 D |
| :- | :- | :- | :- | :- |
| LOG | 475×884 | 1424×275 | 712×605 | 475×660 |
| TIME | 950×330 | 1068×220 | 1187×275 | 1187×220 |
| COMMIT | 237×385 | 356×385 | 237×605 | 356×330 |
| DEP | 356×385 | 475×385 | 475×330 | 356×330 |
| 3D | 356×385 | 594×385 | 475×275 | 594×660 |
| GAUGE | 950×165 | 356×220 | 237×275 | 237×220 |

## 3. 人間の判断が要る論点(spec の壁打ち前)

1. **配置案の選択**: A〜D のいずれか、または格子の数値を調整した変形。
2. **GAUGE の帯の扱い(案 A を選ぶ場合)**: (a) ダイヤルを複数横並びにする(GaugePanel と metricsource の中身に手が入り、roadmap 3 節の「中身は変えない」を差し戻して直す)、(b) 帯をやめ GAUGE を正方形に近い枠に置く変形(例: COMMIT の下)、(c) 帯の左端にダイヤル 1 個を置き残りを空ける。推奨は (b)。理由: roadmap のスコープを保ち、この unit を配置だけに閉じられる。
3. **見出しを消した後の枠の境界**: (a) 現状の枠線(`border-border`)と背景差(`bg-surface-1`)を残し、見出しだけを消す、(b) 枠線も消し隙間(`gap`)だけで区切る。推奨は (a)。理由: 隙間だけだと LOG のような暗い枠と背景の差が小さく、枠の境界が読めない。
4. **ウィンドウの下限(1100×720)での扱い**: (a) 同じ比率で縮む(現状どおり。最も細い枠は案 A の COMMIT で約 180×310 px)、(b) 下限付近で配置を切り替える。推奨は (a)。理由: 切り替えは配置を 2 つ持つことになり、目視での承認対象も 2 倍になる(YAGNI)。
5. **3D と DEP のどちらを大きく取るか**: 案 B・C・D は 3D を DEP より大きくしている(unit #2 で操作を持つため)。逆にする、または同じにするか。
6. **README「画面」表の改訂の形**: 「枠の題名」列を落とした後、位置をどう書くか。(a) 表に「位置」列(例: 左の全高・右上)を足し、文章で配置の型を 1 文で述べる、(b) 選んだ案の ASCII 図を README に載せる。推奨は (a)。理由: 図は格子を変えるたびに崩れやすく、表のほうが保守しやすい。
