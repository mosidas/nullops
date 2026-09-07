# 0002. Canvas 2D による多要素描画で p95 を悪化させない設計指針

## Status

Accepted(2026-09-07)

## Context

roadmap `002-visual-refinement` の unit #3〜#5 は、3D 散布図の点数(256 → 6,000)、パネル・格子・影・ラベルの追加、依存グラフのノード数(10 → 36)と、いずれも Canvas 2D で描く要素数を大きく増やした。判定は 5 パネル(`commit`・`depgraph`・`gauge`・`scatter`・`timeseries`)の rAF フレーム時間 p95 が 20 ms を超えないこと(request.md §3)。要素数の増加がそのまま p95 の悪化につながるかどうかは、3 つの unit の実測を通じて経験則が積み上がった。

## Decision

描画を追加する前に、次の 3 つの回数を先に見積もる。

1. `fillStyle`(および `strokeStyle`)の切り替え回数
2. `ctx.arc()` の呼び出し回数
3. 描画順を決めるための比較ソート(`Array.prototype.sort` 等)の有無

**この 3 つを増やさなければ、要素数(点・ノード・パネルの枚数)をどれだけ増やしても p95・mean・max は悪化しない。** 増やす場合は、同じ色・同じ描画対象をまとめて 1 回の状態変更で描く(バケット化・counting sort によるグルーピング)ことで、切り替え回数を要素数から切り離す。

## Consequences

実測値(いずれも `wails build -devtools` の配布ビルド、`window.nullops.enableFrameStats()` による 5 パネル計測。手順は README「開発」節)。

- **unit #3(`scatter3d-pointcloud`)**: 点数を 256 → 6,000(23 倍)に増やす一方、ハローの 2 重 `arc` 描画(512 回)と奥行き順の比較ソート(256 要素)を捨て、`fillRect` 6,000 回 + 深度帯ごとの `fillStyle` 最大 576 回へ置き換えた。結果、p95 は 18.0 ms → 17.0〜18.0 ms(同等)、max は 23〜63 ms → 19〜25 ms(改善)。`arc` とソートを捨てたコストの削減分が、描画呼び出し回数の増加分を上回った。
- **unit #4(`scatter3d-panes`)**: 面 5 枚(縦 4 + 床)・格子・縁・影・ラベル 20 個を追加した。影は 24 バケットの counting sort で色ごとにまとめ、面ごとの `fillStyle` 切り替えを 24 回に抑えた。結果、p95・mean は unit #3 完了時と同等のまま、max は 19〜25 ms → 18〜21 ms(改善)。
- **unit #5(`depgraph-density`)**: ノード数を 10 → 36 に増やす一方、`drawNodes` の `fillStyle` をノードごとの切り替えから健康状態(`ok`/`warn`/`down`)3 群のバッチ描画へ書き換えた。5 パネルの p95 は 17.0〜18.0 ms・mean 16.7 ms を維持した。

5 パネルの p95 は unit #3・#4・#5 を通じて一貫して 17.0〜18.0 ms に収まり、3 unit のいずれも§8 の削る順(点数・帯・位相数、または影・格子密度・点数)を発動しなかった。

**透視投影の教訓**: 「法線が真横を向く面は投影が線に潰れる」という正射影の直感は、本アプリの透視投影(`FOCAL = 3.2`。`frontend/src/lib/project.ts`)では成り立たない。unit #4 では、この直感に基づいて縦面を離散的に選ぶ実装が、自動回転の下で面が入れ替わる瞬間に視覚的な飛びを生んだ。対処として面の寄与を連続的な重み(`wallWeights`)へ変えた。詳細は `frontend/src/lib/panes.ts` の doc コメントにある。
