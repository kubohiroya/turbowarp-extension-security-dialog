import React from 'react';
import BannerPreview from './banner-preview.jsx';
import {loadExtensionInfo, getPreviewCandidates, getExtensionDescription} from './info.js';
const commonBanner = __SECURITY_COMMON_BANNER__;
import {formatMessage} from './messages.js';
import styles from './style-names.js';
import {resolveExtensionSelection} from './selection.js';
const bindAll = (instance, names) => names.forEach(name => {instance[name] = instance[name].bind(instance);});

const MODES = ['deny', 'sandboxed', 'unsandboxed'];
const requiresUnsandboxed = metadata => metadata && typeof metadata.unsandboxed === 'string' &&
    metadata.unsandboxed.trim().toLowerCase() === 'required';
const isModeAllowed = (mode, metadata) => MODES.includes(mode) &&
    (!requiresUnsandboxed(metadata) || mode === 'unsandboxed');
const allRequireUnsandboxed = (entries, rows) => entries.length > 0 && entries.every(entry => {
    const row = rows[entry.url];
    return row && row.status === 'ready' && requiresUnsandboxed(row.metadata);
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

class ExtensionSecurityDialog extends React.Component {
    constructor (props) {
        super(props);
        const choices = {};
        for (const entry of props.entries) {
            const mode = props.initialChoices.get(entry.url);
            if (MODES.includes(mode)) choices[entry.url] = mode;
        }
        this.state = {choices, rows: {}, expanded: {}, sources: {}, confirmation: null, ready: false};
        this.requests = new Map();
        this.controllers = new Set();
        this.timeouts = new Set();
        this.alive = false;
        bindAll(this, ['handleChoice', 'handleBulk', 'handleDetails', 'handleImageError', 'handleOK',
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
            const request = Promise.resolve().then(() => this.props.loadInfo(entry.url, controller.signal));
            this.requests.set(entry.url, request);
            request.then(result => {
                if (this.alive) {
                    this.setState(previous => {
                        const choices = {...previous.choices};
                        const invalidated = Boolean(choices[entry.url] &&
                            !isModeAllowed(choices[entry.url], result.metadata));
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
        return isModeAllowed(mode, (state.rows[entry.url] || {}).metadata);
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
    handleDetails (event) {
        const entry = this.entryForEvent(event);
        this.setState(previous => ({expanded: {
            ...previous.expanded, [entry.url]: !previous.expanded[entry.url]
        }}), () => {
            if (!this.state.expanded[entry.url]) return;
            this.requests.get(entry.url).then(result => {
                if (this.alive) {
                    this.setState(previous => ({sources: {...previous.sources, [entry.url]: result.source}}));
                }
            }, () => {});
        });
    }
    handleImageError (event) {
        const entry = this.entryForEvent(event);
        const failedURL = event.currentTarget.getAttribute('src');
        this.setState(previous => {
            const row = previous.rows[entry.url] || {};
            const candidates = getPreviewCandidates(entry, row.metadata, commonBanner);
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
        const description = getExtensionDescription(metadata, this.props.locale);
        const required = requiresUnsandboxed(metadata);
        const reasonId = `extension-mode-reason-${index}`;
        const requiredId = `extension-mode-required-${index}`;
        const name = metadata.name || entry.ids.join(', ');
        const candidates = getPreviewCandidates(entry, metadata, commonBanner);
        const expanded = Boolean(this.state.expanded[entry.url]);
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
            <a
                className={styles.sourceLink}
                href={sourceURL}
                target="_blank"
                rel="noopener noreferrer"
            >{sourceURL}</a>
        ) : origin;
        return (
            <article
                className={styles.row}
                key={entry.url}
            >
                <div className={styles.rowMain}>
                    <div className={styles.metadata}>
                        <BannerPreview
                            previewId={`extension-preview-${index}`}
                            className={styles.preview}
                            src={candidates[row.previewIndex || 0]}
                            alt={this.t('preview', {name})}
                            referrerPolicy="no-referrer"
                            data-index={index}
                            onError={this.handleImageError}
                        />
                        <div className={styles.info}>
                            <strong>{name}</strong>
                            <div className={styles.secondary}>{this.t('id', {id: metadata.id || entry.ids.join(', ')})}</div>
                            {metadata.version && <span className={styles.version}>{`v${metadata.version}`}</span>}
                            {metadata.author && (
                                <div className={styles.secondary}>{this.t('author', {author: metadata.author})}</div>
                            )}
                            {metadata.updatedAt && (
                                <div className={styles.secondary}>{this.t('updated', {updated: metadata.updatedAt})}</div>
                            )}
                            {description && <div>{description}</div>}
                            {metadata.license && (
                                <div className={styles.secondary}>{this.t('license', {license: metadata.license})}</div>
                            )}
                            <div className={styles.secondary}>{sourceLink}</div>
                            {!row.status && <div className={styles.secondary}>{this.t('pending')}</div>}
                            {row.status === 'failed' && <div className={styles.error}>{this.t('failed')}</div>}
                            {required && (
                                <div id={reasonId} className={styles.warningText}>
                                    {this.t(selection ? 'selectionRequired' :
                                        this.props.context === 'catalog' ? 'catalogRequired' : 'required')}</div>
                            )}
                            {row.invalidated && !this.state.choices[entry.url] && (
                                <div className={styles.warningText} role="status">{this.t('choiceReset')}</div>
                            )}
                        </div>
                    </div>
                    {!selection && MODES.map(mode => (
                        <label
                            className={styles.choice}
                            key={mode}
                            data-mode={mode}
                            aria-disabled={!this.canChoose(entry, mode)}
                            title={!this.canChoose(entry, mode) ? this.t('required') : undefined}
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
                    <button
                        type="button"
                        className={styles.detailsButton}
                        data-index={index}
                        aria-expanded={expanded}
                        aria-controls={`extension-source-${index}`}
                        onClick={this.handleDetails}
                    >{this.t('details')}</button>
                    {selection && (
                        <label className={styles.choice} aria-disabled={selection.disabled}>
                            <input type="checkbox" checked={selection.checked} disabled={selection.disabled}
                                aria-label={`${name}: ${this.t('selectExtension')}`}
                                aria-describedby={selection.reason ? `extension-selection-reason-${index}` : undefined}
                                onChange={() => this.toggleSelection(entry.id)} />
                            {selection.reason && <span id={`extension-selection-reason-${index}`}
                                className={styles.modeNote}>{this.t(selection.reason)}</span>}
                        </label>
                    )}
                </div>
                {expanded && (
                    <div
                        className={styles.details}
                        id={`extension-source-${index}`}
                    >
                        <strong>{this.t('source')}</strong>
                        <p>{`${entry.ids.join(', ')} · `}{sourceLink}</p>
                        {Object.prototype.hasOwnProperty.call(this.state.sources, entry.url) ? (
                            <textarea
                                aria-label={`${name}: ${this.t('source')}`}
                                value={this.state.sources[entry.url]}
                                readOnly
                                spellCheck={false}
                            />
                        ) : <p>{this.t((selection ? row.sourceStatus : row.status) === 'failed' ?
                            'sourceFailed' : 'pending')}</p>}
                    </div>
                )}
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
                            <p>{this.t(allRequired ?
                                this.props.context === 'catalog' ? 'catalogRequiredIntro' : 'allRequiredIntro' : 'intro')}</p>
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
                            </span>)}<span />
                        </div>
                        <div className={styles.list}>
                            {entries.map((entry, index) => this.renderRow(entry, index))}
                            <p className={styles.note}>{this.t('note')}</p>
                            {counts.unsandboxed > 0 && <p className={styles.warning}>{this.t('warning')}</p>}
                        </div>
                        <footer className={styles.footer}>
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
    handleDetails (event) {
        const entry = this.entryForEvent(event);
        if (!this.requests.has(entry.url)) {
            const controller = new AbortController();
            this.controllers.add(controller);
            const timeout = this.delay(() => controller.abort(), 15000);
            const request = Promise.resolve().then(() => this.props.loadInfo(entry.url, controller.signal));
            this.requests.set(entry.url, request);
            request.catch(() => {
                if (this.alive) this.setState(previous => ({rows: {...previous.rows,
                    [entry.url]: {...previous.rows[entry.url], sourceStatus: 'failed'}}}));
            }).finally(() => {
                clearTimeout(timeout);
                this.timeouts.delete(timeout);
                this.controllers.delete(controller);
            });
        }
        super.handleDetails(event);
    }
    render () {
        const selection = this.selection();
        const query = (this.props.filterQuery || '').trim().toLowerCase();
        const visible = this.props.entries.map((entry, index) => ({entry, index})).filter(({entry}) =>
            [entry.id, (entry.metadata || {}).name, getExtensionDescription(entry.metadata || {}, this.props.locale)]
                .join(' ').toLowerCase().includes(query));
        return (<div className={`${styles.body} twextsec-selection`} aria-busy={this.props.busy}>
            <div className={styles.intro}><p>{this.t('selectionIntro')}</p></div>
            <div className={styles.list}>
                {visible.map(({entry, index}) => this.renderRow(entry, index, {
                    checked: selection.selected.has(entry.id) || selection.loaded.has(entry.id),
                    disabled: this.props.busy || selection.required.has(entry.id) || selection.loaded.has(entry.id),
                    reason: selection.loaded.has(entry.id) ? 'alreadyLoaded' :
                        selection.required.has(entry.id) ? 'dependency' : null
                }))}
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
