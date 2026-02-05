import { describe, it, expect } from 'vitest';
import { isFooterVisible, truncate, getStatusBarData, prepareWordData } from './reader.js';

describe('reader layout logic', () => {
  describe('isFooterVisible', () => {
    it('should be true for height >= 4 and not zen', () => {
      expect(isFooterVisible(4, false)).toBe(true);
      expect(isFooterVisible(5, false)).toBe(true);
      expect(isFooterVisible(10, false)).toBe(true);
    });

    it('should be false for height < 4', () => {
      expect(isFooterVisible(3, false)).toBe(false);
      expect(isFooterVisible(2, false)).toBe(false);
    });

    it('should be false in zen mode regardless of height', () => {
      expect(isFooterVisible(10, true)).toBe(false);
      expect(isFooterVisible(5, true)).toBe(false);
    });
  });

  describe('truncate', () => {
    it('should not truncate if width is sufficient', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate if width is insufficient', () => {
      expect(truncate('hello world', 5)).toBe('hello');
    });
  });

  describe('getStatusBarData', () => {
    const state = {
      index: 0,
      paused: false,
      wpm: 300,
      zen: false,
    };
    const options = { chapters: [] };

    it('should return statusLine and separator (no legend)', () => {
      const data = getStatusBarData(state, 100, options, 80, 0);
      expect(data.statusLine).toBeDefined();
      expect(data.separator).toBeDefined();
      expect((data as any).legend).toBeUndefined();
    });

    it('should use full text for wide screens (>= 50)', () => {
      const data = getStatusBarData(state, 100, options, 80, 0);
      expect(data.statusLine).toContain('PLAYING');
    });

    it('should use symbols for small screens (< 50)', () => {
      const data = getStatusBarData(state, 100, options, 30, 0);
      expect(data.statusLine).toContain('▶');
      expect(data.statusLine).not.toContain('PLAYING');
    });

    it('should prioritize state and wpm (always visible)', () => {
      const data = getStatusBarData(state, 100, options, 20, 0);
      expect(data.statusLine).toContain('▶');
      expect(data.statusLine).toContain('300 wpm');
    });

    it('should show navigation hints at width >= 30', () => {
      const data30 = getStatusBarData(state, 100, options, 30, 0);
      expect(data30.statusLine).toContain('←→');
      
      const data25 = getStatusBarData(state, 100, options, 25, 0);
      expect(data25.statusLine).not.toContain('←→');
    });

    it('should show progress at width >= 40', () => {
      const data40 = getStatusBarData(state, 100, options, 40, 0);
      expect(data40.statusLine).toContain('1/100');
      
      const data35 = getStatusBarData(state, 100, options, 35, 0);
      expect(data35.statusLine).not.toContain('1/100');
    });
  });

  describe('prepareWordData', () => {
      it('should correctly parse words', () => {
          const words = ['Hello', 'world!'];
          const data = prepareWordData(words);
          expect(data).toHaveLength(2);
          expect(data[0].raw).toBe('Hello');
          expect(data[1].trailing).toBe('!');
      });
  });
});
