import type {ComponentType} from 'react';
import type {ExtensionMetadata, ReviewDecision, ReviewEntry, LoadingMode} from './review-types.js';
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
    onComplete(decisions: Map<string, ReviewDecision> | null): void;
}

export const ExtensionReview: ComponentType<ExtensionReviewProps>;
export default ExtensionReview;
