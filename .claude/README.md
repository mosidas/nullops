# .claude

`skills/` と `agents/` は [dev-skills](https://github.com/mosidas/dev-skills) の `dev` グループを導入したものである。ハードコピー方式のため、このリポジトリで Git 管理する。導入内容の記録は `dev-core.lock.json` にある。

更新・削除は dev-skills 側の `install.py` で行う。手で編集すると次の更新で失われる。

```sh
# 更新(廃止されたスキル・エージェントは自動で削除される)
python3 install.py core --target /path/to/nullops dev

# 導入状態の表示
python3 install.py status --target /path/to/nullops
```
