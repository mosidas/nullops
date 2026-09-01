package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"nullops/feed"
)

// wailsEmitter は feed.Emitter の Wails 実装。
//
// feed パッケージを Wails から切り離すため、ランタイムへの依存はこの型に閉じる。
type wailsEmitter struct {
	ctx context.Context
}

// newWailsEmitter は Wails の ctx へ送る Emitter を作る。
//
// ctx は OnStartup が渡すもの。runtime.EventsEmit はこの ctx から
// アプリのインスタンスを取り出すため、自前のキャンセル可能な context ではなく
// Wails の ctx を渡す必要がある。
func newWailsEmitter(ctx context.Context) feed.Emitter {
	return wailsEmitter{ctx: ctx}
}

// Emit は payload を eventName のイベントとしてフロントエンドへ送る。
//
// runtime.EventsEmit はエラーを返さず、購読者が居なければ捨てられる。
func (e wailsEmitter) Emit(eventName string, payload any) {
	runtime.EventsEmit(e.ctx, eventName, payload)
}
