import React from 'react';
import {createPortal} from 'react-dom';
import styles from './style-names.js';

class BannerPreview extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false};
        this.image = React.createRef();
        this.popup = React.createRef();
        this.overImage = false;
        this.overPopup = false;
    }
    componentDidMount () {
        window.addEventListener('resize', this.close);
        window.addEventListener('scroll', this.handleScroll, true);
        window.addEventListener('keydown', this.handleEscape, true);
    }
    componentDidUpdate (previous) {
        if (previous.src !== this.props.src && this.state.open) this.close();
    }
    componentWillUnmount () {
        clearTimeout(this.closeTimer);
        window.removeEventListener('resize', this.close);
        window.removeEventListener('scroll', this.handleScroll, true);
        window.removeEventListener('keydown', this.handleEscape, true);
    }
    close = () => {
        clearTimeout(this.closeTimer);
        this.overPopup = false;
        if (this.state.open) this.setState({open: false});
    };
    show = () => {
        clearTimeout(this.closeTimer);
        const image = this.image.current;
        if (!image || !image.naturalWidth || !image.naturalHeight) return;
        const rect = image.getBoundingClientRect();
        const width = Math.min(image.naturalWidth + 2, window.innerWidth - 24);
        const dialog = image.closest('[role="dialog"]');
        const footer = dialog && dialog.querySelector('footer');
        const footerTop = footer && footer.getBoundingClientRect().top;
        // Keep the decision buttons accessible while the original image is open.
        const bottom = footerTop > 24 ? Math.min(window.innerHeight - 12, footerTop - 8) : window.innerHeight - 12;
        let height = Math.min(image.naturalHeight + 2, bottom - 12);
        let left;
        let top = Math.max(12, Math.min(rect.top, bottom - height));
        if (rect.right + 12 + width <= window.innerWidth - 12) left = rect.right + 12;
        else if (rect.left - width - 12 >= 12) left = rect.left - width - 12;
        else {
            // Avoid covering the hovered thumbnail, which would interrupt pointer entry.
            left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
            const above = Math.max(1, Math.min(rect.top - 8, bottom) - 12);
            const below = Math.max(1, bottom - Math.max(12, rect.bottom + 8));
            if (above >= below) {
                height = Math.min(height, above);
                top = Math.max(12, rect.top - 8 - height);
            } else {
                height = Math.min(height, below);
                top = Math.max(12, rect.bottom + 8);
            }
        }
        this.setState({open: true, width, height, left, top});
    };
    scheduleClose = () => {
        clearTimeout(this.closeTimer);
        // Let the pointer cross the small gap into the scrollable original image.
        this.closeTimer = setTimeout(() => {
            if (!this.overImage && !this.overPopup && document.activeElement !== this.image.current) this.close();
        }, 150);
    };
    handleScroll = event => {
        const popup = this.popup.current;
        if (popup && event.target instanceof window.Node && popup.contains(event.target)) return;
        this.close();
    };
    handleEscape = event => {
        if (this.state.open && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.close();
        }
    };
    render () {
        const {previewId, ...imageProps} = this.props;
        const {open, width, height, left, top} = this.state;
        return (
            <React.Fragment>
                <img
                    {...imageProps}
                    ref={this.image}
                    tabIndex={0}
                    aria-describedby={open ? previewId : undefined}
                    onMouseEnter={() => {this.overImage = true; this.show();}}
                    onMouseLeave={() => {this.overImage = false; this.scheduleClose();}}
                    onFocus={this.show}
                    onBlur={this.scheduleClose}
                    onLoad={() => {
                        if (this.overImage || document.activeElement === this.image.current) this.show();
                    }}
                />
                {open && createPortal(
                    <div
                        id={previewId}
                        ref={this.popup}
                        role="tooltip"
                        className={styles.previewPopup}
                        style={{width, height, left, top}}
                        onMouseEnter={() => {this.overPopup = true; clearTimeout(this.closeTimer);}}
                        onMouseLeave={() => {this.overPopup = false; this.scheduleClose();}}
                    >
                        <img
                            className={styles.previewOriginal}
                            src={this.props.src}
                            alt={this.props.alt}
                            referrerPolicy="no-referrer"
                        />
                    </div>, document.body
                )}
            </React.Fragment>
        );
    }
}

export default BannerPreview;
