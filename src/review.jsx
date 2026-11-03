import React from 'react';
import {formatMessage} from './messages.js';
import {getExtensionDescription, unsandboxedRequirement} from './metadata.js';
import {resolveExtensionSelection} from './selection.js';
import {createPreviewCache} from './storage.js';
import {ExtensionPreview} from './preview.jsx';

/* global __SECURITY_COMMON_BANNER__ */
// A row with no picture of its own still gets one, so the list does not read as half-filled.
const fallbackBanner = __SECURITY_COMMON_BANNER__;
import {
    allRequireUnsandboxed, contradictsDeclaration, executionChoices, initialDecisions, isTrusted, loadingChoices,
    loadingModes
} from './decisions.js';

const bind = (instance, names) => names.forEach(name => {
    instance[name] = instance[name].bind(instance);
});

/** The bytes travel with the project, so there is no address to fetch from or to print. */
const isEmbedded = source => source.kind === 'embedded-file' || source.kind === 'embedded-data';

const sourceLabel = (entry, t) => {
    if (entry.source.kind === 'embedded-file') return t('sourceEmbedded');
    // A project that carries the extension itself has a data: URL for an address. Printing it
    // would put the whole bundle in the row, so say where the bytes are instead.
    if (entry.source.kind === 'embedded-data' || String(entry.source.url).startsWith('data:')) {
        return t('sourceInline');
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
const Failure = ({failure, onRetry, t}) => {
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

/** One choice among a few, as radios: every option stays readable without opening anything. */
const Choices = ({name, value, options, disabled, label, onChange, t}) => (
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
                    onChange={onChange}
                />
                {t(`${name.startsWith('loading') ? 'loading' : 'execution'}-${option}`)}
            </label>
        ))}
    </fieldset>
);

/**
 * The one screen that asks how extensions may run.
 *
 * Adding and opening differ in what is on the list and what can be chosen, not in how the
 * question is put, so they share this component. Nothing here fetches or runs an extension: the
 * host hands in rows that are already resolved, and gets back decisions. Whatever the rows say
 * about themselves — a name, an author, a version — is the extension's own claim, shown as such.
 */
export class ExtensionReview extends React.PureComponent {
    constructor (props) {
        super(props);
        bind(this, ['handleBulkExecution', 'handleBulkLoading', 'handleComplete', 'handleCancel']);
        this.state = {
            decisions: initialDecisions(props.entries, props.mode, {
                recorded: props.initialDecisions, fallbackLoading: props.fallbackLoading
            }),
            chosen: new Set(props.entries.filter(entry => entry.state && entry.state.loaded)
                .map(entry => entry.key)),
            described: new Map()
        };
        this.controller = new AbortController();
    }
    componentDidMount () {
        this.describe();
    }
    componentDidUpdate () {
        if (this.allRequired() && this.props.entries.some(entry =>
            this.state.decisions.get(entry.key).execution !== 'unsandboxed')) {
            // Late metadata can complete the batch, but never starts it without OK.
            this.setState(state => ({decisions: new Map([...state.decisions]
                .map(([key, decision]) => [key, {...decision, execution: 'unsandboxed'}]))}));
        }
    }
    componentWillUnmount () {
        this.controller.abort();
    }
    /** Read each row's own description, one at a time; a failure leaves the row as it was. */
    async describe () {
        const {loadInfo, entries} = this.props;
        if (!loadInfo) return;
        for (const entry of entries) {
            if (entry.metadata || isEmbedded(entry.source)) continue;
            try {
                const info = await loadInfo(entry.source.url, this.controller.signal);
                if (this.controller.signal.aborted) return;
                this.setState(state => ({
                    described: new Map(state.described).set(entry.key, info.metadata || {})
                }));
            } catch (error) {
                if (this.controller.signal.aborted) return;
            }
        }
    }
    t (key, values) {
        return formatMessage(this.props.locale, key, values);
    }
    metadataOf (entry) {
        return entry.metadata || this.state.described.get(entry.key) || {};
    }
    allRequired () {
        return this.props.mode === 'open' && allRequireUnsandboxed(this.props.entries.map(entry =>
            ({...entry, metadata: this.metadataOf(entry)})));
    }
    executionOptions (entry) {
        return this.allRequired() && !isTrusted(entry) ? ['unsandboxed'] : executionChoices(entry, this.props.mode);
    }
    decide (key, change) {
        const entry = this.props.entries.find(entry => entry.key === key);
        if (change.execution !== undefined && !this.executionOptions(entry).includes(change.execution)) return;
        this.setState(state => ({
            decisions: new Map(state.decisions).set(key, {...state.decisions.get(key), ...change})
        }));
    }
    handleBulkExecution (event) {
        const execution = event.target.value;
        this.setState(state => {
            const decisions = new Map(state.decisions);
            for (const entry of this.props.entries) {
                if (this.executionOptions(entry).includes(execution)) {
                    decisions.set(entry.key, {...decisions.get(entry.key), execution});
                }
            }
            return {decisions};
        });
    }
    handleBulkLoading (event) {
        const loading = event.target.value;
        this.setState(state => {
            const decisions = new Map(state.decisions);
            for (const entry of this.props.entries) {
                if (loadingChoices(entry).includes(loading)) {
                    decisions.set(entry.key, {...decisions.get(entry.key), loading});
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
    toggle (key) {
        this.setState(state => {
            const chosen = new Set(state.chosen);
            if (chosen.has(key)) chosen.delete(key);
            else chosen.add(key);
            return {chosen};
        });
    }
    renderRow (entry, selection) {
        const {mode} = this.props;
        const t = this.t.bind(this);
        const decision = this.state.decisions.get(entry.key);
        const metadata = this.metadataOf(entry);
        const executions = this.executionOptions(entry);
        const loadings = loadingChoices(entry);
        const state = mode === 'add' ? selection.stateOf(entry.key) : null;
        const required = state === 'dependency';
        const roots = required ? [...(selection.requiredBy.get(entry.key) || [])] : [];
        const failure = entry.state && entry.state.error;
        const preview = (
            <ExtensionPreview
                url={metadata.banner || fallbackBanner}
                fallback={!metadata.banner}
                name={metadata.name || entry.key}
                cache={this.props.previewCache}
                locale={this.props.locale}
            />
        );
        return (
            <li
                key={entry.key}
                className="twextsec-row"
                data-key={entry.key}
                data-failed={failure ? 'true' : undefined}
            >
                <div className="twextsec-head">
                    {mode === 'add' && (
                        <label className="twextsec-pick">
                            <input
                                type="checkbox"
                                checked={selection.selected.has(entry.key)}
                                disabled={required || state === 'loaded'}
                                onChange={() => this.toggle(entry.key)}
                            />
                            <strong>{metadata.name || entry.key}</strong>
                        </label>
                    )}
                    {mode === 'open' && <strong>{metadata.name || entry.key}</strong>}
                    {/* Without a name the heading is already the ID; saying it again adds nothing. */}
                    {metadata.name && <span className="twextsec-id">{entry.ids.join(', ')}</span>}
                    {metadata.version && <span>{t('version')} {metadata.version}</span>}
                </div>
                {/* One line: a long address is cut short here and kept whole in the tooltip. */}
                <p
                    className="twextsec-source"
                    title={sourceLabel(entry, t)}
                >{sourceLabel(entry, t)}</p>
                {entry.source.sha256 && (
                    <p className="twextsec-digest">{t('digest')} {entry.source.sha256}</p>
                )}
                {/* When adding, the icon is a larger target for the same choice as the checkbox, which
                    stays the one control a keyboard or screen reader uses. */}
                {mode === 'add' ? (
                    <span
                        className="twextsec-preview-pick"
                        aria-hidden="true"
                        onClick={required || state === 'loaded' ? undefined : () => this.toggle(entry.key)}
                    >{preview}</span>
                ) : preview}
                <p className="twextsec-about">{getExtensionDescription(metadata, this.props.locale)}</p>
                <p className="twextsec-claim">
                    {t('creator')}: {metadata.author || t('creatorUnknown')}
                </p>
                {/* Where the row stands and whether the catalog vouches for it share one line. The
                    checkbox already says chosen or not, so only the reasons it cannot be changed —
                    another extension needs it, or it is already running — are put in words. */}
                <div className="twextsec-status">
                    {(required || state === 'loaded') && <span className="twextsec-state">{required ?
                        t('state-dependency', {names: roots.join(', ')}) : t('state-loaded')}</span>}
                    {isTrusted(entry) ? <span className="twextsec-trusted">{t('trusted')}</span> : (
                        <span className="twextsec-requirement">
                            {t(`requirement-${unsandboxedRequirement(metadata)}`)}
                        </span>
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
                    {!isTrusted(entry) && (
                        <Choices
                            name={`execution-${entry.key}`}
                            label={t('execution')}
                            value={decision.execution}
                            options={executions}
                            onChange={event => this.decide(entry.key, {execution: event.target.value})}
                            t={t}
                        />
                    )}
                    {loadings.length > 0 && (
                        <Choices
                            name={`loading-${entry.key}`}
                            label={t('loading')}
                            value={decision.loading}
                            options={loadings}
                            onChange={event => this.decide(entry.key, {loading: event.target.value})}
                            t={t}
                        />
                    )}
                </div>
                {/* With nothing to choose the row still says how it loads, because that is part
                    of what the person is agreeing to run, not an omission. */}
                {loadings.length === 0 && decision.loading !== undefined && (
                    <p className="twextsec-loading-fixed">{t(`loading-${decision.loading}`)}</p>
                )}
                {contradictsDeclaration(entry, decision) && (
                    <p
                        className="twextsec-contradiction"
                        role="alert"
                    >{t('requirement-required')}</p>
                )}
            </li>
        );
    }
    render () {
        const {mode, entries, DialogFrame, failure, onRetry} = this.props;
        const t = this.t.bind(this);
        const selection = this.selection();
        const allRequired = this.allRequired();
        const anyUnsandboxed = [...this.included()]
            .some(key => this.state.decisions.get(key).execution === 'unsandboxed');
        // The bulk control offers whatever at least one row could be set to. Opening a project of
        // nothing but embedded and non-cacheable rows leaves nothing to set, and a control that
        // reaches no row would read as a choice the person does not actually have.
        const bulkLoadings = loadingModes
            .filter(mode => entries.some(entry => loadingChoices(entry).includes(mode)));
        const body = (
            <div className="twextsec-review">
                <p className="twextsec-intro">{t(mode === 'add' ? 'addIntro' : allRequired ? 'allRequiredIntro' : 'openIntro')}</p>
                {failure && (
                    <Failure
                        failure={failure}
                        onRetry={onRetry}
                        t={t}
                    />
                )}
                {(!allRequired || bulkLoadings.length > 0) && <div className="twextsec-bulk">
                    {!allRequired && <Choices
                        name="execution-all"
                        label={t('executionBulk')}
                        value={null}
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
                {anyUnsandboxed && (
                    <p
                        className="twextsec-warning"
                        role="note"
                    >{t('unsandboxedWarning')}</p>
                )}
                <ul className="twextsec-rows">
                    {entries.map(entry => this.renderRow(entry, selection))}
                </ul>
                <menu className="twextsec-actions">
                    <button
                        type="button"
                        data-testid="twextsec-cancel"
                        onClick={this.handleCancel}
                    >{t('cancel')}</button>
                    <button
                        type="button"
                        data-testid="twextsec-complete"
                        onClick={this.handleComplete}
                    >{t(mode === 'add' ? 'add' : 'ok')}</button>
                </menu>
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
}

// A preview is kept in the browser the same way a `remote-cacheable` extension is, so the second
// look at a catalog costs nothing. A host may pass its own cache, or null to keep nothing.
ExtensionReview.defaultProps = {
    locale: 'en', fallbackLoading: 'remote-cacheable', previewCache: createPreviewCache()
};

export default ExtensionReview;
