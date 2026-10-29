import React from 'react';
import {loadExtensionInfo, getExtensionDescription} from './info.js';
import PackageDescription, {PackageRequirement, getPackagePreviewCandidates, requiresUnsandboxed, resolveSharedPackageMetadata}
    from './package-description.jsx';
import PackageSections from './package-sections.jsx';
import {formatMessage} from './messages.js';
import styles from './style-names.js';
import {resolveExtensionSelection} from './selection.js';
const bindAll = (instance, names) => names.forEach(name => {instance[name] = instance[name].bind(instance);});

const MODES = ['deny', 'sandboxed', 'unsandboxed'];
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
        for (const entry of props.entries) {
            const mode = props.initialChoices.get(entry.url);
            if (isModeAllowed(mode, resolveSharedPackageMetadata(entry))) choices[entry.url] = mode;
        }
        this.state = {choices, rows: {}, confirmation: null, ready: false};
        this.requests = new Map();
        this.controllers = new Set();
        this.timeouts = new Set();
        this.alive = false;
        bindAll(this, ['handleChoice', 'handleBulk', 'handleImageError', 'handleOK',
            'handleCancel', 'handleNo', 'handleYes', 'handleRequestClose', 'focusNo']);
    }
    componentDidMount () {
        this.alive = true;
        this.delay(() => this.setState({ready: true}));
        this.startRequests();
    }
    componentDidUpdate () {
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
        this.controllers.forEach(controller => controller.abort());
        this.timeouts.forEach(timeout => clearTimeout(timeout));
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
    entryForEvent (event) {
        return this.props.entries[Number(event.currentTarget.dataset.index)];
    }
    canChoose (entry, mode, state = this.state) {
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
        const entry = this.entryForEvent(event);
        const mode = event.currentTarget.value;
        if (!entry) return;
        this.setState(previous => this.canChoose(entry, mode, previous) ?
            {choices: {...previous.choices, [entry.url]: mode}} : null);
    }
    handleBulk (event) {
        const mode = event.currentTarget.value;
        if (!MODES.includes(mode)) return;
        this.setState(previous => ({choices: Object.assign({}, previous.choices,
            Object.fromEntries(this.props.entries.filter(entry => this.canChoose(entry, mode, previous))
                .map(entry => [entry.url, mode])))}));
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
        this.props.onComplete(new Map(this.props.entries.map(entry => [entry.url, this.state.choices[entry.url]])));
    }
    focusNo (element) {
        if (element) element.focus();
    }
    renderRow (entry, index, selection) {
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
                    {!selection && <div className={styles.securityModes}>
                        <PackageRequirement metadata={sharedMetadata} locale={this.props.locale} id={reasonId} />
                        {MODES.map(mode => (
                            <label
                                className={styles.choice}
                                key={mode}
                                data-mode={mode}
                                aria-disabled={!this.canChoose(entry, mode)}
                                title={!this.canChoose(entry, mode) ? this.t('requiredToRun') : undefined}
                            >
                                <span className={styles.choiceControl}>
                                    <input
                                        type="radio"
                                        name={`extension-security-${index}`}
                                        value={mode}
                                        checked={this.state.choices[entry.url] === mode}
                                        aria-label={`${name}: ${this.t(mode)}`}
                                        aria-describedby={!this.canChoose(entry, mode) ? reasonId :
                                            required && mode === 'unsandboxed' ? requiredId : undefined}
                                        disabled={!this.canChoose(entry, mode)}
                                        data-index={index}
                                        onChange={this.handleChoice}
                                    />
                                    <ModeIcon mode={mode} />
                                </span>
                                <span className={styles.mobileLabel}>{this.t(mode)}</span>
                                {!this.canChoose(entry, mode) && (
                                    <span className={styles.modeNote}>{this.t('unsupported')}</span>
                                )}
                                {required && mode === 'unsandboxed' && (
                                    <span id={requiredId} className={styles.requiredMode}>{this.t('requiredToRun')}</span>
                                )}
                            </label>
                        ))}
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
        const done = entries.filter(entry => (this.state.rows[entry.url] || {}).status).length;
        const confirmation = this.state.confirmation;
        const allRequired = allRequireUnsandboxed(entries, this.state.rows);
        return (
            <Modal
                id="extension-security-batch"
                className={styles.modal}
                contentLabel={this.t('title')}
                hideCloseButton
                onRequestClose={this.handleRequestClose}
            >
                {confirmation ? (
                    <div
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
                    <div className={styles.body}>
                        <div className={styles.intro}>
                            <p>{this.t('securityInstruction')}</p>
                            <div
                                className={styles.secondary}
                                aria-live="polite"
                            >{this.t('progress', {done, total: entries.length})}</div>
                        </div>
                        {!allRequired && (
                            <div className={styles.bulk}>
                                <span>{this.t('bulk')}</span>
                                {MODES.map(mode => (<button
                                    type="button"
                                    key={mode}
                                    value={mode}
                                    disabled={entries.every(entry => !this.canChoose(entry, mode))}
                                    title={this.t('bulkNote')}
                                    onClick={this.handleBulk}
                                ><ModeIcon mode={mode} />{this.t(mode)}</button>))}
                                <div className={styles.bulkNote}>{this.t('bulkNote')}</div>
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

const DefaultFrame = ({children, contentLabel, className}) => (
    <section role="dialog" aria-label={contentLabel} className={className}>{children}</section>
);
ExtensionSecurityDialog.defaultProps = {
    loadInfo: loadExtensionInfo, initialChoices: new Map(), locale: 'en', context: 'project', DialogFrame: DefaultFrame
};
export {ExtensionSecurityDialog};
export default ExtensionSecurityDialog;


class ExtensionSelectionList extends ExtensionSecurityDialog {
    constructor (props) {
        super(props);
        this.state.explicitIds = new Set();
    }
    componentDidMount () {
        this.alive = true;
    }
    componentDidUpdate () {
        const available = new Set(this.props.entries.map(entry => entry.id));
        if ([...this.state.explicitIds].some(id => !available.has(id))) {
            this.setState(previous => ({explicitIds: new Set([...previous.explicitIds].filter(id => available.has(id)))}));
        }
    }
    startRequests () {}
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
        return (<div className={`${styles.body} twextsec-selection`} aria-busy={this.props.busy}>
            <div className={styles.intro}><p>{this.t('selectionIntro')}</p>
                <ul className={styles.selectionLegend} aria-label={this.t('selectionLegend')}>
                    {['selected', 'dependency', 'unselected', 'loaded'].map(state =>
                        <li key={state} data-selection-state={state}>
                            <SelectionIcon state={state} />{this.t(`${state}State`)}
                        </li>)}
                </ul>
            </div>
            <div className={styles.list}>
                <PackageSections entries={this.props.entries} items={visible} locale={this.props.locale}
                    idPrefix="selection-extension" renderItem={renderSelectionRow} />
                {!visible.length && <p role="status">{this.t('noResults')}</p>}
            </div>
            <footer className={styles.footer}>
                <span aria-live="polite">{this.t('selectedSummary', {count: selection.ordered.length})}</span>
                <div className={styles.buttons}>
                    <button type="button" disabled={this.props.busy} onClick={this.props.onCancel}>
                        {this.t('cancel')}</button>
                    <button type="button" className={styles.primary}
                        disabled={this.props.busy || !selection.ordered.length}
                        onClick={() => this.props.onComplete(this.selection().ordered)}>
                        {this.t(this.props.busy ? 'loadingExtensions' : 'loadSelected')}</button>
                </div>
            </footer>
        </div>);
    }
}
ExtensionSelectionList.defaultProps = {...ExtensionSecurityDialog.defaultProps, loadedIds: [], busy: false};
export {ExtensionSelectionList};
