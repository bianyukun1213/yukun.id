import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { parseContentSource, serializeContent, validateContent } from '../server.js';

const source = fs.readFileSync(new URL('../res/content.js', import.meta.url), 'utf8');

describe('content.js parser and serializer', () => {
    test('round-trips the current localized content', () => {
        const content = parseContentSource(source);
        expect(Object.keys(content)).toEqual(['zh-CN', 'en-US', 'ru-RU']);
        expect(validateContent(content)).toEqual([]);
        expect(parseContentSource(serializeContent(content))).toEqual(content);
    });

    test('rejects executable source', () => {
        expect(() => parseContentSource('const content = { value: window.location };')).toThrow();
        expect(() => parseContentSource('const content = { value: `${Date.now()}` };')).toThrow();
    });

    test('rejects invalid persisted data', () => {
        const content = parseContentSource(source);
        content['en-US'].profiles[0].width = 0;
        content['en-US'].links[0].href = 'javascript:alert(1)';
        expect(validateContent(content).length).toBeGreaterThan(0);
    });
});
