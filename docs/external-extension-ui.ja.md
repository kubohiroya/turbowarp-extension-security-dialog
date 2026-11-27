# 外部拡張UIの実装状況

対象: [Issue #106](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/106)。ブランチ: `feat/extensions/external-development-review`。base: `46f7819`。

現在の`PublishedExtension`はホストの`resolve(reference, {signal})`で公開成果物を確認し、利用者の追加操作で`add(candidate, {signal})`へ渡します。npm／GitHub Releaseを扱い、ホストが対応を明示した場合はリポジトリURLなどの別名も入力できます。Webからローカルビルドに接続する経路はありません。

今回、取得中もライブラリ全体にbusyを通知し、カタログからの追加・再試行・閉じる操作との競合を防ぎました。取消要求を出してからホストの処理が終了するまではbusyを維持します。ホストが遅れて結果を返しても、取消・破棄された画面に候補や完了を通知しません。取得失敗・取消後は入力を保持したまま再試行できます。

## 今回の受け入れ基準

- [x] 取得・追加中と取消の終了待ちの間は別のカタログ操作を開始しない。
- [x] 取消後に遅れて取得・追加が成功しても成功通知を出さず、同じ入力で再試行できる。
- [x] 破棄時に取得をabortし、遅れた完了で画面を更新しない。
- [x] ビルドと関連単体5件・ヘッドレス3件が成功する。

```sh
pnpm run build
node --test test/catalog-library.test.cts
node --test --test-timeout=45000 test/published-extension.browser.ts
```

## Issue全体に残る契約・実装

この修正はIssue #106全体の完了を意味しません。現行の`PublishedExtensionPorts`は単一候補の解決と追加のみで、以下のUIとホスト契約を持ちません。

| 残る機能 | 所有境界・必要な接続 |
| --- | --- |
| 版の一覧、更新候補、実行中の版・出所 | resolverの版列挙とLoaderの現在状態・更新候補API |
| Desktopのフォルダ選択、compiler準備・容量・進捗・取消 | Desktopが許可したhandleと検証済みビルド能力 |
| 開発sessionの開始・範囲確認・watch停止・終了 | ディレクトリ、profile、実行方式、権限上限、有効期限のホスト契約 |
| build／runtime診断とTSへの移動 | 世代・file・line・columnに対応した診断と安全なsource navigation |
| 互換buildの再承認なしの反映、範囲逸脱での停止、復旧 | LoaderとDesktopのsession・世代管理・snapshotと前版復旧 |

共有パッケージ`extension-manifest@0.8.0`にはdistributionとbuild-profileの入口があります。また、`extension-loader@0.16.2`には`applyDevelopmentBuild`があります。これらの存在だけで、Desktopの全操作・unsandboxedの自動反映・権限拡大時の停止が本画面で検証済みとは扱いません。

依存順は設計（[Plus Packages #158](https://github.com/kubohiroya/turbowarp-plus-packages/issues/158)）→共有契約（[Manifest #11](https://github.com/kubohiroya/turbowarp-extension-manifest/issues/11)）→resolver／build（[Toolchain #103](https://github.com/kubohiroya/sb3-toolchain/issues/103)）→候補反映・復旧（[Loader #42](https://github.com/kubohiroya/turbowarp-extension-loader/issues/42)）→本UIの製品結線です。これらは調査時点でopenです。確定した契約のfixtureでUIを先行検証し、その後にWeb/Desktopを統合します。

## 運用ログ

- 2026-11-27 JST start: main上の既存Web実装と、固定依存の型・公開APIを調査。
- done: 公開成果物の取得から取消終了までbusyを維持する修正、カタログ操作との競合防止、遅い結果の回帰検証が成功。
- blocked: 版列挙・Desktop能力・watch／session・診断の接続が現行UI契約に未実装。上表の契約と下位パッケージの検証が必要。
- pending: 外部公開・Editor/Desktopへの固定反映は未実施。Issueは継続扱い。

## 切り戻し

本ブランチのUI修正をrevertし、統合後はホストの依存固定を前版へ戻します。既存のカタログと標準custom extension経路、作品内の拡張bytes・出所を保持します。新しいビルド・watchの入口は今回追加しません。
