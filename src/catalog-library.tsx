// SPDX-License-Identifier: MPL-2.0
import {ExtensionReview} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import {parseExtensionCatalog} from './index.js';
import type {CatalogEntry, ReviewDecision, ReviewEntry, ReviewFailure} from './index.js';
import React from 'react';
import {PublishedExtension, type PublishedExtensionPorts} from './published-extension.js';


const text = {
    en: {
        loading: 'Loading TurboWarp Plus extensions…',
        failed: 'The extension catalog could not be loaded.',
        denied: 'No extensions were loaded. Review the selected extensions and their permissions.',
        retry: 'Retry'
    },
    ja: {
        loading: 'TurboWarp Plusの機能拡張を取得しています…',
        failed: '機能拡張の一覧を取得できませんでした。',
        denied: '機能拡張は読み込まれませんでした。選択と読み込み許可を確認してください。',
        retry: '再試行'
    }
};

/**
 * The catalog as rows of the review screen.
 *
 * With the Loader switched off there is nothing to write a form into — the extension loads by its
 * address, as a custom extension does — so the rows say so and the screen offers no form.
 * @param {Array<object>} entries Parsed catalog entries.
 * @param {object} vm The VM, to say which are already running.
 * @param {boolean} [loader] Whether the Loader writes the chosen form into the project.
 * @returns {Array<object>} One `ReviewEntry` per catalog entry, keyed by its extension ID.
 */
interface LibraryVM {
    extensionManager: {
        isExtensionLoaded(id: string): boolean;
        securityManager: object;
        loadExtensionURL(url: string): Promise<unknown>;
        _loadedExtensions: ReadonlyMap<string, string>;
    };
}
type Decisions = Map<string, ReviewDecision>;
interface LibraryProps {
    vm: LibraryVM;
    locale: string;
    filterQuery?: string;
    permissions: unknown;
    onBusyChange(busy: boolean): void;
    onCategorySelected(id: string): void;
    onRequestClose(): void;
}
interface LibraryState {
    entries: CatalogEntry[] | null;
    fetchError: boolean;
    denied: boolean;
    failure: ReviewFailure | null;
    busy: boolean;
    publishedBusy: boolean;
    decisions: Decisions;
}
export const reviewRows = (entries: CatalogEntry[], vm: LibraryVM,
    loader = true): ReviewEntry[] => entries.map(entry => ({
    key: entry.id,
    ids: [entry.id],
    metadata: entry.metadata,
    source: {kind: loader ? 'catalog' : 'legacy', url: entry.url},
    dependencies: [...(entry.dependencies || [])],
    state: {trusted: true, plusFamily: true, loaded: vm.extensionManager.isExtensionLoaded(entry.id)}
}));

export interface CatalogLibraryPorts {
    catalog: {read(signal: AbortSignal): Promise<{catalog?: unknown; icons?: Record<string, string>}>};
    readSettings(vm: LibraryVM, entries: CatalogEntry[]): Promise<{decisions: Decisions}>;
    applySettings(vm: LibraryVM, selection: {entries: CatalogEntry[]; decisions: Decisions}, options: {signal: AbortSignal}): Promise<string[]>;
    loadExtensions(vm: LibraryVM, entries: CatalogEntry[], modes: Map<string, string>, permissions: any): Promise<string[]>;
    published?: {
        allowReferenceAliases?: boolean;
        resolve: PublishedExtensionPorts['resolve'];
        add(vm: LibraryVM, ...args: Parameters<PublishedExtensionPorts['add']>): Promise<void>;
    };
    loaderEnabled: boolean;
    isRetryable(error: unknown): boolean;
    styles: Record<string, string>;
}

/** The host supplies its trusted catalog and loading ports, never GUI components. */
export function createCatalogLibrary({catalog: plusCatalog, readSettings: readPlusCatalogSettings,
    applySettings: applyPlusCatalogSettings, loadExtensions: loadPlusExtensions,
    published, loaderEnabled: PLUS_EXTENSION_LOADER_ENABLED, isRetryable: isWorthAskingAgain, styles}: CatalogLibraryPorts) {
    class PlusLibrary extends React.PureComponent<LibraryProps, LibraryState> {
        declare controller?: AbortController;
        declare answered: Decisions | null;
        declare alive: boolean;


        constructor (props: LibraryProps) {
            super(props);
            this.handleFetchCatalog = this.handleFetchCatalog.bind(this);
            this.handleComplete = this.handleComplete.bind(this);
            this.handleRetry = this.handleRetry.bind(this);
            this.state = {entries: null,
                fetchError: false,
                denied: false,
                failure: null,
                busy: false,
                publishedBusy: false,
                decisions: new Map()};
            // The last answer the screen gave, which "Try again" repeats unchanged.
            this.answered = null;
        }
        componentDidMount () {
            this.alive = true;
            this.handleFetchCatalog();
        }
        componentWillUnmount () {
            this.alive = false;
            if (this.controller) this.controller.abort();
        }
        async handleFetchCatalog () {
            if (this.controller) this.controller.abort();
            this.controller = new AbortController();
            this.setState({fetchError: false});
            const timeout = setTimeout(() => this.controller?.abort(), 15000);
            try {
                const read = await plusCatalog.read(this.controller?.signal ?? new AbortController().signal);
                const parsed = read.catalog ? parseExtensionCatalog(read.catalog) : [];
                // Display images come from the trusted build, not from a project or remote metadata,
                // and the side that owns them has already checked them.
                const icons = read.icons || {};
                const entries = parsed.map(entry => Object.hasOwn(icons, entry.id) ?
                    {...entry, metadata: {...entry.metadata, banner: icons[entry.id]}} : entry);
                const {decisions} = await readPlusCatalogSettings(this.props.vm, entries);
                if (this.alive) this.setState({entries, decisions});
            } catch (error) {
                if (this.alive) {
                    console.error(error);
                    this.setState({fetchError: true});
                }
            } finally {
                clearTimeout(timeout);
            }
        }
        /**
         * Act on the screen's answer: every chosen row, with how it runs and how it loads.
         * @param {Map<string, object>|null} decisions The answer by extension ID, or null for no.
         */
        async handleComplete (decisions: Decisions | null) {
            if (decisions === null) {
                this.props.onRequestClose();
                return;
            }
            this.answered = decisions;
            await this.apply(decisions);
        }
        /**
         * Ask again with the answer that just failed, as the screen's "Try again" requests.
         */
        async handleRetry () {
            if (this.answered && !this.state.busy) await this.apply(this.answered);
        }
        /**
         * Load the chosen rows as answered, and keep how it failed for the screen to state.
         * @param {Map<string, object>} decisions The answer by extension ID.
         */
        async apply (decisions: Decisions) {
            const chosen = (this.state.entries ?? []).filter(entry => decisions.has(entry.id));
            this.setState({busy: true, denied: false, failure: null});
            this.props.onBusyChange(true);
            try {
                const loaded = PLUS_EXTENSION_LOADER_ENABLED ?
                    await applyPlusCatalogSettings(this.props.vm, {entries: chosen, decisions},
                        {signal: this.controller?.signal ?? new AbortController().signal}) :
                    await loadPlusExtensions(this.props.vm, chosen,
                        new Map(chosen.map(entry => [entry.url, decisions.get(entry.id)?.execution ?? 'deny'])),
                        this.props.permissions);
                if (!this.alive) return;
                if (loaded.length) {
                    this.props.onCategorySelected(loaded[loaded.length - 1]);
                    this.props.onRequestClose();
                } else this.setState({denied: true});
            } catch (error) {
                console.error(error);
                if (this.alive) {
                    const failure = error as {code?: string; message?: string} | null;
                    this.setState({failure: {code: failure?.code || 'LOAD_FAILED', message: failure?.message || String(error),
                        retryable: isWorthAskingAgain(error)}});
                }
            } finally {
                if (this.alive) {
                    this.setState({busy: false});
                    this.props.onBusyChange(false);
                }
            }
        }
        renderPublished () {
            if (!published || !PLUS_EXTENSION_LOADER_ENABLED) return null;
            return <PublishedExtension locale={this.props.locale} resolve={published.resolve}
                add={(candidate, options) => published.add(this.props.vm, candidate, options)}
                blocked={this.state.busy} allowReferenceAliases={published.allowReferenceAliases}
                onBusyChange={publishedBusy => {
                    this.setState({publishedBusy});
                    this.props.onBusyChange(publishedBusy);
                }}
                onAdded={id => {
                    this.props.onCategorySelected(id);
                    this.props.onRequestClose();
                }} />;
        }
        render () {
            const t = text[this.props.locale.startsWith('ja') ? 'ja' : 'en'];
            const {entries, busy, publishedBusy, denied, failure, fetchError, decisions} = this.state;
            return (<div className={styles.root}>
                {this.renderPublished()}
                {!entries ? <div className={styles.message} role={fetchError ? 'alert' : 'status'}>
                    <p>{fetchError ? t.failed : t.loading}</p>
                    {fetchError && <button type="button" onClick={this.handleFetchCatalog}>{t.retry}</button>}
                </div> : <>
                {denied && <p
                    className={styles.error}
                    role="alert"
                >{t.denied}</p>}
                <div hidden={busy || publishedBusy}>
                    <ExtensionReview
                        mode="add"
                        entries={reviewRows(entries, this.props.vm, PLUS_EXTENSION_LOADER_ENABLED)}
                        initialDecisions={decisions}
                        locale={this.props.locale}
                        failure={failure}
                        onRetry={this.handleRetry}
                        onComplete={this.handleComplete}
                    />
                </div>
                {busy && <p role="status">{t.loading}</p>}
                </>}
            </div>);
        }
    }

    return PlusLibrary;
}
