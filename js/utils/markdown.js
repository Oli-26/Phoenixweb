// Minimal markdown renderer for user-authored supporting info.
// Supports: headings, bullet/numbered lists, blockquotes, horizontal rules,
// bold/italic/inline code, links, and blank-line paragraphs with soft breaks.

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function safeHref(url) {
    return /^(https?:\/\/|mailto:|\/|#)/i.test(url.trim()) ? url.trim() : '';
}

function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/&lt;br\s*\/?&gt;/gi, '<br>');   // authors hand-type <br>; honour it, nothing else HTML
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (m, label, url) => {
        const href = safeHref(url);
        return href
            ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
            : label;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
    return out;
}

// Plain-text view of markdown source, for previews/truncation where syntax would be noise.
export function markdownToPlain(text) {
    if (!text) return '';
    return String(text)
        .replace(/\r\n?/g, '\n')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+)/gm, '')
        .replace(/^\s*([-*_]\s*){3,}$/gm, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(\*\*|__)([^*_]+)\1/g, '$2')
        .replace(/(^|[\s(])[*_]([^*_\n]+)[*_]/g, '$1$2')
        .replace(/\s*\n+\s*/g, ' ')
        .trim();
}

export function renderMarkdown(text) {
    if (!text) return '';

    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let listType = null;      // 'ul' | 'ol' | null
    let paragraph = [];
    let quote = [];

    const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
    const closeParagraph = () => {
        if (paragraph.length) { html.push(`<p>${paragraph.join('<br>')}</p>`); paragraph = []; }
    };
    const closeQuote = () => {
        if (quote.length) { html.push(`<blockquote>${quote.join('<br>')}</blockquote>`); quote = []; }
    };
    const closeAll = () => { closeParagraph(); closeQuote(); closeList(); };

    for (const raw of lines) {
        const line = raw.trimEnd();

        if (!line.trim()) { closeAll(); continue; }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            closeAll();
            const level = Math.min(heading[1].length + 2, 6); // #  -> h3, keeps modal hierarchy
            html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }

        if (/^\s*(\*\s*){3,}$/.test(line) || /^\s*(-\s*){3,}$/.test(line) || /^\s*(_\s*){3,}$/.test(line)) {
            closeAll();
            html.push('<hr>');
            continue;
        }

        const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
        if (bullet) {
            closeParagraph(); closeQuote();
            if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
            html.push(`<li>${inline(bullet[1])}</li>`);
            continue;
        }

        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (numbered) {
            closeParagraph(); closeQuote();
            if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
            html.push(`<li>${inline(numbered[1])}</li>`);
            continue;
        }

        const quoted = line.match(/^\s*>\s?(.*)$/);
        if (quoted) {
            closeParagraph(); closeList();
            quote.push(inline(quoted[1]));
            continue;
        }

        closeQuote(); closeList();
        paragraph.push(inline(line));
    }

    closeAll();
    return html.join('');
}
