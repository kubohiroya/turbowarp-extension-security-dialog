import type {PreviewCache} from './storage.js';

interface PreviewProps {
    url: string;
    name: string;
    fallback: boolean;
    fallbackURL?: string;
    cache?: PreviewCache | null;
    locale?: string;
}
import React from 'react';
import {formatMessage} from './messages.js';

/**
 * The picture beside a row.
 *
 * A preview is decoration, so everything here fails quietly: a picture that cannot be fetched,
 * a browser that will not keep it, a cache that answers with nothing. None of those may stop the
 * row from being read or answered. It is also never evidence — nothing here is checked against a
 * digest, and what the row's own checks say is elsewhere.
 */
export class ExtensionPreview extends React.PureComponent<PreviewProps, {src: string | null}> {
    private controller: AbortController;
    private objectURL: string | null;
    constructor (props: PreviewProps) {
        super(props);
        this.state = {src: null};
        this.controller = new AbortController();
        this.objectURL = null;
    }
    componentDidMount () {
        this.show();
    }
    componentDidUpdate (previous: PreviewProps) {
        if (previous.url !== this.props.url) {
            this.release();
            this.controller.abort();
            this.controller = new AbortController();
            this.setState({src: null}, () => this.show());
        }
    }
    componentWillUnmount () {
        this.controller.abort();
        this.release();
    }
    release () {
        if (this.objectURL === null) return;
        URL.revokeObjectURL(this.objectURL);
        this.objectURL = null;
    }
    adopt (blob: Blob) {
        if (this.controller.signal.aborted) return;
        this.objectURL = URL.createObjectURL(blob);
        this.setState({src: this.objectURL});
    }
    async show () {
        const {url, cache} = this.props;
        const controller = this.controller;
        if (!url) return;
        // The fallback icon travels inside the bundle, so there is nothing to fetch or keep.
        if (url.startsWith('data:')) {
            this.setState({src: url});
            return;
        }
        try {
            const kept = cache ? await cache.read(url) : null;
            if (controller.signal.aborted) return;
            if (kept) {
                this.adopt(kept);
                return;
            }
            const response = await fetch(url, {
                signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
            });
            if (!response.ok) throw new Error('Preview request failed');
            const blob = await response.blob();
            if (controller.signal.aborted) return;
            // Keeping it is a convenience; a browser that refuses still shows the picture now.
            this.adopt(blob);
            if (cache) await cache.write(url, blob);
        } catch (error) {
            // Images can be displayed across origins even when CORS prevents reading their
            // bytes for the cache. Keep the author's image instead of dropping it in that case.
            if (!controller.signal.aborted && this.objectURL === null) this.setState({src: url});
        }
    }
    render () {
        if (this.state.src === null) return null;
        return (
            <img
                className={this.props.fallback || this.state.src === this.props.fallbackURL ?
                    'twextsec-preview twextsec-preview-fallback' : 'twextsec-preview'}
                src={this.state.src}
                referrerPolicy="no-referrer"
                onError={() => {
                    this.release();
                    this.setState({src: this.state.src === this.props.fallbackURL ? null : this.props.fallbackURL || null});
                }}
                alt={formatMessage(this.props.locale, 'preview', {name: this.props.name})}
            />
        );
    }
}

export default ExtensionPreview;
