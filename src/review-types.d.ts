/**
 * The vocabulary the review screen and its hosts share.
 *
 * Nothing here imports the Loader's own types. A host that reads a Plus manifest turns it into
 * `ReviewEntry` rows before this package sees it, and turns `ReviewDecision` back into whatever
 * the Loader wants. That keeps the dependency pointing one way: this package defines the port,
 * the hosts implement it.
 *
 * The four loading forms are nevertheless spelled exactly as the manifest and the SB3 save format
 * spell them. Sharing the words costs nothing and buys a lot: a host wires the two ends together
 * without a translation table, and a translation table is where one layer quietly comes to
 * disagree with the one above it.
 */

/** What the person allows a row to do. `deny` means it does not run at all. */
export type ExecutionDecision = 'deny' | 'sandboxed' | 'unsandboxed';

/**
 * Where a row's bytes come from when the project runs.
 *
 * Four forms, two holding a reference and two holding the bytes. `remote-non-cacheable` fetches
 * every time and keeps nothing anywhere. `remote-cacheable` fetches too, but a verified copy may
 * be kept in this browser, so opening again costs no network while the project still holds only a
 * reference. `embedded-file` is a file inside the archive. `embedded-data` is a `data:` value in
 * the project document, which is also what lets a standard TurboWarp host open the project at all.
 *
 * All four are the author's decision, recorded when the extension was added, so the only question
 * these leave the person opening a project is whether a `remote-cacheable` row may keep its copy
 * here. That one can only ever be declined: `remote-non-cacheable` is the author forbidding the
 * copy, and there is no way to write permission back over it.
 */
export type LoadingMode =
    'remote-non-cacheable' | 'remote-cacheable' | 'embedded-file' | 'embedded-data';

export interface ExtensionMetadata {
    name?: string; id?: string; description?: string; descriptions?: Record<string, string>;
    author?: string; authorURL?: string; version?: string; license?: string;
    repository?: string; docsURL?: string; banner?: string; package?: string;
    unsandboxed?: string; updatedAt?: string;
}

/**
 * Where a row's code comes from, and what can be checked about it.
 *
 * A row some project already names carries the author's chosen form as its own `kind`, which is
 * why `loadingChoices` can read the choices off the source and needs no table. The two kinds that
 * are not forms are the two cases where there is no author's decision to read: `catalog` is a row
 * that is in no project yet, so whoever is looking at it is the author and picks the form, and
 * `legacy` is an ordinary custom extension, which has no form to pick.
 */
export type ReviewSource =
    | {kind: 'catalog'; url: string; sha256?: string}
    | {kind: 'remote-non-cacheable'; url: string; sha256: string}
    | {kind: 'remote-cacheable'; url: string; sha256: string}
    | {kind: 'embedded-file'; sha256: string}
    | {kind: 'embedded-data'; sha256: string}
    | {kind: 'legacy'; url: string};

/**
 * A load that failed, as the host reports it.
 *
 * `retryable` is the host's judgement — in the TurboWarp-Plus Editor, the Loader's
 * `isWorthAskingAgain` — and not something this package derives from `code`: one code can come
 * from a dropped connection and from a forged extension alike. Only `true` offers "try again", and
 * only when the screen was also given `onRetry`; missing or `false` states the failure and stops.
 */
export interface ReviewFailure {
    code?: string;
    message: string;
    retryable?: boolean;
}

export interface ReviewEntryState {
    loaded?: boolean;
    trusted?: boolean;
    error?: ReviewFailure;
}

export interface ReviewEntry {
    /** Identifies the row across a session: an extension ID where there is one, else the URL. */
    key: string;
    ids: string[];
    metadata?: ExtensionMetadata;
    source: ReviewSource;
    /** What the project recorded, when it recorded anything. */
    requestedExecution?: 'sandboxed' | 'unsandboxed';
    dependencies?: string[];
    state?: ReviewEntryState;
}

export interface ReviewDecision {
    execution: ExecutionDecision;
    /** Absent for `legacy` rows: the existing custom-extension path has no loading mode. */
    loading?: LoadingMode;
}

export type ReviewDecisions = Map<string, ReviewDecision>;
