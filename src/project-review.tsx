// SPDX-License-Identifier: MPL-2.0
import JSZip from '@turbowarp/jszip';
import {discoverManifest, LoaderError} from '@kubohiroya/turbowarp-extension-loader';
import type {ExtensionSpec} from '@kubohiroya/turbowarp-extension-loader';
import {
    createDecisionStorage, initialDecisions, loadExtensionInfo, requiresReview
} from './index.js';
import {ExtensionReview} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import {
    installBatchExtensionLoader, isExtensionSecurityCancelled
} from '@kubohiroya/turbowarp-extension-security-dialog/turbowarp';
import React from 'react';

import {embeddedExtensionMetadata} from './embedded-extension-name.js';
import {createCatalogPreviewResolver} from './catalog-preview.js';
import {createCatalogResourceResolver} from './catalog-resources.js';
import {createCatalogMatcher, inlineCodeDigest} from './catalog-match.js';
import type {ReviewEntry} from './review-types.js';
import type {PreviewCatalog} from './catalog-preview.js';

import type {createProjectReviewChannel, ReadEmbeddedReviewFile} from './project-review-channel.js';
export {embeddedExtensionName} from './embedded-extension-name.js';
export interface ProjectReviewPorts {
    catalog?: PreviewCatalog;
    trusted: {ready?(): Promise<void>; listedDigests?: ReadonlySet<unknown>; isTrustedCode(options: any): boolean | Promise<boolean>; isTrustedURL(url: string | undefined): boolean | Promise<boolean>};
    pendingReview: ReturnType<typeof createProjectReviewChannel>['pendingPlusReview'];
    reviewedArchive(input: unknown): {project: Record<string, unknown>} | undefined;
    duringApproval<T>(vm: object, run: () => Promise<T>): Promise<T>;
    styles: Record<string, string>;
}
export function createProjectSecurityReview({catalog, trusted: defaultTrusted, pendingReview: pendingPlusReview,
    reviewedArchive: reviewedProjectArchive, duringApproval: duringProjectLoadApproval, styles}: ProjectReviewPorts) {
    const hex = (bytes: any) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    const resolveResources = createCatalogResourceResolver(catalog);
    const withResources = async (entry: ReviewEntry) => {
        // Only the host's version-matched catalog may supply this field on an open-project row.
        const {resourceDeclaration: _claim, ...metadata} = entry.metadata || {};
        const resourceDeclaration = await resolveResources(entry, AbortSignal.timeout(5000));
        return {...entry, metadata: {...metadata, ...(resourceDeclaration ? {resourceDeclaration} : {})}};
    };
    const matchCatalog = createCatalogMatcher(catalog);
    /**
     * Where the catalog publishes the code a project carries itself. Asked only of a row whose
     * digest the catalog already vouched for, so the address names the same bytes.
     * @param {object} entry The review row, with its digest.
     * @returns {Promise<string|undefined>} The catalog's address for this code.
     */
    const listedURL = async (entry: ReviewEntry) => (await matchCatalog(entry, AbortSignal.timeout(5000))).item?.url;

    /**
     * The project document a load was handed, whatever form it arrived in.
     * @param {unknown} input The first argument of `vm.loadProject`.
     * @returns {Promise<object|null>} The parsed document, or null when it cannot be read.
     */
    const readProjectDocument = async (input: any) => {
        const verified = reviewedProjectArchive(input);
        if (verified) return verified.project;
        if (input && typeof input === 'object' && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer)) {
            return input;
        }
        if (typeof input === 'string') return JSON.parse(input);
        const zip = await JSZip.loadAsync(input);
        const file = zip.file('project.json');
        return file ? JSON.parse(await file.async('string')) : null;
    };

    /**
     * How this distribution names a project, so what its opener chose is remembered for it.
     *
     * The address a project carries is its name when it has one: it survives edits. Without one, the
     * name is the content with its volatile metadata left out — what the previous version of the review
     * remembered by — so an unchanged project is still recognised, and an edited one is asked again.
     * @param {unknown} input The first argument of `vm.loadProject`.
     * @returns {Promise<string|null>} The name, or null when there is nothing to name.
     */
    const identifyProject = async (input: any) => {
        const project = await readProjectDocument(input);
        if (!project || typeof project !== 'object') return null;
        const uri = discoverManifest(project)?.uri;
        if (typeof uri === 'string') return uri;
        const {meta, projectVersion, ...content} = project;
        const canonical = JSON.stringify(content, (key, value) => (value && typeof value === 'object' && !Array.isArray(value) ?
            Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]])) : value));
        return `sha256:${hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))}`;
    };

    async function verifiedEmbeddedMetadata(spec: ExtensionSpec, readFile?: ReadEmbeddedReviewFile) {
        if (spec.source.type !== 'embedded-file' || !readFile) return;
        try {
            const bytes = await readFile(spec.source.path);
            // The codec returns a fresh ArrayBuffer-backed copy of the archive entry.
            const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
            if (hex(digest) === spec.sha256) return embeddedExtensionMetadata(bytes, spec.id);
        } catch {
            // Descriptions are optional. The Loader reports any invalid or unavailable code when loading.
        }
    }

    /**
     * A project's Plus manifest as rows of the open review.
     *
     * Each row carries the author's form as its source, which is how the screen knows the only thing
     * left to ask about loading is whether a `remote-cacheable` copy is kept. A row the catalog lists —
     * by its URL, or by the digest the manifest pins, which the Loader checks against the bytes before
     * anything runs — is trusted and stated rather than asked about.
     * @param {object} manifest The project's Plus manifest.
     * @param {object} trusted The catalog's trust checks.
     * @param {Function} [readEmbeddedFile] Reads the current load's ZIP entries.
     * @returns {Promise<Array<object>>} One `ReviewEntry` per manifest extension, keyed by its ID.
     */
    const plusReviewRows = (manifest: any, trusted: any, readEmbeddedFile?: ReadEmbeddedReviewFile) => Promise.all(manifest.extensions.map(async (spec: any) => {
        const [vouched, declared] = await Promise.all([
            trusted.isTrustedCode({source: spec.source, actualSHA256: spec.sha256}),
            verifiedEmbeddedMetadata(spec, readEmbeddedFile)
        ]);
        const source = typeof spec.source.url === 'string' && spec.source.type.startsWith('remote-') ?
            {kind: spec.source.type, url: spec.source.url, sha256: spec.sha256} : {kind: spec.source.type, sha256: spec.sha256};
        // Bytes the project carries have no address of their own; the catalog's says where they come from.
        const listed = vouched && !('url' in source) ? await listedURL({key: spec.id, ids: [spec.id], source}) : undefined;
        return withResources({key: spec.id,
            ids: [spec.id],
            // The manifest's own version and publisher win over what the bytes say of themselves.
            metadata: {...declared, id: spec.id, ...(spec.version ? {version: spec.version} : {}),
                ...(spec.publisher ? {author: spec.publisher} : {})},
            source,
            requestedExecution: spec.execution,
            dependencies: [...spec.dependencies],
            ...(vouched ? {state: {trusted: true, plusFamily: true, ...(listed ? {listedURL: listed} : {})}} : {})});
    }));

    const frames = new WeakMap();

    /**
     * The GUI's modal, in the shape the screen asks of a frame.
     *
     * The screen hands its frame a title, a way to cancel and its body. The GUI's `Modal` names those a
     * content label and a close request, so this is the one place the two vocabularies meet. The frame's
     * look is this side's too: the package styles only its body, and the GUI's modal is transparent
     * unless its caller gives it a class. Each GUI
     * modal gets one adapter, kept, so React sees the same component on every render.
     * @param {Function} Modal The GUI's modal component.
     * @returns {Function} A frame component the screen can render into.
     */
    const frameFor = (Modal: any) => {
        if (!frames.has(Modal)) {
            const Frame = ({title, onCancel, children}: any) => React.createElement(Modal, {
                id: 'extension-security-batch', className: styles.frame, contentLabel: title, onRequestClose: onCancel,
                manageHistory: false
            }, React.createElement('div', {className: styles.body}, children));
            frames.set(Modal, Frame);
        }
        return frames.get(Modal);
    };

    /**
     * Build the review, so a test can hand in its own catalog, screen and storage.
     * @param {object} [parts] `trusted`, `screen`, `install`, `storage` and `identify` for tests.
     * @returns {object} `installBatchLoader`, `render` and `isCancelled`.
     */
    /**
     * The review's own markup, which is the dialog package's rather than the GUI's.
     *
     * The editor turns a bare space into "run" and the arrows into sprite nudges; inside the review
     * those keys belong to its checkboxes and buttons. The GUI asks before acting, through the
     * `shouldIgnoreKeyEvent` socket, and only this side can answer — the class comes from the package
     * this distribution depends on. The fork still carries a hard-coded `.twextsec-modal`, which the
     * 0.7 screen no longer renders, so the socket is what makes this work at all.
     */
    const REVIEW_ROOT = '.twextsec-review';

    const createSecurityReview = ({
        trusted = defaultTrusted,
        screen = ExtensionReview,
        install = installBatchExtensionLoader,
        storage = createDecisionStorage(),
        identify = identifyProject
    } = {}) => Object.freeze({
        /**
         * Put this review in front of the VM's extension loading.
         *
         * Everything the GUI knows comes in: the VM, how to show one of its modals, which extensions it
         * trusts already and where to find an icon for one. What this adds is the catalog's own trust —
         * an extension this distribution lists needs no review, the way TurboWarp treats its gallery —
         * and the asking itself.
         * @param {object} context `vm`, `showReview`, `defaultURLs`, `isTrusted` and `bannerFor`.
         * @returns {Function} Restores the VM's previous loading path.
         */
        installBatchLoader ({vm, showReview, defaultURLs, isTrusted, bannerFor}: any) {
            return install(vm, async (entries, initial) => {
                // A trusted row is stated, not asked about: the screen gives it no choice.
                const rows = await Promise.all(entries.map(async entry => {
                    const url = 'url' in entry.source ? entry.source.url : undefined;
                    const legacy = entry.source.kind === 'legacy';
                    // A project written for standard TurboWarp carries a Plus extension as a data:
                    // address. Its bytes are judged by digest, as a Plus manifest's embedded forms are;
                    // every other ordinary custom extension is trusted by its address alone. A Plus row
                    // arrives already judged by its address and pinned digest together.
                    const digest = legacy ? await inlineCodeDigest(url) : undefined;
                    const plusFamily = legacy && Boolean(digest ?
                        await trusted.isTrustedCode({source: {type: 'embedded-data'}, actualSHA256: digest}) :
                        await trusted.isTrustedURL(url));
                    const vouched = legacy && (isTrusted(url) || plusFamily);
                    // The digest goes on the row only once the catalog vouched for it, so the screen
                    // states it and the catalog's artwork and address can be matched to it.
                    const source = plusFamily && digest ? {...entry.source, sha256: digest} : entry.source;
                    const listed = plusFamily && digest ? await listedURL({...entry, source}) : undefined;
                    const banner = bannerFor({ids: entry.ids, url});
                    return withResources({...entry, source,
                        ...(banner ? {metadata: {...entry.metadata, banner}} : {}),
                        ...(vouched ? {state: {...entry.state, trusted: true, plusFamily,
                            ...(listed ? {listedURL: listed} : {})}} : {})});
                }));
                const starting = initialDecisions(rows, 'open', {recorded: initial});
                if (!requiresReview(rows)) return starting;
                return duringProjectLoadApproval(vm, () => showReview(rows, starting));
            }, defaultURLs, storage, {
                identify,
                // The Plus host opens a channel for the load it drives, so its rows are asked about on
                // this same screen, and the answer goes back for it to hand the Loader.
                collectEntries: async () => {
                    const channel = pendingPlusReview(vm);
                    return channel ? plusReviewRows(channel.manifest, trusted, channel.readEmbeddedFile) : [];
                },
                applyDecisions: decisions => {
                    const channel = pendingPlusReview(vm);
                    if (!channel) return;
                    // A denied Plus row already prevents the whole project from opening. Stop here
                    // before the batch starts legacy extensions or the Loader resolves remote code.
                    const denied = channel.manifest.extensions.find(spec => decisions.get(spec.id)?.execution === 'deny');
                    if (denied) throw new LoaderError('TRUST_DENIED', 'Host did not approve this exact extension digest', denied.id);
                    channel.decisions = decisions;
                }
            });
        },
        /**
         * Render the review inside the GUI's own modal frame, which arrives as `DialogFrame`.
         * @param {object} props What the GUI passes: entries, initial choices, locale, frame, callback.
         * @returns {object} The element to render.
         */
        render: ({entries, initialChoices, locale, DialogFrame, onComplete}: any) => React.createElement(screen, {
            mode: 'open', entries, initialDecisions: initialChoices, locale,
            DialogFrame: DialogFrame && frameFor(DialogFrame),
            // A custom extension's name, description, creator and licence are its own leading comment,
            // read without running it, so the row says what it is and labels each part a claim.
            loadInfo: loadExtensionInfo,
            loadPreview: createCatalogPreviewResolver(catalog),
            onComplete
        }),
        /**
         * Whether a key event happened inside the review, so the editor leaves that key alone.
         * @param {object} event The key event the GUI received.
         * @returns {boolean} True when the event belongs to the review.
         */
        ownsKeyEvent: (event: any) => {
            const target = event?.target;
            return typeof target?.closest === 'function' && target.closest(REVIEW_ROOT) !== null;
        },
        /**
         * Whether an error means someone declined, rather than something failing.
         * @param {object} error The rejection from loading.
         * @returns {boolean} True when the review was cancelled.
         */
        isCancelled: (error: any) => isExtensionSecurityCancelled(error)
    });



    return {identifyProject, plusReviewRows, frameFor, createSecurityReview};
}
