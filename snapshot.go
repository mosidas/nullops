package main

// DashboardSnapshot は起動直後の初期表示を 1 回で取得するための戻り値。
//
// Wails のバインディング生成器がこの型を frontend/wailsjs/go/models.ts へ
// TypeScript 型として出力し、フロントエンドはそれをイベントハンドラでも使う
// (spec.md §5.4)。後続の作業単位はここへフィールドを足す。
type DashboardSnapshot struct {
	// Log は古い順のログ行。nil にならない(JSON 化して null にしないため)。
	Log []LogLine `json:"log"`
	// Scatter は 3D 散布図の点群。Points は nil にならない(同上)。
	Scatter ScatterCloud `json:"scatter"`
	// Commits は古い順の擬似コミット履歴。nil にならない(同上)。
	Commits []Commit `json:"commits"`
	// Graph は擬似依存関係。Nodes・Edges は nil にならない(同上)。
	Graph DependencyGraph `json:"graph"`
	// Metrics は折れ線の履歴とタコメータの最新の読み。
	// Series・Points は nil にならない(同上)。
	Metrics MetricHistory `json:"metrics"`
}
