const messages = {
    "en": {
        "title": "Extension Security",
        "intro": "Choose how to run each extension.",
        "progress": "Extension information: {done}/{total}",
        "bulk": "Apply to all listed extensions",
        "extension": "Extension",
        "deny": "Deny",
        "unsandboxed": "Without sandbox",
        "sandboxed": "With sandbox",
        "details": "Details",
        "author": "Author: {author}",
        "embedded": "Embedded in this project",
        "pending": "Getting metadata…",
        "failed": "Could not retrieve metadata",
        "required": "Requires running without sandbox",
        "note": "Metadata is provided by the author. You can choose while it loads.",
        "summary": "Deny {deny} · Without {unsandboxed} · With {sandboxed} · Unselected {unselected}",
        "cancel": "Cancel",
        "ok": "OK",
        "yes": "Yes",
        "no": "No",
        "cancelTitle": "Cancel loading",
        "cancelQuestion": "Cancel loading this project and return to the TurboWarp Editor start screen?",
        "denyTitle": "Continue with denied extensions",
        "denyQuestion": "This project may not work as its author intended when it runs. Continue?",
        "source": "Source code",
        "sourceFailed": "Could not retrieve source code.",
        "preview": "Preview for {name}",
        "warning": "Extensions without a sandbox can access your project and browser information."
    },
    "ja": {
        "title": "機能拡張セキュリティ",
        "intro": "読み込む機能拡張ごとに、実行方法を選んでください。",
        "progress": "機能拡張の情報：{done}/{total} 件を確認",
        "bulk": "表示中のすべてに適用",
        "extension": "機能拡張",
        "deny": "拒否",
        "unsandboxed": "サンドボックスなし",
        "sandboxed": "サンドボックスあり",
        "details": "詳細",
        "author": "作者 {author}",
        "embedded": "プロジェクト内に埋め込み",
        "pending": "メタデータを取得中…",
        "failed": "メタデータを取得できませんでした",
        "required": "サンドボックスなしが必要",
        "note": "メタデータは作者の自己申告です。取得中でも選択できます。",
        "summary": "拒否 {deny} · なし {unsandboxed} · あり {sandboxed} · 未指定 {unselected}",
        "cancel": "キャンセル",
        "ok": "OK",
        "yes": "はい",
        "no": "いいえ",
        "cancelTitle": "読み込みのキャンセル",
        "cancelQuestion": "このプロジェクトの読み込みをキャンセルし、TurboWarp Editorの初期画面に戻ります。キャンセルしますか？",
        "denyTitle": "機能拡張を拒否して続行",
        "denyQuestion": "このプロジェクトの実行をする際に、作者が意図した動作をできない可能性があります。続行しますか？",
        "source": "ソースコード",
        "sourceFailed": "ソースコードを取得できませんでした。",
        "preview": "{name} のプレビュー",
        "warning": "サンドボックスなしの拡張は、プロジェクトやブラウザーの情報にアクセスできます。"
    }
};
const formatMessage = (locale, key, values = {}) => {
    const language = String(locale || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
    const template = messages[language][key] || messages.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) => String(values[name] === undefined ? match : values[name]));
};
export {messages, formatMessage};
