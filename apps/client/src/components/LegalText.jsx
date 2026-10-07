import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@tm/shared';

/**
 * The sections of the Terms of Service or the Privacy Policy (termsOfService() / privacyPolicy() from
 * @tm/shared): a heading for each, its paragraphs, then its points as a bulleted list. Used by the
 * public /terms and /privacy pages and inside the sign-up and "We updated our terms" dialogs, so the
 * text is the same everywhere. `numbered` puts "1." … before the headings; `idPrefix` gives each
 * section an id (e.g. "terms-payments") for the page's "On This Page" links; `colors` sets the
 * heading and body colours of the surface it sits on.
 */
export default function LegalText({ sections, numbered = true, idPrefix = '', colors = {}, compact = false }) {
  const heading = colors.heading || tokens.textPrimary;
  const body = colors.body || tokens.textSecondary;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 3 }}>
      {sections.map((s, i) => (
        <Box component="section" key={s.id} id={idPrefix ? `${idPrefix}-${s.id}` : undefined} sx={{ scrollMarginTop: '96px' }}>
          <Typography component="h2" sx={{ fontSize: compact ? 14.5 : 18, fontWeight: 700, color: heading, mb: 0.75 }}>
            {numbered ? `${i + 1}. ` : ''}
            {s.heading}
          </Typography>
          {s.paragraphs.map((p, j) => (
            <Typography key={j} sx={{ fontSize: compact ? 13 : 14.5, lineHeight: 1.7, color: body, mb: 1 }}>
              {p}
            </Typography>
          ))}
          {s.bullets.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {s.bullets.map((b, j) => (
                <Typography component="li" key={j} sx={{ fontSize: compact ? 13 : 14.5, lineHeight: 1.65, color: body }}>
                  {b}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
