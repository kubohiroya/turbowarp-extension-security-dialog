# 拡張開発の状態と診断を表示する共有UI

対象: [Security Dialog #106](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/106)。ブランチ: `feat/extensions/development-status-ui`、base: `5dab311`。

`./react`の`ExtensionDevelopment`は、開発フォルダの接続・取消、自動更新の停止・再開、接続解除、適用済みビルドと診断を表示します。既存の`ExtensionRow`と日英・テーマの契約を使います。フォルダ操作・承認・ビルド・VM反映はホストのままで、表示や再描画からこれらを呼びません。

Desktopの既存session snapshotとコールバックを接続できる形で新規実装しています。Desktopの既存アドオンUIや監視・承認・ビルド処理をこのパッケージへ移植しません。

## ホストとの契約

```tsx
import {ExtensionDevelopment} from '@kubohiroya/turbowarp-extension-security-dialog/react';

<ExtensionDevelopment
    locale={locale}
    capabilities={{localDevelopment: Boolean(desktopHost), sourceBuild: desktopHost?.sourceBuild === true}}
    sessions={sessions}
    adding={connecting}
    error={connectionError}
    DialogFrame={HostFrame}
    onAdd={mode => development.start(mode)}
    onCancelAdd={() => development.cancelStart()}
    onToggle={(token, enabled) => development.setEnabled(token, enabled)}
    onRemove={token => development.stop(token)}
    onClose={closePanel}
/>
```

`capabilities`は信頼されたホストが与えます。未指定または`localDevelopment: false`なら何も表示しません。`sourceBuild: true`だけではローカル操作を表示しません。Webからlocalhostやビルドサービスへ接続する処理はありません。ソースビルドの操作はホストが明示した場合にだけ表示します。

`sessions`はホストが検証・反映した状態のsnapshotです。`token`・`id`・`directory`・`enabled`に加え、`mode`、`appliedDigest`、`busy`、`waiting`、`buildError`、`error`、`diagnostic`などを受け取ります。ヘッダーから読む名前・説明・製作者・版は自己申告の説明に限り、実行方式・適用済みハッシュ・Plus所属には使いません。`execution`がなければ「報告されていません」と表示します。

UIはコールバックへ要求を渡しただけで監視のチェックや適用済みビルドを変更しません。ホストが新しいsnapshotを渡したときに表示を更新します。ビルド待機・コンパイル失敗中も最後の適用済みハッシュを保持し、ビルド失敗と実行時エラーを別に表示します。以前のハッシュの診断は以前のビルドのエラーと表示します。接続解除はホストへの要求であり、ソースや作品を削除しません。

接続の取消要求は1回だけ渡します。ホストが処理の終了を報告するまでは、追加・切替・閉じる操作とモーダルの閉じる要求を止めます。ホストのフォルダ選択・session承認に加えて、このUIが独自の確認画面を出すことはありません。

## TypeScript診断からの移動

`onOpenSource(token, {file, line, column, sha256})`は任意です。診断に明示されたハッシュが最後に適用したSHA-256と一致し、座標が正の整数、ファイルが`src/`以下の相対TS/JSファイルの場合だけ操作を表示します。`..`、絶対パス、URL、ビルド不一致、ハッシュの欠落は移動できません。表示する座標はテキストであり、`file:`リンクやshell文字列へ変換しません。

コールバックを受けるホストは、session・適用済みビルド・パスの権限を再検証してから自分のソース編集機能へ渡します。診断位置の解決やOSファイルを開く機能はこのUIにはありません。旧Desktopのハッシュを含まない診断は表示できますが、移動操作を有効にはしません。

## 検証と受け入れ基準

- [x] ホスト能力がないWebではローカル操作を表示せず、ソースビルドは明示能力でのみ表示する。
- [x] ビルド失敗・待機・停止・実行時診断を区別し、ホスト報告前に適用済みビルドを更新しない。
- [x] 接続時の要求1回、同じsessionの後続snapshot表示では追加の開始要求ゼロ。これはUIコールバック数の測定であり、OSやLoaderの全承認回数の測定ではない。
- [x] 接続取消の重複・処理終了前の閉じる操作を防ぐ。
- [x] ソース移動は正しいビルドと安全な相対座標だけを渡し、移動能力がなければ操作を出さない。
- [x] ヘッダー・説明・フォルダをコードとして実行しない。ヘッダーから画像取得や権限付与を行わない。
- [x] 日英、dark/light、320/390/1280px幅と568px高さ、キーボード、ホスト報告の不足を確認する。
- [x] 型検査を含むビルド、関連単体14件、Desktopアダプター込みのヘッドレス9件が成功。

```sh
pnpm run build
node --test test/extension-development.test.cts test/extension-row.test.cts
# Shared UI only: four passing cases, with two Desktop-only cases skipped.
node --test --test-timeout=45000 test/extension-development.browser.ts
# Also verify the locally prepared Desktop adapter: nine passing cases, no skips.
TWEXTSEC_DESKTOP_SOURCE=/absolute/path/to/desktop-adapter-checkout \
node --test --test-timeout=45000 test/extension-development.browser.ts
```

単体テストは通常の`pnpm test`に含め、共有UIのヘッドレス検証は既存CIへ追加しました。Desktopアダプターを使う検証では、その実ファイルをbundleし、GUIのModalとCSS Modulesだけをfixtureにします。Electronの実ウィンドウ・OS入力・実製品rendererの検証ではありません。

## 製品結線と残課題

Desktop `d3a1fb6`を基点とする`refactor/extensions/shared-development-ui`に、既存ダイアログの拡張ブロック画面だけをこのUIへ渡すアダプターを準備しました。旧共有パッケージに`ExtensionDevelopment`がなければ既存UIを維持し、アドオン画面も従来のままです。共有UIを含む版の公開、Editorの固定依存更新、Desktopの固定renderer更新と製品ビルドの確認後に実際の表示が切り替わります。

現行Desktop backendはサンドボックスでのローカル開発を扱います。UIがunsandboxedの状態を表示できることを、そのbackendの対応や自動反映の承認済みとは扱いません。版一覧・公開済み拡張の更新管理、GitHubソースビルド、ツール取得時の容量・進捗、ビルド世代付きの全診断、ソース編集への製品接続は継続課題です。

## 運用ログ・切り戻し

- 2026-11-28 JST start: Issue #106とDesktop #67/#68、既存preload・監視controller・状態表示の契約を調査。
- blocked: サンドボックス内の依存取得が制限されたため、固定依存の既存storeを使うインストールへ切り替えて解消。
- blocked: 低い画面でフッターが画面外へ出ることを検出。高さの上限と一覧だけのスクロールを修正。
- blocked: 旧React入口のfixtureでmodule解決基点が不足。テストの解決基点を設定して解消。
- done: 共有UIのビルド・単体14件、旧版互換・アドオン維持を含むヘッドレス9件成功。Desktopの既存session・診断・取消・世代管理8件も成功。
- pending: 共有UIの公開と製品の固定依存・renderer更新、実製品の統合検証。Issue全体の完了とは扱わない。

共有UIの追加をrevertし、Desktopアダプターは元のダイアログへ戻します。製品の固定更新後は依存とrendererを直前の版へ戻します。UIの切り戻しで開発フォルダ、適用済み作品、正常成果物を削除しません。
