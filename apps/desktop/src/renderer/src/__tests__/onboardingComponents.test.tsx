import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WelcomeModal } from '../components/WelcomeModal';
import { SpotlightTourOverlay } from '../components/SpotlightTourOverlay';
import { TutorialDrawer } from '../components/TutorialDrawer';

describe('Onboarding Components Render', () => {
  it('renders WelcomeModal with core titles and action buttons when open', () => {
    const html = renderToStaticMarkup(<WelcomeModal isOpen={true} />);
    expect(html).toContain('Find any clip or photo in seconds');
    expect(html).toContain('100% Private');
    expect(html).toContain('Start Interactive Tour');
    expect(html).toContain('Open Tutorial Guide &amp; Shortcuts');
    expect(html).toContain('Skip and explore on my own');
  });

  it('renders nothing when WelcomeModal is closed', () => {
    const html = renderToStaticMarkup(<WelcomeModal isOpen={false} />);
    expect(html).toBe('');
  });

  it('renders SpotlightTourOverlay when tour is active', () => {
    const html = renderToStaticMarkup(
      <SpotlightTourOverlay isActive={true} stepIndex={0} />
    );
    expect(html).toContain('Step 1 of 5');
    expect(html).toContain('Intelligent Visual Search &amp; Image Drop');
    expect(html).toContain('⌘K');
    expect(html).toContain('Next');
    expect(html).toContain('Skip tour');
  });

  it('renders single element spotlight in SpotlightTourOverlay', () => {
    const html = renderToStaticMarkup(
      <SpotlightTourOverlay
        isActive={true}
        singleInfo={{
          selector: '[data-tour="shelf-button"]',
          title: 'Cross-Folder Staging Shelf',
          description: 'Collect media across drives',
          shortcut: '⌘⇧S',
        }}
      />
    );
    expect(html).toContain('Spotlight');
    expect(html).toContain('Cross-Folder Staging Shelf');
    expect(html).toContain('⌘⇧S');
    expect(html).toContain('Got it');
  });

  it('renders TutorialDrawer with 3 tabs and content', () => {
    let html = renderToStaticMarkup(
      <TutorialDrawer isOpen={true} activeTab="interact" />
    );
    expect(html).toContain('Tutorial &amp; Guide');
    expect(html).toContain('Semantic &amp; Natural Search');
    expect(html).toContain('Reverse Image Matching');
    expect(html).toContain('Cross-Folder Staging Shelf');

    // Switch to buttons tab
    html = renderToStaticMarkup(
      <TutorialDrawer isOpen={true} activeTab="buttons" />
    );
    expect(html).toContain('Visual Search Bar');
    expect(html).toContain('Spotlight');
    expect(html).toContain('Staging Shelf');

    // Switch to shortcuts tab
    html = renderToStaticMarkup(
      <TutorialDrawer isOpen={true} activeTab="shortcuts" />
    );
    expect(html).toContain('⌘K / Ctrl+K');
    expect(html).toContain('⌘⇧S / Ctrl+Shift+S');
    expect(html).toContain('? / F1');
    expect(html).toContain('Space');
    expect(html).toContain('J / K / L');
  });

  it('renders nothing when TutorialDrawer is closed', () => {
    const html = renderToStaticMarkup(<TutorialDrawer isOpen={false} />);
    expect(html).toBe('');
  });
});
