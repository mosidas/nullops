#!/bin/sh
# ユニバーサルビルドの build/bin/nullops.app を作り、バージョンを書いてアドホック署名する。
# 第 1 引数でバージョン(`v1.2.3` か `1.2.3`)を受け取る。省略時は 0.0.0。
set -eu
cd "$(dirname "$0")/.."

version=${1:-0.0.0}
version=${version#v}
echo "bundle.sh: version=$version"

wails build -clean -platform darwin/universal
app=build/bin/nullops.app

# wails build にバージョンを渡すフラグが無いため Info.plist を直接書く。
plutil -replace CFBundleShortVersionString -string "$version" "$app/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$version" "$app/Contents/Info.plist"

# Info.plist の書き換えで wails build の署名が無効になるため最後に署名し直す。
codesign --force --sign - "$app"
