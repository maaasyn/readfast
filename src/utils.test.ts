import { describe, it, expect } from 'vitest';
import { parseWord, getORPIndex, extractWords } from './utils.js';

describe('utils', () => {
    describe('parseWord', () => {
        it('should extract core word from word with punctuation', () => {
            expect(parseWord('Hello,')).toEqual({
                leading: '',
                core: 'Hello',
                trailing: ','
            });
            expect(parseWord('"quote"')).toEqual({
                leading: '"',
                core: 'quote',
                trailing: '"'
            });
            expect(parseWord('word')).toEqual({
                leading: '',
                core: 'word',
                trailing: ''
            });
        });

        it('should handle words with no core', () => {
            expect(parseWord('...')).toEqual({
                leading: '...',
                core: '',
                trailing: ''
            });
        });

        it('should handle hyphenated words', () => {
            expect(parseWord('state-of-the-art')).toEqual({
                leading: '',
                core: 'state-of-the-art',
                trailing: ''
            });
            expect(parseWord('end-to-end...')).toEqual({
                 leading: '',
                 core: 'end-to-end',
                 trailing: '...'
            });
        });
    });

    describe('getORPIndex', () => {
        it('should calculate correct ORP index based on length', () => {
            expect(getORPIndex('A')).toBe(0); // length 1
            expect(getORPIndex('word')).toBe(1); // length 2-5
            expect(getORPIndex('speed')).toBe(1); // length 2-5
            expect(getORPIndex('pretty')).toBe(2); // length 6-9
            expect(getORPIndex('beautiful')).toBe(2); // length 6-9
            expect(getORPIndex('understanding')).toBe(3); // length 10-13
            expect(getORPIndex('constitutional')).toBe(4); // length 14+
        });

        it('should ignore punctuation for ORP calculation', () => {
            expect(getORPIndex('word,')).toBe(1); // "word" length 4 -> index 1
        });
    });

    describe('extractWords', () => {
        it('should split text into words by whitespace', () => {
            const text = "Quick brown, fox jumps.";
            expect(extractWords(text)).toEqual([
                'Quick',
                'brown,',
                'fox',
                'jumps.'
            ]);
        });

        it('should handle multiple spaces and tabs', () => {
            const text = "Word   with\tspace.";
            expect(extractWords(text)).toEqual([
                'Word',
                'with',
                'space.'
            ]);
        });

        it('should keep complex punctuation attached', () => {
            const text = "hello... world?!?";
            expect(extractWords(text)).toEqual([
                'hello...',
                'world?!?'
            ]);
        });

        it('should treat hyphenated words as single tokens', () => {
            const text = "state-of-the-art implementation";
            expect(extractWords(text)).toEqual([
                'state-of-the-art',
                'implementation'
            ]);
        });
    });

    describe('number handling', () => {
        it('should parse formatted numbers correctly', () => {
             expect(parseWord('1,000')).toEqual({
                 leading: '',
                 core: '1,000',
                 trailing: ''
             });
             expect(parseWord('$50.00')).toEqual({
                 leading: '$',
                 core: '50.00',
                 trailing: ''
             });
             expect(parseWord('3.14')).toEqual({
                 leading: '',
                 core: '3.14',
                 trailing: ''
             });
        });

        it('should identify numbers correctly', async () => {
            const { isNumber } = await import('./utils.js');
            expect(isNumber('100')).toBe(true);
            expect(isNumber('1,000')).toBe(true);
            expect(isNumber('$50.00')).toBe(true);
            expect(isNumber('Word')).toBe(false);
            expect(isNumber('Top 10')).toBe(true);
            expect(isNumber('1990s')).toBe(true);
        });
    });
});
