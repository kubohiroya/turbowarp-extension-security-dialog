const messages = {
    en: {
        addTitle: 'Choose extensions',
        openTitle: 'This project wants to run extensions',
        addIntro: 'Choose what to add. Anything a chosen extension needs is selected for you.',
        openIntro: 'Decide how each one may run before the project starts. Nothing runs until you choose.',
        execution: 'How it runs',
        loading: 'Where it loads from',
        executionBulk: 'How they all run',
        loadingBulk: 'Where they all load from',
        'execution-deny': 'Do not run',
        'execution-sandboxed': 'In the sandbox',
        'execution-unsandboxed': 'Without the sandbox',
        'loading-cached': 'Keep a copy (default)',
        'loading-remote': 'Fetch each time',
        'loading-embedded': 'In the project',
        loadingNote: 'A kept copy is verified and reused, so the project opens without the network. ' +
            'Fetching each time leaves nothing in this browser.',
        unsandboxedWarning: 'Without the sandbox, an extension can reach the project, the editor ' +
            'and this site’s data. Choose it only for code you trust.',
        'requirement-required': 'Says it needs to run without the sandbox',
        'requirement-optional': 'Says the sandbox is optional',
        'requirement-not-needed': 'Says the sandbox is fine',
        'requirement-unknown': 'Says nothing about the sandbox',
        trusted: 'Listed in the catalog, so it runs without the sandbox',
        trustedNote: 'Catalog extensions are treated like TurboWarp’s own gallery and are not asked about.',
        'state-loaded': 'Already running',
        'state-selected': 'You chose it',
        'state-dependency': 'Needed by {names}',
        'state-unselected': 'Not chosen',
        sourceEmbedded: 'Stored in the project',
        sourceLegacy: 'A custom extension address',
        creator: 'Creator',
        creatorUnknown: 'Not stated',
        licenseUnknown: 'Not stated',
        version: 'Version',
        digest: 'SHA-256',
        unverified: 'The creator’s name is the extension’s own claim and is not verified.',
        failed: 'Could not be loaded',
        ok: 'OK',
        cancel: 'Cancel',
        add: 'Add',
        preview: 'Preview of {name}',
        fetchWaitTitle: 'Fetching an extension',
        fetchWaitRetry: 'Could not connect. Trying again ({attempt}/{attempts})',
        fetchWaitNote: 'This takes a few seconds. If it keeps failing, loading stops and the ' +
            'project you had open is restored.'
    },
    ja: {
        addTitle: '機能拡張を選ぶ',
        openTitle: 'この作品は機能拡張を使います',
        addIntro: '追加するものを選んでください。選んだ拡張が必要とするものは自動で選ばれます。',
        openIntro: '作品が動き出す前に、どこまで動かすかを決めてください。決めるまで何も動きません。',
        execution: '動かし方',
        loading: '読み込み元',
        executionBulk: 'すべての動かし方',
        loadingBulk: 'すべての読み込み元',
        'execution-deny': '動かさない',
        'execution-sandboxed': 'サンドボックスの中で',
        'execution-unsandboxed': 'サンドボックスなしで',
        'loading-cached': '控えを残す（既定）',
        'loading-remote': '毎回取得する',
        'loading-embedded': '作品の中から',
        loadingNote: '控えは検証したうえで使い回すので、通信なしでも作品が開きます。' +
            '毎回取得する場合は、このブラウザーに何も残りません。',
        unsandboxedWarning: 'サンドボックスなしの拡張は、作品・エディター・このサイトのデータに' +
            'アクセスできます。信頼できるコードにだけ選んでください。',
        'requirement-required': 'サンドボックスなしが必要と申告しています',
        'requirement-optional': 'サンドボックスは任意と申告しています',
        'requirement-not-needed': 'サンドボックスで問題ないと申告しています',
        'requirement-unknown': 'サンドボックスについて申告がありません',
        trusted: 'カタログに掲載されているので、サンドボックスなしで動きます',
        trustedNote: 'カタログの拡張は TurboWarp の標準ギャラリーと同じ扱いで、確認を求めません。',
        'state-loaded': '読み込み済み',
        'state-selected': '選択しました',
        'state-dependency': '{names} が必要としています',
        'state-unselected': '選んでいません',
        sourceEmbedded: '作品の中にあります',
        sourceLegacy: 'カスタム拡張のアドレス',
        creator: '製作者',
        creatorUnknown: '記載なし',
        licenseUnknown: '記載なし',
        version: 'バージョン',
        digest: 'SHA-256',
        unverified: '製作者名は拡張自身の申告で、検証していません。',
        failed: '読み込めませんでした',
        ok: 'OK',
        cancel: 'キャンセル',
        add: '追加',
        preview: '{name} のプレビュー',
        fetchWaitTitle: '機能拡張を取得しています',
        fetchWaitRetry: '接続できませんでした。再試行しています（{attempt}/{attempts}）',
        fetchWaitNote: '数秒で終わります。それでも取得できない場合は読み込みを中止し、' +
            '開いていた作品に戻します。'
    }
};

/**
 * The wording for one key, in the reader's language.
 *
 * A missing key falls back to English rather than disappearing, and a missing English key reads
 * as the key itself, so a gap shows up as something a reader can report instead of blank space.
 * @param {string} locale The reader's locale; only the language is used.
 * @param {string} key The wording to look up.
 * @param {object} [values] Names to put into the `{placeholders}`.
 * @returns {string} The wording, with placeholders filled in.
 */
export const formatMessage = (locale, key, values = {}) => {
    const language = String(locale || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
    const template = messages[language][key] || messages.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
        (values[name] === undefined ? match : String(values[name])));
};

export {messages};
