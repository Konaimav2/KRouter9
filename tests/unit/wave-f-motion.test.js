import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Wave F motion-only contract', () => {
  it('fully disables animations and transitions for reduced motion, including pseudo-elements', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:reduce\)\s*\{\s*\*,\*::before,\*::after\s*\{[^}]*animation:none!important/);
    expect(css).toMatch(/\*,\*::before,\*::after\s*\{[^}]*transition:none!important/);
    expect(css).toContain('scroll-behavior:auto!important');
  });
  it('keeps smooth settings scroll on the actual inner scroller', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/\.instrument-field\s*\{[^}]*scroll-behavior:smooth/);
    expect(read('src/app/(dashboard)/dashboard/profile/page.js')).toContain('scrollIntoView');
  });
  it.each(['Dialog', 'Sheet', 'PopoverMenu', 'ConfirmDialog'])('%s uses existing tokens for interruptible overlay motion instead of entry keyframes', (name) => {
    const source = read(`src/shared/components/overlays/${name}.jsx`);
    expect(source).toContain('animation: "none"');
    expect(source).toContain('var(--duration-base) var(--ease-enter)');
    expect(source).not.toContain('transition: "all');
    expect(source).toContain('if (!open) return null');
  });
});

// Render real primitives; the optional artifact is for isolated browser CSS probes,
// not a substitute for an authenticated dashboard viewport walk.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Dialog from '../../src/shared/components/overlays/Dialog.jsx';
import Sheet from '../../src/shared/components/overlays/Sheet.jsx';
import PopoverMenu from '../../src/shared/components/overlays/PopoverMenu.jsx';
import ConfirmDialog from '../../src/shared/components/overlays/ConfirmDialog.jsx';

it('renders opacity-only 180ms token transitions without changing close or modal contracts', () => {
  const fixtures = [
    React.createElement(Dialog, { open: true, title: 'Connection settings' }, 'Synthetic multi-account configuration'),
    React.createElement(Sheet, { open: true, title: 'Filters' }, 'Synthetic filter options'),
    React.createElement(PopoverMenu, { open: true, label: 'Actions' }, React.createElement('button', { role: 'menuitem' }, 'Manage route')),
    React.createElement(ConfirmDialog, { open: true, title: 'Delete fixture?', actionLabel: 'Delete fixture' }, 'Synthetic fixture only'),
  ];
  const markup = fixtures.map((element) => renderToStaticMarkup(element));
  for (const html of markup) {
    expect(html).toContain('animation:none;transition:opacity var(--duration-base) var(--ease-enter)');
    expect(html).toContain('starting:opacity-0');
    expect(html).toContain('transition-none!');
    expect(html).not.toContain('transform:');
  }
  expect(renderToStaticMarkup(React.createElement(Dialog, { open: false, title: 'Hidden' }))).toBe('');
  if (process.env.WAVE_F_EVIDENCE) {
    fs.writeFileSync(path.join(process.env.WAVE_F_EVIDENCE, 'fixture.html'), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="current.css"><body>${markup[0]}<template id="sheet">${markup[1]}</template><template id="menu">${markup[2]}</template><template id="confirm">${markup[3]}</template></body>`);
  }
});

it('uses bounded motion tokens on skeletons, tabs, and surface menus', () => {
  const usage = read('src/app/(dashboard)/dashboard/usage/page.js');
  expect(usage).toContain('starting:opacity-50');
  expect(usage).toContain('[&>button]:duration-[var(--duration-base)]');
  const combos = read('src/app/(dashboard)/dashboard/combos/page.js');
  expect(combos).not.toContain('transition-all');
  expect(combos).toContain('starting:opacity-0 transition-opacity duration-[var(--duration-base)]');
  expect(read('src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js')).toContain('starting:opacity-50');
  const css = read('src/app/globals.css');
  const base = Number(css.match(/--duration-base:(\d+)ms/)[1]);
  expect(base).toBeGreaterThanOrEqual(150);
  expect(base).toBeLessThanOrEqual(250);
});
