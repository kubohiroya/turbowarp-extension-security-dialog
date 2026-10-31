# セキュリティダイアログのウィンドウ操作

関連契約: [許可・キャンセルの境界 #18](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/18)、[表示・選択案内 #39](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/39)。2026-10-31のユーザー追加依頼に基づくローカル実装です。作業ブランチは `fix/ui/dialog-window`。ユーザーの追加承認に基づき、この差分をcommit・push・PR作成し、CI成功後にSquash Merge・Release/npm公開を行います。

共通の `ExtensionSecurityDialog` で、タイトルのドラッグ移動、四辺・四隅のリサイズ、タイトル右上の「全画面化／元のサイズに戻す」を利用できます。単体表示とホスト提供のModalに対応し、GUIやdata-editorへの依存は追加しません。

セキュリティダイアログは従来どおり閉じるボタンを非表示にします。終了はキャンセル確認を通します。移動・サイズ変更・最大化は実行許可や拒否の選択を変更せず、`onComplete` を呼びません。メタデータの取得、750msの待機、OK、拒否を含む確定、キャンセル、確認の「いいえ／はい」は既存処理を維持します。文言は既存locale契約を使用します。

通常時は一覧をスクロールし、小さくした場合は案内と一覧をまとめた領域もスクロールできます。最小サイズ360×280pxと、さらに小さい画面への補正を設け、タイトルとOK・キャンセルを操作可能に保ちます。最大化前の位置・サイズを復元し、破棄時にはポインター・画面サイズ変更の監視を解放します。

依存順は既存security UI→ウィンドウ操作・CSS→関連検証→ローカルEditor組み込みです。許可ポリシー・保存形式・ホストの既存フラグ運用は変更しません。

## 受け入れ基準

- [x] 単体・ホスト内表示でタイトル移動、四辺四隅のリサイズ、最大化・復元。
- [x] 未承認の実行・完了通知なし、選択内容の保持、拒否確認・キャンセル確認の維持。
- [x] 最小サイズと320px・390px幅で操作可能。
- [x] メタデータ到着・言語切替後も位置・選択を保持し、日英のボタン名を表示。
- [x] 破棄時の監視解除、既存のUI・配布設定テスト44件と新規ブラウザー3件の成功。

```sh
node scripts/build.mjs
node --test test/ui.test.cjs test/distribution-ui.test.cjs
node --test test/window.browser.mjs
```

## 運用ログ（2026-10-31 JST）

- start: cleanな `2ad94a5da4b1baafbd61dd167872c40af1703aa3` を基点に隔離checkoutで着手。
- blocked: ブラウザー用fixtureの必須ID配列不足と、中央寄せtransformの残存を検出し修正。
- done: 関連47件成功。ホスト組み込みには既存のwebpack 4対応CJS入口を使用し、ローカルGUIビルド成功。
- done: 実Editorで移動・リサイズ・最大化／復元・390px表示・タイトル中央揃え・選択保持・キャンセル確認を検証。未承認の拡張実行なし、ページ例外0。

## 切戻し

今回の `react.jsx`・`react.css`・`messages.js`・`dialog-window.js` の差分をまとめて戻し、共通配布物とホストを再ビルドします。許可・拒否の既存処理と作品データは保持します。

## 公開手順

branch: `fix/ui/dialog-window` / base: `main`。0.5.0として公開し、Editorは検証済み版へ固定して再公開します。新規ブラウザー3件を通常CIへ追加します。PR・main CIとReleaseの成功、npm archiveの一致、Editorの公開後UI確認をDoDとします。ロールバックはsecurity依存を0.4.0と対応する検証済みSHAへ揃えて戻し、再ビルド・再配信します。

- start: ユーザーがセキュリティダイアログのcommit・push・PR・CI後merge・公開とEditorの依存更新・再公開を明示承認。
