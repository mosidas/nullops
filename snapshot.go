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
}
