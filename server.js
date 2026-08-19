import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_PATH = path.join(ROOT_DIR, 'res', 'content.js');
const BACKUP_DIR = path.join(ROOT_DIR, 'res', '.content-backups');
const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_BACKUPS = 20;
const TOKEN = crypto.randomBytes(32).toString('base64url');
const LANGUAGE_KEYS = ['zh-CN', 'en-US', 'ru-RU'];
const LOCALE_FIELDS = [
    'langName',
    'langLabel',
    'dir',
    'profiles',
    'profileImgCounterTitle',
    'links',
    'name',
    'aka',
    'desc',
    'keywords',
    'mirrorNotice',
    'markdown',
    'captchaLoading',
    'captchaLoadingFailed',
    'moreContactLoading',
    'moreContactLoadingFailed',
    'photoSwipe',
    'colorScheme'
];
const PROFILE_FIELDS = ['src', 'width', 'height', 'alt'];
const LINK_FIELDS = ['title', 'icon', 'href'];
const PHOTO_SWIPE_FIELDS = ['closeTitle', 'zoomTitle', 'arrowPrevTitle', 'arrowNextTitle', 'errorMsg', 'indexIndicatorSep'];
const COLOR_SCHEME_FIELDS = ['label', 'light', 'dark', 'system'];
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webp': 'image/webp'
};

function createObject() {
    return Object.create(null);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function parseContentSource(source) {
    const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    if (program.body.length !== 1) throw new Error('content.js 必须只包含一个声明。');

    const statement = program.body[0];
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const' || statement.declarations.length !== 1) {
        throw new Error('content.js 必须以 const content = { ... }; 的形式声明。');
    }

    const declaration = statement.declarations[0];
    if (declaration.id.type !== 'Identifier' || declaration.id.name !== 'content' || !declaration.init) {
        throw new Error('未找到 content 对象声明。');
    }

    return readNode(declaration.init);
}

function readNode(node) {
    if (node.type === 'Literal') return node.value;
    if (node.type === 'TemplateLiteral') {
        if (node.expressions.length !== 0) throw new Error('模板字符串中不能包含插值。');
        return node.quasis.map(quasi => quasi.value.cooked).join('');
    }
    if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+') && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
        return node.operator === '-' ? -node.argument.value : node.argument.value;
    }
    if (node.type === 'ArrayExpression') {
        return node.elements.map((element) => {
            if (!element) throw new Error('数组中不能有空元素。');
            return readNode(element);
        });
    }
    if (node.type === 'ObjectExpression') {
        const value = createObject();
        for (const property of node.properties) {
            if (property.type !== 'Property' || property.kind !== 'init' || property.computed || property.method || property.shorthand) {
                throw new Error('对象中只能包含静态键值对。');
            }
            const key = readPropertyKey(property.key);
            if (PROTOTYPE_KEYS.has(key) || Object.prototype.hasOwnProperty.call(value, key)) {
                throw new Error(`不允许的重复或危险字段：${key}`);
            }
            value[key] = readNode(property.value);
        }
        return value;
    }

    throw new Error(`不支持的内容语法：${node.type}`);
}

function readPropertyKey(node) {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'Literal' && (typeof node.value === 'string' || typeof node.value === 'number')) return String(node.value);
    throw new Error('对象键必须是静态字符串或标识符。');
}

function assertKeys(value, expected, fieldPath, errors) {
    const keys = Object.keys(value);
    for (const key of keys) {
        if (!expected.includes(key)) errors.push(`${fieldPath}.${key} 不是允许的字段。`);
    }
    for (const key of expected) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${fieldPath}.${key} 是必填字段。`);
    }
}

function assertString(value, fieldPath, errors, maximum = 20_000) {
    if (typeof value !== 'string') {
        errors.push(`${fieldPath} 必须是文本。`);
    } else if (value.length > maximum) {
        errors.push(`${fieldPath} 不能超过 ${maximum} 个字符。`);
    }
}

function assertSafeUrl(value, fieldPath, errors, allowedProtocols) {
    assertString(value, fieldPath, errors, 4_000);
    if (typeof value !== 'string') return;
    try {
        const url = new URL(value);
        if (!allowedProtocols.includes(url.protocol)) errors.push(`${fieldPath} 的协议不被允许。`);
    } catch {
        errors.push(`${fieldPath} 不是有效网址。`);
    }
}

function validateLocale(locale, languageKey, errors) {
    const base = `content.${languageKey}`;
    if (!isPlainObject(locale)) {
        errors.push(`${base} 必须是对象。`);
        return;
    }
    assertKeys(locale, LOCALE_FIELDS, base, errors);

    for (const key of LOCALE_FIELDS) {
        if (['profiles', 'links', 'photoSwipe', 'colorScheme'].includes(key)) continue;
        assertString(locale[key], `${base}.${key}`, errors, key === 'markdown' ? 500_000 : 20_000);
    }
    if (locale.dir !== 'ltr' && locale.dir !== 'rtl') errors.push(`${base}.dir 必须是 ltr 或 rtl。`);

    if (!Array.isArray(locale.profiles) || locale.profiles.length === 0 || locale.profiles.length > 20) {
        errors.push(`${base}.profiles 必须包含 1 到 20 项。`);
    } else {
        locale.profiles.forEach((profile, index) => {
            const profilePath = `${base}.profiles[${index}]`;
            if (!isPlainObject(profile)) {
                errors.push(`${profilePath} 必须是对象。`);
                return;
            }
            assertKeys(profile, PROFILE_FIELDS, profilePath, errors);
            assertSafeUrl(profile.src, `${profilePath}.src`, errors, ['https:', 'http:']);
            for (const dimension of ['width', 'height']) {
                if (!Number.isSafeInteger(profile[dimension]) || profile[dimension] <= 0 || profile[dimension] > 100_000) {
                    errors.push(`${profilePath}.${dimension} 必须是正整数。`);
                }
            }
            assertString(profile.alt, `${profilePath}.alt`, errors);
        });
    }

    if (!Array.isArray(locale.links) || locale.links.length > 50) {
        errors.push(`${base}.links 最多可以包含 50 项。`);
    } else {
        locale.links.forEach((link, index) => {
            const linkPath = `${base}.links[${index}]`;
            if (!isPlainObject(link)) {
                errors.push(`${linkPath} 必须是对象。`);
                return;
            }
            assertKeys(link, LINK_FIELDS, linkPath, errors);
            assertString(link.title, `${linkPath}.title`, errors);
            assertString(link.icon, `${linkPath}.icon`, errors, 200);
            if (typeof link.icon === 'string' && !/^[a-z0-9-]+:[a-z0-9-]+$/i.test(link.icon)) errors.push(`${linkPath}.icon 的格式无效。`);
            assertSafeUrl(link.href, `${linkPath}.href`, errors, ['https:', 'http:', 'mailto:']);
        });
    }

    validateStringObject(locale.photoSwipe, PHOTO_SWIPE_FIELDS, `${base}.photoSwipe`, errors);
    validateStringObject(locale.colorScheme, COLOR_SCHEME_FIELDS, `${base}.colorScheme`, errors);
}

function validateStringObject(value, expectedFields, fieldPath, errors) {
    if (!isPlainObject(value)) {
        errors.push(`${fieldPath} 必须是对象。`);
        return;
    }
    assertKeys(value, expectedFields, fieldPath, errors);
    for (const key of expectedFields) assertString(value[key], `${fieldPath}.${key}`, errors);
}

function validateContent(content) {
    const errors = [];
    if (!isPlainObject(content)) return ['content 必须是对象。'];
    assertKeys(content, LANGUAGE_KEYS, 'content', errors);
    for (const languageKey of LANGUAGE_KEYS) validateLocale(content[languageKey], languageKey, errors);
    return errors;
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
}

function orderedContent(content) {
    const result = createObject();
    for (const languageKey of LANGUAGE_KEYS) {
        const locale = content[languageKey];
        const normalizedLocale = createObject();
        for (const key of LOCALE_FIELDS) {
            if (key === 'profiles') normalizedLocale[key] = locale[key].map(profile => orderedObject(profile, PROFILE_FIELDS));
            else if (key === 'links') normalizedLocale[key] = locale[key].map(link => orderedObject(link, LINK_FIELDS));
            else if (key === 'photoSwipe') normalizedLocale[key] = orderedObject(locale[key], PHOTO_SWIPE_FIELDS);
            else if (key === 'colorScheme') normalizedLocale[key] = orderedObject(locale[key], COLOR_SCHEME_FIELDS);
            else normalizedLocale[key] = locale[key];
        }
        result[languageKey] = normalizedLocale;
    }
    return result;
}

function orderedObject(value, keys) {
    const result = createObject();
    for (const key of keys) result[key] = value[key];
    return result;
}

function serializeContent(content) {
    return `const content = ${JSON.stringify(orderedContent(content), null, 4)};\n`;
}

async function loadContent() {
    const source = await fsp.readFile(CONTENT_PATH, 'utf8');
    const content = parseContentSource(source);
    const errors = validateContent(content);
    if (errors.length > 0) throw new Error(`content.js 的现有结构无效：${errors.join(' ')}`);
    return { content, revision: sha256(source) };
}

async function saveContent(content, expectedRevision) {
    const source = await fsp.readFile(CONTENT_PATH, 'utf8');
    const revision = sha256(source);
    if (expectedRevision !== revision) return { conflict: true };

    const errors = validateContent(content);
    if (errors.length > 0) return { errors };

    const backup = await createBackup(source);
    const output = serializeContent(content);
    await replaceContent(output, source);
    return { backup, revision: sha256(output) };
}

async function createBackup(source) {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const backupName = `content.${stamp}.${crypto.randomBytes(4).toString('hex')}.js`;
    await fsp.writeFile(path.join(BACKUP_DIR, backupName), source, { encoding: 'utf8', mode: 0o600 });
    const backups = (await fsp.readdir(BACKUP_DIR, { withFileTypes: true }))
        .filter(entry => entry.isFile() && /^content\..+\.js$/.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    await Promise.all(backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS)).map(entry => fsp.unlink(path.join(BACKUP_DIR, entry.name))));
    return path.posix.join('res/.content-backups', backupName);
}

async function replaceContent(output, originalSource) {
    const temporaryPath = path.join(path.dirname(CONTENT_PATH), `.content.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    const handle = await fsp.open(temporaryPath, 'wx', 0o600);
    try {
        await handle.writeFile(output, 'utf8');
        await handle.sync();
    } finally {
        await handle.close();
    }

    try {
        await fsp.rename(temporaryPath, CONTENT_PATH);
    } catch (error) {
        try {
            await fsp.copyFile(temporaryPath, CONTENT_PATH);
            await fsp.unlink(temporaryPath);
        } catch (fallbackError) {
            try {
                await fsp.writeFile(CONTENT_PATH, originalSource, { encoding: 'utf8', mode: 0o600 });
            } catch {
                // The dedicated backup created before this point remains available for recovery.
            }
            throw fallbackError;
        }
    }
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const parts = [];
        request.on('data', (part) => {
            size += part.length;
            if (size > MAX_BODY_BYTES) {
                reject(Object.assign(new Error('请求内容过大。'), { statusCode: 413 }));
                request.destroy();
                return;
            }
            parts.push(part);
        });
        request.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
        request.on('error', reject);
    });
}

function sendJson(response, statusCode, data) {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify(data));
}

function sendError(response, statusCode, message, extra = createObject()) {
    sendJson(response, statusCode, { error: message, ...extra });
}

function isAuthorized(request, url) {
    const authorization = request.headers.authorization;
    const expected = `Bearer ${TOKEN}`;
    return authorization === expected && url.searchParams.get('token') === null;
}

function isTrustedRequest(request) {
    const host = request.headers.host;
    if (host !== `${HOST}:${PORT}` && host !== HOST) return false;
    const origin = request.headers.origin;
    return !origin || origin === `http://${HOST}:${PORT}`;
}

async function handleApi(request, response, url) {
    if (!isTrustedRequest(request)) return sendError(response, 403, '请求来源不受信任。');
    if (!isAuthorized(request, url)) return sendError(response, 401, '需要本地编辑器令牌。');

    if (request.method === 'GET' && url.pathname === '/api/content') {
        try {
            const { content, revision } = await loadContent();
            return sendJson(response, 200, { content, revision, languages: LANGUAGE_KEYS });
        } catch (error) {
            return sendError(response, 500, '无法读取 content.js。', { detail: error.message });
        }
    }

    if (request.method === 'POST' && url.pathname === '/api/content') {
        if (!request.headers['content-type']?.startsWith('application/json')) return sendError(response, 415, '请求必须使用 application/json。');
        try {
            const body = JSON.parse(await readRequestBody(request));
            if (!isPlainObject(body) || typeof body.expectedRevision !== 'string' || !Object.prototype.hasOwnProperty.call(body, 'content')) {
                return sendError(response, 400, '请求格式无效。');
            }
            const result = await saveContent(body.content, body.expectedRevision);
            if (result.conflict) return sendError(response, 409, '文件已在其他位置更新，请重新加载后再保存。');
            if (result.errors) return sendError(response, 400, '内容校验失败。', { errors: result.errors });
            return sendJson(response, 200, { revision: result.revision, backup: result.backup });
        } catch (error) {
            const statusCode = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
            return sendError(response, statusCode, statusCode === 400 ? '请求 JSON 无效。' : '无法保存 content.js。');
        }
    }

    return sendError(response, 404, '未找到 API 路径。');
}

function resolveStaticPath(urlPath) {
    const relativePath = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
    const filePath = path.resolve(ROOT_DIR, relativePath);
    if (filePath !== ROOT_DIR && !filePath.startsWith(`${ROOT_DIR}${path.sep}`)) return null;
    return filePath;
}

async function serveStatic(response, url) {
    const filePath = resolveStaticPath(url.pathname === '/editor/' ? '/editor.html' : url.pathname);
    if (!filePath) return sendPlain(response, 403, 'Forbidden');
    try {
        const stats = await fsp.stat(filePath);
        if (!stats.isFile()) return sendPlain(response, 404, 'Not Found');
        const extension = path.extname(filePath).toLowerCase();
        const isEditorFile = filePath === path.join(ROOT_DIR, 'editor.html') || filePath === path.join(ROOT_DIR, 'res', 'editor.js') || filePath === path.join(ROOT_DIR, 'res', 'editor.css');
        response.writeHead(200, {
            'Cache-Control': isEditorFile ? 'no-store' : 'public, max-age=300',
            'Content-Security-Policy': isEditorFile ? "default-src 'self'; connect-src 'self'; img-src 'self' https: http:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-src 'none'; object-src 'none'" : "default-src 'self' https:; base-uri 'self'",
            'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff'
        });
        fs.createReadStream(filePath).pipe(response);
    } catch (error) {
        if (error.code === 'ENOENT') return sendPlain(response, 404, 'Not Found');
        return sendPlain(response, 500, 'Internal Server Error');
    }
}

function sendPlain(response, statusCode, message) {
    response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    response.end(message);
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || HOST}`);
    if (url.pathname.startsWith('/api/')) return handleApi(request, response, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendPlain(response, 405, 'Method Not Allowed');
    return serveStatic(response, url);
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    server.listen(PORT, HOST, () => {
        console.log(`内容编辑器已启动： http://${HOST}:${PORT}/editor/#token=${TOKEN}`);
        console.log('该地址仅绑定到本机。按 Ctrl+C 停止服务。');
    });
}

export {
    LANGUAGE_KEYS,
    parseContentSource,
    serializeContent,
    validateContent,
    createServer
};

function createServer() {
    return server;
}
