// SPDX-License-Identifier: MPL-2.0
import React from 'react';
import {parseResourceDeclaration, RESOURCE_ICON_PATHS, RESOURCE_LABELS, resourceText} from
    '@kubohiroya/turbowarp-extension-manifest/resources';
import type {ResourceDeclaration} from '@kubohiroya/turbowarp-extension-manifest/resources';

/** Display-only author claims: opening this disclosure never opens a device or grants access. */
export function ResourceDisclosure({declaration, locale = 'en'}:
    {declaration?: ResourceDeclaration; locale?: string}) {
    const ja = /^ja(?:-|$)/i.test(locale);
    const t = (en: string, japanese: string) => ja ? japanese : en;
    let parsed: ResourceDeclaration | undefined;
    try { parsed = parseResourceDeclaration(declaration); } catch {
        return <p className="twextsec-resource-status">{t('Resource declaration unavailable', 'リソース利用の申告を読み取れません')}</p>;
    }
    if (!parsed) return <p className="twextsec-resource-status">{t('Resource use: not declared', 'リソース利用：未申告')}</p>;
    if (!parsed.resources.length) return <p className="twextsec-resource-status">{t('Resource use: none declared', 'リソース利用の申告：なし')}</p>;
    const direction = {download: t('Download', '取得'), upload: t('Upload', '送信'),
        bidirectional: t('Send and receive', '送受信')};
    return (
        <details className="twextsec-resources">
            <summary title={t('Click or press Enter to show resource details', 'クリックまたはEnterキーで利用内容を表示')}>
                <span className="twextsec-resource-heading">{t('Resource use (author declaration)', 'リソースの利用（製作者の申告）')}</span>
                <span className="twextsec-resource-chips">
                    {parsed.resources.map(item => <span className="twextsec-resource-chip" key={item.type}
                        title={resourceText(RESOURCE_LABELS[item.type], locale)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={RESOURCE_ICON_PATHS[item.type]} /></svg>
                        <span className="twextsec-resource-label">{resourceText(RESOURCE_LABELS[item.type], locale)}{item.data && ` · ${direction[item.data.direction]}`}{item.access === 'permission-request' && t(' · permission request', '・許可要求のみ')}{item.usage === 'conditional' &&
                            t(' (conditional)', '（条件付き）')}</span>
                    </span>)}
                </span>
            </summary>
            <dl>
                {parsed.resources.map(item => <div key={item.type}>
                    <dt>{resourceText(RESOURCE_LABELS[item.type], locale)} · {item.usage === 'required' ?
                        t('Used by the main feature', '主要機能で利用') : t('Conditional use', '条件付きで利用')}</dt>
                    <dd>{resourceText(item.purpose, locale)}</dd>
                    {item.condition && <dd>{t('When: ', '利用条件：')}{resourceText(item.condition, locale)}</dd>}
                    {item.access === 'permission-request' && <dd>{t('Permission request only; see the purpose above.', '許可要求のある経路です。取得後の扱いは上記の用途を確認してください。')}</dd>}
                    {item.data && <dd>{direction[item.data.direction]}：{resourceText(item.data.content, locale)}</dd>}
                    {item.via && <dd>{t('Through: ', '連携先：')}{item.via.join(', ')}</dd>}
                </div>)}
            </dl>
            <p>{t('This declaration describes use; it does not grant browser permissions.', '利用内容の申告です。ブラウザの使用許可を与えるものではありません。')}</p>
        </details>
    );
}
