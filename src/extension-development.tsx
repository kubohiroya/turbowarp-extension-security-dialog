// SPDX-License-Identifier: MPL-2.0
import React from 'react';
import type {ComponentType} from 'react';
import type {DialogFrameProps} from './react.js';
import type {ExtensionMetadata} from './review-types.js';
import {ExtensionRow} from './extension-row.js';
import {parseExtensionMetadata} from './metadata.js';

export interface DevelopmentSourceLocation {
    file: string;
    line: number;
    column: number;
    /** The host must match this applied build before opening the source. */
    sha256: string;
}

/** A host-owned session snapshot; displaying it never authorizes or applies a build. */
export interface ExtensionDevelopmentSession {
    token: string;
    id: string;
    directory: string;
    enabled: boolean;
    mode?: 'artifact' | 'source';
    execution?: 'sandboxed' | 'unsandboxed';
    metadata?: ExtensionMetadata;
    sourceHeader?: string;
    appliedDigest?: string;
    busy?: boolean;
    removing?: boolean;
    unavailable?: boolean;
    waiting?: boolean;
    error?: string | null;
    buildError?: string | null;
    /** A digest is required for navigation; older hosts may report display-only coordinates. */
    diagnostic?: {file: string; line: number; column: number; sha256?: string} | null;
}

export interface ExtensionDevelopmentProps {
    /** Supplied by the trusted host, never inferred from a project or its metadata. */
    capabilities?: {localDevelopment: boolean; sourceBuild?: boolean};
    sessions: readonly ExtensionDevelopmentSession[];
    locale?: string;
    adding?: boolean;
    error?: string | null;
    DialogFrame?: ComponentType<DialogFrameProps>;
    onClose(): void;
    /** The host owns folder selection, session consent, validation and build isolation. */
    onAdd(mode: 'artifact' | 'source'): void;
    onCancelAdd?(): void;
    onToggle(token: string, enabled: boolean): void;
    onRemove(token: string): void;
    /** The host validates the session, build and source path again; this is not a URL. */
    onOpenSource?(token: string, location: DevelopmentSourceLocation): void;
}

const text = {
    en: {
        title: 'Extension development',
        intro: 'Automatic updates use completed builds from the folders you approved. Pause updates to keep the last applied build in your project.',
        empty: 'No development folders are connected.',
        folder: 'Development folder',
        artifact: 'Watch completed builds', source: 'Build TypeScript in Desktop',
        addArtifact: 'Connect a build folder…', addSource: 'Connect a TypeScript folder…',
        close: 'Close', cancel: 'Cancel connecting', cancelling: 'Cancelling…',
        adding: 'Selecting a folder or preparing its first build…',
        remove: 'Disconnect folder',
        enabled: 'Automatic updates enabled', paused: 'Automatic updates paused',
        unavailable: 'Development session unavailable', busy: 'Updating the development session…',
        waiting: 'Waiting for a complete, verified build.',
        applied: 'Last applied build', unapplied: 'No applied build has been reported.',
        sandboxed: 'Runs in the sandbox',
        unsandboxed: 'Runs outside the sandbox. Automatic updates execute later code changes with these permissions.',
        unknownExecution: 'Execution mode not reported',
        buildError: 'Build failed', operationError: 'Development operation failed', runtimeError: 'Runtime error',
        earlierRuntimeError: 'Runtime error from an earlier build', diagnosticBuild: 'Diagnostic build',
        unknownDiagnosticBuild: 'The build for this diagnostic has not been reported.',
        kept: 'The last applied build is retained in the project.',
        details: 'Build details', code: 'Diagnostic code', openSource: 'Open TypeScript location',
        unsafeLocation: 'Source navigation is unavailable for this location or build.'
    },
    ja: {
        title: '拡張ブロックの開発',
        intro: '承認したフォルダの完成ビルドを自動で反映します。自動更新を止めると、最後に適用したビルドを作品に保持します。',
        empty: '開発フォルダは接続されていません。',
        folder: '開発フォルダ',
        artifact: '完成したビルドを監視', source: 'Desktop で TypeScript をビルド',
        addArtifact: 'ビルドフォルダを接続…', addSource: 'TypeScript フォルダを接続…',
        close: '閉じる', cancel: '接続をキャンセル', cancelling: 'キャンセル中…',
        adding: 'フォルダの選択または最初のビルドを準備しています…',
        remove: 'フォルダの接続を解除',
        enabled: '自動更新は有効', paused: '自動更新は停止中',
        unavailable: '開発セッションは利用できません', busy: '開発セッションを更新しています…',
        waiting: '整合性を確認できる完成ビルドを待っています。',
        applied: '最後に適用したビルド', unapplied: '適用済みのビルドは報告されていません。',
        sandboxed: 'サンドボックスの中で実行',
        unsandboxed: 'サンドボックスの外で実行します。自動更新中は、その後のコード変更もこの権限で実行されます。',
        unknownExecution: '実行方式は報告されていません',
        buildError: 'ビルド失敗', operationError: '開発操作に失敗しました', runtimeError: '実行時エラー',
        earlierRuntimeError: '以前のビルドの実行時エラー', diagnosticBuild: '診断対象のビルド',
        unknownDiagnosticBuild: 'この診断に対応するビルドは報告されていません。',
        kept: '最後に適用したビルドを作品に保持しています。',
        details: 'ビルドの詳細', code: '診断コード', openSource: 'TypeScript の該当位置を開く',
        unsafeLocation: 'この位置またはビルドからはソースを開けません。'
    }
};
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** A display link is a bounded project-relative coordinate, never a file: or shell address. */
function sourceLocation(session: ExtensionDevelopmentSession): DevelopmentSourceLocation | undefined {
    const point = session.diagnostic;
    if (!point || !digest(session.appliedDigest) ||
        point.sha256 !== session.appliedDigest ||
        !/^src\/(?:[\p{L}\p{M}\p{N}_. -]+\/)*[\p{L}\p{M}\p{N}_. -]+\.(?:[cm]?[jt]s|[jt]sx)$/iu.test(point.file) ||
        point.file.split('/').some(part => part === '.' || part === '..') ||
        ![point.line, point.column].every(value => Number.isSafeInteger(value) && value > 0 && value <= 9999999)) return;
    return {file: point.file, line: point.line, column: point.column, sha256: session.appliedDigest};
}

/** Browser-safe development UI. The host retains all filesystem, consent and execution authority. */
export function ExtensionDevelopment({capabilities, sessions, locale = 'en', adding = false, error,
    DialogFrame, onClose, onAdd, onCancelAdd, onToggle, onRemove, onOpenSource}: ExtensionDevelopmentProps) {
    const [cancelling, setCancelling] = React.useState(false);
    React.useEffect(() => {if (!adding) setCancelling(false);}, [adding]);
    if (capabilities?.localDevelopment !== true) return null;
    const t = text[locale.toLowerCase().startsWith('ja') ? 'ja' : 'en'];
    const close = () => {if (!adding) onClose();};
    const body = <section className="twextsec-review twextsec-development" aria-label={t.title}>
        {!DialogFrame && <h2>{t.title}</h2>}
        <div className="twextsec-development-scroll">
            <p>{t.intro}</p>
            {error && <p className="twextsec-failed" role="alert">{error}</p>}
            {sessions.length === 0 ? <p>{t.empty}</p> : <ul className="twextsec-rows">
                {sessions.map(session => {
                    const claimed = session.metadata ?? parseExtensionMetadata(session.sourceHeader ?? '');
                    // Header comments supply descriptive text, never image URLs, permissions or family membership.
                    const metadata = {name: claimed.name, description: claimed.description, descriptions: claimed.descriptions,
                        author: claimed.author, version: claimed.version, license: claimed.license};
                    const location = sourceLocation(session);
                    const applied = digest(session.appliedDigest) ? session.appliedDigest : undefined;
                    const diagnosticDigest = digest(session.diagnostic?.sha256) ? session.diagnostic.sha256 : undefined;
                    const blocked = adding || session.busy || session.removing;
                    return <ExtensionRow key={session.token} metadata={metadata} ids={[session.id]} locale={locale}
                        previewCache={null} itemProps={{'data-session': session.token}}
                        pick={{checked: session.enabled, disabled: blocked || session.unavailable,
                            onToggle: () => onToggle(session.token, !session.enabled)}}
                        details={<div className="twextsec-development-source">
                            <span>{session.mode === 'source' ? t.source : session.mode === 'artifact' ? t.artifact : ''}</span>
                            <p>{t.folder}: <code>{session.directory}</code></p>
                            <p>{session.execution === 'sandboxed' ? t.sandboxed :
                                session.execution === 'unsandboxed' ? t.unsandboxed : t.unknownExecution}</p>
                            <p data-applied-digest={applied}>{applied ? `${t.applied}: ${applied.slice(0, 12)}` : t.unapplied}</p>
                        </div>}>
                        <p role="status">{session.unavailable ? t.unavailable : session.busy ? t.busy :
                            session.enabled ? t.enabled : t.paused}</p>
                        {session.enabled && session.waiting && <p role="status">{t.waiting}</p>}
                        {session.buildError && <p className="twextsec-failed" role="alert">
                            {t.buildError}. {applied ? t.kept : t.unapplied}
                        </p>}
                        {session.error && <p className="twextsec-failed" role="alert">{t.operationError}</p>}
                        {session.diagnostic && <div className="twextsec-failed" role="alert">
                            <p>{diagnosticDigest && diagnosticDigest !== applied ? t.earlierRuntimeError : t.runtimeError}:
                                {' '}<code>{session.diagnostic.file}:{session.diagnostic.line}:{session.diagnostic.column}</code></p>
                            <p>{diagnosticDigest ? `${t.diagnosticBuild}: ${diagnosticDigest.slice(0, 12)}` : t.unknownDiagnosticBuild}</p>
                            {onOpenSource && (location ? <button type="button" disabled={blocked || session.unavailable}
                                onClick={() => onOpenSource(session.token, location)}>{t.openSource}</button> : <p>{t.unsafeLocation}</p>)}
                        </div>}
                        {(applied || session.error || session.buildError) && <details>
                            <summary>{t.details}</summary>
                            {applied && <p>SHA-256: <code>{applied}</code></p>}
                            {session.buildError && <p>{t.code}: <code>{session.buildError}</code></p>}
                            {session.error && <p>{t.code}: <code>{session.error}</code></p>}
                        </details>}
                        <div className="twextsec-actions">
                            <button type="button" disabled={blocked} onClick={() => onRemove(session.token)}>{t.remove}</button>
                        </div>
                    </ExtensionRow>;
                })}
            </ul>}
        </div>
        {adding && <p role="status">{cancelling ? t.cancelling : t.adding}</p>}
        <div className="twextsec-actions twextsec-development-actions">
            <button type="button" disabled={adding} onClick={() => onAdd('artifact')}>{t.addArtifact}</button>
            {capabilities.sourceBuild === true && <button type="button" disabled={adding} onClick={() => onAdd('source')}>{t.addSource}</button>}
            {adding && onCancelAdd && <button type="button" disabled={cancelling} onClick={() => {
                setCancelling(true); onCancelAdd();
            }}>{t.cancel}</button>}
            <button type="button" disabled={adding} onClick={close}>{t.close}</button>
        </div>
    </section>;
    return DialogFrame ? <DialogFrame title={t.title} onCancel={close}>{body}</DialogFrame> : body;
}
