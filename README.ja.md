# turbowarp-extension-security-dialog

[English](./README.md) | **日本語**

TurboWarpの複数の機能拡張を、1つの一覧で確認するための共通パッケージです。
関連タスクと受け入れ基準は [scratch-gui #33](https://github.com/kubohiroya/scratch-gui/issues/33) に記録しています。

## 連動するパッケージ

このパッケージは、ホストのGUIと `scratch-vm` の間に入ります。scratch-vmのソースや
`node_modules` 内の依存パッケージは書き換えません。アダプターは実行時にインスタンスの
メソッドを数個だけ包み、元に戻すための `restore()` を返します。

```mermaid
flowchart TB
    subgraph HOST["ホストアプリ"]
        FLAG["scratch-gui の起動時フラグ<br/>extensionSecurityBatch、既定OFF"]
        FRAME["ホストのダイアログ外枠と画面遷移<br/>キャンセル後は初期画面へ"]
    end

    subgraph PKG["本パッケージ"]
        ADAPTER["./turbowarp<br/>installBatchExtensionLoader"]
        UI["./react<br/>ExtensionSecurityDialog"]
        CORE["core<br/>loadExtensionInfo, preferences, messages"]
    end

    subgraph VM["scratch-vm"]
        HOOKS["vm._loadExtensions<br/>vm.loadProject, vm.clear"]
        EM["ExtensionManager<br/>getExtensionURLs"]
        SM["SecurityManager<br/>getSandboxMode"]
    end

    IDB[("IndexedDB<br/>プロジェクト別の既定値")]
    NET["拡張のソースURL<br/>GitHub raw、バナー画像"]

    FLAG -->|読み込み時に導入| ADAPTER
    FRAME -->|DialogFrame内に描画| UI
    ADAPTER <-->|包んで元に戻す| HOOKS
    ADAPTER <--> EM
    ADAPTER <--> SM
    ADAPTER -->|一覧と復元した選択| UI
    UI -->|URLとモードのMap、またはnull| ADAPTER
    UI --> CORE
    CORE -->|取得のみ、コードは実行しない| NET
    CORE <--> IDB
```

| パッケージ | 関係 |
| --- | --- |
| `scratch-vm` | 包むだけで、変更しません。`_loadExtensions` に割り込み、最初の拡張が動き出す前に**すべての**許可を決めます。`loadProject` と `clear` が1回の読み込みに範囲を限り、`getSandboxMode` はバッチ単位で固定し、`getExtensionURLs` は拒否したブロックのソースURLを保持して、保存し直しても失われないようにします。 |
| `scratch-gui` / TurboWarp Editorフォーク | ホスト側です。既定OFFの起動時フラグ、`DialogFrame` として渡すモーダルの外枠、確認済みキャンセル後のエディター初期画面への遷移を担当します。ホスト独自のセキュリティポリシーが優先されます。 |
| `react`、`react-dom` | 任意のpeer dependencyで、React UIの利用時にだけ必要です。coreとVMアダプターには不要です。 |
| `@turbowarp/jszip` | プロジェクト別の既定値のために、`sb3` から `project.json` を読み出して識別します。 |

## 表示するダイアログ

1回のプロジェクト読み込みにつき1つのダイアログで、読み込み待ちの拡張URLをすべて並べます。
各行には「拒否」「サンドボックスあり」「サンドボックスなし」の3択があり、一括選択は対応する
拡張すべてに同じ選択を適用します。見出し・一括選択・OK/キャンセルは常に見えたままで、
一覧だけがスクロールします。下図では列見出しを「あり」「なし」と省略していますが、
実際は「サンドボックスあり」「サンドボックスなし」と表示します。

```
+--------------------------------------------------------------------------+
| 機能拡張セキュリティ                                                     |
| 実行方法を選んでください（取得中でも選択できます）                       |
|                                             機能拡張の情報：2/3 件を確認 |
|                                                                          |
| 表示中のすべてに適用: [(x) 拒否] [(o) あり] [(!) なし]                   |
| そのモードに対応する拡張だけに適用します。                               |
| +----------------------------------------------------------------------+ |
| | 機能拡張                |   (x) 拒否   |   (o) あり   |   (!) なし   | |  <- この領域だけが
| +----------------------------------------------------------------------+ |     スクロールする
| | [バナー] Fetch          |     ( )      |    非対応    |     (*)      | |
| |   作者 ... | ID: fetch | ライセンス: MIT | 更新日時 ...              | |
| |   (!) この拡張はサンドボックス内では動作しません。                   | |
| |       サンドボックスなし: 動作に必要                        [ 詳細 ] | |
| +----------------------------------------------------------------------+ |
| | [バナー] Storage        |     (*)      |     ( )      |     ( )      | |
| |   メタデータを取得中…                                       [ 詳細 ] | |
| +----------------------------------------------------------------------+ |
| メタデータは作者の自己申告です。                                         |
| サンドボックスなしの拡張は、プロジェクトやブラウザーの                   |
| 情報にアクセスできます。                                                 |
| 拒否 1 · あり 0 · なし 1 · 未指定 1                                      |
|                                             [ キャンセル ]    [  OK  ]   |
+--------------------------------------------------------------------------+
```

続いて、2種類の確認ダイアログが出ることがあります。

- **読み込みのキャンセル** — 「このプロジェクトの読み込みをキャンセルし、TurboWarp Editorの
  初期画面に戻ります。キャンセルしますか？」確認済みのキャンセルだけが読み込みを中断します。
  そのVMエラーは `isExtensionSecurityCancelled(error)` で識別できます。
- **機能拡張を拒否して続行** — 「このプロジェクトの実行をする際に、作者が意図した動作を
  できない可能性があります。続行しますか？」「いいえ」なら一覧に戻り、何も保存しません。

バナーはホバーまたはキーボードフォーカスで原寸プレビューを表示します。画面より大きい画像は
プレビュー枠内をスクロールして確認できます。ソースコードを一覧内に表示するのは「詳細」だけです。

```mermaid
sequenceDiagram
    actor U as ユーザー
    participant G as ホストGUI
    participant A as アダプター
    participant D as ダイアログ
    participant V as scratch-vm

    U->>G: プロジェクトを開く
    G->>V: loadProject
    V->>A: 包まれたloadProject
    A->>A: project.jsonをSHA-256で識別
    A->>A: 保存済みの既定値を読み出す
    V->>A: 包まれた_loadExtensions
    A->>D: 読み込み待ちの全件と復元した選択
    D-->>U: 1つの一覧、個別と一括の3択、詳細
    D->>D: メタデータとバナーを非同期に取得
    U->>D: OK
    D-->>U: 拒否があるときだけ続行確認
    D->>A: URLごとに 拒否 / あり / なし のMap
    A->>V: 許可したURLをloadExtensionURL、モードはバッチ単位で固定
    A->>A: プロジェクトが開けた後にだけ既定値を保存
```

## 本来あるべき実装場所

**この機能は、本家のTurboWarp Editorで実装されているべきものです。** 信頼できない拡張コードを
どう実行するかの判断は、エディター自身のセキュリティ境界に属するもので、プロジェクト側が
後付けするべきものではありません。拡張コードが動き出す前に確認が終わっていなければならず、
ユーザーがまとめて判断できるようプロジェクト内の全拡張を一度に扱わなければならず、その結果は
保存と再読み込みをまたいで残らなければなりません。下流のパッケージにできるのは、ホストの
メソッドを実行時に包んでそこに近づけることだけです。

**作者は、このパッケージが有用なものであると信じ、その信念のもとで公開しています。** 本家が
これを満たすまでの間、どのTurboWarpホストでも既定OFFのフラグの背後で一括確認を今すぐ
導入できますし、このパッケージは、挙動・日本語と英語の文言・互換境界を示す、本家実装のための
動く参考実装にもなります。TurboWarp Editorによってこのパッケージが不要になるなら、作者は
それを喜びます。

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

## ライセンス

GPL-3.0-only です。画像の出典は [LICENSE](./LICENSE) と [NOTICE.md](./NOTICE.md) を参照してください。
