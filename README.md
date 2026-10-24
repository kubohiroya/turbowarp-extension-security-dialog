# turbowarp-extension-security-dialog

TurboWarpの複数の機能拡張を、1つの一覧で確認するための共通パッケージです。
関連タスクと受け入れ基準は [scratch-gui #33](https://github.com/kubohiroya/scratch-gui/issues/33) に記録しています。

## 責務

- 一覧比較UI、個別・一括の3択、確認ダイアログ、ソースの詳細表示
- コードを実行しないメタデータ取得、実バナー／GitHub画像の候補選択、共通バナーへの切替
- 画像・メタデータの非同期更新と独立した選択・詳細の状態保持
- プロジェクト別のIndexedDB保存と初期選択の復元
- `./turbowarp` に分離したVM互換アダプター

ホスト側が、ダイアログの外枠、起動時フラグ、キャンセル後の初期画面への移動を担当します。
ReactとReact DOMは任意のpeer dependencyです。React UIの利用時は両方を用意してください。
coreとVMアダプターの利用にReact/React DOMは必要ありません。

ダイアログ全体の高さをビューポート内に制限し、見出し・一括選択・OK/キャンセルを維持したまま、
一覧（詳細と注意書きを含む）だけをスクロールします。短い画面高では余白を詰めます。

## メタデータとプレビュー

HTTP/HTTPSの出所URLは完全なURLを表示し、別タブで開きます。埋め込み拡張や他のスキームはリンクにしません。
ソース先頭の宣言コメントに `// Updated: 2026-10-19T10:30:00+09:00` などの更新日時がある場合、
記載値をそのまま表示します。`Updated at` / `Updated-at` / `UpdatedAt` / `Last updated` / `Last-updated` /
`Last modified` / `Last-modified` も同じ項目です。カスタム `loadInfo` は `metadata.updatedAt` を返せます。
記載がなければ日時は表示せず、HTTPの取得日時やファイル時刻で補いません。

バナーはホバーまたはキーボードフォーカスで原寸プレビューを表示します。画面より大きい画像は
プレビュー枠内をスクロールして確認できます。ポインターを外すかEscapeで閉じ、選択や詳細状態を保持します。
メタデータの非同期取得中も実行方法を選べます。ソースの一覧内表示は引き続き「詳細」を押したときだけです。

## 実行モードの選択

個別選択・一括選択・一覧の見出しは、禁止アイコンの「拒否」、盾の「サンドボックスあり」、
警告の「サンドボックスなし」の順です。アイコンと色は文字ラベルを補助し、安全性の認定には使いません。

先頭の宣言コメントに `// Unsandboxed: required` があれば、「サンドボックスあり」を無効化して
動作しない理由を表示し、「サンドボックスなし」に「動作に必要」を付けます。拒否は選択できます。
この宣言は作者の自己申告であり、未宣言・取得失敗から必須モードを推測しません。

実行する選択の確定はメタデータ取得の完了または失敗後です。遅れて取得した宣言に対応しない選択は、
保存済みの復元値も含めて解除し、選び直しを案内します。権限の広いモードへ自動で変更しません。
一括選択は対応する拡張だけに適用し、全件が非対応の一括ボタンは無効化します。

## 接続例

```jsx
import {ExtensionSecurityDialog} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import {installBatchExtensionLoader} from '@kubohiroya/turbowarp-extension-security-dialog/turbowarp';
import '@kubohiroya/turbowarp-extension-security-dialog/styles.css';

const restore = installBatchExtensionLoader(vm, (entries, initialChoices) =>
  new Promise(resolve => showDialog(
    <ExtensionSecurityDialog entries={entries} initialChoices={initialChoices}
      locale="ja" DialogFrame={HostModal} onComplete={resolve} />
  )), defaultExtensionURLs);
```

`onComplete` は確定したMap、または確認済みキャンセルの `null` を返します。
キャンセル時のVMエラーは `isExtensionSecurityCancelled(error)` で識別できます。
Webpack 4のCSS Modules環境では `styles.css` の代わりに `webpack4.css` を読み込みます。
従来のWebpack 4がpackage exportsを解釈しない場合にも、ルートの互換entryを解決できます。

## 設定の保存

OKで確定し、プロジェクトが正常に開いた場合だけ保存します。復元値も明示的なOKが必要です。
キャンセル、続行確認の「いいえ」、読み込み失敗では設定を上書きしません。
project.jsonの内容をSHA-256で識別し、編集環境メタデータとJSONのキー順を除外します。
ファイル名では識別しません。内容が変わったプロジェクトは別の設定として扱います。
保存する拡張URLもハッシュ化し、設定DBへソースコードを複製しません。
IndexedDBや暗号APIが利用できない環境でも、許可確認と読み込みを続行できます。

## ホスト互換境界

現在のアダプターはVMインスタンスの `_loadExtensions`、`loadProject`、`clear` と、
ExtensionManagerの `getExtensionURLs`、SecurityManagerの `getSandboxMode` を包みます。
scratch-vmのソースやnode_modules内の依存パッケージは編集しません。
アダプターを破棄する際は返された `restore()` を呼びます。
scratch-guiは既定OFFの起動時フラグで導入し、ホスト独自のセキュリティポリシーを優先します。

## 開発と検証

```sh
npm install
npm test
```

GUIとの統合では、実VMでの拒否後の表示・保存、エディター初期画面への遷移、
実ブラウザーのIndexedDB復元も検証します。GitHub画像の取得に失敗した場合は共通バナーを使います。

## ロールバック

ホストの `extensionSecurityBatch` をOFFにして再読込すると既存の確認経路へ戻ります。
必要なら共通依存とホストの接続差分を一体でrevertします。保存済み作品の形式は変えません。
