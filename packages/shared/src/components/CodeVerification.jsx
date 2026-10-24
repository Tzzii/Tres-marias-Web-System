import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { OtpInput } from './OtpInput.jsx';
import './CodeVerification.css';

const ERROR_DURATION = 1180;

// An irregular fracture mesh: large edge panes and small splinters around the impact.
// Each pane carries its own slice of the input border, reflection, and digit.
const SHARDS = [
  { points: '0,0 35,0 43,44', x: -24, y: -29, turn: -38, tilt: 42 },
  { points: '0,0 43,44 0,22', x: -31, y: -12, turn: -62, tilt: -35 },
  { points: '35,0 72,0 43,44', x: 4, y: -35, turn: 24, tilt: 58 },
  { points: '72,0 100,0 100,35 43,44', x: 23, y: -25, turn: 43, tilt: -46 },
  { points: '100,35 100,77 65,58 43,44', x: 35, y: -6, turn: 56, tilt: 32 },
  { points: '100,77 100,100 65,58', x: 29, y: 15, turn: 84, tilt: -54 },
  { points: '100,100 55,100 65,58', x: 17, y: 25, turn: 47, tilt: 62 },
  { points: '55,100 22,100 30,73 65,58', x: -3, y: 30, turn: -28, tilt: -38 },
  { points: '22,100 0,100 30,73', x: -22, y: 23, turn: -75, tilt: 48 },
  { points: '0,100 0,62 30,73', x: -34, y: 10, turn: -46, tilt: -61 },
  { points: '0,62 0,22 43,44 30,73', x: -27, y: -5, turn: 32, tilt: 53 },
  { points: '43,44 65,58 30,73', x: 8, y: 10, turn: -96, tilt: -72 }
];

/** Keep the real inputs in place, then animate them only after the server's verdict. */
export default function CodeVerification({
  state,
  onSuccessComplete,
  onErrorComplete,
  loadingLabel = 'Opening your dashboard…',
  ...inputProps
}) {
  const root = useRef(null);
  const effectId = `tm-code-glass-${useId().replace(/:/g, '')}`;
  const callbacks = useRef({ onSuccessComplete, onErrorComplete });
  callbacks.current = { onSuccessComplete, onErrorComplete };
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    const stage = root.current;
    const measure = () => {
      const inputs = stage.querySelectorAll('input');
      for (const [index, input] of inputs.entries()) {
        const angle = (index / inputs.length) * Math.PI * 2 - Math.PI / 2;
        input.style.setProperty('--gather-x', `${stage.clientWidth / 2 - input.offsetLeft - input.offsetWidth / 2}px`);
        input.style.setProperty('--arc-y', `${index % 2 ? 36 : -36}px`);
        input.style.setProperty('--glass-delay', `${index * 14}ms`);
        input.style.setProperty('--ring-x', `${Math.cos(angle) * 58}px`);
        input.style.setProperty('--ring-y', `${Math.sin(angle) * 58}px`);
        input.style.setProperty('--orbit-x', `${Math.cos(angle + Math.PI / 3) * 58}px`);
        input.style.setProperty('--orbit-y', `${Math.sin(angle + Math.PI / 3) * 58}px`);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [inputProps.length]);

  useEffect(() => {
    setLoading(false);
    if (state !== 'success' && state !== 'error') return undefined;
    const loadingTimer =
      state === 'success' ? window.setTimeout(() => setLoading(true), reducedMotion ? 150 : 1650) : null;
    // Completion uses a timer, so disabled animations cannot strand sign-in.
    const completeTimer = window.setTimeout(
      () => (state === 'success' ? callbacks.current.onSuccessComplete?.() : callbacks.current.onErrorComplete?.()),
      state === 'success' ? (reducedMotion ? 650 : 2450) : reducedMotion ? 150 : ERROR_DURATION
    );
    return () => {
      window.clearTimeout(loadingTimer);
      window.clearTimeout(completeTimer);
    };
  }, [state, reducedMotion]);

  return (
    <div ref={root} className="tm-code-verification" data-state={state} data-loading={loading}>
      <div className="tm-code-inputs">
        <OtpInput {...inputProps} state={state} />
      </div>
      {state === 'error' && !reducedMotion && (
        <>
          <svg className="tm-code-glass-definitions" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={`${effectId}-face`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.98" />
                <stop offset="0.42" stopColor="#fff1ee" stopOpacity="0.85" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0.96" />
                <stop offset="1" stopColor="#f3b8b2" stopOpacity="0.65" />
              </linearGradient>
              {SHARDS.map((shard, index) => (
                <clipPath id={`${effectId}-cut-${index}`} key={index}>
                  <polygon points={shard.points} />
                </clipPath>
              ))}
            </defs>
          </svg>
          <div className="tm-code-breakup" aria-hidden="true">
            <div className="tm-code-shards" style={{ '--code-length': inputProps.length || 6 }}>
              {Array.from({ length: inputProps.length || 6 }, (_, index) => (
                <div className="tm-code-glass" key={index} style={{ '--glass-delay': `${index * 14}ms` }}>
                  <span className="tm-code-glass-reset" />
                  <svg className="tm-code-cracks" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                      pathLength="1"
                      d="M43 44 35 0M43 44 0 0M43 44 0 22M43 44 72 0M43 44 100 35M43 44 65 58 100 77M65 58 100 100M65 58 55 100M65 58 30 73 22 100M30 73 0 100M30 73 0 62M30 73 43 44"
                    />
                  </svg>
                  {SHARDS.map((shard, shardIndex) => (
                    <svg
                      className="tm-code-shard"
                      key={shardIndex}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{
                        '--shard-x': `${shard.x * (index % 2 ? 0.88 : 1) * 0.8}px`,
                        '--shard-y': `${(shard.y - (index % 3) * 3) * 0.8}px`,
                        '--shard-turn': `${shard.turn * (index % 2 ? -1 : 1)}deg`,
                        '--shard-tilt': `${shard.tilt}deg`,
                        '--shard-delay': `${(shardIndex % 4) * 13}ms`
                      }}
                    >
                      <g clipPath={`url(#${effectId}-cut-${shardIndex})`}>
                        <rect
                          className="tm-code-glass-face"
                          x="1"
                          y="1"
                          width="98"
                          height="98"
                          rx="20"
                          fill={`url(#${effectId}-face)`}
                        />
                        <path className="tm-code-glass-reflection" d="M-10 34 75-12h28L-10 67Z" />
                        <text
                          className="tm-code-glass-digit"
                          x="50"
                          y="52"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {inputProps.value?.[index] || ''}
                        </text>
                        <rect className="tm-code-glass-rim" x="1.5" y="1.5" width="97" height="97" rx="20" />
                      </g>
                      <polygon className="tm-code-shard-edge" points={shard.points} />
                    </svg>
                  ))}
                  {[0, 1, 2].map((glint) => (
                    <span
                      className="tm-code-glint"
                      key={glint}
                      style={{
                        '--glint-x': `${[-23, 8, 27][glint] * 0.8}px`,
                        '--glint-y': `${[-21, -30, 3][glint] * 0.8}px`,
                        '--glint-delay': `${glint * 38}ms`
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {state === 'success' && (
        <div className="tm-code-confirmation" aria-hidden="true">
          <span className="tm-code-loading-ring" />
          <svg className="tm-code-check" viewBox="0 0 48 48" fill="none">
            <path d="M12 24.5 20.5 33 36 16" pathLength="1" />
          </svg>
        </div>
      )}
      <span className="tm-code-status" role="status" aria-live="polite" aria-atomic="true">
        {state === 'success'
          ? loading
            ? loadingLabel
            : 'Code verified'
          : state === 'error'
            ? 'Code not accepted. Try again.'
            : ''}
      </span>
    </div>
  );
}
