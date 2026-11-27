# ギャラリー画像とPlus所属の表示

対象: [Issue #97](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/97)。ブランチ: `fix/review/gallery-images-family-badge`。base: `46f7819`。

実行を許可するホストの判定と、TurboWarp Plusの所属表示は独立しています。ホストが実行を信頼する行でも、ホスト提供カタログのIDとURL、またはIDと埋め込みコードのSHA-256が一致しなければPlusのバッジは表示しません。リモート行にハッシュがある場合はその一致も必要です。カタログが読めない場合も、既存の実行許可の判断を維持して汎用の信頼表示にします。

TurboWarp公式ギャラリーの画像は、公開メタデータのslugから組み立てたコードのURL全体と照合します。画像の取得に拡張コードの実行は不要です。画像がない場合はブランドを表さない既存の代替画像を使用します。画像解決の途中で取り消された行には、後から届いた結果を返しません。

## 受け入れ基準と検証

- [x] IDのみの一致、異なるURL・ハッシュ、カタログ取得失敗ではPlus所属を付与しない。
- [x] 既存の実行信頼、未承認コードの未実行、キャンセルを維持する。
- [x] Consoles / Temporary Variables / Textの画像が公式公開JSONと一致する（2026-11-27 JSTに読取確認）。
- [x] 画像なし・失敗時の代替表示、同一URLでも別IDなら汎用バッジ、日英・light/dark・320/390px幅を共有接続口のヘッドレスfixtureで確認する。
- [x] ビルドと関連単体30件・ヘッドレス3件が成功する。
- [ ] この修正版を依存固定した実Editor配布物での統合確認。

```sh
pnpm run build
node --test test/project-review.test.cts test/gallery-preview.test.cts test/catalog-preview.test.cts test/extension-row.test.cts test/editor-batch-review.test.cts test/editor-verified-review-names.test.cts test/catalog-resources.test.cts
node --test --test-timeout=45000 test/gallery.browser.ts
```

## 運用ログ

- 2026-11-27 JST start: 最新mainと既存修正を確認。元の作業場所の未コミット変更を保全し、独立worktreeで着手。
- blocked: 実行信頼だけで別ID・URL・ハッシュにもPlus所属が付くケースと、取消後の画像結果の返却を回帰テストで再現。
- done: 上記2件を修正し、対象テストと型検査を含むビルドが成功。
- blocked: 初回のサンドボックス内ブラウザー実行が完了せず中断。ローカルプロセスの起動権限でヘッドレス再実行し、3件成功。
- pending: 外部公開と実Editorへの依存固定は未実施。Issue全体の完了判定はその統合確認後に行う。

## 切り戻し

本ブランチの修正をrevertします。Editorに固定反映した場合は依存とlockfileを直前の版へ戻して再ビルドします。新規フラグ・許可方式・作品形式の変更はありません。
