import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const testSiteKey = '1x00000000000000000000AA';
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? testSiteKey : '');
let scriptPromise;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = null;
      throw error;
    });
  }
  return scriptPromise;
}

export default function SignupCaptcha({ onChange, resetCount = 0 }) {
  const element = useRef(null);
  const widget = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!siteKey) return undefined;
    let mounted = true;
    loadScript()
      .then(() => {
        if (!mounted || !element.current) return;
        widget.current = window.turnstile.render(element.current, {
          sitekey: siteKey,
          callback: onChange,
          'expired-callback': () => onChange(''),
          'error-callback': () => onChange('')
        });
      })
      .catch(() => mounted && setError(true));
    return () => {
      mounted = false;
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [onChange]);

  useEffect(() => {
    if (resetCount && widget.current !== null) window.turnstile?.reset(widget.current);
  }, [resetCount]);

  if (!siteKey) return null;
  return (
    <Box>
      <Box ref={element} />
      {error && (
        <Typography color="error" variant="body2">
          The security check could not load. Please refresh the page.
        </Typography>
      )}
    </Box>
  );
}
