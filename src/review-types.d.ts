/**
 * The vocabulary the review screen and its hosts share.
 *
 * Nothing here names the Loader's own types. A host that reads a Plus manifest turns it into
 * `ReviewEntry` rows before this package sees it, and turns `ReviewDecision` back into whatever
 * the Loader wants. That keeps the dependency pointing one way: this package defines the port,
 * the hosts implement it.
 */

/** What the person allows a row to do. `deny` means it does not run at all. */
export type ExecutionDecision = 'deny' | 'sandboxed' | 'unsandboxed';

/**
 * Where a row's bytes come from when the project runs.
 *
 * The family settled on three ways to hold anything, extensions included. `remote` fetches every
 * time: nothing is kept in the browser and nothing is kept in the project. `cached` keeps
 * verified bytes in the browser and reuses them, so opening again costs no network while the
 * project still holds only a reference. `embedded` is the project carrying the bytes itself, and
 * it has two forms: `embedded-file`, a file inside the archive, and `embedded-data`, a `data:`
 * value inside the project document.
 *
 * Choosing between the two embedded forms is about how the project is written, not about how it
 * runs, so it belongs to whatever saves the project rather than to this screen. Adding an
 * extension here records `embedded`; the writer decides which form that becomes.
 */
export type LoadingMode = 'cached' | 'remote' | 'embedded';

export interface ExtensionMetadata {
    name?: string; id?: string; description?: string; descriptions?: Record<string, string>;
    author?: string; authorURL?: string; version?: string; license?: string;
    repository?: string; docsURL?: string; banner?: string; package?: string;
    unsandboxed?: string; updatedAt?: string;
}

/** Where a row's code comes from, and what can be checked about it. */
export type ReviewSource =
    | {kind: 'catalog'; url: string; sha256?: string}
    | {kind: 'reference'; url: string; sha256: string}
    | {kind: 'embedded'; sha256: string}
    | {kind: 'legacy'; url: string};

export interface ReviewEntryState {
    loaded?: boolean;
    trusted?: boolean;
    error?: {code: string; message: string};
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
