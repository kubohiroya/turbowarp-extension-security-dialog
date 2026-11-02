import type {ReviewDecision, ReviewEntry} from './review-types.js';
import type {DecisionStorage} from './index.js';

export function isExtensionSecurityCancelled(error: unknown): boolean;

export interface BatchLoaderOptions {
    /** Rows the host owns, read from the project before any extension code runs. */
    collectEntries?: (project: unknown) => Promise<ReviewEntry[]>;
    /** The same answer, handed to the host so it can drive the Loader's trust and caching. */
    applyDecisions?: (decisions: Map<string, ReviewDecision>, entries: ReviewEntry[]) => void;
    /** How the host names a project, so the opener's decisions can be remembered for it. */
    identify?: (project: unknown) => Promise<string | null>;
}

export function installBatchExtensionLoader(
    vm: object,
    review: (entries: ReviewEntry[], initial: Map<string, ReviewDecision>) =>
        Promise<Map<string, ReviewDecision> | null>,
    defaultURLs?: Record<string, string>,
    storage?: DecisionStorage | null,
    options?: BatchLoaderOptions
): () => void;
