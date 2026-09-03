# nullops

作業中に見えるダッシュボードを表示するデスクトップアプリ。実際の処理は何も実行しない。

[genact](https://github.com/svenstaro/genact) が流す擬似的な作業ログに可視化パネルを加え、1 画面に並べる。

## 画面

6 枠を 3 列 2 行に並べる。「枠の題名」は画面に出る見出しそのままで、表の行と画面の枠は 1 対 1 に対応する。

| パネル | 枠の題名 | 内容 |
| :- | :- | :- |
| ログストリーム | Log Stream | ビルド・デプロイ・スキャン等の擬似ログを流す |
| コミットグラフ | Commit Graph | 分岐とマージを含むコミット履歴を描く |
| 折れ線グラフ | Timeseries | スループット・レイテンシ等の時系列を描く |
| グラフビュー | Dependency Graph | ノードとエッジで依存関係を描く |
| タコメータ | Utilization | 針が使用率を指す円形インジケータ |
| 3D 散布図 | Scatter 3D | 3 次元空間の点群を回転させる |

並び順は画面の配置(1 行目 左→右、2 行目 左→右)と一致する。

## 動作環境

macOS / Windows / Linux。

## 開発

```sh
wails dev     # 開発モード(ホットリロード)
wails build   # 配布用ビルド
```

必要なもの: Go 1.25 以上、Node.js 24 以上、[Wails CLI](https://wails.io/docs/gettingstarted/installation) v2。
