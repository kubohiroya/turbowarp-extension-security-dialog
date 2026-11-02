/**
 * Close a chosen set over its dependencies, and say why each row is in it.
 *
 * A list has to distinguish three things that look alike: what the person ticked, what came along
 * because something else needs it, and what is already running. Only the first can be unticked,
 * and the second has to name who required it, or a tick that will not clear looks broken.
 * @param {Array<object>} entries Catalog entries, each with `id` and `dependencies`.
 * @param {Iterable<string>} [chosen] The IDs the person ticked.
 * @param {Iterable<string>} [loaded] The IDs already running in the host.
 * @returns {object} The closed set, why each row is in it, and the order to load them in.
 */
export function resolveExtensionSelection(entries, chosen = [], loaded = []) {
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    const explicit = new Set([...chosen].filter(id => byId.has(id)));
    const already = new Set([...loaded].filter(id => byId.has(id)));
    const selected = new Set();
    const requiredBy = new Map();

    const take = (id, root) => {
        if (root !== null) {
            const roots = requiredBy.get(id) || new Set();
            roots.add(root);
            requiredBy.set(id, roots);
        }
        if (selected.has(id)) return;
        selected.add(id);
        for (const dependency of byId.get(id).dependencies || []) {
            take(dependency, root === null ? id : root);
        }
    };
    for (const id of explicit) take(id, null);

    // A dependency has to be loaded before whatever needs it, and catalog order breaks the
    // remaining ties, so two runs over one catalog never disagree about the order.
    const ordered = [];
    const placed = new Set();
    const place = id => {
        if (placed.has(id)) return;
        placed.add(id);
        for (const dependency of byId.get(id).dependencies || []) {
            if (selected.has(dependency)) place(dependency);
        }
        ordered.push(byId.get(id));
    };
    for (const entry of entries) {
        if (selected.has(entry.id)) place(entry.id);
    }

    const required = new Set([...selected].filter(id => !explicit.has(id)));
    return {
        selected,
        explicit,
        required,
        requiredBy,
        loaded: already,
        ordered,
        /**
         * Why a row is in the set, as the reader needs to tell the cases apart.
         * @param {string} id The row's extension ID.
         * @returns {string} One of loaded, selected, dependency or unselected.
         */
        stateOf(id) {
            if (already.has(id)) return 'loaded';
            if (explicit.has(id)) return 'selected';
            if (required.has(id)) return 'dependency';
            return 'unselected';
        }
    };
}
