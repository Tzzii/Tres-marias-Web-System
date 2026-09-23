import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { PALETTES, cssVarName } from './palettes.js';

/**
 * Dark / light mode for the customer portal and the admin dashboard.
 *
 * Dark is the navy shell both portals have always used; light is the warm ivory
 * and gold of the public website. The choice is remembered per browser and is
 * shared by every page of that portal (including its sign-in screen).
 *
 * How the switch reaches the UI: applyColorMode() writes the chosen palette onto
 * <html> as CSS custom properties, and theme/tokens.js reads those back as
 * `var(--tm-...)`. So every component that styles itself with `tokens.x` follows
 * the mode with no extra work. Components that need the mode itself (to pick a
 * whole MUI theme, or an icon) call useColorMode().
 *
 * Switching is animated as a circle opening from the toggle button (see
 * revealFrom below). Browsers without the View Transitions API, and anyone who
 * asked for less motion, get a plain colour fade instead.
 */

const STORAGE_KEY = 'tm.theme';

/** How long the reveal (and the fallback colour fade) lasts, in milliseconds. */
const REVEAL_MS = 520;

/** The saved mode, or dark when nothing is saved (or storage is blocked). */
export const readColorMode = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch (e) {
    return 'dark';
  }
};

/**
 * Paint a mode: every palette value becomes a CSS custom property on <html>,
 * `data-tm-mode` is set for plain CSS, and the browser UI colour (address bar on
 * phones, form controls) is kept matching. Returns the mode that was applied.
 */
export const applyColorMode = (mode) => {
  const value = mode === 'light' ? 'light' : 'dark';
  if (typeof document === 'undefined') return value;
  const palette = PALETTES[value];
  const root = document.documentElement;
  Object.entries(palette).forEach(([key, color]) => root.style.setProperty(cssVarName(key), color));
  root.dataset.tmMode = value;
  root.style.colorScheme = value;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', palette.headerBg);
  return value;
};

// Paint the saved mode while this module loads, before React's first render, so
// someone who chose light mode never sees the navy shell flash on the way in.
applyColorMode(readColorMode());

/** True when the device is set to "reduce motion": then the mode changes with no animation at all. */
const wantsLessMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
};

/** How far (x, y) is from the farthest corner of the window: the radius the circle has to reach. */
const cornerDistance = (x, y) => Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

/** Fallback for browsers without view transitions: fade the colours for one beat. */
const fadeColours = () => {
  const root = document.documentElement;
  root.classList.add('tm-theming');
  window.setTimeout(() => root.classList.remove('tm-theming'), REVEAL_MS);
};

/**
 * Swap the mode behind a circle that opens from `origin` ({ x, y } in window
 * coordinates, normally the middle of the toggle button).
 *
 * The browser photographs the page, `change` swaps the palette, and the new
 * photograph is then clipped to a growing circle so the new theme washes over
 * the old one from the button outwards. `change` has to update the page
 * right away (not later), which is why the React state is written with flushSync.
 */
const revealFrom = (origin, change) => {
  const canReveal = typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && origin && !wantsLessMotion();
  if (!canReveal) {
    if (!wantsLessMotion()) fadeColours();
    change();
    return;
  }
  const { x, y } = origin;
  const transition = document.startViewTransition(() => flushSync(change));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${cornerDistance(x, y)}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    })
    // The transition was skipped (another one started, or the tab went to the background): the mode still changed
    .catch(() => {});
};

const ColorModeContext = createContext({ mode: 'dark', isLight: false, setMode: () => {}, toggleMode: () => {} });

/** Holds the current mode and keeps <html>, localStorage and the other open tabs matching. */
export function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(readColorMode);

  // Repaint and remember whenever the mode changes
  useEffect(() => {
    applyColorMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
      /* private browsing: the mode still works, it just isn't remembered */
    }
  }, [mode]);

  // Follow the switch when the same portal is open in another tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setMode(e.newValue === 'light' ? 'light' : 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Paint the palette inside the transition as well as setting the React state, so the
  // colours and the MUI theme both belong to the photograph the circle reveals.
  const change = useCallback((next, origin) => {
    revealFrom(origin, () => {
      applyColorMode(next);
      setMode(next);
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      isLight: mode === 'light',
      /** setMode('light' | 'dark', origin?) — `origin` is { x, y } for the circle to open from. */
      setMode: (next, origin) => change(next === 'light' ? 'light' : 'dark', origin),
      /** toggleMode(origin?) — same, flipping to the other mode. */
      toggleMode: (origin) => change(mode === 'light' ? 'dark' : 'light', origin)
    }),
    [mode, change]
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

/** `{ mode, isLight, setMode, toggleMode }`. Safe outside the provider: it then reports dark. */
export const useColorMode = () => useContext(ColorModeContext);
