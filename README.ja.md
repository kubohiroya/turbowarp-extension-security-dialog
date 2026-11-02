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
| `.` | カタログの読み込み、拡張自身の申告の読み取り、依存の閉包、開く人の選択の記憶、文言 |
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
| 読み込み元 | 控えを残す、毎回取得する、作品の中から | 控えを残す、毎回取得する。作品に入っているバイト列は他に取得元が無い |
| 一括指定 | 両方 | 両方 |

### しないこと

**カタログが保証しない限り、何もサンドボックスの外では始まりません。** 拡張が「サンドボックス
なしが必要」と申告していても、それによって自分を外に置けるわけではありません。申告は申告として
示し、画面はサンドボックスの中から始めます。それでもサンドボックスを選ぶことはでき、警告は
出しますが**止めはしません**。

**信頼済みの行は、尋ねずに述べます。** カタログに載っている拡張はホストの標準ギャラリーと同じ
扱いで、サンドボックスなしで動き、実行の選択肢を出しません。信頼済みの行だけの作品は止める
価値が無いので、`requiresReview` が画面を出さなくてよいと答えます。

**記録された答えは、いまも選択肢である場合だけ尊重します。** 作品が参照から埋め込みに変わった、
行が信頼済みになった、といった場合に、もう提示しない答えを持ち込みません。

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
| 参照か、作品の中のバイト列か | 作品 | 追加した人 |
| 動かし方（追加したとき） | 作品 | 追加した人 |
| 動かし方（開いたとき） | このブラウザー、作品ごと | 開く人 |
| 控えを残すか毎回取得するか | このブラウザー、作品ごと | 開く人 |
| プレビュー画像 | このブラウザー | 誰でもない。常に残す |

保存が使えないとき（プライベートウィンドウ、サイトデータを止めたブラウザー）も、読み取りは必ず
使える値を返します。これを土台にした画面が開けなくなることはありません。

## 主張しないこと

名前・製作者・バージョン・ライセンスは、いずれも拡張が自分の先頭コメントに書いた言葉です。画面は
それを未検証の申告として示します。ここでコードを評価することはありません。プレビュー画像は装飾で、
何とも照合していません。コードを検証するのは別の場所で、失敗した行にはそう表示されます。

## 開発

```sh
pnpm install
pnpm run check   # ビルド、テスト36件、pack の dry run
```

React と React DOM は peerDependencies なので、ホストが用意します。実行時の依存はありません。

## ライセンス

[MPL-2.0](LICENSE)。何が対象で何が対象外かは [NOTICE.md](./NOTICE.md) を参照してください。
