import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { PALETTES, cssVarName } from './palettes.js';

/**
 * Dark / light mode for the customer portal and the admin dashboard.
 *
 * Light (the warm ivory and gold of the public website) is the default; dark is
 * the midnight and champagne theme, used after someone presses the toggle in Settings.
 * That press is remembered per browser and is shared by every page of that
 * portal. Public pages and admin sign-in stay light in a LightModeScope.
 * Nothing is saved until the toggle is
 * pressed, so a browser that never pressed it always opens in light mode.
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

// A new key on purpose: the old 'tm.theme' was written on every visit (as 'dark', the old
// default) even by people who never touched the toggle, so it can't tell a real choice apart.
const STORAGE_KEY = 'tm.colorMode';
const OLD_STORAGE_KEY = 'tm.theme';

/** How long the reveal (and the fallback colour fade) lasts, in milliseconds. */
const REVEAL_MS = 520;

/** The mode picked with the toggle, or light when it was never pressed (or storage is blocked). */
export const readColorMode = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
};

/** Remember a mode picked with the toggle. Private browsing: the mode still works, it just isn't remembered. */
const saveColorMode = (mode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {
    /* storage blocked */
  }
};

// Clear the old key so it doesn't linger in DevTools; its value is ignored either way
try {
  localStorage.removeItem(OLD_STORAGE_KEY);
} catch (e) {
  /* storage blocked */
}

/**
 * Paint a mode: every palette value becomes a CSS custom property on <html>,
 * `data-tm-mode` is set for plain CSS, and the browser UI colour (address bar on
 * phones, form controls) is kept matching. Returns the mode that was applied.
 */
export const applyColorMode = (mode) => {
  const value = mode === 'dark' ? 'dark' : 'light';
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
// someone who switched to dark mode never sees the ivory page flash on the way in.
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
  const canReveal =
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    origin &&
    !wantsLessMotion();
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

const ColorModeContext = createContext({ mode: 'light', isLight: true, setMode: () => {}, toggleMode: () => {} });

/**
 * Holds the current mode and keeps <html> and the other open tabs matching.
 * The mode is saved only by `change` (a press of the toggle), never just for
 * opening a page, so light stays the default until someone picks dark.
 */
export function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(readColorMode);

  // Repaint whenever the mode changes
  useEffect(() => {
    applyColorMode(mode);
  }, [mode]);

  // Follow the switch when the same portal is open in another tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setMode(e.newValue === 'dark' ? 'dark' : 'light');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Remember the pick, then paint the palette inside the transition as well as setting the
  // React state, so the colours and the MUI theme both belong to the photograph the circle reveals.
  const change = useCallback((next, origin) => {
    saveColorMode(next);
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
      setMode: (next, origin) => change(next === 'dark' ? 'dark' : 'light', origin),
      /** toggleMode(origin?) — same, flipping to the other mode. */
      toggleMode: (origin) => change(mode === 'light' ? 'dark' : 'light', origin)
    }),
    [mode, change]
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

/** `{ mode, isLight, setMode, toggleMode }`. Safe outside the provider: it then reports light. */
export const useColorMode = () => useContext(ColorModeContext);

/** Public pages and admin sign-in stay light without changing the saved portal preference. */
export function LightModeScope({ children }) {
  return (
    <ColorModeContext.Provider value={{ mode: 'light', isLight: true, setMode: () => {}, toggleMode: () => {} }}>
      {children}
    </ColorModeContext.Provider>
  );
}
