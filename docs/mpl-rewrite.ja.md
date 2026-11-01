# MPL-2.0での書き直しと共通の選択画面（設計）

2026-11-01時点のorigin/main（0.5.0、`0599f99`）と、それを使うscratch-guiフォーク（develop `48e659f1`）・turbowarp-extension-loader（0.1.0）を読んで作成しました。実装前の設計です。

家族全体の方針は [turbowarp-plus-packagesの設計書](https://github.com/kubohiroya/turbowarp-plus-packages/blob/main/docs/editor-architecture.ja.md) にあります。この文書は、そのうちこのパッケージが受け持つ部分を具体化します。

## 目的

1. ライセンスをGPL-3.0-onlyからMPL-2.0に変え、本家（TurboWarpのscratch-gui）に由来する要素を含まないようにする。
2. 開発者が拡張を追加するときと、開発や再生のために作品を開くときで、同じ選択画面を出す。
3. その画面で、実行（拒否・サンドボックスあり・サンドボックスなし）と、読み込み方式（Cached・Remote・Embedded）を指定できるようにする。
4. 拡張の許可や検証のための画面を、この選択画面のほかに置かない。

## 現状

### 構成

| 入口 | 中身 |
|---|---|
| `.`（core） | メタデータの取得（コードは実行しない）、プレビュー画像の候補、作品ごとの選択の保存（IndexedDB）、カタログの読み込みと依存の解決、文言 |
| `./react` | `ExtensionSecurityDialog`（作品を開くときの一括画面）、`ExtensionSelectionList`（カタログから選ぶ一覧） |
| `./turbowarp` | `installBatchExtensionLoader`。VMのインスタンスのメソッドを実行時に包み、作品のすべての拡張について、コードが動く前にまとめて選ばせる |

### 使われ方（3つの経路と3つの画面）

| 場面 | 経路 | 出る画面 |
|---|---|---|
| 作品を開く（通常のカスタム拡張、`extensionURLs`） | `./turbowarp` の一括読み込み → `ExtensionSecurityDialog` | 一括画面（このパッケージ） |
| 作品を開く（Plus拡張、ローダーのManifest） | ローダー → 信頼の判定 → フォークの`tw-plus-permission-ui.js` | 拡張ごとの許可画面（フォーク独自）。Editorの画面が出る前に1つずつ出る |
| TurboWarp-Plus一覧から追加する | `ExtensionSelectionList`（配布方式つき） → ローダーの`configure` → 信頼の判定 → `tw-plus-permission-ui.js` | 一覧で選んだ後に、拡張ごとの許可画面がもう一度出る |

問題は次のとおりです。

- 同じ判断（この拡張をどう動かすか）を、3種類の画面で求めている。追加するときは、一覧で選んだ後に同じことをもう一度尋ねている。
- Plus拡張を開くときの画面は一括ではなく、実行方法を選べず、読み込み方式も選べない。
- 読み込み方式の選択肢がEmbeddedとRemoteで、既定がRemote。キャッシュはページを閉じると消えるメモリ上のものだけ。

## 由来の確認とライセンス

- コミットの作成者は31件すべてHiroya Kuboです。
- 本家のセキュリティ画面の文言（例：「Unsandboxed extensions can corrupt your project」）は含まれていません。コードを写した記録や痕跡もありませんでした。
- 本家に由来するのは、アイコン`assets/common.svg`です。TurboWarpの「カスタム拡張機能」の画像（`src/lib/libraries/extensions/custom/custom.svg`、GPL）を正方形に切り抜いたものです。`{ }`の文字だけはseti-ui（MIT、`NOTICE.md`に記載）に由来します。
- `assets/screenshots/`は公開Editorの画面を撮ったものです。npmパッケージには含めていません（`files`に入っていない）。

このため、ライセンスの変更に必要な作業は次のとおりです。

1. アイコンを、本家の画像に由来しない新しいものに差し替える（seti-uiの`{ }`を使う場合は、MITの表示を残す）。
2. `package.json`の`license`と`LICENSE`をMPL-2.0にし、READMEの記載を直す。
3. 0.5.0までの版はGPL-3.0-onlyのまま残る。MPL-2.0は、次の版（0.6.0）から適用する。

## 共通の選択画面

`ExtensionSecurityDialog`と`ExtensionSelectionList`を、1つの部品にまとめます。追加するときと開くときで違うのは、選ぶ対象の出どころと、指定できる範囲だけです。

| 項目 | 追加するとき（TurboWarp-Plus一覧） | 開くとき（作品の読み込み） |
|---|---|---|
| 表示する場所 | 「拡張機能を選ぶ」の「TurboWarp-Plus」の枠 | 作品のコードが動く前のダイアログ |
| 対象 | カタログの拡張。依存先は自動で選ぶ | 作品の拡張すべて（通常のカスタム拡張とPlus拡張を1つの一覧で） |
| 選ぶか外すか | チェックで選ぶ | なし（作品にある拡張がすべて対象） |
| 実行 | サンドボックスあり・なし（拒否はチェックを外す） | 拒否・サンドボックスあり・なし |
| 読み込み方式 | Cached（既定）・Remote・Embedded | 参照の拡張はCached（既定）・Remote。Embeddedの拡張はEmbeddedと表示するだけ。通常のカスタム拡張は、URLかデータURLかを表示するだけ |
| 一括指定 | 実行と読み込み方式の両方 | 実行と読み込み方式の両方 |
| 状態とエラー | 読み込み済み、取得の失敗、SHA-256の不一致を行ごとに表示 | 同じ |

指定した内容は、次の場所に記録します。

| 内容 | 記録する場所 | 決める人 |
|---|---|---|
| 参照か中身か（Embeddedかどうか） | 作品（ローダーのManifest） | 追加する人（作者） |
| 実行（追加したとき） | 作品（ローダーのManifest） | 追加する人 |
| 実行（開いたとき） | ブラウザー（作品ごとの既定。今のIndexedDBの保存と同じ） | 開く人 |
| CachedかRemoteか | ブラウザー（作品ごとの既定と、全体の既定Cached） | 開く人 |

この画面のほかに、拡張の許可や検証のための画面は置きません。フォークの`tw-plus-permission-ui.js`（拡張ごとの許可画面と、右上の「拡張の検証・許可」）は、この画面に置き換えて廃止します。ローダーによるSHA-256の照合は、画面を持たない内部の確認として毎回行い、失敗した拡張は読み込まずに、この画面の行に結果を示します。

## API（案）

### 部品

```ts
type ExecutionDecision = 'deny' | 'sandboxed' | 'unsandboxed';
type LoadingMode = 'cached' | 'remote' | 'embedded';

interface ReviewEntry {
  key: string;                       // 行の識別子（拡張IDまたはURL）
  ids: string[];
  metadata?: ExtensionMetadata;      // 今のcoreの型をそのまま使う
  source:
    | {kind: 'catalog'; url: string}                          // 追加するとき
    | {kind: 'reference'; url: string; sha256: string}        // 作品のPlus拡張（参照）
    | {kind: 'embedded'; sha256: string}                      // 作品のPlus拡張（中身）
    | {kind: 'legacy'; url: string};                          // 通常のカスタム拡張
  requestedExecution?: 'sandboxed' | 'unsandboxed';           // 作品に記録された実行
  dependencies?: string[];
  state?: {loaded?: boolean; error?: {code: string; message: string}};
}

interface ReviewDecision {
  execution: ExecutionDecision;
  loading?: LoadingMode;             // legacyでは持たない
}

interface ExtensionReviewProps {
  mode: 'add' | 'open';
  entries: ReviewEntry[];
  initialDecisions?: ReadonlyMap<string, ReviewDecision>;
  locale?: string;
  DialogFrame?: React.ComponentType<DialogFrameProps>;      // openのときだけ使う
  loadInfo?: (url: string, signal: AbortSignal) => Promise<ExtensionInfo>;
  onComplete(decisions: Map<string, ReviewDecision> | null): void;
}
```

- `mode: 'add'`のときは、選択のチェックと依存の自動選択（今の`resolveExtensionSelection`）を使います。
- 0.6.xでは、今の`ExtensionSecurityDialog`と`ExtensionSelectionList`を、この部品を使う薄い受け渡しとして残します。フォークが新しい部品に移った後に削除します。

### 作品を開くときの一括読み込み（`./turbowarp`）

今の`installBatchExtensionLoader`は、通常のカスタム拡張だけを集めます。Plus拡張も同じ一覧に入れるため、ホストが追加の行を渡せるようにします。

```ts
installBatchExtensionLoader(vm, review, defaultURLs, storage, {
  // 作品を読み込み始めたときに、ローダーのManifestから行を作って返す
  collectEntries?: (project) => Promise<ReviewEntry[]>,
  // 一括画面の結果を、ローダーの信頼の判定とキャッシュの方針へ渡す
  applyDecisions?: (decisions: Map<string, ReviewDecision>) => void
});
```

ローダーのManifestを読むのはホスト（plus-editorの結合モジュール）です。このパッケージは、ローダーの型をimportせずに、`ReviewEntry`と`ReviewDecision`だけで受け渡します。

## ローダーとホストとの分担

| 受け持ち | 内容 |
|---|---|
| このパッケージ | 共通の選択画面、作品を開くときの一括読み込み、開く人の選択の保存 |
| extension-loader | 取得・SHA-256の照合・登録。信頼の判定は、`session-trust`の`requestApproval`に渡された関数の答えに従う（画面を持たない）。拡張ごとにCachedかRemoteかを受け取れるようにする（今のキャッシュの口はSHA-256しか受け取らないため、ローダー側の変更が要る） |
| plus-editorの結合モジュール | IndexedDBのキャッシュを作ってローダーに渡す。選択画面の結果から`requestApproval`を作る。作品を開くときに、ローダーのManifestから行を作って`collectEntries`に渡す |
| scratch-guiフォーク | TurboWarp-Plusの枠と、作品を開くときの確認を、差し込み口として呼ぶフックだけ |

## 進め方

1. **ライセンスの変更（0.6.0）。** アイコンを差し替え、MPL-2.0を宣言します。画面とAPIは変えません。
2. **共通の選択画面（0.7.0）。** `ExtensionReview`を加え、読み込み方式の列（Cached・Remote・Embedded）を足します。今の2つの部品は、新しい部品を使う受け渡しにします。
3. **ローダーの対応。** 拡張ごとのCachedとRemoteを受け取れるようにします（extension-loader 0.2.0）。
4. **作品を開くときの一本化。** `collectEntries`と`applyDecisions`を加えます。家族の移行の段階3（差し込みの仕組み）の後に、plus-editorの結合モジュールからつなぎ、フォークの`tw-plus-permission-ui.js`を削除します。
5. **古い部品の削除。** フォークが新しい部品に移った後、受け渡しの`ExtensionSecurityDialog`と`ExtensionSelectionList`を削除します。

## 未決事項

1. **コードを書き直すか、宣言を変えるか。** 由来の確認では、本家に由来するのはアイコンだけでした。コードは作者が書いたもので、宣言を変えるだけでMPL-2.0にできる見込みです。全面的に書き直す必要があるかを決めます（推奨：アイコンの差し替えと宣言の変更にとどめ、画面の作り直しは共通の選択画面の作業で行う）。
2. **開く人が実行を下げられるか。** 作品に「サンドボックスなし」と記録されたPlus拡張を、開く人が「サンドボックスあり」に下げて動かせるようにするか。拡張が「サンドボックスなし：必要」と申告している場合は、下げると動かない。
3. **CachedとRemoteの既定の持ち方。** 作品ごとに覚えるか、ブラウザー全体の既定だけにするか。
4. **画面の撮影画像の扱い。** `assets/screenshots/`は公開Editor（GPL）の画面を撮ったものです。npmパッケージには含めていませんが、リポジトリに置き続けるか、READMEの画像を撮り直すかを決めます。
