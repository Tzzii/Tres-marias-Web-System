import assert from 'node:assert/strict';
import test from 'node:test';
import { darkPalette, lightPalette } from '../../../packages/shared/src/theme/palettes.js';

function rgb(value) {
  if (value.startsWith('#'))
    return value
      .slice(1)
      .match(/../g)
      .map((channel) => parseInt(channel, 16));
  return value.match(/[\d.]+/g).map(Number);
}

function luminance(color) {
  const channels = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function readable(foreground, background, label, minimum = 4.5) {
  const ratio = contrast(rgb(foreground), background);
  assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
}

test('dark-mode primary, secondary and muted text remain readable on every work surface', () => {
  for (const surface of ['bgBase', 'cardLight', 'surfaceSubtle', 'surfaceMuted', 'inputBg']) {
    for (const text of ['textPrimary', 'textSecondary', 'textMuted']) {
      readable(darkPalette[text], rgb(darkPalette[surface]), `${text} on ${surface}`);
    }
  }
});

test('dark-mode status labels remain readable over their tinted backgrounds', () => {
  for (const tone of ['success', 'warning', 'info', 'danger']) {
    const [r, g, b, alpha] = rgb(darkPalette[`${tone}Bg`]);
    for (const surface of ['cardLight', 'surfaceSubtle']) {
      const background = rgb(darkPalette[surface]).map(
        (channel, index) => [r, g, b][index] * alpha + channel * (1 - alpha)
      );
      readable(darkPalette[`${tone}Text`], background, `${tone} label on ${surface}`);
    }
  }
});

test('dark-mode actions, destructive action labels and input boundaries have visible contrast', () => {
  readable(darkPalette.onGold, rgb(darkPalette.gold), 'Primary action text');
  readable(darkPalette.onInk, rgb(darkPalette.ink), 'Selected action text');
  readable(darkPalette.dangerOnInk, rgb(darkPalette.ink), 'Destructive action on selected toolbar');
  readable(darkPalette.borderInput, rgb(darkPalette.inputBg), 'Input boundary', 3);
});

test('evening navigation, hints and champagne links stay readable on their intended surfaces', () => {
  readable(darkPalette.sidebarText, rgb(darkPalette.sidebarBg), 'Sidebar navigation');
  readable(darkPalette.sidebarTextMuted, rgb(darkPalette.sidebarBg), 'Sidebar section labels');
  readable(darkPalette.sidebarActiveText, rgb(darkPalette.sidebarActiveBg), 'Selected navigation');
  readable(darkPalette.placeholder, rgb(darkPalette.inputBg), 'Input hints');
  for (const surface of ['bgBase', 'cardLight', 'surfaceMuted'])
    readable(darkPalette.goldText, rgb(darkPalette[surface]), `Champagne link on ${surface}`);
});

test('both themes supply every token so switching modes cannot leave stale colors', () => {
  assert.deepEqual(Object.keys(darkPalette).sort(), Object.keys(lightPalette).sort());
});
