// Report content height to the parent frame (e.g. Wix) so it can auto-resize
// the iframe. Harmless when not embedded — nothing listens, message is ignored.
function postHeight() {
    parent.postMessage(
        { type: 'phoenix-height', height: document.documentElement.scrollHeight },
        '*'
    );
}

window.addEventListener('load', postHeight);
window.addEventListener('resize', postHeight);
window.addEventListener('hashchange', () => setTimeout(postHeight, 50));
if (window.ResizeObserver) {
    new ResizeObserver(postHeight).observe(document.body);
}
