import type {ComponentType} from 'react';
import Review from './review.js';
import type {ExtensionMetadata, ReviewDecision, ReviewEntry, ReviewFailure, LoadingMode} from './review-types.js';
import type {PreviewCache, ReviewMode} from './index.js';

export interface DialogFrameProps {
    title: string;
    onCancel(): void;
    children?: unknown;
}

export interface ExtensionReviewProps {
    mode: ReviewMode;
    entries: ReviewEntry[];
    initialDecisions?: ReadonlyMap<string, ReviewDecision>;
    locale?: string;
    fallbackLoading?: LoadingMode;
    /** Used only when opening a project: the host supplies its own modal. */
    DialogFrame?: ComponentType<DialogFrameProps>;
    loadInfo?: (url: string, signal: AbortSignal) => Promise<{source: string; metadata: ExtensionMetadata}>;
    /** Where previews are kept between visits; null keeps nothing. */
    previewCache?: PreviewCache | null;
    /**
     * A failure of the whole load, shown above the rows. Absent or null renders exactly as before.
     * `retryable` is the host's judgement, never derived here from `code`.
     * Only `message` is required; missing `retryable` offers no retry.
     */
    failure?: ReviewFailure | null;
    /**
     * Asks the host to try the load again. "Try again" appears only for a failure — `failure`, or a
     * row's `state.error` — whose `retryable` is `true`, and only when this is given.
     */
    onRetry?: () => void;
    onComplete(decisions: Map<string, ReviewDecision> | null): void;
}

export const ExtensionReview: ComponentType<ExtensionReviewProps> = Review;
export default ExtensionReview;
