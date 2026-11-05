import React from 'react';
import {displayURL} from './display-urls.js';

// Match whole URLs before email addresses so a refused URL cannot turn into a partial email link.
const addresses = /https?:\/\/[^\s<>"'。、「」『』【】]+|mailto:[^\s<>"'。、「」『』【】]+|[\w.!#$%&'*+/=?^`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi;

const trimPunctuation = (text: string) => {
    let result = text;
    while (result) {
        const last = result.slice(-1);
        if (/[.,;:!?！？]/.test(last)) {
            result = result.slice(0, -1);
            continue;
        }
        const opener = {')': '(', ']': '[', '}': '{', '）': '（'}[last];
        if (opener && result.split(last).length > result.split(opener).length) {
            result = result.slice(0, -1);
            continue;
        }
        break;
    }
    return result;
};

/** Render text, preserving everything except adding links around recognized addresses. */
export const LinkedText = ({text}: {text: string}) => {
    const parts = [];
    const input = String(text || '');
    const matcher = new RegExp(addresses.source, addresses.flags);
    let cursor = 0;
    let match;
    while ((match = matcher.exec(input))) {
        parts.push(input.slice(cursor, match.index));
        const label = trimPunctuation(match[0]);
        const href = displayURL(/^(?:https?:\/\/|mailto:)/i.test(label) ? label : `mailto:${label}`, true);
        parts.push(href ? (
            <a
                key={match.index}
                href={href}
                target={/^mailto:/i.test(href) ? undefined : '_blank'}
                rel="noopener noreferrer"
            >{label}</a>
        ) : label);
        parts.push(match[0].slice(label.length));
        cursor = matcher.lastIndex;
    }
    parts.push(input.slice(cursor));
    return <React.Fragment>{parts}</React.Fragment>;
};
