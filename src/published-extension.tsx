// SPDX-License-Identifier: MPL-2.0
import React from 'react';
import type {ResourceDeclaration} from '@kubohiroya/turbowarp-extension-manifest/resources';
import {ResourceDisclosure} from './resources.js';

export interface PublishedCandidate {
    readonly distribution: {
        readonly id: string;
        readonly package: string;
        readonly version: string;
        readonly name: string;
        readonly description: string;
        readonly license: string;
        readonly execution: 'sandboxed' | 'unsandboxed';
        readonly resources: ResourceDeclaration;
    };
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly sourceURL?: string;
}

export interface PublishedExtensionPorts {
    resolve(reference: string, options: {signal: AbortSignal}): Promise<PublishedCandidate>;
    add(candidate: PublishedCandidate, options: {signal: AbortSignal}): Promise<void>;
}

interface Props extends PublishedExtensionPorts {
    locale: string;
    blocked: boolean;
    onBusyChange(busy: boolean): void;
    onAdded(id: string): void;
}

export function PublishedExtension({locale, resolve, add, blocked, onBusyChange, onAdded}: Props) {
    const t = (english: string, japanese: string) => locale.startsWith('ja') ? japanese : english;
    const [reference, setReference] = React.useState('');
    const [candidate, setCandidate] = React.useState<PublishedCandidate>();
    const [error, setError] = React.useState('');
    const [pending, setPending] = React.useState(false);
    const operation = React.useRef<AbortController | null>(null);
    React.useEffect(() => () => operation.current?.abort(), []);

    async function run(task: (signal: AbortSignal) => Promise<void>, authoring = false) {
        if (operation.current || blocked) return false;
        const controller = operation.current = new AbortController();
        setPending(true);
        setError('');
        if (authoring) onBusyChange(true);
        try {
            await task(controller.signal);
            return !controller.signal.aborted;
        } catch (failure) {
            if (!controller.signal.aborted) {
                const code = (failure as {code?: string} | null)?.code;
                const invalid = t('Enter an exact npm version or a GitHub Release tag URL.',
                    'npm の正確な版、または GitHub Release のタグ URL を入力してください。');
                const failed = authoring ? t('The extension was not added.', '拡張機能を追加できませんでした。') :
                    t('The published files could not be verified.', '公開ファイルを検証できませんでした。');
                setError(code === 'INVALID_REFERENCE' ? invalid : code ? failed + ' (' + code + ')' : failed);
            }
            return false;
        } finally {
            operation.current = null;
            if (!controller.signal.aborted) {
                setPending(false);
                if (authoring) onBusyChange(false);
            }
        }
    }

    return <section aria-label={t('Published extension', '公開済みの拡張機能')}>
        <form onSubmit={event => {
            event.preventDefault();
            setCandidate(undefined);
            void run(async signal => {
                const resolved = await resolve(reference, {signal});
                if (!signal.aborted) setCandidate(resolved);
            });
        }}>
            <label>
                {t('npm package or GitHub Release', 'npm パッケージまたは GitHub Release')}
                <input type="text" placeholder="@scope/package@1.2.3" value={reference} maxLength={512}
                    disabled={pending || blocked} onChange={event => {
                        setReference(event.target.value);
                        setCandidate(undefined);
                        setError('');
                    }} />
            </label>
            <button type="submit" disabled={pending || blocked || !reference.trim()}>{t('Inspect', '確認')}</button>
        </form>
        {error && <p role="alert">{error}</p>}
        {candidate && <div>
            <p><strong>{candidate.distribution.name}</strong> · {candidate.distribution.package}@{candidate.distribution.version}</p>
            <p>{candidate.distribution.description}</p>
            <p>{candidate.distribution.license} · {candidate.distribution.execution === 'sandboxed' ?
                t('Sandboxed', 'サンドボックス内') : t('Runs outside the sandbox', 'サンドボックス外で実行')}</p>
            <ResourceDisclosure declaration={candidate.distribution.resources} locale={locale} />
            <button type="button" disabled={pending || blocked} onClick={() => void run(signal => add(candidate, {signal}), true).then(added => {
                if (added) onAdded(candidate.distribution.id);
            })}>{t('Add published extension', '公開拡張を追加')}</button>
        </div>}
        {pending && <p role="status">{t('Working…', '処理中…')}</p>}
    </section>;
}
