import {unsandboxedRequirement} from './metadata.js';

/** A row listed in the catalog is trusted like the host's own gallery and is never asked about. */
export const isTrusted = entry => Boolean(entry && entry.state && entry.state.trusted);

/** Only a reference can be fetched or kept; embedded bytes and legacy URLs have no choice. */
export const loadingChoices = entry => (
    entry.source.kind === 'catalog' ? ['cached', 'remote', 'embedded'] :
        entry.source.kind === 'reference' ? ['cached', 'remote'] : []
);

/**
 * What a row may be allowed to do.
 *
 * A trusted row has no choice to make. Adding has no `deny` because not adding is what refusing
 * looks like there; opening does, because the project already names the extension and the person
 * still has to be able to say no to it.
 * @param {object} entry The row.
 * @param {string} mode Either add or open.
 * @returns {Array<string>} The execution choices to offer, empty when there is nothing to choose.
 */
export const executionChoices = (entry, mode) => (
    isTrusted(entry) ? [] :
        mode === 'add' ? ['sandboxed', 'unsandboxed'] : ['deny', 'sandboxed', 'unsandboxed']
);

/**
 * Where a row starts before anyone touches it.
 *
 * A trusted row runs without the sandbox, as the gallery's own do. Everything else starts in the
 * sandbox, including an extension that says it needs to be outside: that claim is the extension's
 * own and must not pre-approve itself. What the project recorded is honoured only as far as the
 * sandbox, for the same reason.
 * @param {object} entry The row.
 * @param {string} mode Either add or open.
 * @param {string} fallbackLoading Where a reference loads from when nothing is recorded.
 * @returns {object} The decision to start from.
 */
export function defaultDecision(entry, mode, fallbackLoading = 'cached') {
    const execution = isTrusted(entry) ? 'unsandboxed' : 'sandboxed';
    const choices = loadingChoices(entry);
    if (choices.length === 0) {
        return entry.source.kind === 'embedded' ? {execution, loading: 'embedded'} : {execution};
    }
    return {execution, loading: choices.includes(fallbackLoading) ? fallbackLoading : choices[0]};
}

/**
 * The decisions a screen opens with: what was recorded last time, else the defaults.
 *
 * A recorded choice is only honoured where it is still one of the choices. A project that moved
 * from a reference to embedded bytes, or a row that has since become trusted, must not carry a
 * stale answer into a screen that no longer offers it.
 * @param {Array<object>} entries The rows.
 * @param {string} mode Either add or open.
 * @param {object} options Previously recorded decisions and the fallback loading mode.
 * @returns {Map<string, object>} The starting decisions, by row key.
 */
export function initialDecisions(entries, mode, {recorded = new Map(), fallbackLoading = 'cached'} = {}) {
    return new Map(entries.map(entry => {
        const base = defaultDecision(entry, mode, fallbackLoading);
        const previous = recorded.get(entry.key);
        if (!previous) return [entry.key, base];
        const execution = executionChoices(entry, mode).includes(previous.execution) ?
            previous.execution : base.execution;
        const loading = loadingChoices(entry).includes(previous.loading) ? previous.loading : base.loading;
        return [entry.key, loading === undefined ? {execution} : {execution, loading}];
    }));
}

/**
 * Whether opening this project has anything to ask about.
 *
 * With nothing but trusted rows there is no question to put, and a dialog that only reports would
 * be a toll gate on opening a project. The host skips the screen and uses the defaults.
 * @param {Array<object>} entries The rows.
 * @returns {boolean} True when at least one row needs a person.
 */
export const requiresReview = entries => entries.some(entry => !isTrusted(entry));

/**
 * Whether the sandbox is likely to break this row, by its own account.
 *
 * This is a warning, never a permission: the extension said it needs to be outside the sandbox,
 * and choosing the sandbox anyway usually ends with the extension refusing to start.
 * @param {object} entry The row.
 * @param {object} decision The decision being made about it.
 * @returns {boolean} True when the choice contradicts what the extension declared.
 */
export const contradictsDeclaration = (entry, decision) => (
    decision.execution === 'sandboxed' &&
    unsandboxedRequirement(entry.metadata || {}) === 'required'
);
