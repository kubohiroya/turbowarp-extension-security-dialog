# @kubohiroya/turbowarp-extension-security-dialog

作品の機能拡張をどこまで動かすかを尋ねる1つの画面と、拡張のコードが動き出す前にそれを人の前へ
出すための配線です。

[MPL-2.0](LICENSE) です。「Incompatible With Secondary Licenses」の表示を付けていないので、
GPL-3.0 で配布する大きな作品に組み込めます。TurboWarp-Plus-Editor はそうやって配信しています。

## 何を解決するか

VM は機能拡張を1つずつ読み込み、そのたびに尋ねます。作品を開くことが確認の行列になり、最後の
拡張を見る前に最初の拡張が動き出します。拡張を追加するときは二度尋ねます。一覧で選んだあとに、
同じことをもう一度訊かれます。

このパッケージは作品全体をまとめて集め、1つの問いにして、そのあとで読み込みます。

## 入口

| import | 中身 |
| --- | --- |
| `.` | カタログの読み込み、拡張自身の申告の読み取り、依存の閉包、開く人の選択の記憶、取得待ちのダイアログ、文言 |
| `./react` | 画面そのもの `ExtensionReview` |
| `./turbowarp` | VM を包んで問いを先に出す `installBatchExtensionLoader` |
| `./styles.css`、`./webpack4.css` | 画面のスタイル。後者は CSS modules 向けにクラス名を `:global()` で包んだもの |

## 画面

```jsx
import {ExtensionReview} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import '@kubohiroya/turbowarp-extension-security-dialog/styles.css';

<ExtensionReview
    mode="open"             // または "add"
    entries={entries}
    locale="ja"
    DialogFrame={HostModal} // 開くときだけ使う
    loadInfo={loadExtensionInfo}
    onComplete={decisions => {/* Map。断られたときは null */}}
/>
```

追加と開くで違うのは、一覧に何が載るかと何を選べるかだけで、問いの立て方は同じです。だから
1つの部品です。

| | `add` | `open` |
| --- | --- | --- |
| 一覧に載るもの | カタログの拡張。依存先は自動で選ばれる | 作品が使う拡張すべて |
| 選ぶ | チェックで選ぶ | 無し。作品が既に名指ししている |
| 動かし方 | サンドボックスの中で、またはサンドボックスなしで | 動かさない、サンドボックスの中で、サンドボックスなしで |
| 読み込み元 | 4つの持ち方から選ぶ | `remote-cacheable` の行で控えを残すかだけ。ほかの行は読み込み元を述べる |
| 一括指定 | 両方 | 動かし方と、断れる控えが1つでもあるときはその控え |

### 4つの持ち方

拡張のバイト列の持ち方は4つです。ローダーの Manifest・SB3 の保存形式・この画面が同じ語で呼ぶので、
ホストは両端を変換表なしでつなげます。

| 名前 | このブラウザー | 作品のファイル | 標準 TurboWarp |
| --- | --- | --- | --- |
| `remote-non-cacheable` | 何も残さない | 参照だけ | 開けない |
| `remote-cacheable` | 検証した控えを残してよい | 参照だけ | 開けない |
| `embedded-file` | 残すものが無い | バイト列を ZIP の中のファイルとして持つ | 開けない |
| `embedded-data` | 残すものが無い | バイト列を `data:` の値として持つ | **開ける** |

**4つはすべて作者の決定**で、拡張を追加したときに決まります。だから `add` は4つすべてを出し、
`open` はほとんど何も出しません。開く人に残る問いは「`remote-cacheable` の行の控えを自分の
ブラウザーに実際に残すか」だけで、しかも**断ることしかできません**。`remote-non-cacheable` は
作者が控えを禁じたということで、それを上書きして許可を書く書き方は存在しません。そのため
`loadingChoices` は行の source から選択肢を読み取り、横に対応表を置く必要がありません。source が
持ち方を名指している行はもうそのように読み込まれているので、画面は尋ねるのではなく述べます。

### しないこと

**作品を開くとき、全件がサンドボックスなしを必須と申告していれば、そのモードを選択済みにします。**
取得失敗がなく、空でない一覧のすべての申告が揃った場合だけ適用します。「動かさない」と
「サンドボックスの中で」、実行方法の一括指定は表示しません。OKで実行を承認するか、キャンセルで
中止します。OK前には実行しません。読み込み元や控えを断る選択は別に保ちます。

カタログからの追加、通常・未申告・任意指定・取得失敗が混ざる作品では、従来どおり
サンドボックスの中を既定にし、実行方法を選べます。必須の申告に反する選択は警告します。

**信頼済みの行は、尋ねずに述べます。** カタログに載っている拡張はホストの標準ギャラリーと同じ
扱いで、サンドボックスなしで動き、実行の選択肢を出しません。信頼済みの行だけの作品は止める
価値が無いので、`requiresReview` が画面を出さなくてよいと答えます。

**記録された答えは、いまも選択肢である場合だけ尊重します。** 作品が `remote-cacheable` から
埋め込みに変わった、行が信頼済みになった、といった場合に、もう提示しない答えを持ち込みません。

### 読み込みに失敗したとき

```jsx
<ExtensionReview
    /* ...上と同じ */
    failure={{code: error.code, message: error.message, retryable: isWorthAskingAgain(error)}}
    onRetry={() => loadAgain()}
/>
```

`failure` は読み込み全体の失敗で、行の一覧の上に出ます。行ごとの失敗は行の `state.error` に入れ、
こちらも同じ `retryable` を任意で持てます。どちらも同じ規則に従います。

| `retryable` | `onRetry` | 画面に出るもの |
| --- | --- | --- |
| `true` | 渡されている | コードとメッセージ、「通信の問題の可能性があります」、`onRetry` を呼ぶ **もう一度試す** ボタン |
| `true` | 渡されていない | コードとメッセージだけ |
| `false` または無し | どちらでも | コードとメッセージだけ |

`failure` を渡さなければ、これらの props が無かったときとまったく同じに描きます。
必須なのは `message` だけです。`failure={{message: '取得できませんでした'}}` なら失敗の文だけを
表示します。`code` は表示用の任意の値で、`retryable` を省略した場合はやり直しを提示しません。

公開パッケージには `dist/build-info.json` を含め、
`@kubohiroya/turbowarp-extension-security-dialog/build-info` からも参照できます。`name`、`version`、
ソースの完全な `revision`、`sourceState`（`commit` または `working-tree`）を記録します。ホスト側は
完全版を固定し、配信前に revision を照合できます。切り戻しはパッケージ版と lockfile を元に戻す
ことで行えます。新しい失敗表示だけを止める場合は、`failure` と `onRetry` を渡さないでください。

**画面はエラーコードの表を持ちません。** もう一度試して結果が変わりうるかはホストの判断で、
TurboWarp-Plus Editor ではローダーの `isWorthAskingAgain` が決め、真偽値として渡されます。コード
では決まりません。`LOAD_FAILED` は、もう一度試せば通るかもしれない通信の切断からも、何度試しても
通らない「登録した ID が違う」拡張からも出ます。後者に「もう一度試す」を出すのは、画面が裏付け
られない助言です。

## 取得を待つあいだ

```js
import {createExtensionWaitDialog} from '@kubohiroya/turbowarp-extension-security-dialog';

const wait = createExtensionWaitDialog(document, locale);
// ローダーが再試行を報告します。待ちが現実のものになった時点で show() が開きます。
const ports = createFetchPort(fetch, {onRetry: info => wait.show(info)});
// 成否どちらの経路でも hide() を呼びます。ホストが消えるときは dispose() です。
```

1つの拡張の取得が、通信のやり直しで数秒止まることがあります。そのあいだ操作全体が止まります
——どの行も検証と承認を終えるまで、1つも登録されません。だから隅ではなく画面の中央を取ります。
このあとに出る問いも同じ場所に出るので、注意を動かさずに済みます。

**閉じるボタンもキャンセルボタンもありません。** 意図的にそうしています。閉じても取得は止まらず、
途中で止めてもロールバックの実装がまだ無いので、どちらのボタンも存在しない制御を差し出すことに
なり、何も戻せない状態を作りかねません。Escape を断るのも同じ理由です。

表示は `delayMs`（既定 300ms）だけ遅れます。最短の待ちは1回のバックオフなので、0.5秒で現れて
消えるダイアログはちらつきとしか読めず、何のためでもなくフォーカスを奪います。スタイルは自前で
持ち、1つの document につき一度だけ注入します。すべてのホストが CSS のパイプラインを持っている
わけではなく、単一 HTML のランタイムやパッケージャーのページは JavaScript だけを組み立てます。

## VM への配線

```js
import {installBatchExtensionLoader} from '@kubohiroya/turbowarp-extension-security-dialog/turbowarp';
import {createDecisionStorage} from '@kubohiroya/turbowarp-extension-security-dialog';

const uninstall = installBatchExtensionLoader(vm, review, defaultURLs, createDecisionStorage(), {
    collectEntries: async project => /* ホストが持つ行。例: Plus の Manifest */ [],
    applyDecisions: decisions => /* 同じ答えからローダーの信頼とキャッシュを動かす */ {},
    identify: async project => /* このホストが作品をどう名指すか */ null
});
```

この層が自分で読み込むのは、従来のカスタム拡張だけです。ホストが集めた行は、それを取得・検証した
もの（TurboWarp-Plus-Editor ではローダー）のものなので、`collectEntries` で入って
`applyDecisions` で出ていきます。このパッケージはローダーの型もコードも参照しません。依存は
一方向で、こちらが口を定義し、ホストが実装します。

断られた場合は `onComplete` が `null` を返し、読み込みは `isExtensionSecurityCancelled` が
見分けられるエラーで止まります。ホストは拒否と不具合を取り違えません。

## 何を、どこに覚えるか

| 内容 | 場所 | 決める人 |
| --- | --- | --- |
| 4つの持ち方のどれか | 作品 | 追加した人 |
| 動かし方（追加したとき） | 作品 | 追加した人 |
| 動かし方（開いたとき） | このブラウザー、作品ごと | 開く人 |
| `remote-cacheable` の控えを実際に残すか | このブラウザー、作品ごと | 開く人。断ることだけできる |
| プレビュー画像 | このブラウザー | 誰でもない。常に残す |

保存が使えないとき（プライベートウィンドウ、サイトデータを止めたブラウザー）も、読み取りは必ず
使える値を返します。これを土台にした画面が開けなくなることはありません。

## 主張しないこと

名前・製作者・バージョン・ライセンスは、いずれも拡張が自分の先頭コメントに書いた言葉です。画面は
それを未検証の申告として示します。ここでコードを評価することはありません。プレビュー画像は装飾で、
何とも照合していません。コードを検証するのは別の場所で、失敗した行にはそう表示されます。

先頭コメントは2つの書き方を読みます。TurboWarp 本体の拡張とギャラリーが使う `// Name: ...` の行と、`/** @name ... */` のブロックです。同じ項目を両方が書いていればブロックを採ります。見出しとして読むのは先頭に続くコメント行だけで、`Bundled extensions:` で止めます。バンドルが中身について書いたことは中身のもので、バンドル自身のものではないためです。

## 開発

```sh
pnpm install
pnpm run check   # ビルド、テスト56件、pack の dry run
```

React と React DOM は peerDependencies なので、ホストが用意します。実行時の依存はありません。

## ライセンス

[MPL-2.0](LICENSE)。何が対象で何が対象外かは [NOTICE.md](./NOTICE.md) を参照してください。

0.6.0でMPL-2.0へ書き直したときの設計の記録は [書き直しの設計](docs/mpl-rewrite.ja.md) にあります。
