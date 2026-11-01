import {formatMessage} from './messages.js';

// The dialog carries its own styles because its hosts are not all CSS pipelines: the Editor
// bundles this package's stylesheet, but the single-HTML runtime and the packager page build
// JavaScript only and would render an unstyled box. Injecting is idempotent per document.
const styles = '.twextsec-wait{position:fixed;left:50vw;top:50vh;right:auto;bottom:auto;margin:0;' +
    'transform:translate(-50%,-50%);box-sizing:border-box;width:min(440px,calc(100vw - 32px));' +
    'border:1px solid var(--ui-black-transparent,#0000001a);border-radius:12px;padding:20px 24px;' +
    'color:var(--ui-modal-foreground,#263145);background:var(--ui-modal-background,#fff);' +
    'box-shadow:0 16px 48px #0000004d;font:inherit}' +
    '.twextsec-wait::backdrop{background:#111827a6}' +
    // showModal focuses the dialog itself because nothing inside it is focusable. The ring marks
    // a place the keyboard cannot go, so drop it; the backdrop already shows what has the screen.
    '.twextsec-wait:focus,.twextsec-wait:focus-visible{outline:none}' +
    '.twextsec-wait h2{margin:0 0 10px;font-size:1.05em}' +
    '.twextsec-wait p{margin:0 0 8px}' +
    '.twextsec-wait-source{overflow-wrap:anywhere;font-size:.85em;opacity:.7}' +
    '.twextsec-wait-note{margin-bottom:0;font-size:.9em;opacity:.8}';

const injectStyles = document => {
    if (!document.head || document.querySelector('[data-twextsec-wait-style]')) return;
    const element = document.createElement('style');
    element.setAttribute('data-twextsec-wait-style', '');
    element.textContent = styles;
    document.head.appendChild(element);
};

const text = (document, tag, value, className) => {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
};

/**
 * A centred dialog for a wait the person cannot act on.
 *
 * Fetching one extension can stall for seconds while the transport asks again, and the whole
 * operation is blocked while it does: every entry has to be verified and approved before any of
 * them is registered. A notice in a corner understates that. This takes the middle of the
 * screen, where the approval dialog that follows appears too, so attention does not have to move.
 *
 * It carries no close and no cancel button, on purpose. Closing would not stop the fetch, and
 * stopping one halfway has no rollback behind it yet, so either button would offer control that
 * does not exist and could leave the project in a state nothing restores.
 *
 * Showing is delayed, because the shortest wait is one backoff. A dialog that appears and
 * disappears inside half a second reads as a flicker and steals focus for nothing; one that
 * stays for a second or more is the case worth interrupting for.
 * @param {Document} document The host document.
 * @param {string} locale Host locale; only the language is used.
 * @param {object} options How long a wait has to look like before it is worth a dialog.
 * @returns {object} The show, hide and dispose ends of one dialog.
 */
export function createExtensionWaitDialog(document, locale = 'en', {delayMs = 300} = {}) {
    let dialog = null;
    let timer = null;
    let latest = null;
    let disposed = false;
    const label = key => formatMessage(locale, key, latest || {});

    const render = () => {
        if (!dialog) return;
        dialog.querySelector('[data-twextsec-wait="attempt"]').textContent = label('fetchWaitRetry');
        dialog.querySelector('[data-twextsec-wait="source"]').textContent = latest.url || '';
    };
    const open = () => {
        timer = null;
        if (disposed || dialog || !document || !document.body) return;
        injectStyles(document);
        dialog = document.createElement('dialog');
        dialog.className = 'twextsec-wait';
        dialog.setAttribute('data-testid', 'twextsec-wait');
        dialog.setAttribute('aria-live', 'polite');
        dialog.appendChild(text(document, 'h2', formatMessage(locale, 'fetchWaitTitle')));
        const attempt = text(document, 'p', '');
        attempt.setAttribute('data-twextsec-wait', 'attempt');
        const source = text(document, 'p', '', 'twextsec-wait-source');
        source.setAttribute('data-twextsec-wait', 'source');
        dialog.append(attempt, source,
            text(document, 'p', formatMessage(locale, 'fetchWaitNote'), 'twextsec-wait-note'));
        // Escape would close it without stopping anything, so refuse the request and stay.
        dialog.addEventListener('cancel', event => event.preventDefault());
        document.body.appendChild(dialog);
        render();
        try {
            if (typeof dialog.showModal === 'function') dialog.showModal();
        } catch (error) {
            // A host that cannot open a modal still gets the panel's running log.
        }
    };

    return Object.freeze({
        /**
         * Report the attempt now being waited for, opening the dialog once the wait looks real.
         * @param {object} info The url, the attempt it leads to, and how many there are in all.
         * @returns {void}
         */
        show(info) {
            if (disposed) return;
            latest = info || {};
            if (dialog) render();
            else if (timer === null) timer = setTimeout(open, delayMs);
        },
        /**
         * Take it down: the fetch resolved, one way or the other.
         * @returns {void}
         */
        hide() {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            latest = null;
            if (!dialog) return;
            try {
                dialog.close();
            } catch (error) {
                // Removing it below is what actually ends the wait.
            }
            dialog.remove();
            dialog = null;
        },
        dispose() {
            disposed = true;
            this.hide();
        }
    });
}
