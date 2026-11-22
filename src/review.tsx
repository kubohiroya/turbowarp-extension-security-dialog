import type {ExtensionReviewProps} from './react.js';
import type {ExecutionDecision, ExtensionMetadata, LoadingMode, ReviewDecision, ReviewEntry,
    ReviewFailure, ReviewSource} from './review-types.js';
import type {ExtensionSelection} from './selection.js';

type Translate = (key: string, values?: Record<string, string | number>) => string;
type Choice = ExecutionDecision | LoadingMode;
interface ReviewState {
    decisions: Map<string, ReviewDecision>;
    chosen: Set<string>;
    described: Map<string, ExtensionMetadata>;
    individual: boolean;
}
import React from 'react';
import {formatMessage} from './messages.js';
import {loadExtensionInfo, unsandboxedRequirement} from './metadata.js';
import {readInlineExtensionName} from './inline-name.js';
import {resolveExtensionSelection} from './selection.js';
import {createPreviewCache} from './storage.js';
import {ExtensionRow} from './extension-row.js';
import {createGalleryPreviewResolver} from './gallery-preview.js';

import {
    allRequireUnsandboxed, contradictsDeclaration, executionChoices, initialDecisions, isTrusted, loadingChoices,
    loadingModes
} from './decisions.js';

/** The bytes travel with the project, so there is no address to fetch from or to print. */
const isEmbedded = (source: ReviewSource): source is Extract<ReviewSource, {kind: 'embedded-file' | 'embedded-data'}> => source.kind === 'embedded-file' || source.kind === 'embedded-data';

const sourceLabel = (entry: ReviewEntry, t: Translate) => {
    // Bytes carried by the project have no address of their own. When the host's catalog vouched
    // for their digest, its address for the same bytes says where they are published.
    const listed = (label: string) => entry.state?.listedURL ?
        `${label}${t('sourceListed', {url: entry.state.listedURL})}` : label;
    if (entry.source.kind === 'embedded-file') return listed(t('sourceEmbedded'));
    // A project that carries the extension itself has a data: URL for an address. Printing it
    // would put the whole bundle in the row, so say where the bytes are instead.
    if (entry.source.kind === 'embedded-data' || String(entry.source.url).startsWith('data:')) {
        return listed(t('sourceInline'));
    }
    if (entry.source.kind === 'legacy') return `${t('sourceLegacy')}: ${entry.source.url}`;
    return entry.source.url;
};

/**
 * What went wrong, and — only when asking again could change the outcome — a way to ask again.
 *
 * Whether a failure is worth retrying is the host's call, made with the Loader's own judgement and
 * passed in as a boolean. This screen keeps no table of error codes: the same code can come from a
 * dropped connection and from a forged extension, and only the cause behind it tells them apart.
 * Offering "try again" for a failure that will fail the same way every time would be advice the
 * screen cannot back, so without `retryable` the failure is stated and nothing more.
 */
const Failure = ({failure, onRetry, t}: {failure: ReviewFailure; onRetry?: () => void; t: Translate}) => {
    const retry = failure.retryable === true && typeof onRetry === 'function';
    return (
        <div
            className="twextsec-failed"
            role="alert"
        >
            <p>{t('failed')}: {failure.code && `${failure.code} `}{failure.message}</p>
            {retry && <p className="twextsec-retry-note">{t('retryNote')}</p>}
            {retry && (
                <button
                    type="button"
                    className="twextsec-retry"
                    data-testid="twextsec-retry"
                    onClick={() => onRetry()}
                >{t('retry')}</button>
            )}
        </div>
    );
};

const choiceIcons: Partial<Record<Choice, string>> = {
    sandboxed: '🛡️',
    unsandboxed: '⚠️',
    'remote-cacheable': '💼',
    'remote-non-cacheable': '⬇️',
    'embedded-file': '🥡',
    'embedded-data': '📦'
};

/** Icons reinforce the visible label without changing its accessible name. */
const ChoiceLabel = ({kind, option, t}: {kind: string; option: Choice; t: Translate}) => (
    <span className="twextsec-choice-label">
        {choiceIcons[option] && (
            <span className="twextsec-choice-icon" aria-hidden="true">{choiceIcons[option]}</span>
        )}
        <span>{t(`${kind}-${option}`)}</span>
    </span>
);

/** Dismiss for this continuous warning; selecting unsandboxed again shows a fresh notice. */
const UnsandboxedWarning = ({t}: {t: Translate}) => {
    const [dismissed, setDismissed] = React.useState(false);
    const returnFocus = React.useRef<Element | null>(null);
    React.useEffect(() => {
        returnFocus.current = document.activeElement;
    }, []);
    if (dismissed) return null;
    return (
        <aside className="twextsec-warning">
            <span role="status">{t('unsandboxedWarning')}</span>
            <button
                type="button"
                className="twextsec-warning-close"
                onClick={() => {
                    if (returnFocus.current && returnFocus.current.isConnected &&
                        "focus" in returnFocus.current && typeof returnFocus.current.focus === "function") {
                        returnFocus.current.focus({preventScroll: true});
                    }
                    setDismissed(true);
                }}
            >{t('closeWarning')}</button>
        </aside>
    );
};

/** One choice among a few, as radios: every option stays readable without opening anything. */
const Choices = <T extends Choice>({name, value, options, disabled, label, onChange, t}: {
    name: string; value: T | null | undefined; options: T[]; disabled?: boolean;
    label: string; onChange: (option: T) => void; t: Translate;
}) => (
    <fieldset className="twextsec-choice">
        <legend>{label}</legend>
        {options.map(option => (
            <label key={option}>
                <input
                    type="radio"
                    name={name}
                    value={option}
                    checked={value === option}
                    disabled={disabled}
                    onChange={() => onChange(option)}
                />
                <ChoiceLabel kind={name.startsWith('loading') ? 'loading' : 'execution'} option={option} t={t} />
            </label>
        ))}
    </fieldset>
);

/** Pressed buttons make the mutually exclusive execution choices visible without radio icons. */
const ExecutionButtons = ({value, options, onChange, t}: {
    value: ExecutionDecision; options: ExecutionDecision[];
    onChange: (option: ExecutionDecision) => void; t: Translate;
}) => (
    <div className="twextsec-execution" role="group" aria-label={t('execution')}>
        {(['deny', 'sandboxed', 'unsandboxed'] as const).map(option => (
            <button
                key={option}
                type="button"
                data-execution={option}
                aria-pressed={value === option}
                disabled={!options.includes(option)}
                onClick={() => onChange(option)}
                onKeyDown={event => {
                    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (!keys.includes(event.key)) return;
                    event.preventDefault();
                    const buttons = Array.from(event.currentTarget.parentElement!
                        .querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                    const index = buttons.indexOf(event.currentTarget);
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                        (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                    buttons[next].focus();
                    buttons[next].click();
                }}
            >{t(`open-execution-${option}`)}</button>
        ))}
    </div>
);

/**
 * The one screen that asks how extensions may run.
 *
 * Adding and opening differ in what is on the list and what can be chosen, not in how the
 * question is put, so they share this component. The screen can read a description before the
 * host runs any code. The host hands in rows and gets back decisions. Whatever the rows say
 * about themselves — a name, an author, a version — is the extension's own claim, shown as such.
 */
export class ExtensionReview extends React.PureComponent<ExtensionReviewProps, ReviewState> {
    private readonly controller: AbortController;
    constructor (props: ExtensionReviewProps) {
        super(props);
        this.handleBulkExecution = this.handleBulkExecution.bind(this);
        this.handleBulkLoading = this.handleBulkLoading.bind(this);
        this.handleComplete = this.handleComplete.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleEnableAll = this.handleEnableAll.bind(this);
        this.state = {
            decisions: initialDecisions(props.entries, props.mode, {
                recorded: props.initialDecisions, fallbackLoading: props.fallbackLoading
            }),
            chosen: new Set(props.entries.filter(entry => entry.state && entry.state.loaded)
                .map(entry => entry.key)),
            described: new Map(),
            individual: false
        };
        this.controller = new AbortController();
    }
    componentDidMount () {
        this.describe();
    }
    componentWillUnmount () {
        this.controller.abort();
    }
    /** Read descriptions and gallery pictures independently; neither blocks the person's answer. */
    async describe () {
        const {loadInfo, loadPreview, entries} = this.props;
        const galleryPreview = createGalleryPreviewResolver();
        await Promise.all(entries.map(async entry => {
            const picture = !entry.metadata?.banner ? Promise.resolve()
                .then(() => loadPreview?.(entry, this.controller.signal))
                .catch(() => undefined)
                .then(banner => banner || ('url' in entry.source ? galleryPreview(entry.source.url, this.controller.signal) : undefined))
                .then(banner => {
                if (!banner || this.controller.signal.aborted) return;
                this.setState(state => {
                    const metadata = state.described.get(entry.key) || {};
                    return {described: new Map(state.described).set(entry.key, {
                        ...metadata, banner: metadata.banner || banner
                    })};
                });
            }) : Promise.resolve();
            const describeSource = async () => {
                if (isEmbedded(entry.source)) return;
                const {url} = entry.source;
                const inline = entry.source.kind === 'legacy' && url.startsWith('data:');
                const read = loadInfo ?? (inline ? loadExtensionInfo : undefined);
                // Partial host metadata must not hide the source's own name and description.
                if (!read) return;
                try {
                    const info = await read(url, this.controller.signal);
                    if (this.controller.signal.aborted) return;
                    const metadata = info.metadata || {};
                    const name = inline && !metadata.name?.trim() ? readInlineExtensionName(info.source, entry.ids) : undefined;
                    this.setState(state => ({
                        described: new Map(state.described).set(entry.key, {
                            ...state.described.get(entry.key), ...metadata, ...(name ? {name} : {})
                        })
                    }));
                } catch {
                    // A missing source description must not hide a gallery image or block review.
                }
            };
            await Promise.all([picture, describeSource()]);
        }));
    }
    t (key: string, values?: Record<string, string | number>) {
        return formatMessage(this.props.locale, key, values);
    }
    metadataOf (entry: ReviewEntry) {
        const described = this.state.described.get(entry.key);
        if (!described) return entry.metadata || {};
        return {...described, ...entry.metadata, name: entry.metadata?.name?.trim() || described.name};
    }
    allRequired () {
        return this.props.mode === 'open' && allRequireUnsandboxed(this.props.entries.map(entry =>
            ({...entry, metadata: this.metadataOf(entry)})));
    }
    executionOptions (entry: ReviewEntry): ExecutionDecision[] {
        return executionChoices(entry, this.props.mode);
    }
    decide (key: string, change: Partial<ReviewDecision>) {
        const entry = this.props.entries.find(entry => entry.key === key);
        if (!entry || (change.execution !== undefined && !this.executionOptions(entry).includes(change.execution))) return;
        this.setState(state => ({
            decisions: new Map(state.decisions).set(key, {...state.decisions.get(key)!, ...change})
        }));
    }
    handleBulkExecution (execution: ExecutionDecision) {
        this.setState(state => {
            const decisions = new Map(state.decisions);
            for (const entry of this.props.entries) {
                if (this.executionOptions(entry).includes(execution)) {
                    decisions.set(entry.key, {...decisions.get(entry.key)!, execution});
                }
            }
            return {decisions};
        });
    }
    handleBulkLoading (loading: LoadingMode) {
        this.setState(state => {
            const decisions = new Map(state.decisions);
            for (const entry of this.props.entries) {
                if (loadingChoices(entry).includes(loading)) {
                    decisions.set(entry.key, {...decisions.get(entry.key)!, loading});
                }
            }
            return {decisions};
        });
    }
    handleComplete () {
        const included = this.included();
        this.props.onComplete(new Map([...this.state.decisions]
            .filter(([key]) => included.has(key))));
    }
    handleEnableAll () {
        // Explicit consent applies to the whole batch; merely showing the controls grants nothing.
        this.setState(state => ({decisions: new Map([...state.decisions].map(([key, decision]) =>
            [key, {...decision, execution: 'unsandboxed' as const}]))}), this.handleComplete);
    }
    handleCancel () {
        this.props.onComplete(null);
    }
    /** Which rows the answer covers: everything when opening, the closed selection when adding. */
    included () {
        if (this.props.mode === 'open') return new Set(this.props.entries.map(entry => entry.key));
        return this.selection().selected;
    }
    selection () {
        const entries = this.props.entries.map(entry => ({
            id: entry.key, dependencies: entry.dependencies || []
        }));
        const loaded = this.props.entries
            .filter(entry => entry.state && entry.state.loaded).map(entry => entry.key);
        return resolveExtensionSelection(entries, this.state.chosen, loaded);
    }
    toggle (key: string) {
        this.setState(state => {
            const chosen = new Set(state.chosen);
            if (chosen.has(key)) chosen.delete(key);
            else chosen.add(key);
            return {chosen};
        });
    }
    renderRow (entry: ReviewEntry, selection: ExtensionSelection) {
        const {mode} = this.props;
        const t = this.t.bind(this);
        const decision = this.state.decisions.get(entry.key)!;
        const metadata = this.metadataOf(entry);
        const executions = this.executionOptions(entry);
        const loadings = loadingChoices(entry);
        const state = mode === 'add' ? selection.stateOf(entry.key) : null;
        const required = state === 'dependency';
        const roots = required ? [...(selection.requiredBy.get(entry.key) || [])] : [];
        const failure = entry.state && entry.state.error;
        return (
            <ExtensionRow
                key={entry.key}
                metadata={metadata}
                ids={entry.ids}
                locale={this.props.locale}
                trusted={isTrusted(entry)}
                plusFamily={entry.state?.plusFamily === true}
                previewCache={this.props.previewCache}
                itemProps={{'data-key': entry.key, 'data-failed': failure ? 'true' : undefined}}
                pick={mode === 'add' ? {
                    checked: selection.selected.has(entry.key),
                    disabled: required || state === 'loaded',
                    onToggle: () => this.toggle(entry.key)
                } : undefined}
                details={<>
                    {/* One line: a long address is cut short here and kept whole in the tooltip. */}
                    <p
                        className="twextsec-source"
                        title={sourceLabel(entry, t)}
                    >{sourceLabel(entry, t)}</p>
                    {'sha256' in entry.source && entry.source.sha256 && (
                        <p className="twextsec-digest">{t('digest')} {entry.source.sha256}</p>
                    )}
                </>}
            >
                {/* The checkbox already says chosen or not, so only the reasons it cannot be changed —
                    another extension needs it, or it is already running — are put in words. The one
                    mark beside them is the warning for an extension that says it must leave the
                    sandbox, trusted or not; one that can run inside it carries none. */}
                <div className="twextsec-status">
                    {(required || state === 'loaded') && <span className="twextsec-state">{required ?
                        t('state-dependency', {names: roots.join(', ')}) : t('state-loaded')}</span>}
                    {unsandboxedRequirement(metadata) === 'required' && (
                        <span className="twextsec-requirement">{t('requirement-required')}</span>
                    )}
                </div>
                {failure && (
                    <Failure
                        failure={failure}
                        onRetry={this.props.onRetry}
                        t={t}
                    />
                )}
                <div className="twextsec-choices">
                    {mode === 'open' && this.state.individual && !isTrusted(entry) && (
                        <ExecutionButtons
                            value={decision.execution}
                            options={executions}
                            onChange={execution => this.decide(entry.key, {execution})}
                            t={t}
                        />
                    )}
                    {mode === 'add' && !isTrusted(entry) && (
                        <Choices
                            name={`execution-${entry.key}`}
                            label={t('execution')}
                            value={decision.execution}
                            options={executions}
                            onChange={execution => this.decide(entry.key, {execution})}
                            t={t}
                        />
                    )}
                    {loadings.length > 0 && (mode === 'add' || this.state.individual) && (
                        <Choices
                            name={`loading-${entry.key}`}
                            label={t('loading')}
                            value={decision.loading}
                            options={loadings}
                            onChange={loading => this.decide(entry.key, {loading})}
                            t={t}
                        />
                    )}
                </div>
                {/* With nothing to choose the row still says how it loads, because that is part
                    of what the person is agreeing to run, not an omission. */}
                {(loadings.length === 0 || (mode === 'open' && !this.state.individual)) && decision.loading !== undefined && (
                    <p className="twextsec-loading-fixed"><ChoiceLabel kind="loading" option={decision.loading} t={t} /></p>
                )}
                {(mode === 'add' || this.state.individual) && contradictsDeclaration(entry, decision) && (
                    <p
                        className="twextsec-contradiction"
                        role="alert"
                    >{t('requirement-required')}</p>
                )}
            </ExtensionRow>
        );
    }
    render () {
        const {mode, entries, DialogFrame, failure, onRetry} = this.props;
        const t = this.t.bind(this);
        const selection = this.selection();
        const allRequired = this.allRequired();
        const rowExecutions = entries.filter(entry => !isTrusted(entry))
            .map(entry => this.state.decisions.get(entry.key)?.execution);
        const bulkExecution = rowExecutions.every(execution => execution === rowExecutions[0]) ?
            rowExecutions[0] : undefined;
        const anyUnsandboxed = [...this.included()]
            .some(key => this.state.decisions.get(key)!.execution === 'unsandboxed');
        // The bulk control offers whatever at least one row could be set to. Opening a project of
        // nothing but embedded and non-cacheable rows leaves nothing to set, and a control that
        // reaches no row would read as a choice the person does not actually have.
        const bulkLoadings = loadingModes
            .filter(mode => entries.some(entry => loadingChoices(entry).includes(mode)));
        const content = (
            <React.Fragment>
                {mode === 'add' ? <p className="twextsec-intro">{t('addIntro')}</p> : <>
                    <p className="twextsec-intro">{t('openReason')}</p>
                    <p className="twextsec-intro">{t('openIntro')} {t('openTrust')}</p>
                    <p className="twextsec-intro">{t('unsandboxedWarning')}</p>
                    <p className="twextsec-intro">{t('openIndividual')}</p>
                    {allRequired && <p className="twextsec-note">{t('allRequiredIntro')}</p>}
                    <menu className="twextsec-actions twextsec-open-actions">
                        <button type="button" data-testid="twextsec-cancel" onClick={this.handleCancel}>{t('stop')}</button>
                        <button type="button" data-testid="twextsec-individual"
                            aria-expanded={this.state.individual}
                            aria-pressed={this.state.individual}
                            disabled={this.state.individual}
                            onClick={() => this.setState({individual: true})}>{t('reviewIndividually')}</button>
                        <button type="button" data-testid="twextsec-enable-all"
                            onClick={this.handleEnableAll}>{t('enableAll')}</button>
                    </menu>
                    {this.state.individual && <p className="twextsec-individual-heading" role="status">{t('individualMode')}</p>}
                </>}
                {failure && (
                    <Failure
                        failure={failure}
                        onRetry={onRetry}
                        t={t}
                    />
                )}
                {(mode === 'add' || this.state.individual) && ((mode === 'add' && !allRequired) || bulkLoadings.length > 0) && <div className="twextsec-bulk">
                    {mode === 'add' && !allRequired && <Choices
                        name="execution-all"
                        label={t('executionBulk')}
                        value={bulkExecution}
                        options={mode === 'add' ? ['sandboxed', 'unsandboxed'] :
                            ['deny', 'sandboxed', 'unsandboxed']}
                        onChange={this.handleBulkExecution}
                        t={t}
                    />}
                    {bulkLoadings.length > 0 && (
                        <React.Fragment>
                            <Choices
                                name="loading-all"
                                label={t('loadingBulk')}
                                value={null}
                                options={bulkLoadings}
                                onChange={this.handleBulkLoading}
                                t={t}
                            />
                            <p className="twextsec-note">{t('loadingNote')}</p>
                        </React.Fragment>
                    )}
                </div>}
                <ul className="twextsec-rows">
                    {entries.map(entry => this.renderRow(entry, selection))}
                </ul>
            </React.Fragment>
        );
        const body = (
            <div className="twextsec-review" data-mode={mode} data-individual={this.state.individual}>
                {mode === 'add' ? <div className="twextsec-scroll">{content}</div> : content}
                {anyUnsandboxed && (mode === 'add' || this.state.individual) && <UnsandboxedWarning t={t} />}
                {(mode === 'add' || this.state.individual) && <menu className="twextsec-actions">
                    {mode === 'add' && <button
                        type="button"
                        data-testid="twextsec-cancel"
                        onClick={this.handleCancel}
                    >{t('cancel')}</button>}
                    <button
                        type="button"
                        data-testid="twextsec-complete"
                        onClick={this.handleComplete}
                    >{t(mode === 'add' ? 'add' : 'runSelected')}</button>
                </menu>}
            </div>
        );
        if (mode === 'open' && DialogFrame) {
            return (
                <DialogFrame
                    title={t('openTitle')}
                    onCancel={this.handleCancel}
                >{body}</DialogFrame>
            );
        }
        return body;
    }

    static defaultProps = {
        locale: 'en', fallbackLoading: 'remote-cacheable' as const, previewCache: createPreviewCache()
    };
}

// A preview is kept in the browser the same way a `remote-cacheable` extension is, so the second
// look at a catalog costs nothing. A host may pass its own cache, or null to keep nothing.

export default ExtensionReview;
