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
        readonly bundle?: {readonly sha256: string};
    };
    readonly source?: {readonly provider: 'npm'} | {
        readonly provider: 'github'; readonly repository: string; readonly tag: string; readonly commit: string;
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
    allowReferenceAliases?: boolean;
    onBusyChange(busy: boolean): void;
    onAdded(id: string): void;
}

export function PublishedExtension({locale, resolve, add, blocked, allowReferenceAliases = false, onBusyChange, onAdded}: Props) {
    const t = (english: string, japanese: string) => locale.startsWith('ja') ? japanese : english;
    const [reference, setReference] = React.useState('');
    const [candidate, setCandidate] = React.useState<PublishedCandidate>();
    const [error, setError] = React.useState('');
    const [phase, setPhase] = React.useState<'idle' | 'working' | 'cancelling'>('idle');
    const operation = React.useRef<AbortController | null>(null);
    const mounted = React.useRef(true);
    React.useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            operation.current?.abort();
        };
    }, []);
    const pending = phase !== 'idle';

    function cancel() {
        if (!operation.current || operation.current.signal.aborted) return;
        setPhase('cancelling');
        operation.current.abort();
    }

    async function run(task: (signal: AbortSignal) => Promise<void>, authoring = false) {
        if (operation.current || blocked) return false;
        const controller = operation.current = new AbortController();
        setPhase('working');
        setError('');
        onBusyChange(true);
        try {
            await task(controller.signal);
            return mounted.current && !controller.signal.aborted;
        } catch (failure) {
            if (mounted.current && !controller.signal.aborted) {
                const code = (failure as {code?: string} | null)?.code;
                const invalid = allowReferenceAliases ?
                    t('Enter an npm package or a GitHub repository or Release URL.',
                        'npm パッケージ、GitHub リポジトリ、または Release の URL を入力してください。') :
                    t('Enter an exact npm version or a GitHub Release tag URL.',
                        'npm の正確な版、または GitHub Release のタグ URL を入力してください。');
                const failed = authoring ? t('The extension was not added.', '拡張機能を追加できませんでした。') :
                    t('The published files could not be verified.', '公開ファイルを検証できませんでした。');
                setError(code === 'INVALID_REFERENCE' ? invalid : code ? failed + ' (' + code + ')' : failed);
            }
            return false;
        } finally {
            operation.current = null;
            if (mounted.current) {
                setPhase('idle');
                onBusyChange(false);
            }
        }
    }

    return <section aria-label={t('Published extension', '公開済みの拡張機能')}>
        <form onSubmit={event => {
            event.preventDefault();
            void run(async signal => {
                setCandidate(undefined);
                const resolved = await resolve(reference, {signal});
                if (mounted.current && !signal.aborted) setCandidate(resolved);
            });
        }}>
            <label>
                {allowReferenceAliases ?
                    t('npm package or GitHub repository / Release', 'npm パッケージまたは GitHub リポジトリ・Release') :
                    t('npm package or GitHub Release', 'npm パッケージまたは GitHub Release')}
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
            {candidate.source?.provider === 'github' && <p>GitHub: {candidate.source.repository} · {candidate.source.tag}</p>}
            <p>{candidate.distribution.description}</p>
            <p>{candidate.distribution.license} · {candidate.distribution.execution === 'sandboxed' ?
                t('Sandboxed', 'サンドボックス内') : t('Runs outside the sandbox', 'サンドボックス外で実行')}</p>
            <ResourceDisclosure declaration={candidate.distribution.resources} locale={locale} />
            {(candidate.distribution.bundle || candidate.source?.provider === 'github') && <details>
                <summary>{t('Verified artifact details', '検証済み成果物の詳細')}</summary>
                {candidate.source?.provider === 'github' && <p>Commit: <code>{candidate.source.commit}</code></p>}
                {candidate.distribution.bundle && <p>SHA-256: <code>{candidate.distribution.bundle.sha256}</code></p>}
            </details>}
            <button type="button" disabled={pending || blocked} onClick={() => void run(signal => add(candidate, {signal}), true).then(added => {
                if (added) onAdded(candidate.distribution.id);
            })}>{t('Add published extension', '公開拡張を追加')}</button>
        </div>}
        {pending && <>
            <p role="status">{phase === 'cancelling' ?
                t('Cancelling…', 'キャンセル中…') : t('Working…', '処理中…')}</p>
            <button type="button" disabled={phase === 'cancelling'} onClick={cancel}>{t('Cancel', 'キャンセル')}</button>
        </>}
    </section>;
}
