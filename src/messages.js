const messages = {
    en: {
        addTitle: 'Choose extensions',
        openTitle: 'This project wants to run extensions',
        addIntro: 'Choose what to add. Anything a chosen extension needs is selected for you.',
        openIntro: 'Decide how each one may run before the project starts. Nothing runs until you choose.',
        allRequiredIntro: 'All extensions say they need to run without the sandbox. That mode is already selected. Choose OK to run them, or Cancel to stop. Nothing runs before OK.',
        execution: 'How it runs',
        loading: 'Where it loads from',
        executionBulk: 'How they all run',
        loadingBulk: 'Where they all load from',
        'execution-deny': 'Do not run',
        'execution-sandboxed': 'In the sandbox',
        'execution-unsandboxed': 'Without the sandbox',
        'loading-remote-cacheable': 'Keep a copy (default)',
        'loading-remote-non-cacheable': 'Fetch each time',
        // The two embedded forms differ only in the carrier, which is what decides who else can
        // open the project, so the wording names the carrier and nothing else.
        'loading-embedded-file': 'In the project',
        'loading-embedded-data': 'In the project, as a data address',
        loadingNote: 'A kept copy is verified and reused, so the project opens without the network. ' +
            'Fetching each time leaves nothing in this browser.',
        unsandboxedWarning: 'Without the sandbox, an extension can reach the project, the editor ' +
            'and this site’s data. Choose it only for code you trust.',
        'requirement-required': '❓ Not in the catalog: says it needs to run without the sandbox',
        'requirement-optional': '❓ Not in the catalog: says running without the sandbox is optional',
        'requirement-not-needed': '❓ Not in the catalog: says the sandbox is fine',
        'requirement-unknown': '❓ Not in the catalog: says nothing about the sandbox',
        trusted: '📕 In the catalog: can run without the sandbox',
        trustedNote: 'Catalog extensions are treated like TurboWarp’s own gallery and are not asked about.',
        'state-loaded': '▶️ Already running',
        'state-selected': '✅ Selected',
        'state-dependency': '🔗 Needed by {names}',
        'state-unselected': '☐ Not selected',
        sourceEmbedded: 'Stored in the project',
        sourceLegacy: 'A custom extension address',
        sourceInline: 'Written into the project as a data address',
        creator: 'Creator (unverified claim)',
        creatorUnknown: 'Not stated',
        licenseUnknown: 'Not stated',
        version: 'Version',
        digest: 'SHA-256',
        failed: 'Could not be loaded',
        retryNote: 'This may be a network problem.',
        retry: 'Try again',
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
        allRequiredIntro: 'すべての機能拡張が「サンドボックスなし」を必要と申告しているため、選択済みです。「OK」で実行するか、「キャンセル」で中止してください。OKまでは実行しません。',
        execution: '動かし方',
        loading: '読み込み元',
        executionBulk: 'すべての動かし方',
        loadingBulk: 'すべての読み込み元',
        'execution-deny': '動かさない',
        'execution-sandboxed': 'サンドボックスの中で',
        'execution-unsandboxed': 'サンドボックスなしで',
        'loading-remote-cacheable': '控えを残す（既定）',
        'loading-remote-non-cacheable': '毎回取得する',
        'loading-embedded-file': '作品の中から',
        'loading-embedded-data': '作品の中の data: アドレスから',
        loadingNote: '控えは検証したうえで使い回すので、通信なしでも作品が開きます。' +
            '毎回取得する場合は、このブラウザーに何も残りません。',
        unsandboxedWarning: 'サンドボックスなしの拡張は、作品・エディター・このサイトのデータに' +
            'アクセスできます。信頼できるコードにだけ選んでください。',
        'requirement-required': '❓ カタログ記載なし：サンドボックスなしが必要と申告',
        'requirement-optional': '❓ カタログ記載なし：サンドボックスなし動作は任意と申告',
        'requirement-not-needed': '❓ カタログ記載なし：サンドボックスで動作可と申告',
        'requirement-unknown': '❓ カタログ記載なし：サンドボックスについて申告なし',
        trusted: '📕 カタログ記載あり：サンドボックスなし動作可',
        trustedNote: 'カタログの拡張は TurboWarp の標準ギャラリーと同じ扱いで、確認を求めません。',
        'state-loaded': '▶️ 読み込み済み',
        'state-selected': '✅ 選択中',
        'state-dependency': '🔗 {names} が必要としています',
        'state-unselected': '☐ 非選択',
        sourceEmbedded: '作品の中にあります',
        sourceLegacy: 'カスタム拡張のアドレス',
        sourceInline: '作品の中に data: アドレスとして書かれています',
        creator: '製作者（未検証の申告）',
        creatorUnknown: '記載なし',
        licenseUnknown: '記載なし',
        version: 'バージョン',
        digest: 'SHA-256',
        failed: '読み込めませんでした',
        retryNote: '通信の問題の可能性があります。',
        retry: 'もう一度試す',
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
