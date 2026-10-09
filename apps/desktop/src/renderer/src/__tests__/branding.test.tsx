import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Wordmark, AppIcon } from '@snapsort/ui';

describe('Branding Components', () => {
  it('renders official image Wordmark by default with light and dark mode images', () => {
    const html = renderToStaticMarkup(<Wordmark size="md" />);
    expect(html).toContain('hidden dark:block');
    expect(html).toContain('block dark:hidden');
    expect(html).toContain('alt="snapsort"');
    expect(html).toContain('h-[26px]');
    expect(html).toContain('w-[104px]');
  });

  it('renders explicit dark theme Wordmark', () => {
    const html = renderToStaticMarkup(<Wordmark theme="dark" size="sm" />);
    expect(html).toContain('alt="snapsort"');
    expect(html).toContain('h-5');
    expect(html).toContain('w-[80px]');
    // Only one image for explicit theme
    const imgMatches = html.match(/<img/g);
    expect(imgMatches?.length).toBe(1);
  });

  it('renders explicit light theme Wordmark', () => {
    const html = renderToStaticMarkup(<Wordmark theme="light" size="lg" />);
    expect(html).toContain('alt="snapsort"');
    expect(html).toContain('h-8');
    expect(html).toContain('w-[128px]');
    const imgMatches = html.match(/<img/g);
    expect(imgMatches?.length).toBe(1);
  });

  it('renders legacy dot variant for backwards compatibility', () => {
    const html = renderToStaticMarkup(<Wordmark variant="dot" size="md" />);
    expect(html).toContain('snapsort');
    expect(html).toContain('.');
  });

  it('renders AppIcon with default size and attributes', () => {
    const html = renderToStaticMarkup(<AppIcon size="md" alt="snapsort" />);
    expect(html).toContain('<img');
    expect(html).toContain('alt="snapsort"');
    expect(html).toContain('w-7 h-7');
  });

  it('renders AppIcon with numeric sizing preserving aspect ratio', () => {
    const html = renderToStaticMarkup(<AppIcon size={48} />);
    expect(html).toContain('width:48px');
    expect(html).toContain('height:46px');
  });
});
