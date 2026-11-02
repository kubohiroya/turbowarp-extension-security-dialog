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
 * `cached` keeps a verified copy in the browser and reuses it; `remote` fetches every time and
 * leaves nothing behind; `embedded` reads the copy the project carries. Only the project's author
 * chooses `embedded`, because it is the project that grows.
 *
 * These are the Loader's own source types, because a decision made here ends up in a project
 * manifest the Loader reads. The SB3 writer in turbowarp-kamishibai-app#1109 names one more,
 * splitting `embedded` into `embedded-file` (bytes as a file in the ZIP, which is what a manifest
 * records) and `embedded-data` (bytes inside `project.json` as a `data:` URL). That extra name is
 * a compatibility shadow written beside the manifest so standard TurboWarp can still read the
 * project; it is not an alternative anyone picks here, so this screen does not offer it.
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
