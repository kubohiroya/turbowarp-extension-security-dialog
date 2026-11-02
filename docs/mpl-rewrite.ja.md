# MPL-2.0での書き直しと共通の選択画面（設計）

2026-11-01時点のorigin/main（0.5.0、`0599f99`）と、それを使うscratch-guiフォーク（develop `48e659f1`）・turbowarp-extension-loader（0.1.0）を読んで作成しました。実装前の設計です。

> **この文書は実装前の設計の記録です。** 書き直しは0.6.0（#52）で入り、読み込み方式は0.7.0（#54）でturbowarp-extension-loader 0.5.0の4つの形に揃えました。今の仕様は、[turbowarp-plus-packagesの設計書](https://github.com/kubohiroya/turbowarp-plus-packages/blob/main/docs/editor-architecture.ja.md)とこのパッケージのREADMEにあります。この文書とは、次の点が違います。
>
> - 読み込み方式は「Cached・Remote・Embedded」ではなく、`remote-non-cacheable`・`remote-cacheable`（既定）・`embedded-file`・`embedded-data`の4つです。4つとも作品に記録し、決めるのは追加する人（作者）です。
> - 開く人が選べるのは、`remote-cacheable`の拡張について、控えを自分のブラウザーに残すのを断ること（ローダーの`declineCaching`）だけです。下の「CachedとRemoteの選択は、開く人のブラウザーに作品ごとに覚える」という決定（2026-11-02）は、これに置き換わりました。作品は`Manifest.uri`で見分けます。

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

これを踏まえ、このパッケージは全面的に書き直します（2026-11-01決定）。

1. 0.5.0のコードを土台にせず、この設計書を仕様として新しく実装します。0.5.0は作者の著作物なので、その振る舞いや文言を仕様として参照することは差し支えありません。
2. アイコンは、本家の画像に由来しない新しいものにします（seti-uiの`{ }`を使う場合は、MITの表示を残す）。
3. 書き直した版（0.6.0）からMPL-2.0とします。0.5.0までの版はGPL-3.0-onlyのまま残ります。

## 共通の選択画面

`ExtensionSecurityDialog`と`ExtensionSelectionList`を、1つの部品にまとめます。追加するときと開くときで違うのは、選ぶ対象の出どころと、指定できる範囲だけです。

| 項目 | 追加するとき（TurboWarp-Plus一覧） | 開くとき（作品の読み込み） |
|---|---|---|
| 表示する場所 | 「拡張機能を選ぶ」の「TurboWarp-Plus」の枠 | 作品のコードが動く前のダイアログ |
| 対象 | カタログの拡張。依存先は自動で選ぶ | 作品の拡張すべて（通常のカスタム拡張とPlus拡張を1つの一覧で） |
| 選ぶか外すか | チェックで選ぶ | なし（作品にある拡張がすべて対象） |
| 実行 | 信頼済みの拡張はサンドボックスなしで、選ばない。それ以外はサンドボックスあり・なし（拒否はチェックを外す） | 信頼済みの拡張はサンドボックスなしで、確認しない。それ以外は拒否・サンドボックスあり・なし |
| 読み込み方式 | Cached（既定）・Remote・Embedded | 参照の拡張はCached（既定）・Remote。Embeddedの拡張はEmbeddedと表示するだけ。通常のカスタム拡張は、URLかデータURLかを表示するだけ |
| 一括指定 | 実行と読み込み方式の両方 | 実行と読み込み方式の両方 |
| 状態とエラー | 読み込み済み、取得の失敗、SHA-256の不一致を行ごとに表示 | 同じ |

指定した内容は、次の場所に記録します。

| 内容 | 記録する場所 | 決める人 |
|---|---|---|
| 参照か中身か（Embeddedかどうか） | 作品（ローダーのManifest） | 追加する人（作者） |
| 実行（追加したとき） | 作品（ローダーのManifest） | 追加する人 |
| 実行（開いたとき） | ブラウザー（作品ごとの既定。今のIndexedDBの保存と同じ） | 開く人 |
| CachedかRemoteか | ブラウザー（作品ごとに覚える。作品ごとの指定がない拡張は、全体の既定Cached） | 開く人 |
| プレビュー画像（バナー・スクリーンショット） | ブラウザー（IndexedDBのキャッシュ。Cachedの拡張と同じく、初回だけ取得して使い回す） | なし（常にキャッシュする） |

### 信頼済みの拡張

TurboWarp標準環境では、TurboWarp標準ギャラリー（`extensions.turbowarp.org`）の拡張を確認なしでサンドボックスなしに読み込みます。TurboWarp-Plus環境（turbowarp-extension-loaderを組み込んだランタイム）では、それに加えて、TurboWarp-Plusダッシュボードのカタログ（`extensions-v1.json`）に掲載された拡張を同じく扱います。

- 信頼の根拠は、カタログに掲載されたURLか、掲載されたSHA-256（作品に同梱されたEmbeddedの照合用）です。カタログを読めないときは、何も信頼しません。
- 信頼済みの拡張は、選択画面の行に「信頼済み（サンドボックスなし）」と示し、実行の選択肢を出しません。作品を開くときに、信頼済みの拡張だけなら、画面そのものを出しません。
- 0.5.0を使う現在のフォークでは、scratch-gui#101で同じ扱いを先に入れています（作品を開くときの一括確認、ローダーの許可、TurboWarp Plus一覧の初期値）。書き直した版では、この判定を部品の入力として受け取ります。

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

- `mode: 'add'`のときは、選択のチェックと依存の自動選択を使います（0.5.0の`resolveExtensionSelection`と同じ振る舞い）。
- 書き直した版には、0.5.0の`ExtensionSecurityDialog`と`ExtensionSelectionList`は含めません。フォークは、新しい版へ移るまで0.5.0（GPL-3.0-only）を使い続けます。フォークはGPLなので、ライセンスの上で問題はありません。

### 作品を開くときの一括読み込み（`./turbowarp`）

0.5.0の`installBatchExtensionLoader`は、通常のカスタム拡張だけを集めます。書き直した版では、Plus拡張も同じ一覧に入れるため、ホストが追加の行を渡せるようにします。

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

1. **全面的な書き直し（0.6.0、MPL-2.0）。** この設計書を仕様として、core・共通の選択画面（`ExtensionReview`）・作品を開くときの一括読み込み（`collectEntries`と`applyDecisions`を含む）を新しく実装します。新しいアイコンに替えます。0.5.0の部品は含めません。
2. **ローダーの対応。** 拡張ごとのCachedとRemoteを受け取れるようにします（extension-loader 0.3.0。0.2.xはnpmへの移行で使いました）。
3. **Editorへの組み込み。** 家族の移行の段階3（差し込みの仕組み）の後に、plus-editorの結合モジュールから0.6.0をつなぎます。追加するとき（TurboWarp-Plusの枠）と開くときの両方を新しい画面に切り替え、フォークの`tw-plus-permission-ui.js`を削除し、フォークの0.5.0への依存を外します。

## 未決事項

なし（2026-11-02時点）。

決定済み（2026-11-02）：

- CachedとRemoteの選択は、開く人のブラウザーに作品ごとに覚える。作品ごとの指定がない拡張には、全体の既定（Cached）を使う。
- 選択画面に出すプレビュー画像（バナー・スクリーンショット）も、Cachedの拡張と同じくIndexedDBにキャッシュする。
- READMEの画像（`assets/screenshots/`）は、書き直した版の部品だけを表示したページで撮り直す。公開Editor（GPL）の画面は写さない。

決定済み（2026-11-01）：

- 0.5.0のコードを土台にせず、全面的に書き直す。
- 標準ギャラリーとTurboWarp-Plusカタログの拡張は信頼済みとし、サンドボックスなしで、実行の選択肢も確認も出さない。このため「作品に記録された実行を開く人が下げられるか」は、カタログの拡張では起きない。

## 作者の意図と違う実行方法で動かしたとき

2026-11-01に公開Editorで確かめた結果です。「サンドボックスなし：必要」と申告しているAsset Cache 0.6.1を、ローダーのManifestで「サンドボックスあり」にした作品を開きました。URLから開いた場合とファイルから開いた場合で、結果は同じです。

1. 作品を開く段階で、拡張のコードがサンドボックスの中で評価され、拡張自身が `Asset Cache must run unsandboxed.` というエラーを投げる。拡張は登録されない。
2. ローダー全体の時間切れ（30秒）で登録が中断され、ローダーは `LoaderError: Extension load failed` を呼び出し元に返す。
3. GUIは「プロジェクトを読み込めませんでした」画面に、失敗した拡張のIDと原因をすべて示し、Editorを既定の作品に戻す。作品は開かない。

画面に出る文面は次のとおりです。

```
ExtensionLoadError: Extension kubohiroyaassetcache could not be loaded, so the project was not opened.
LoaderError: Extension load failed [LOAD_FAILED]
  Error: Sandbox registration cancelled [CANCELLED]
    LoaderError: Extension load timed out [TIMEOUT]
```

3は、kubohiroya/scratch-gui#103 で直したあとの動きです。それまでは、GUIがこのエラーを処理せず、Editor全体が「うわっ! 何か問題が発生しました」のクラッシュ画面になっていました。作品もEditorも使えませんでした。

自分で確認しない拡張（サンドボックスで`Scratch.vm`などが使えないことに、ブロックを実行したときに初めて気付く拡張）では、作品は開けても、ブロックの実行時に失敗すると考えられます（この場合は確かめていません）。

カタログの拡張は信頼済みとしてサンドボックスなしで動かすので、カタログの拡張についてはこの食い違いは起きません。

書き直した版では、読み込みに失敗した拡張を、選択画面のその行にエラーとして示し、作品とほかの拡張は開けるようにします。現在のフォークの修正（#103）は、作品を開かずにEditorを使える状態に保つところまでです。1つの拡張だけを外して作品を開くには、次の2つが要ります。

- ローダーの対応：今のローダーは、作品の拡張をすべて登録するか、1つも登録しないかのどちらかで扱う。
- 保存の対応：外した拡張の記録を、保存したときに失わない仕組み。
