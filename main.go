package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title: "nullops",
		// 6 枠を 3 列 × 2 行で読める大きさ(spec.md §3 前提 2)。
		Width:  1440,
		Height: 900,
		// 縮めても枠が潰れない下限(spec.md §8)。
		MinWidth:  1100,
		MinHeight: 720,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// 起動直後、本文が描かれるまでのあいだ見える地色。
		//
		// 色の正本は frontend/src/app/globals.css の @theme であり、ここは
		// --color-surface-0 (#10141c) と同じ値を写している。Wails のオプションは
		// Go の構造体で CSS 変数を読めないため直値になる。テンプレート由来の
		// 値のままだと起動直後だけ本文の地色とずれて見える(spec.md §3 前提 10)。
		BackgroundColour: &options.RGBA{R: 16, G: 20, B: 28, A: 1},
		OnStartup:        app.startup,
		// ウィンドウを閉じたときに擬似データの生成を止める(spec.md §6.5)。
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
