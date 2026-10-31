import React from 'react';
import {loadExtensionInfo, getExtensionDescription} from './info.js';
import PackageDescription, {PackageRequirement, getPackagePreviewCandidates, requiresUnsandboxed, resolveSharedPackageMetadata}
    from './package-description.jsx';
import PackageSections from './package-sections.jsx';
import {formatMessage} from './messages.js';
import styles from './style-names.js';
import {resolveExtensionSelection} from './selection.js';
import {attachSecurityDialogWindow} from './dialog-window.js';
const bindAll = (instance, names) => names.forEach(name => {instance[name] = instance[name].bind(instance);});

const MODES = ['deny', 'sandboxed', 'unsandboxed'];
const EXECUTION_MODES = ['sandboxed', 'unsandboxed'];
const DISTRIBUTIONS = ['embedded', 'remote'];
const entryIds = entry => entry.id ? [entry.id] : entry.ids || [];
const initialValue = (values, entry) => {
    for (const key of [...(entry.id ? [entry.id] : []), entry.url, ...(entry.ids || [])]) {
        const value = values instanceof Map ? values.get(key) : values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
        if (value !== undefined) return value;
    }
    return undefined;
};
const isModeAllowed = (mode, metadata) => MODES.includes(mode) &&
    (!requiresUnsandboxed(metadata) || mode === 'unsandboxed');
const allRequireUnsandboxed = (entries, rows) => entries.length > 0 && entries.every(entry => {
    const row = rows[entry.url];
    return row && row.status === 'ready' && requiresUnsandboxed(resolveSharedPackageMetadata(entry, row.metadata));
});

const ModeIcon = ({mode}) => (
    <svg
        className={styles.modeIcon}
        data-mode={mode}
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
    >
        {mode === 'deny' ? (
            <React.Fragment><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></React.Fragment>
        ) : mode === 'sandboxed' ? (
            <path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        ) : (
            <React.Fragment><path d="M12 3L2 21h20zM12 9v5" /><circle cx="12" cy="17" r="0.5" /></React.Fragment>
        )}
    </svg>
);

const SelectionIcon = ({state}) => (
    <svg className={styles.selectionIcon} viewBox="0 0 20 20" width="16" height="16"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false">
        {state === 'dependency' ? (
            <React.Fragment><path d="M8 6l2-2a4 4 0 015 5l-2 2M12 14l-2 2a4 4 0 01-5-5l2-2M7 13l6-6" /></React.Fragment>
        ) : state === 'loaded' ? (
            <React.Fragment><rect x="2" y="2" width="16" height="16" rx="3" /><path d="M5 10l3 3 7-7" /></React.Fragment>
        ) : (
            <React.Fragment><circle cx="10" cy="10" r="8" />
                {state === 'selected' && <path d="M6 10l3 3 5-6" />}</React.Fragment>
        )}
    </svg>
);


class ExtensionSecurityDialog extends React.Component {
    constructor (props) {
        super(props);
        const choices = {};
        const distributions = {};
        for (const entry of props.entries) {
            const mode = initialValue(props.initialChoices, entry);
            if (isModeAllowed(mode, resolveSharedPackageMetadata(entry))) choices[entry.url] = mode;
            const distribution = initialValue(props.initialDistributions, entry);
            distributions[entry.url] = DISTRIBUTIONS.includes(distribution) ? distribution : 'remote';
        }
        this.state = {choices, distributions, rows: {}, confirmation: null, ready: false};
        this.requests = new Map();
        this.controllers = new Set();
        this.timeouts = new Set();
        this.alive = false;
        bindAll(this, ['handleChoice', 'handleBulk', 'handleImageError', 'handleOK',
            'handleCancel', 'handleNo', 'handleYes', 'handleRequestClose', 'focusNo',
            'handleDistribution', 'handleBulkDistribution', 'handleWindowAnchor']);
    }
    componentDidMount () {
        this.alive = true;
        this.mountWindow();
        this.delay(() => this.setState({ready: true}));
        this.startRequests();
    }
    componentDidUpdate (previousProps) {
        this.mountWindow();
        this.initializeEntries(previousProps);
        this.startRequests();
        const {entries} = this.props;
        if (allRequireUnsandboxed(entries, this.state.rows) &&
            entries.some(entry => this.state.choices[entry.url] !== 'unsandboxed')) {
            // Preset the sole supported mode; execution still requires the user's OK.
            this.setState(previous => ({choices: Object.assign({}, previous.choices,
                Object.fromEntries(entries.map(entry => [entry.url, 'unsandboxed'])))}));
        }
    }
    componentWillUnmount () {
        this.alive = false;
        this.windowControls?.dispose();
        this.controllers.forEach(controller => controller.abort());
        this.timeouts.forEach(timeout => clearTimeout(timeout));
    }
    handleWindowAnchor (node) {
        if (node) {
            this.windowAnchor = node;
            if (this.alive) this.mountWindow();
        }
    }
    mountWindow () {
        const labels = {maximize: this.t('maximize'), restore: this.t('restoreWindow')};
        if (!this.windowControls && this.windowAnchor) {
            this.windowControls = attachSecurityDialogWindow(this.windowAnchor, labels);
        }
        this.windowControls?.updateLabels(labels);
    }
    delay (callback, duration = 750) {
        const timeout = setTimeout(() => {
            this.timeouts.delete(timeout);
            if (this.alive) callback();
        }, duration);
        this.timeouts.add(timeout);
        return timeout;
    }
    startRequests () {
        for (const entry of this.props.entries) {
            if (this.requests.has(entry.url)) continue;
            const controller = new AbortController();
            this.controllers.add(controller);
            const timeout = this.delay(() => controller.abort(), 15000);
            const request = Promise.resolve().then(() => this.props.loadInfo(entry.url, controller.signal))
                .then(result => ({metadata: result.metadata}));
            this.requests.set(entry.url, request);
            request.then(result => {
                if (this.alive) {
                    this.setState(previous => {
                        const choices = {...previous.choices};
                        const invalidated = Boolean(choices[entry.url] &&
                            !isModeAllowed(choices[entry.url], resolveSharedPackageMetadata(entry, result.metadata)));
                        // Clear incompatible choices before applying any batch defaults.
                        if (invalidated) delete choices[entry.url];
                        return {choices, rows: {
                            ...previous.rows,
                            [entry.url]: {
                                ...previous.rows[entry.url], metadata: result.metadata, status: 'ready',
                                previewIndex: 0, invalidated
                            }
                        }};
                    });
                }
            }, () => {
                if (this.alive) {
                    this.setState(previous => ({rows: {
                        ...previous.rows, [entry.url]: {...previous.rows[entry.url], status: 'failed'}
                    }}));
                }
            }).then(() => {
                clearTimeout(timeout);
                this.timeouts.delete(timeout);
                this.controllers.delete(controller);
            });
        }
    }
    t (key, values) {
        return formatMessage(this.props.locale, key, values);
    }
    initializeEntries (previousProps) {
        if (previousProps.entries === this.props.entries) return;
        const previousURLs = new Set(previousProps.entries.map(entry => entry.url));
        const added = this.props.entries.filter(entry => !previousURLs.has(entry.url));
        if (!added.length) return;
        this.setState(previous => {
            const choices = {...previous.choices};
            const distributions = {...previous.distributions};
            for (const entry of added) {
                const restored = initialValue(this.props.initialChoices, entry);
                const actualLoadedMode = this.props.enableDistribution && this instanceof ExtensionSelectionList &&
                    this.props.loadedIds.includes(entry.id) && this.executionModes().includes(restored);
                if (actualLoadedMode || this.canChoose(entry, restored, previous)) choices[entry.url] = restored;
                else if (this.props.enableDistribution && this instanceof ExtensionSelectionList &&
                    requiresUnsandboxed(resolveSharedPackageMetadata(entry))) choices[entry.url] = 'unsandboxed';
                const distribution = initialValue(this.props.initialDistributions, entry);
                distributions[entry.url] = DISTRIBUTIONS.includes(distribution) ? distribution : 'remote';
            }
            return {choices, distributions};
        });
    }
    entryForEvent (event) {
        return this.props.entries[Number(event.currentTarget.dataset.index)];
    }
    executionModes () {
        return MODES;
    }
    canConfigureEntry () {
        return true;
    }
    canChoose (entry, mode, state = this.state) {
        if (this.props.enableDistribution && mode === 'deny' && (this.props.loadedIds || []).includes(entry.id)) return false;
        return isModeAllowed(mode, resolveSharedPackageMetadata(entry, (state.rows[entry.url] || {}).metadata));
    }
    selectionReady () {
        return this.props.entries.every(entry => {
            const mode = this.state.choices[entry.url];
            const row = this.state.rows[entry.url] || {};
            // Even denial must wait: a late requirement may invalidate the choice.
            return this.canChoose(entry, mode) &&
                (row.status === 'ready' || row.status === 'failed');
        });
    }
    handleChoice (event) {
        if (this.props.busy) return;
        const entry = this.entryForEvent(event);
        const mode = event.currentTarget.value;
        if (!entry || !this.canConfigureEntry(entry)) return;
        this.setState(previous => this.canChoose(entry, mode, previous) ?
            {choices: {...previous.choices, [entry.url]: mode}} : null);
    }
    handleBulk (event) {
        if (this.props.busy) return;
        const mode = event.currentTarget.value;
        if (!this.executionModes().includes(mode)) return;
        this.setState(previous => ({choices: Object.assign({}, previous.choices,
            Object.fromEntries(this.props.entries.filter(entry => this.canChoose(entry, mode, previous))
                .map(entry => [entry.url, mode])))}));
    }
    handleDistribution (event) {
        if (this.props.busy) return;
        const entry = this.entryForEvent(event);
        const distribution = event.currentTarget.value;
        if (entry && this.canConfigureEntry(entry) && DISTRIBUTIONS.includes(distribution)) {
            this.setState(previous => ({distributions: {...previous.distributions, [entry.url]: distribution}}));
        }
    }
    handleBulkDistribution (event) {
        if (this.props.busy) return;
        const distribution = event.currentTarget.value;
        if (!DISTRIBUTIONS.includes(distribution)) return;
        // Bulk distribution deliberately includes rows hidden by the search filter.
        this.setState(previous => ({distributions: Object.assign({}, previous.distributions,
            Object.fromEntries(this.props.entries.map(entry => [entry.url, distribution])))}));
    }
    settings (entries = this.props.entries) {
        const distributions = new Map();
        for (const entry of entries) {
            for (const id of entryIds(entry)) distributions.set(id, this.state.distributions[entry.url] || 'remote');
        }
        return {entries, distributions, choices: new Map(entries.filter(entry =>
            this.executionModes().includes(this.state.choices[entry.url])).map(entry => [entry.url, this.state.choices[entry.url]]))};
    }
    renderDistributionBulk () {
        if (!this.props.enableDistribution) return null;
        return <div className={styles.bulk} data-testid="extension-distribution-bulk">
            <span>{this.t('distributionBulk')}</span>
            {DISTRIBUTIONS.map(distribution => <button type="button" key={distribution}
                value={distribution} data-distribution={distribution} disabled={this.props.busy}
                onClick={this.handleBulkDistribution}>{this.t(`distribution-${distribution}`)}</button>)}
            <div className={styles.bulkNote}>{this.t('distributionNote')}</div>
        </div>;
    }
    handleImageError (event) {
        const entry = this.entryForEvent(event);
        const failedURL = event.currentTarget.getAttribute('src');
        this.setState(previous => {
            const row = previous.rows[entry.url] || {};
            const candidates = getPackagePreviewCandidates(entry, resolveSharedPackageMetadata(entry, row.metadata));
            const index = row.previewIndex || 0;
            if (candidates[index] !== failedURL || index >= candidates.length - 1) return null;
            return {rows: {...previous.rows, [entry.url]: {...row, previewIndex: index + 1}}};
        });
    }
    confirm (confirmation) {
        this.setState({confirmation, ready: false});
        this.delay(() => this.setState({ready: true}));
    }
    handleOK () {
        if (!this.state.ready || !this.selectionReady()) return;
        if (this.props.entries.some(entry => this.state.choices[entry.url] === 'deny')) this.confirm('deny');
        else this.complete();
    }
    handleCancel () {
        this.confirm('cancel');
    }
    handleNo () {
        this.setState({confirmation: null, ready: true});
    }
    handleYes () {
        if (!this.state.ready) return;
        if (this.state.confirmation === 'cancel') this.props.onComplete(null);
        else this.complete();
    }
    handleRequestClose () {
        if (this.state.confirmation) this.handleNo();
        else this.handleCancel();
    }
    complete () {
        if (!this.selectionReady()) {
            this.setState({confirmation: null});
            return;
        }
        const decisions = new Map(this.props.entries.map(entry => [entry.url, this.state.choices[entry.url]]));
        if (this.props.enableDistribution) this.props.onComplete(decisions, this.settings());
        else this.props.onComplete(decisions);
    }
    focusNo (element) {
        if (element) element.focus();
    }
    renderRow (entry, index, selection) {
        const controlsDisabled = this.props.busy || Boolean(selection && !selection.checked);
        const row = selection ? {...this.state.rows[entry.url], metadata: entry.metadata, status: 'ready'} :
            this.state.rows[entry.url] || {};
        const metadata = row.metadata || {};
        const sharedMetadata = resolveSharedPackageMetadata(entry, row.metadata);
        const required = requiresUnsandboxed(sharedMetadata);
        const idPrefix = selection ? 'selection-extension' : 'security-extension';
        const reasonId = `${idPrefix}-mode-reason-${index}`;
        const requiredId = `${idPrefix}-mode-required-${index}`;
        const name = metadata.name || entry.ids.join(', ');
        let origin = this.t('embedded');
        let sourceURL = null;
        try {
            const url = new URL(entry.url);
            if (url.protocol !== 'data:') origin = url.host || entry.url;
            if (['https:', 'http:'].includes(url.protocol)) sourceURL = url.href;
        } catch (e) {
            origin = entry.url;
        }
        const sourceLink = sourceURL ? (
            <a className={styles.sourceLink} href={sourceURL}
                target="_blank" rel="noopener noreferrer">{sourceURL}</a>
        ) : origin;
        return (
            <article className={styles.row} key={entry.url}
                data-extension-id={entryIds(entry).join(',')}
                data-distribution={this.props.enableDistribution ? this.state.distributions[entry.url] || 'remote' : undefined}
                data-selection-state={selection ? selection.state : undefined}>
                <div className={styles.rowMain}>
                    <div className={styles.packageColumn}>
                        <PackageDescription entry={entry} metadata={metadata} sharedMetadata={sharedMetadata}
                            locale={this.props.locale} index={index} idPrefix={idPrefix}
                            requirementId={reasonId}
                            showRequirement={Boolean(selection)}
                            previewIndex={row.previewIndex} status={row.status} onImageError={this.handleImageError}
                            linkCreator={Boolean(selection || (metadata.author && metadata.authorURL))}
                            showMissingMetadata={Boolean(selection)}
                            documentation={Boolean(selection || metadata.docsURL)}
                            provenance={!selection && <div className={styles.secondary}>{sourceLink}</div>}>
                            {selection && <div className={styles.selectionStatus}>
                                <span className={styles.selectionBadge} id={`${idPrefix}-state-${index}`}>
                                    <SelectionIcon state={selection.state} />{this.t(`${selection.state}State`)}
                                </span>
                                {selection.dependencyReason && <span className={styles.selectionReason}
                                    id={`${idPrefix}-reason-${index}`}>{selection.dependencyReason}</span>}
                            </div>}
                        </PackageDescription>
                        {!selection && row.invalidated && !this.state.choices[entry.url] &&
                            <div className={styles.packageNotices}>
                                <div className={styles.warningText} role="status">{this.t('choiceReset')}</div>
                            </div>}
                    </div>
                    {(!selection || this.props.enableDistribution) && <div className={styles.rowControls}
                        aria-disabled={controlsDisabled}>
                    <div className={styles.securityModes} role="group" aria-label={this.t('executionMode')}>
                        {!selection && <PackageRequirement metadata={sharedMetadata} locale={this.props.locale} id={reasonId} />}
                        {this.executionModes().map(mode => (
                            <label
                                className={styles.choice}
                                key={mode}
                                data-mode={mode}
                                aria-disabled={controlsDisabled || !this.canChoose(entry, mode)}
                                title={!this.canChoose(entry, mode) ? this.t('requiredToRun') : undefined}
                            >
                                <span className={styles.choiceControl}>
                                    <input
                                        type="radio"
                                        name={`${selection ? 'selection-' : ''}extension-security-${index}`}
                                        value={mode}
                                        checked={this.state.choices[entry.url] === mode}
                                        aria-label={`${name}: ${this.t(mode)}`}
                                        aria-describedby={!this.canChoose(entry, mode) ? reasonId :
                                            required && mode === 'unsandboxed' ? requiredId : undefined}
                                        disabled={controlsDisabled || !this.canChoose(entry, mode)}
                                        data-index={index}
                                        onChange={this.handleChoice}
                                    />
                                    <ModeIcon mode={mode} />
                                </span>
                                <span className={this.props.enableDistribution ? styles.inlineModeLabel : styles.mobileLabel}>{this.t(mode)}</span>
                                {!this.canChoose(entry, mode) && (
                                    <span className={styles.modeNote}>{this.t('unsupported')}</span>
                                )}
                                {required && mode === 'unsandboxed' && (
                                    <span id={requiredId} className={styles.requiredMode}>{this.t('requiredToRun')}</span>
                                )}
                            </label>
                        ))}
                    </div>
                    {this.props.enableDistribution && <fieldset className={styles.distributionModes}
                        disabled={controlsDisabled}>
                        <legend>{this.t('distribution')}</legend>
                        {DISTRIBUTIONS.map(distribution => <label key={distribution} className={styles.choice}>
                            <input type="radio" name={`${idPrefix}-distribution-${index}`}
                                value={distribution} data-index={index} data-distribution={distribution}
                                checked={(this.state.distributions[entry.url] || 'remote') === distribution}
                                disabled={controlsDisabled}
                                aria-label={`${name}: ${this.t(`distribution-${distribution}`)}`}
                                onChange={this.handleDistribution} />
                            <span>{this.t(`distribution-${distribution}`)}</span>
                        </label>)}
                    </fieldset>}
                    </div>}
                    {selection && <label className={styles.choice} aria-disabled={selection.disabled}>
                        <input type="checkbox" checked={selection.checked} disabled={selection.disabled}
                            aria-label={`${name}: ${this.t('selectExtension')}`}
                            aria-describedby={selection.dependencyReason ? `${idPrefix}-reason-${index}` :
                                `${idPrefix}-state-${index}`}
                            onChange={() => this.toggleSelection(entry.id)} />
                    </label>}
                </div>
            </article>
        );
    }

    render () {
        const Modal = this.props.DialogFrame;
        const {entries} = this.props;
        const counts = {deny: 0, sandboxed: 0, unsandboxed: 0, unselected: 0};
        entries.forEach(entry => {
            const mode = this.state.choices[entry.url];
            counts[this.canChoose(entry, mode) ? mode : 'unselected']++;
        });
        const confirmation = this.state.confirmation;
        const allRequired = allRequireUnsandboxed(entries, this.state.rows);
        return (
            <Modal
                id="extension-security-batch"
                className={styles.modal}
                headerClassName={styles.frameHeader}
                contentLabel={this.t('title')}
                hideCloseButton
                onRequestClose={this.handleRequestClose}
            >
                {confirmation ? (
                    <div
                        ref={this.handleWindowAnchor}
                        className={styles.confirmation}
                        role="alertdialog"
                        aria-labelledby="extension-confirm-title"
                        aria-describedby="extension-confirm-question"
                    >
                        <h3 id="extension-confirm-title">
                            {this.t(confirmation === 'cancel' ? 'cancelTitle' : 'denyTitle')}
                        </h3>
                        <p id="extension-confirm-question">
                            {this.t(confirmation === 'cancel' ?
                                this.props.context === 'catalog' ? 'catalogCancelQuestion' : 'cancelQuestion' : 'denyQuestion')}
                        </p>
                        <div className={styles.buttons}>
                            <button
                                type="button"
                                ref={this.focusNo}
                                onClick={this.handleNo}
                            >{this.t('no')}</button>
                            <button
                                type="button"
                                className={styles.primary}
                                disabled={!this.state.ready}
                                onClick={this.handleYes}
                            >{this.t('yes')}</button>
                        </div>
                    </div>
                ) : (
                    <div ref={this.handleWindowAnchor}
                        className={`${styles.body}${this.props.enableDistribution ? ' twextsec-with-distribution' : ''}`}>
                        <div className="twextsec-window-scroll">
                            <div className={styles.intro}>
                                <p>{this.t('securityInstruction')}</p>
                            </div>
                            {this.renderDistributionBulk()}
                            {!allRequired && (
                                <div className={styles.bulk}>
                                    <span>{this.t('bulk')}</span>
                                    {MODES.map(mode => (<button
                                        type="button"
                                        key={mode}
                                        value={mode}
                                        disabled={entries.every(entry => !this.canChoose(entry, mode))}
                                        onClick={this.handleBulk}
                                    ><ModeIcon mode={mode} />{this.t(mode)}</button>))}
                                </div>
                            )}
                            <div
                                className={styles.columns}
                                aria-hidden="true"
                            >
                                <span>{this.t('extension')}</span>
                                {MODES.map(mode => <span key={mode} className={styles.modeHeading}>
                                    <ModeIcon mode={mode} />{this.t(mode)}
                                </span>)}
                            </div>
                            <div className={styles.list}>
                                <PackageSections entries={entries} items={entries.map((entry, index) => ({entry, index}))}
                                    locale={this.props.locale} idPrefix="security-extension"
                                    renderItem={({entry, index}) => this.renderRow(entry, index)} />
                                <p className={styles.note}>{this.t('note')}</p>
                                {counts.unsandboxed > 0 && <p className={styles.warning}>{this.t('warning')}</p>}
                            </div>
                        </div>
                        <footer className={`${styles.footer} ${styles.securityFooter}`}>
                            {this.props.context === 'catalog' &&
                                <p className={styles.cancelDestination}>{this.t('catalogCancelDestination')}</p>}
                            <div className={styles.footerControls}>
                                <span
                                    className={styles.secondary}
                                    aria-live="polite"
                                >{this.t('summary', counts)}</span>
                                <div className={styles.buttons}>
                                    <button
                                        type="button"
                                        onClick={this.handleCancel}
                                    >{this.t('cancel')}</button>
                                    <button
                                        type="button"
                                        className={styles.primary}
                                        disabled={!this.state.ready || !this.selectionReady()}
                                        onClick={this.handleOK}
                                    >{this.t('ok')}</button>
                                </div>
                            </div>
                        </footer>
                    </div>
                )}
            </Modal>
        );
    }
}

const DefaultFrame = ({children, contentLabel, className, headerClassName}) => (
    <section role="dialog" aria-label={contentLabel} className={className}>
        <header className={headerClassName}><div>{contentLabel}</div></header>
        {children}
    </section>
);
ExtensionSecurityDialog.defaultProps = {
    loadInfo: loadExtensionInfo, initialChoices: new Map(), initialDistributions: new Map(),
    enableDistribution: false, locale: 'en', context: 'project', DialogFrame: DefaultFrame
};
export {ExtensionSecurityDialog};
export default ExtensionSecurityDialog;


class ExtensionSelectionList extends ExtensionSecurityDialog {
    constructor (props) {
        super(props);
        this.state.explicitIds = new Set();
        if (props.enableDistribution) {
            for (const entry of props.entries) {
                if (!EXECUTION_MODES.includes(this.state.choices[entry.url])) delete this.state.choices[entry.url];
                const actual = initialValue(props.initialChoices, entry);
                if (props.loadedIds.includes(entry.id) && EXECUTION_MODES.includes(actual)) this.state.choices[entry.url] = actual;
                if (!this.state.choices[entry.url] && requiresUnsandboxed(resolveSharedPackageMetadata(entry))) {
                    this.state.choices[entry.url] = 'unsandboxed';
                }
            }
        }
    }
    componentDidMount () {
        this.alive = true;
    }
    componentDidUpdate (previousProps) {
        this.initializeEntries(previousProps);
        const available = new Set(this.props.entries.map(entry => entry.id));
        if ([...this.state.explicitIds].some(id => !available.has(id))) {
            this.setState(previous => ({explicitIds: new Set([...previous.explicitIds].filter(id => available.has(id)))}));
        }
    }
    startRequests () {}
    executionModes () {
        return EXECUTION_MODES;
    }
    canChoose (entry, mode, state = this.state) {
        return EXECUTION_MODES.includes(mode) && super.canChoose(entry, mode, state);
    }
    canConfigureEntry (entry) {
        const selection = this.selection();
        return selection.selected.has(entry.id) || selection.loaded.has(entry.id);
    }
    selection () {
        return resolveExtensionSelection(this.props.entries, this.state.explicitIds, this.props.loadedIds);
    }
    toggleSelection (id) {
        if (this.props.busy) return;
        const selection = this.selection();
        if (selection.required.has(id) || selection.loaded.has(id)) return;
        this.setState(previous => {
            const explicitIds = new Set(previous.explicitIds);
            if (explicitIds.has(id)) explicitIds.delete(id);
            else explicitIds.add(id);
            return {explicitIds};
        });
    }
    completeSelection () {
        const selection = this.selection();
        if (!this.props.enableDistribution) {
            this.props.onComplete(selection.ordered);
            return;
        }
        const included = this.props.entries.filter(entry => selection.selected.has(entry.id) || selection.loaded.has(entry.id));
        if (included.some(entry => !this.canChoose(entry, this.state.choices[entry.url]))) return;
        this.props.onComplete(selection.ordered, this.settings(included));
    }
    render () {
        const selection = this.selection();
        const query = (this.props.filterQuery || '').trim().toLowerCase();
        const visible = this.props.entries.map((entry, index) => ({entry, index})).filter(({entry}) =>
            [entry.id, (entry.metadata || {}).name, getExtensionDescription(entry.metadata || {}, this.props.locale)]
                .join(' ').toLowerCase().includes(query));
        const byId = new Map(this.props.entries.map(entry => [entry.id, entry]));
        const renderSelectionRow = ({entry, index}) => {
            const loaded = selection.loaded.has(entry.id);
            const state = loaded ? 'loaded' : this.state.explicitIds.has(entry.id) ? 'selected' :
                selection.selected.has(entry.id) ? 'dependency' : 'unselected';
            const rootNames = [...(selection.requiredBy.get(entry.id) || [])].map(id =>
                (byId.get(id).metadata || {}).name || id);
            const separator = String(this.props.locale).toLowerCase().startsWith('ja') ? '、' : ', ';
            return this.renderRow(entry, index, {
                state,
                checked: selection.selected.has(entry.id) || loaded,
                disabled: this.props.busy || selection.required.has(entry.id) || loaded,
                dependencyReason: !loaded && rootNames.length ? this.t('requiredBy', {names: rootNames.join(separator)}) : null
            });
        };
        const configured = this.props.entries.filter(entry => selection.selected.has(entry.id) || selection.loaded.has(entry.id));
        const configuredCount = configured.length;
        const choicesReady = configured.every(entry => this.canChoose(entry, this.state.choices[entry.url]));
        return (<div className={`${styles.body} twextsec-selection${this.props.enableDistribution ? ' twextsec-with-distribution' : ''}`} aria-busy={this.props.busy}>
            <div className={styles.intro}><p>{this.t('selectionIntro')}</p>
                <ul className={styles.selectionLegend} aria-label={this.t('selectionLegend')}>
                    {['selected', 'dependency', 'unselected', 'loaded'].map(state =>
                        <li key={state} data-selection-state={state}>
                            <SelectionIcon state={state} />{this.t(`${state}State`)}
                        </li>)}
                </ul>
            </div>
            {this.props.enableDistribution && !this.props.entries.every(entry =>
                requiresUnsandboxed(resolveSharedPackageMetadata(entry))) && <div className={styles.bulk}>
                <span>{this.t('executionBulk')}</span>
                {this.executionModes().map(mode => <button type="button" key={mode} value={mode} data-execution={mode}
                    disabled={this.props.busy || this.props.entries.every(entry => !this.canChoose(entry, mode))}
                    onClick={this.handleBulk}><ModeIcon mode={mode} />{this.t(mode)}</button>)}
            </div>}
            {this.renderDistributionBulk()}
            <div className={styles.list}>
                <PackageSections entries={this.props.entries} items={visible} locale={this.props.locale}
                    idPrefix="selection-extension" renderItem={renderSelectionRow} />
                {!visible.length && <p role="status">{this.t('noResults')}</p>}
            </div>
            <footer className={styles.footer}>
                <span aria-live="polite">{this.t(this.props.enableDistribution ? 'configuredSummary' : 'selectedSummary',
                    {count: this.props.enableDistribution ? configuredCount : selection.ordered.length})}</span>
                <div className={styles.buttons}>
                    <button type="button" disabled={this.props.busy} onClick={this.props.onCancel}>
                        {this.t('cancel')}</button>
                    <button type="button" className={styles.primary}
                        disabled={this.props.busy || !(this.props.enableDistribution ? configuredCount && choicesReady : selection.ordered.length)}
                        onClick={() => this.completeSelection()}>
                        {this.t(this.props.busy ? 'loadingExtensions' : this.props.enableDistribution ? 'applySettings' : 'loadSelected')}</button>
                </div>
            </footer>
        </div>);
    }
}
ExtensionSelectionList.defaultProps = {...ExtensionSecurityDialog.defaultProps, loadedIds: [], busy: false};
export {ExtensionSelectionList};
