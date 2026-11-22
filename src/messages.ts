const messages: Record<string, Record<string, string>> = {
    en: {
        addTitle: 'Choose extensions',
        openTitle: 'Confirmation: This project wants to run extensions',
        addIntro: 'Choose what to add. Anything a chosen extension needs is selected for you.',
        openReason: 'To run this project, you need to enable the extensions listed below.',
        openIntro: 'Before the project starts, check the extensions it uses and their creators.',
        openTrust: 'Enable and run them only if you trust the creators of both the project and its extensions and judge them safe to use.',
        openIndividual: 'You can also review each extension separately before deciding.',
        allRequiredIntro: 'All extensions state that they need to run without the sandbox.',
        stop: 'Do not run',
        reviewIndividually: 'Review each extension',
        enableAll: 'Enable all and run',
        individualMode: 'Individual review mode',
        runSelected: 'Run with these choices',
        'open-execution-deny': 'Do not run',
        'open-execution-sandboxed': 'Run in the sandbox to try it out',
        'open-execution-unsandboxed': 'Trust and run without the sandbox',
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
        closeWarning: 'Close',
        'requirement-required': '⚠️ Needs to run without the sandbox',
        trusted: 'Trusted by the host: runs without the sandbox',
        plusFamily: 'TurboWarp Plus family',
        trustedNote: 'Catalog extensions are treated like TurboWarp’s own gallery and are not asked about.',
        'state-loaded': '▶️ Already running',
        'state-dependency': '🔗 Needed by {names}',
        sourceEmbedded: 'Stored in the project',
        sourceLegacy: 'A custom extension address',
        sourceInline: 'Written into the project as a data address',
        sourceListed: ' (the same code as published at {url})',
        creator: 'Creator (unverified claim)',
        creatorUnknown: 'Not stated',
        licenseUnknown: 'Not stated',
        version: 'Version',
        extensionPage: 'Extension website',
        extensionUnknown: 'Unknown extension',
        releaseNotes: 'Release notes',
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
        openTitle: '確認: この作品は機能拡張を使います',
        addIntro: '追加するものを選んでください。選んだ拡張が必要とするものは自動で選ばれます。',
        openReason: 'この作品を動かすには、以下の「機能拡張」を有効にする必要があります。',
        openIntro: '作品が動き出す前に、使用する機能拡張とその製作者を確認してください。',
        openTrust: '作品と機能拡張の製作者を信頼でき、安全に使用できると判断した場合にだけ、有効にして実行してください。',
        openIndividual: '機能拡張ごとに確認して判断することもできます。',
        allRequiredIntro: 'すべての機能拡張が「サンドボックスなし」での実行を必要と申告しています。',
        stop: '実行しない',
        reviewIndividually: '機能拡張を個別に確認',
        enableAll: 'すべて有効にして実行',
        individualMode: '個別確認モード',
        runSelected: '選んだ内容で実行',
        'open-execution-deny': '動かさない',
        'open-execution-sandboxed': '様子を見るためにサンドボックス内で動かす',
        'open-execution-unsandboxed': '信頼してサンドボックスなしで動かす',
        execution: '動かし方',
        loading: '読み込み元',
        executionBulk: 'すべての動かし方',
        loadingBulk: 'すべての読み込み元',
        'execution-deny': '動かさない',
        'execution-sandboxed': 'サンドボックスの中で',
        'execution-unsandboxed': 'サンドボックスなしで',
        'loading-remote-cacheable': 'キャッシュを残す（既定）',
        'loading-remote-non-cacheable': '毎回取得する',
        'loading-embedded-file': '作品の中から',
        'loading-embedded-data': '作品の中の data: アドレスから',
        loadingNote: 'キャッシュは検証したうえで使い回すので、通信なしでも作品が開きます。' +
            '毎回取得する場合は、このブラウザーに何も残りません。',
        unsandboxedWarning: 'サンドボックスなしの拡張は、作品・エディター・このサイトのデータに' +
            'アクセスできます。信頼できるコードにだけ選んでください。',
        closeWarning: '閉じる',
        'requirement-required': '⚠️ サンドボックスなしが必要',
        trusted: 'ホストが信頼する拡張：サンドボックスなしで動きます',
        plusFamily: 'TurboWarp Plus ファミリー',
        trustedNote: 'カタログの拡張は TurboWarp の標準ギャラリーと同じ扱いで、確認を求めません。',
        'state-loaded': '▶️ 読み込み済み',
        'state-dependency': '🔗 {names} が必要としています',
        sourceEmbedded: '作品の中にあります',
        sourceLegacy: 'カスタム拡張のアドレス',
        sourceInline: '作品の中に data: アドレスとして書かれています',
        sourceListed: '（提供元 {url} と同じコード）',
        creator: '製作者（未検証の申告）',
        creatorUnknown: '記載なし',
        licenseUnknown: '記載なし',
        version: 'バージョン',
        extensionPage: '機能拡張の紹介ページ',
        extensionUnknown: '不明な機能拡張',
        releaseNotes: 'リリースノート',
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
export const formatMessage = (locale: string | undefined, key: string, values: Record<string, string | number> = {}) => {
    const language = String(locale || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
    const template = messages[language][key] || messages.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
        (values[name] === undefined ? match : String(values[name])));
};

export {messages};
