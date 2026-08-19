'use strict';

const LANGUAGE_KEYS = ['zh-CN', 'en-US', 'ru-RU'];
const labels = {
    langName: '语言短名称', langLabel: '语言选择器标签', dir: '文字方向', profiles: '个人照片',
    profileImgCounterTitle: '照片计数标题', links: '链接', name: '姓名', aka: '别名', desc: '简介',
    keywords: '关键词', mirrorNotice: '镜像提示', markdown: 'Markdown', captchaLoading: '验证码加载中',
    captchaLoadingFailed: '验证码加载失败', moreContactLoading: '更多联系方式加载中',
    moreContactLoadingFailed: '更多联系方式加载失败', photoSwipe: '图片查看器', colorScheme: '颜色主题',
    src: '图片地址', width: '宽度', height: '高度', alt: '替代文本', title: '标题', icon: '图标', href: '网址',
    closeTitle: '关闭按钮标题', zoomTitle: '缩放按钮标题', arrowPrevTitle: '上一张按钮标题',
    arrowNextTitle: '下一张按钮标题', errorMsg: '错误消息', indexIndicatorSep: '索引分隔符',
    label: '标签', light: '浅色', dark: '深色', system: '系统'
};
const state = {
    content: null,
    revision: null,
    dirty: false,
    saving: false,
    selections: [sessionStorage.getItem('editor-left-language') || 'zh-CN', sessionStorage.getItem('editor-right-language') || 'en-US']
};
const panelsElement = document.getElementById('panels');
const statusElement = document.getElementById('status');
const saveButton = document.getElementById('save-button');
const reloadButton = document.getElementById('reload-button');
const apiToken = new URLSearchParams(location.hash.slice(1)).get('token');

function apiHeaders(json = false) {
    const headers = { Authorization: `Bearer ${apiToken || ''}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
}

function setStatus(message, kind = '') {
    statusElement.textContent = message;
    statusElement.className = `status ${kind}`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeElement(tagName, text, className) {
    const element = document.createElement(tagName);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}

function displayName(key) {
    return labels[key] || key;
}

function pathValue(path) {
    return path.reduce((value, key) => value[key], state.content);
}

function setPathValue(path, value) {
    const parent = path.slice(0, -1).reduce((current, key) => current[key], state.content);
    parent[path.at(-1)] = value;
    markDirty();
}

function markDirty() {
    state.dirty = true;
    saveButton.disabled = state.saving;
    setStatus('有未保存的修改。');
}

function fieldControl(path, key, value) {
    const wrapper = makeElement('div', undefined, 'field');
    const label = makeElement('label', displayName(key));
    const isLong = key === 'markdown' || key === 'mirrorNotice' || key.includes('Failed') || key === 'desc';
    const control = makeElement(isLong ? 'textarea' : 'input');
    control.name = path.join('.');
    if (key === 'width' || key === 'height') {
        control.type = 'number';
        control.min = '1';
        control.step = '1';
    }
    control.value = value;
    control.id = `field-${path.join('-')}`;
    label.htmlFor = control.id;
    control.addEventListener('input', () => {
        const nextValue = control.type === 'number' ? Number(control.value) : control.value;
        setPathValue(path, nextValue);
    });
    wrapper.append(label, control);
    return { wrapper, control };
}

function renderScalar(parent, path, key, value) {
    const { wrapper, control } = fieldControl(path, key, value);
    if (key === 'markdown') {
        control.className = 'markdown-editor';
        const previewLabel = makeElement('label', 'Markdown 预览');
        previewLabel.htmlFor = `preview-${path.join('-')}`;
        const preview = makeElement('div', undefined, 'preview');
        preview.id = previewLabel.htmlFor;
        preview.setAttribute('aria-live', 'polite');
        const updatePreview = () => {
            try {
                const html = marked.parse(control.value);
                preview.replaceChildren();
                const template = document.createElement('template');
                template.innerHTML = html;
                sanitizePreview(template.content);
                preview.append(template.content.cloneNode(true));
            } catch (error) {
                preview.replaceChildren(makeElement('p', `预览失败：${error.message}`, 'field-error'));
            }
        };
        let timer;
        control.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(updatePreview, 180);
        });
        updatePreview();
        wrapper.append(previewLabel, preview);
    }
    parent.append(wrapper);
}

function sanitizePreview(fragment) {
    for (const element of [...fragment.querySelectorAll('*')]) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'SVG', 'MATH'].includes(element.tagName)) {
            element.remove();
            continue;
        }
        for (const attribute of [...element.attributes]) {
            if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
            if (['href', 'src', 'action', 'xlink:href'].includes(attribute.name.toLowerCase())) {
                try {
                    const url = new URL(attribute.value, location.href);
                    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) element.removeAttribute(attribute.name);
                } catch {
                    element.removeAttribute(attribute.name);
                }
            }
        }
        if (element.tagName === 'A' && element.getAttribute('target') === '_blank') element.setAttribute('rel', 'noopener noreferrer');
    }
}

function renderObject(parent, path, key, value) {
    const fieldset = makeElement('fieldset');
    fieldset.append(makeElement('legend', displayName(key)));
    for (const [childKey, childValue] of Object.entries(value)) renderValue(fieldset, [...path, childKey], childKey, childValue);
    parent.append(fieldset);
}

function renderArray(parent, path, key, value) {
    const fieldset = makeElement('fieldset');
    fieldset.append(makeElement('legend', displayName(key)));
    value.forEach((item, index) => {
        const itemWrapper = makeElement('section', undefined, 'array-item');
        const heading = makeElement('p', `${displayName(key)} ${index + 1}`, 'item-heading');
        const actions = makeElement('div', undefined, 'item-actions');
        if (index > 0) {
            const up = makeElement('button', '上移');
            up.type = 'button';
            up.addEventListener('click', () => { [value[index - 1], value[index]] = [value[index], value[index - 1]]; markDirty(); render(); });
            actions.append(up);
        }
        if (index < value.length - 1) {
            const down = makeElement('button', '下移');
            down.type = 'button';
            down.addEventListener('click', () => { [value[index], value[index + 1]] = [value[index + 1], value[index]]; markDirty(); render(); });
            actions.append(down);
        }
        const remove = makeElement('button', '删除', 'danger');
        remove.type = 'button';
        remove.addEventListener('click', () => { value.splice(index, 1); markDirty(); render(); });
        actions.append(remove);
        heading.append(actions);
        itemWrapper.append(heading);
        for (const [childKey, childValue] of Object.entries(item)) renderValue(itemWrapper, [...path, index, childKey], childKey, childValue);
        fieldset.append(itemWrapper);
    });
    const add = makeElement('button', '新增');
    add.type = 'button';
    add.addEventListener('click', () => {
        const template = key === 'profiles' ? { src: 'https://', width: 1, height: 1, alt: '' } : { title: '', icon: 'uil:globe', href: 'https://' };
        value.push(template);
        markDirty();
        render();
    });
    fieldset.append(makeElement('div', undefined, 'array-actions')).append(add);
    parent.append(fieldset);
}

function renderValue(parent, path, key, value) {
    if (Array.isArray(value)) return renderArray(parent, path, key, value);
    if (value && typeof value === 'object') return renderObject(parent, path, key, value);
    renderScalar(parent, path, key, value);
}

function renderPanel(index) {
    const languageKey = state.selections[index];
    const locale = state.content[languageKey];
    const panel = makeElement('section', undefined, 'panel');
    panel.dataset.language = languageKey;
    const header = makeElement('div', undefined, 'panel-header');
    const heading = makeElement('h2', `${index === 0 ? '左栏' : '右栏'}：${languageKey}（${locale.langName}）`);
    const select = makeElement('select');
    select.setAttribute('aria-label', `${index === 0 ? '左栏' : '右栏'}语言`);
    for (const key of LANGUAGE_KEYS) {
        const option = makeElement('option', `${key} — ${state.content[key].langName}`);
        option.value = key;
        option.selected = key === languageKey;
        select.append(option);
    }
    select.addEventListener('change', () => {
        state.selections[index] = select.value;
        sessionStorage.setItem(index === 0 ? 'editor-left-language' : 'editor-right-language', select.value);
        render();
    });
    header.append(heading, select);
    panel.append(header);
    for (const [key, value] of Object.entries(locale)) renderValue(panel, [languageKey, key], key, value);
    return panel;
}

function render() {
    if (!state.content) return;
    panelsElement.replaceChildren(renderPanel(0), renderPanel(1));
    panelsElement.setAttribute('aria-busy', 'false');
    saveButton.disabled = state.saving || !state.dirty;
}

async function loadContent() {
    setStatus('正在读取 content.js……');
    const response = await fetch('/api/content', { headers: apiHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '读取失败。');
    state.content = body.content;
    state.revision = body.revision;
    state.dirty = false;
    render();
    setStatus('已加载，可以开始编辑。', 'success');
}

async function saveContent() {
    if (!state.content || state.saving) return;
    state.saving = true;
    saveButton.disabled = true;
    setStatus('正在保存……');
    try {
        const response = await fetch('/api/content', {
            method: 'POST',
            headers: apiHeaders(true),
            body: JSON.stringify({ content: state.content, expectedRevision: state.revision })
        });
        const body = await response.json();
        if (!response.ok) {
            if (Array.isArray(body.errors)) throw new Error(body.errors.join('\n'));
            throw new Error(body.error || '保存失败。');
        }
        state.revision = body.revision;
        state.dirty = false;
        setStatus(`保存成功。备份：${body.backup}`, 'success');
    } catch (error) {
        setStatus(error.message, 'error');
    } finally {
        state.saving = false;
        saveButton.disabled = !state.dirty;
    }
}

reloadButton.addEventListener('click', async () => {
    if (state.dirty && !window.confirm('存在未保存的修改，确定重新加载吗？')) return;
    try {
        await loadContent();
    } catch (error) {
        setStatus(error.message, 'error');
    }
});
saveButton.addEventListener('click', saveContent);
document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveContent();
    }
});
window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
});

loadContent().catch(error => {
    panelsElement.setAttribute('aria-busy', 'false');
    setStatus(error.message, 'error');
});
