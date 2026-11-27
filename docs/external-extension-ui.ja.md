# 外部拡張UIの実装状況

対象: [Issue #106](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/106)。追補ブランチ: `feat/extensions/published-version-navigation`。base: `fe311ad`。

現在の`PublishedExtension`はホストの`resolve(reference, {signal})`で公開成果物を確認し、利用者の追加操作で`add(candidate, {signal})`へ渡します。npm／GitHub Releaseを扱い、ホストが対応を明示した場合はリポジトリURLなどの別名も入力できます。Webからローカルビルドに接続する経路はありません。

候補を確認した後、npmの正確な版またはGitHub Releaseのタグを入力して選び直せます。取得済みの配布元を維持した完全指定へ変換し、同じホストresolverで再取得・検証します。版の入力を変えてから新しい検証が成功するまでは追加できません。取消・失敗時は入力と前の確認済み候補を保持しますが、前の版を新しい候補として追加しません。「配布元の入力に戻る」は最後に確認できた入力を保ち、入力欄へフォーカスを戻します。

取得元の`source`を返さない旧ホストでは版の入力を表示せず、従来の入力→確認→追加を維持します。ホストAPIの変更や版一覧を取得する新しい通信経路は不要です。版の一覧・導入済み拡張の更新は別の未完了項目です。表示やハッシュ検証はコードの安全性認定ではなく、実行条件の確認とホストのポリシーは引き続きホストが所有します。

今回、取得中もライブラリ全体にbusyを通知し、カタログからの追加・再試行・閉じる操作との競合を防ぎました。取消要求を出してからホストの処理が終了するまではbusyを維持します。ホストが遅れて結果を返しても、取消・破棄された画面に候補や完了を通知しません。取得失敗・取消後は入力を保持したまま再試行できます。

## 今回の受け入れ基準

- [x] 取得・追加中と取消の終了待ちの間は別のカタログ操作を開始しない。
- [x] 取消後に遅れて取得・追加が成功しても成功通知を出さず、同じ入力で再試行できる。
- [x] 破棄時に取得をabortし、遅れた完了で画面を更新しない。
- [x] 版を変更すると追加を止め、再検証した版だけを1回の追加操作で渡す。
- [x] 不正な版入力から別URLやlocalhostへの取得を開始しない。
- [x] 戻る・取消・取得失敗・再試行で入力を保持し、キーボードのEnterとフォーカス復元を確認する。
- [x] ビルドと関連単体10件・ヘッドレス6件が成功する。版選び直しは日英・light/dark・320/390px幅で確認する。

```sh
pnpm run build
node --test test/catalog-library.test.cts test/extension-row.test.cts
node --test --test-timeout=45000 test/published-extension.browser.ts
```

## Issue全体に残る契約・実装

この修正はIssue #106全体の完了を意味しません。`PublishedExtensionPorts`は単一候補の解決と追加を担います。開発sessionの表示と操作は、追加の[`ExtensionDevelopment`](./extension-development-ui.ja.md)でホストsnapshotとコールバックを受けられるようになりました。以下の製品結線と所有APIの検証は継続します。

| 残る機能 | 所有境界・必要な接続 |
| --- | --- |
| 版の一覧、更新候補、実行中の版・出所 | resolverの版列挙とLoaderの現在状態・更新候補API |
| 共有開発UIとDesktopの製品結線、compiler準備・容量・進捗 | 新しい共有UIを含む固定版とDesktopが検証したビルド能力 |
| 開発sessionの範囲・権限拡大・失効の製品連携 | 表示・開始・停止・解除は共有UIに追加。範囲と承認の検証はホストが所有 |
| 全build／runtime診断とTSへの移動の製品接続 | 種類と適用ハッシュを区別する表示・移動callbackは追加。世代付き診断と安全な実移動はホストが所有 |
| 互換buildの再承認なしの反映、範囲逸脱での停止、復旧 | LoaderとDesktopのsession・世代管理・snapshotと前版復旧 |

共有パッケージ`extension-manifest@0.8.0`にはdistributionとbuild-profileの入口があります。また、`extension-loader@0.16.2`には`applyDevelopmentBuild`があります。これらの存在だけで、Desktopの全操作・unsandboxedの自動反映・権限拡大時の停止が本画面で検証済みとは扱いません。

依存順は設計（[Plus Packages #158](https://github.com/kubohiroya/turbowarp-plus-packages/issues/158)）→共有契約（[Manifest #11](https://github.com/kubohiroya/turbowarp-extension-manifest/issues/11)）→resolver／build（[Toolchain #103](https://github.com/kubohiroya/sb3-toolchain/issues/103)）→候補反映・復旧（[Loader #42](https://github.com/kubohiroya/turbowarp-extension-loader/issues/42)）→本UIの製品結線です。これらは調査時点でopenです。確定した契約のfixtureでUIを先行検証し、その後にWeb/Desktopを統合します。

## 運用ログ

- 2026-11-27 JST start: main上の既存Web実装と、固定依存の型・公開APIを調査。
- done: 公開成果物の取得から取消終了までbusyを維持する修正、カタログ操作との競合防止、遅い結果の回帰検証が成功。
- blocked: 版列挙・Desktop能力・watch／session・診断の接続が現行UI契約に未実装。上表の契約と下位パッケージの検証が必要。
- pending: 外部公開・Editor/Desktopへの固定反映は未実施。Issueは継続扱い。
- 2026-11-28 JST start: 公開済みresolver契約を確認し、版一覧APIを追加せず正確な版・Releaseタグの選び直しを実装。
- blocked: 戻る直後の入力フォーカスがeffect実行前に照会されるケースを検出。DOM更新直後のlayout effectで復元するよう修正。
- done: ビルド・関連単体10件・ヘッドレス6件成功。追加操作は明示操作1回で、取得や版の入力からは実行・追加しないことをfixtureで確認。

## 切り戻し

本ブランチのUI修正をrevertし、統合後はホストの依存固定を前版へ戻します。既存のカタログと標準custom extension経路、作品内の拡張bytes・出所を保持します。新しいビルド・watchの入口は今回追加しません。
