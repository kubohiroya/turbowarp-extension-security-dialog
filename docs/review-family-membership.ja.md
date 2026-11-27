# ギャラリー画像とPlus所属の表示

対象: [Issue #97](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/97)。修正はPR #117でマージ済み。統合検証の追補ブランチ: `test/review/editor-gallery-integration`、base: `fe311ad`。

実行を許可するホストの判定と、TurboWarp Plusの所属表示は独立しています。ホストが実行を信頼する行でも、ホスト提供カタログのIDとURL、またはIDと埋め込みコードのSHA-256が一致しなければPlusのバッジは表示しません。リモート行にハッシュがある場合はその一致も必要です。カタログが読めない場合も、既存の実行許可の判断を維持して汎用の信頼表示にします。

TurboWarp公式ギャラリーの画像は、公開メタデータのslugから組み立てたコードのURL全体と照合します。画像の取得に拡張コードの実行は不要です。画像がない場合はブランドを表さない既存の代替画像を使用します。画像解決の途中で取り消された行には、後から届いた結果を返しません。

## 受け入れ基準と検証

- [x] IDのみの一致、異なるURL・ハッシュ、カタログ取得失敗ではPlus所属を付与しない。
- [x] 既存の実行信頼、未承認コードの未実行、キャンセルを維持する。
- [x] Consoles / Temporary Variables / Textの画像が公式公開JSONと一致する（2026-11-27 JSTに読取確認）。
- [x] 画像なし・失敗時の代替表示、同一URLでも別IDなら汎用バッジ、日英・light/dark・320/390px幅を共有接続口のヘッドレスfixtureで確認する。
- [x] ビルドと関連単体30件・ヘッドレス3件が成功する。
- [x] 最新Editorの固定GUI・VMにローカル修正版を差し込んだビルドで、実Editorのヘッドレス統合2件が成功する。
- [ ] npm公開版と製品Editorの依存固定への反映。ローカル統合成功を公開サイトへの反映済みとは扱わない。

```sh
pnpm run build
node --test test/project-review.test.cts test/gallery-preview.test.cts test/catalog-preview.test.cts test/extension-row.test.cts test/editor-batch-review.test.cts test/editor-verified-review-names.test.cts test/catalog-resources.test.cts
node --test --test-timeout=45000 test/gallery.browser.ts
```

## 実Editorでの統合確認（2026-11-28 JST）

Editor `25655d487b20630f77f61cc2397991e25f9bbe55`、その`site/source.json`が固定するGUI `60b87e2f2503206847f509285aa4de3cee3670c7`とVM `88a2c06e9deb3dd652c52c20daf4f728b387d41d`を、既存の作業場所と分離した一時worktreeで使用しました。Editorの固定依存はLoader `0.16.3`です。security-dialogは`fe311ad`を基点にした未公開ローカルビルドを、Editor既存の`TW_PLUS_SECURITY_PREVIEW_ROOT`で全公開入口へ差し込みました。Editor・GUIの製品ソースに変更はありません。

`test/editor-gallery.browser.ts`は実際のGUIモーダル・VM・IndexedDBを使い、ギャラリーとカタログのネットワークをfixtureに固定します。Consoles / Temporary Variables / Textの固有画像を、キャッシュ後のblob URLでも画像自体の寸法で識別します。Plusカタログと一致するコードだけにPlusバッジが付くこと、画像なしの汎用代替表示、日本語のキャンセルで実行ゼロ、英語・390px画面で4件の許可後実行と1件の拒否を確認しました。作品ロード後の実際の保存完了を待ってから再読込し、拒否の選択復元と再承認前の未実行も確認しています。

検証済みリビジョン・成果物ハッシュ・ケースは[検証記録](./verification/editor-gallery-20261128.json)に残します。テストは通常CIでEditorのcheckoutを要求せず、以下の環境変数を明示したときだけ実行します。未指定時のskipは検証成功には数えません。

```sh
# Build and serve the pinned Editor using its existing preview script.
TW_PLUS_SECURITY_PREVIEW_ROOT=/absolute/path/to/built/security-dialog \
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui \
node --openssl-legacy-provider scripts/local-security-preview.cts start --port 8661

# Run from the security-dialog checkout in a second terminal.
TWEXTSEC_EDITOR_URL=http://127.0.0.1:8661/ \
TWEXTSEC_EDITOR_REVISION=25655d487b20630f77f61cc2397991e25f9bbe55 \
TWEXTSEC_SECURITY_REVISION=fe311adfdfb5af2bb40d3159b7a6cd884a46f2e7 \
node --test --test-timeout=100000 test/editor-gallery.browser.ts
```

## 運用ログ

- 2026-11-27 JST start: 最新mainと既存修正を確認。元の作業場所の未コミット変更を保全し、独立worktreeで着手。
- blocked: 実行信頼だけで別ID・URL・ハッシュにもPlus所属が付くケースと、取消後の画像結果の返却を回帰テストで再現。
- done: 上記2件を修正し、対象テストと型検査を含むビルドが成功。
- blocked: 初回のサンドボックス内ブラウザー実行が完了せず中断。ローカルプロセスの起動権限でヘッドレス再実行し、3件成功。
- pending: 外部公開と実Editorへの依存固定は未実施。Issue全体の完了判定はその統合確認後に行う。
- 2026-11-28 JST start: 最新Editorと固定GUI・VMの一時環境を作成。lockfileを維持し、ローカル修正版を既存のpreview接続口へ渡す。
- blocked: 初回ビルドで必須micro:bit静的データと固定CSSの取得前提が不足。既存スクリプトのハッシュ検証付き生成とネットワーク取得で解消。
- blocked: 統合テストの想定を実際の画像キャッシュ、個別確認ボタン、注意表示の閉じる操作、IndexedDB保存完了の順序へ修正。
- done: 実Editor統合2件成功。許可・拒否・未承認時の未実行・選択復元を確認。製品公開・依存固定は未実施。

## 切り戻し

表示修正の切り戻しはPR #117をrevertします。この検証追補だけを取り消す場合は、追加テスト・検証記録と文書をrevertします。Editorに固定反映した場合は依存とlockfileを直前の版へ戻して再ビルドします。新規フラグ・許可方式・作品形式の変更はありません。
