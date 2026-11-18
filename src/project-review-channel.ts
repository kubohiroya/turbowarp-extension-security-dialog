// SPDX-License-Identifier: MPL-2.0
import type {Manifest} from '@kubohiroya/turbowarp-extension-loader';
import type {ReviewDecision} from './index.js';
export type ReadEmbeddedReviewFile = (path: string) => Promise<Uint8Array>;
export interface ReviewChannel {manifest: Manifest; decisions: Map<string, ReviewDecision> | null; readEmbeddedFile?: ReadEmbeddedReviewFile}
export function createProjectReviewChannel() {
    const pending = new WeakMap<object, ReviewChannel>();


    /**
     * Open the channel for one load: the review may read `manifest` and writes its answer back.
     * @param {object} vm The VM being loaded.
     * @param {object} manifest The project's Plus manifest.
     * @param {Function} [readEmbeddedFile] Reads JS bytes from this load's prepared archive.
     * @returns {object} The channel, whose `decisions` the review fills in.
     */
    const openPlusReview = (vm: object, manifest: Manifest, readEmbeddedFile?: ReadEmbeddedReviewFile) => {
        const channel: ReviewChannel = {manifest, decisions: null, readEmbeddedFile};
        pending.set(vm, channel);
        return channel;
    };

    /**
     * The channel of the load in progress, if a Plus host opened one.
     * @param {object} vm The VM being loaded.
     * @returns {object|null} The channel, or null when no Plus rows are waiting.
     */
    const pendingPlusReview = (vm: object) => pending.get(vm) || null;

    /**
     * Close a channel; a later load opens its own.
     * @param {object} vm The VM that was loaded.
     * @param {object} channel The channel `openPlusReview` returned.
     */
    const closePlusReview = (vm: object, channel: ReviewChannel) => {
        if (pending.get(vm) === channel) pending.delete(vm);
    };

    return {openPlusReview, pendingPlusReview, closePlusReview};
}
