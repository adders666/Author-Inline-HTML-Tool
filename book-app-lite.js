// Book Authoring Tool Lite (Chapters, Works, HTML)
const SECTION_TYPES = {
    NEWSPAPER: 'newspaper', // legacy compatibility for saved stories
    CHAPTER: 'chapter',
    WORK: 'work',
    HTML: 'html'
};

const TAB_NAMES = {
    CHAPTER: 'chapter',
    WORK: 'work',
    HTML: 'html',
    STORY: 'story'
};

let sections = [];
let activeTab = TAB_NAMES.CHAPTER;
let currentEditingIndex = null;
let editingNoticeEl = null;
let applyEditBtn = null;
let saveTimeout;
let previewTimeout;
const tokenCache = new Map();

function isElectron() {
    return typeof window !== 'undefined' && !!window.electronAPI;
}

function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = event.currentTarget.closest('.dropdown');
    if (!dropdown) return;
    document.querySelectorAll('.dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
    });
    dropdown.classList.toggle('open');
}

document.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    }
});

function saveState() {
    try {
        if (currentEditingIndex !== null) updateCurrentSectionInMemory();
        const state = { sections, activeTab };
        localStorage.setItem('bookAuthorToolState', JSON.stringify(state));
        console.log('State saved.');
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem('bookAuthorToolState');
        if (!saved) {
            updatePreview();
            return;
        }
        const state = JSON.parse(saved);
        sections = (state.sections || []).map(s => s.type === SECTION_TYPES.NEWSPAPER ? convertNewspaperToHtml(s) : s);
        switchTab(state.activeTab || TAB_NAMES.CHAPTER);
        updateSectionList();
    } catch (e) {
        console.error('Failed to load state:', e);
        sections = [];
        updatePreview();
    }
}

function clearState() {
    if (!confirm('Clear the entire book? This cannot be undone.')) return;
    sections = [];
    currentEditingIndex = null;
    localStorage.removeItem('bookAuthorToolState');
    updateSectionList();
    document.getElementById('ch-title').value = '';
    document.getElementById('ch-body').value = '';
    clearFootnoteFields();
    switchTab(TAB_NAMES.CHAPTER);
    setEditingNotice();
}

function switchTab(tab) {
    if (currentEditingIndex !== null) {
        updateCurrentSectionInMemory();
        saveState();
    }
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    const target = document.getElementById('tab-' + tab);
    if (target) target.classList.add('active');
    updatePreview();
}

function getChapterData() {
    return {
        type: SECTION_TYPES.CHAPTER,
        title: document.getElementById('ch-title').value,
        body: document.getElementById('ch-body').value,
        preserveBreaks: document.getElementById('ch-preserve').checked,
        footnotes: Array.from(document.querySelectorAll('.footnote-input')).map(el => el.value.trim()).filter(Boolean)
    };
}

function getWorkData() {
    return {
        type: SECTION_TYPES.WORK,
        title: document.getElementById('work-title').value,
        body: document.getElementById('work-body').value,
        font: document.getElementById('work-font').value,
        size: parseFloat(document.getElementById('work-size').value) || 14,
        spacing: parseFloat(document.getElementById('work-spacing').value) || 0,
        align: document.getElementById('work-align').value || 'left'
    };
}

function stripHtmlToInline(html, { removeScripts = true, flattenWhitespace = false } = {}) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        if (removeScripts) {
            doc.querySelectorAll('script, style, link[rel="stylesheet"], meta').forEach(el => el.remove());
            doc.querySelectorAll('*').forEach(el => el.removeAttribute('onload'));
        }
        let content = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
        if (flattenWhitespace) content = content.replace(/\s+/g, ' ').trim();
        return content;
    } catch (e) {
        console.error('HTML strip failed', e);
        return html;
    }
}

function getHtmlImportData() {
    const raw = document.getElementById('html-import-raw').value || '';
    const removeScripts = document.getElementById('html-remove-scripts').checked;
    const flattenWhitespace = document.getElementById('html-flatten').checked;
    const content = stripHtmlToInline(raw, { removeScripts, flattenWhitespace });
    return {
        type: SECTION_TYPES.HTML,
        title: document.getElementById('html-import-title').value || 'HTML Snippet',
        raw,
        content,
        removeScripts,
        flattenWhitespace
    };
}

function updateCurrentSectionInMemory() {
    if (currentEditingIndex === null || !sections[currentEditingIndex]) return;
    const curType = sections[currentEditingIndex].type;
    if (curType === SECTION_TYPES.CHAPTER) sections[currentEditingIndex] = getChapterData();
    else if (curType === SECTION_TYPES.WORK) sections[currentEditingIndex] = getWorkData();
    else if (curType === SECTION_TYPES.HTML) sections[currentEditingIndex] = getHtmlImportData();
    updateSectionList();
}

function addSection(type) {
    let data;
    if (type === SECTION_TYPES.CHAPTER) data = getChapterData();
    else if (type === SECTION_TYPES.WORK) data = getWorkData();
    else if (type === SECTION_TYPES.HTML) data = getHtmlImportData();
    else return;

    const isEditing = currentEditingIndex !== null && sections[currentEditingIndex] && sections[currentEditingIndex].type === type;
    const name = type === SECTION_TYPES.CHAPTER ? 'Chapter' : type === SECTION_TYPES.WORK ? 'Work' : 'HTML Snippet';
    if (isEditing) {
        sections[currentEditingIndex] = data;
        alert(`${name} updated!`);
    } else {
        sections.push(data);
        alert(`${name} added to Story!`);
    }
    currentEditingIndex = null;
    saveState();
    updateSectionList();
    if (activeTab === TAB_NAMES.STORY) paginateStory(); else updatePreview();
    setEditingNotice();
}

const addChapter = () => addSection(SECTION_TYPES.CHAPTER);
const addWork = () => addSection(SECTION_TYPES.WORK);
const addHtmlImport = () => addSection(SECTION_TYPES.HTML);

function removeSection(index) {
    if (currentEditingIndex === index) currentEditingIndex = null;
    sections.splice(index, 1);
    saveState();
    updatePreview();
    updateSectionList();
}

function moveSection(index, direction) {
    if (direction === 'up' && index > 0) {
        [sections[index], sections[index - 1]] = [sections[index - 1], sections[index]];
        if (currentEditingIndex === index) currentEditingIndex = index - 1;
        else if (currentEditingIndex === index - 1) currentEditingIndex = index;
    } else if (direction === 'down' && index < sections.length - 1) {
        [sections[index], sections[index + 1]] = [sections[index + 1], sections[index]];
        if (currentEditingIndex === index) currentEditingIndex = index + 1;
        else if (currentEditingIndex === index + 1) currentEditingIndex = index;
    }
    saveState();
    updatePreview();
    updateSectionList();
}

function getSectionIcon(type) {
    if (type === SECTION_TYPES.WORK) return '✒️';
    if (type === SECTION_TYPES.HTML) return '🌐';
    if (type === SECTION_TYPES.NEWSPAPER) return '📰';
    return '📖';
}

function getSectionTitle(section) {
    if (section.type === SECTION_TYPES.NEWSPAPER) return section.title || 'Newspaper';
    if (section.type === SECTION_TYPES.WORK) return section.title || 'Minor/Major Work';
    if (section.type === SECTION_TYPES.HTML) return section.title || 'HTML Snippet';
    return section.title || 'Untitled Chapter';
}

function updateSectionList() {
    document.getElementById('section-list').innerHTML = sections.map((s, i) => `
        <div class="section-item">
            <span class="section-label">${getSectionIcon(s.type)} ${getSectionTitle(s)}</span>
            <div class="section-actions">
                <button class="icon-btn" title="Edit" onclick="editSection(${i})">✏️</button>
                ${i > 0 ? `<button class="icon-btn" title="Move Up" onclick="moveSection(${i}, 'up')">↑</button>` : ''}
                ${i < sections.length - 1 ? `<button class="icon-btn" title="Move Down" onclick="moveSection(${i}, 'down')">↓</button>` : ''}
                <button class="icon-btn" title="Remove" onclick="removeSection(${i})">✕</button>
            </div>
        </div>
    `).join('');
}

function editSection(index) {
    currentEditingIndex = index;
    const section = sections[index];
    if (section.type === SECTION_TYPES.CHAPTER) {
        document.getElementById('ch-title').value = section.title;
        document.getElementById('ch-body').value = section.body;
        document.getElementById('ch-preserve').checked = section.preserveBreaks !== false;
        loadFootnoteFields(section.footnotes || []);
        switchTab(TAB_NAMES.CHAPTER);
    } else if (section.type === SECTION_TYPES.WORK) {
        document.getElementById('work-title').value = section.title;
        document.getElementById('work-body').value = section.body;
        document.getElementById('work-font').value = section.font;
        document.getElementById('work-size').value = section.size;
        document.getElementById('work-spacing').value = section.spacing;
        document.getElementById('work-align').value = section.align;
        switchTab(TAB_NAMES.WORK);
    } else if (section.type === SECTION_TYPES.HTML) {
        document.getElementById('html-import-title').value = section.title || 'HTML Snippet';
        document.getElementById('html-import-raw').value = section.raw || '';
        document.getElementById('html-remove-scripts').checked = section.removeScripts !== false;
        document.getElementById('html-flatten').checked = !!section.flattenWhitespace;
        switchTab(TAB_NAMES.HTML);
    } else if (section.type === SECTION_TYPES.NEWSPAPER) {
        alert('Newspaper sections are view-only in Lite mode.');
        switchTab(TAB_NAMES.STORY);
    }
    setEditingNotice(`Editing: ${getSectionTitle(section)}`);
}

function createPage(container) {
    const page = document.createElement('div');
    page.className = 'page';
    container.appendChild(page);
    return page;
}

function renderChapter(c) {
    let text = (c.body || '').replace(/\r\n/g, '\n');
    text = text.replace(/—/g, ', ').replace(/–/g, ' ');
    const preserve = c.preserveBreaks !== false;
    const paragraphs = text.split(/\n\s*\n+/).map(p => preserve ? p.trimEnd() : p.replace(/\n+/g, ' ').trim()).filter(Boolean);
    const titleHTML = c.title ? `<h1>${c.title}</h1>` : '';
    const footnotes = Array.isArray(c.footnotes) ? c.footnotes.filter(f => f && f.trim()) : [];
    return { titleHTML, paragraphs, preserve, footnotes };
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function tokenizeText(text) {
    if (tokenCache.has(text)) return tokenCache.get(text);
    const tokens = [];
    const parts = text.split(/(\[\[fn:[\s\S]*?\]\])/);
    parts.forEach(part => {
        if (!part) return;
        if (part.startsWith('[[fn:') && part.endsWith(']]')) {
            const inner = part.slice(5, -2).trim();
            if (inner) tokens.push({ type: 'fn', text: inner });
        } else {
            part.split(/\s+/).filter(Boolean).forEach(w => tokens.push({ type: 'word', text: w }));
        }
    });
    tokenCache.set(text, tokens);
    return tokens;
}

function getFootnotesContainer() {
    return document.getElementById('footnotes-container');
}

function clearFootnoteFields() {
    const cont = getFootnotesContainer();
    if (cont) cont.innerHTML = '';
}

function addFootnoteField(value = '') {
    const cont = getFootnotesContainer();
    if (!cont) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'footnote-item';
    const ta = document.createElement('textarea');
    ta.className = 'footnote-input';
    ta.placeholder = 'Footnote text';
    ta.value = value || '';
    wrapper.appendChild(ta);
    cont.appendChild(wrapper);
    return ta;
}

function loadFootnoteFields(list = []) {
    clearFootnoteFields();
    list.forEach(fn => addFootnoteField(fn));
}

function renderWork(w) {
    let text = w.body || '';
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    const titleHTML = w.title ? `<h2>${w.title}</h2>` : '';
    const style = `font-family:${w.font}; font-size:${w.size}pt; letter-spacing:${w.spacing}em; text-align:${w.align};`;
    return `<div class="work-preview" style="${style}">${titleHTML}${paragraphs.map(p => `<p>${p}</p>`).join('')}</div>`;
}

function renderHtmlSnippet(h) {
    return `<div class="html-snippet">${h.content || ''}</div>`;
}

function renderNewspaper(n) {
    const styleClass = n.style || 'style-british';
    const articlesHTML = (n.articles || []).map(a => {
        const paragraphs = (a.body || '').split(/\n\n+/).filter(p => p.trim());
        let bodyHTML = paragraphs.map(p => `<p>${p.trim().replace(/\n/g, ' ')}</p>`).join('');
        const adHTML = (a.adTitle || a.adBody) ? `<div class="ad-box"><div class="ad-title">${a.adTitle || ''}</div><div class="ad-body">${a.adBody || ''}</div></div>` : '';
        let articleContent = a.adPos === 'start' ? adHTML + bodyHTML : a.adPos === 'end' ? bodyHTML + adHTML : bodyHTML;
        return `<div class="article-block"><h2>${a.headline || ''}</h2><h3>${a.subhead || ''}</h3><div class="article-body cols-${a.cols || 2}">${articleContent}</div></div>`;
    }).join('<hr class="divider">');
    return `<div class="newspaper ${styleClass}"><div class="masthead"><h1>${n.title || ''}</h1></div><div class="meta">${n.meta || ''}</div><div class="newspaper-body">${articlesHTML}</div></div>`;
}

function convertNewspaperToHtml(section) {
    return {
        type: SECTION_TYPES.HTML,
        title: section.title || 'Newspaper',
        raw: '',
        content: renderNewspaper(section),
        removeScripts: false,
        flattenWhitespace: false
    };
}

function isOverflowing(element) {
    const buffer = element.clientHeight * 0.02;
    return element.scrollHeight > element.clientHeight + buffer;
}

function paginateStory() {
    const preview = document.getElementById('book-preview');
    preview.innerHTML = '';
    if (!sections.length) return;
    let currentPage = createPage(preview);

    const createProseFragment = (className) => {
        const fragment = document.createDocumentFragment();
        const proseEl = document.createElement('div');
        proseEl.className = className;
        fragment.appendChild(proseEl);
        const paragraph = document.createElement('p');
        proseEl.appendChild(paragraph);
        return { fragment, proseEl, paragraph };
    };

    for (const section of sections) {
        if (section.type === SECTION_TYPES.CHAPTER) {
            if (currentPage.innerHTML.trim() !== '') currentPage = createPage(preview);
            const { titleHTML, paragraphs, preserve, footnotes = [] } = renderChapter(section);
            const initial = createProseFragment('chapter-prose' + (preserve ? ' preserve-breaks' : ''));
            currentPage.appendChild(initial.fragment);
            let prose = initial.proseEl;
            let p = initial.paragraph;

            if (titleHTML) {
                const temp = document.createElement('div');
                temp.innerHTML = titleHTML;
                const h = temp.firstChild;
                const firstPara = prose.querySelector('p');
                if (firstPara) prose.insertBefore(h, firstPara); else prose.appendChild(h);
                if (isOverflowing(currentPage)) {
                    prose.removeChild(h);
                    currentPage = createPage(preview);
                    const next = createProseFragment(prose.className);
                    next.proseEl.insertBefore(h, next.paragraph);
                    currentPage.appendChild(next.fragment);
                    prose = next.proseEl;
                    p = next.paragraph;
                }
            }

            if (!p) {
                p = document.createElement('p');
                prose.appendChild(p);
            }
            if (prose.querySelectorAll('p').length === 1 && titleHTML) p.style.textIndent = '0';

            for (const para of paragraphs) {
                const lines = preserve ? para.split('\n') : [para.replace(/\n+/g, ' ')];
                lines.forEach((line, idxLine) => {
                    const tokens = tokenizeText(line);
                    tokens.forEach(token => {
                        const originalHTML = p.innerHTML;
                        if (token.type === 'fn') {
                            p.innerHTML += (p.innerHTML ? ' ' : '') + `<span class="footnote">${escapeHtml(token.text)}</span>`;
                        } else {
                            p.innerHTML += (p.innerHTML ? ' ' : '') + token.text;
                        }
                        if (isOverflowing(currentPage)) {
                            p.innerHTML = originalHTML;
                            currentPage = createPage(preview);
                            const next = createProseFragment('chapter-prose' + (preserve ? ' preserve-breaks no-dropcap' : ' no-dropcap'));
                            currentPage.appendChild(next.fragment);
                            prose = next.proseEl;
                            p = next.paragraph;
                            if (token.type === 'fn') p.innerHTML = `<span class="footnote">${escapeHtml(token.text)}</span>`;
                            else p.innerHTML = token.text;
                        }
                    });
                    if (preserve && idxLine < lines.length - 1) p.appendChild(document.createElement('br'));
                });
                if (prose.innerHTML.trim() !== '') {
                    p = document.createElement('p');
                    prose.appendChild(p);
                }
            }

            if (footnotes.length) {
                footnotes.forEach((fn, idx) => {
                    const fnPara = document.createElement('p');
                    fnPara.className = 'footnote-block';
                    fnPara.innerHTML = `<sup>${idx + 1}</sup>${escapeHtml(fn).replace(/\n/g, '<br>')}`;
                    prose.appendChild(fnPara);
                    if (isOverflowing(currentPage)) {
                        prose.removeChild(fnPara);
                        currentPage = createPage(preview);
                        const next = createProseFragment('chapter-prose no-dropcap');
                        currentPage.appendChild(next.fragment);
                        prose = next.proseEl;
                        const newFn = document.createElement('p');
                        newFn.className = 'footnote-block';
                        newFn.innerHTML = `<sup>${idx + 1}</sup>${escapeHtml(fn).replace(/\n/g, '<br>')}`;
                        prose.appendChild(newFn);
                        p = next.paragraph;
                        prose.appendChild(p);
                    }
                });
            }
        } else if (section.type === SECTION_TYPES.WORK) {
            if (currentPage.innerHTML.trim() !== '') currentPage = createPage(preview);
            currentPage.innerHTML = renderWork(section);
            if (isOverflowing(currentPage)) {
                const temp = document.createElement('div');
                temp.innerHTML = renderWork(section);
                const paras = Array.from(temp.querySelectorAll('p'));
                currentPage.innerHTML = '';
                const styleString = `font-family:${section.font}; font-size:${section.size}pt; letter-spacing:${section.spacing}em; text-align:${section.align}; padding-bottom:8px;`;
                let wrapper = document.createElement('div');
                wrapper.className = 'work-preview';
                wrapper.style.cssText = styleString;
                if (section.title) {
                    const h2 = document.createElement('h2');
                    h2.textContent = section.title;
                    wrapper.appendChild(h2);
                }
                currentPage.appendChild(wrapper);
                let paraEl = null;
                const ensurePara = () => {
                    paraEl = document.createElement('p');
                    wrapper.appendChild(paraEl);
                };
                ensurePara();
                paras.forEach((paraText, idx) => {
                    const words = paraText.textContent.split(' ');
                    words.forEach(word => {
                        const original = paraEl.textContent;
                        paraEl.textContent = (paraEl.textContent ? paraEl.textContent + ' ' : '') + word;
                        if (isOverflowing(currentPage)) {
                            paraEl.textContent = original;
                            currentPage = createPage(preview);
                            const newWrapper = document.createElement('div');
                            newWrapper.className = 'work-preview';
                            newWrapper.style.cssText = styleString;
                            const frag = document.createDocumentFragment();
                            frag.appendChild(newWrapper);
                            currentPage.appendChild(frag);
                            paraEl = document.createElement('p');
                            paraEl.textContent = word;
                            newWrapper.appendChild(paraEl);
                            wrapper = newWrapper;
                        }
                    });
                    if (idx < paras.length - 1) {
                        paraEl = document.createElement('p');
                        wrapper.appendChild(paraEl);
                    }
                });
            }
        } else if (section.type === SECTION_TYPES.HTML) {
            if (currentPage.innerHTML.trim() !== '') currentPage = createPage(preview);
            const frag = document.createElement('div');
            frag.className = 'html-snippet';
            frag.innerHTML = section.content || '';
            currentPage.appendChild(frag);
            if (isOverflowing(currentPage)) {
                currentPage.removeChild(frag);
                currentPage = createPage(preview);
                currentPage.appendChild(frag);
            }
        } else if (section.type === SECTION_TYPES.NEWSPAPER) {
            if (currentPage.innerHTML.trim() !== '') currentPage = createPage(preview);
            currentPage.innerHTML = renderNewspaper(section);
            currentPage.classList.add('newspaper-page');
        }
    }
    if (preview.lastChild && preview.lastChild.innerHTML.trim() === '') preview.removeChild(preview.lastChild);
}

function updatePreview() {
    const preview = document.getElementById('book-preview');
    preview.innerHTML = '';

    if (activeTab === TAB_NAMES.CHAPTER) {
        const page = createPage(preview);
        page.classList.add('chapter-preview');
        const data = getChapterData();
        const { titleHTML, paragraphs, preserve, footnotes } = renderChapter(data);
        const bodyHtml = paragraphs.map(p => `<p>${preserve ? p.replace(/\n/g, '<br>') : p}`.replace(/\[\[fn:(.+?)\]\]/g, (_, t) => `<span class="footnote">${escapeHtml(t)}</span>` ) + '</p>').join('');
        const footHtml = footnotes.map((fn, idx) => `<p class="footnote-block"><sup>${idx + 1}</sup>${escapeHtml(fn).replace(/\n/g, '<br>')}</p>`).join('');
        page.innerHTML = `<div class="chapter-prose${preserve ? ' preserve-breaks' : ''}">${titleHTML}${bodyHtml}${footHtml}</div>`;
    } else if (activeTab === TAB_NAMES.WORK) {
        const page = createPage(preview);
        page.classList.add('work-preview');
        page.innerHTML = renderWork(getWorkData());
    } else if (activeTab === TAB_NAMES.HTML) {
        const page = createPage(preview);
        page.classList.add('html-preview');
        page.innerHTML = renderHtmlSnippet(getHtmlImportData());
    } else if (activeTab === TAB_NAMES.STORY) {
        paginateStory();
    } else {
        paginateStory();
    }
}

function triggerImportState() {
    if (isElectron() && window.electronAPI?.loadState) {
        window.electronAPI.loadState().then(res => {
            if (res?.ok && res.data) {
                localStorage.setItem('bookAuthorToolState', res.data);
                loadState();
                alert(`State loaded${res.path ? ' from ' + res.path : ''}`);
            } else if (res?.message) {
                alert(res.message);
            }
        }).catch(err => {
            console.error('Electron load failed', err);
            alert('Load failed: ' + err.message);
        });
    } else {
        const input = document.getElementById('state-file-input');
        if (input) input.click();
    }
}

function importStateFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const parsed = JSON.parse(text);
            localStorage.setItem('bookAuthorToolState', JSON.stringify(parsed));
            loadState();
            alert('State imported!');
        } catch (err) {
            console.error('Import failed', err);
            alert('Import failed: ' + err.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

async function exportPdf() {
    try {
        if (activeTab !== TAB_NAMES.STORY) {
            paginateStory();
        }
        if (isElectron() && window.electronAPI?.exportPdf) {
            const res = await window.electronAPI.exportPdf();
            if (!res?.ok) throw new Error(res?.message || 'Export failed');
            alert(`PDF exported${res.path ? ' to ' + res.path : ''}`);
        } else {
            window.print();
        }
    } catch (e) {
        console.error('PDF export failed', e);
        alert('PDF export failed: ' + e.message);
    }
}

function setEditingNotice(text = '') {
    if (!editingNoticeEl) return;
    editingNoticeEl.textContent = text;
    if (applyEditBtn) applyEditBtn.disabled = currentEditingIndex === null;
}

function applyCurrentEdit() {
    if (currentEditingIndex === null) return;
    updateCurrentSectionInMemory();
    saveState();
    updateSectionList();
    if (activeTab === TAB_NAMES.STORY) paginateStory(); else updatePreview();
    setEditingNotice();
}

function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveState, 1000);
}

function schedulePreview() {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(updatePreview, 300);
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', function() {
    loadState();
    editingNoticeEl = document.getElementById('editing-notice');
    applyEditBtn = document.getElementById('apply-edit-btn');
    setEditingNotice();

    const inputs = document.querySelectorAll('#tab-chapter input, #tab-chapter textarea, #tab-work input, #tab-work textarea, #tab-work select, #tab-html input, #tab-html textarea');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            if (activeTab !== TAB_NAMES.STORY) schedulePreview();
            if (currentEditingIndex !== null) scheduleSave();
            scheduleSave();
        });
    });
});
