import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { TERMS_UPDATED, catalogApi, privacyPolicy, termsOfService, useDocumentTitle, useResource } from '@tm/shared';
import LegalText from '../../components/LegalText.jsx';
import SiteFooter from '../../components/SiteFooter.jsx';
import SiteNav from '../../components/SiteNav.jsx';
import { site } from '../../theme/siteTheme.js';

// The two documents: page title, the sections, and the link to the other one
const DOCS = {
  terms: { title: 'Terms of Service', other: { to: '/privacy', label: 'Privacy Policy' } },
  privacy: { title: 'Privacy Policy', other: { to: '/terms', label: 'Terms of Service' } }
};

/**
 * The public /terms and /privacy pages (anyone can read them, signed in or not). The text comes from
 * @tm/shared (legal/terms.js), the same words the sign-up and booking forms ask customers to agree to.
 * The Terms name the current minimum downpayment once the catalogue has loaded (until then, "the
 * minimum downpayment shown in your quotation"). "On This Page" jumps to each section.
 */
export default function LegalPage({ kind }) {
  const doc = DOCS[kind];
  useDocumentTitle(doc.title);
  // The minimum downpayment named in the payment terms (loading the catalogue brings it up to date)
  const catalog = useResource(() => (kind === 'terms' ? catalogApi.getCatalog() : Promise.resolve(null)), [kind]);
  const minDownpayment = kind === 'terms' && catalog.data ? catalogApi.minDownpayment() : null;
  const sections = kind === 'terms' ? termsOfService({ minDownpayment }) : privacyPolicy();

  return (
    <Box sx={{ backgroundColor: site.ivory, color: site.ink, minHeight: '100vh' }}>
      <SiteNav />
      <Container maxWidth={false} sx={{ maxWidth: 860, py: { xs: 4, md: 6 } }}>
        <Typography component="h1" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 30, md: 38 }, fontWeight: 700, color: site.ink }}>
          {doc.title}
        </Typography>
        <Typography sx={{ mt: 1, fontSize: 13.5, color: site.inkMuted }}>
          Last updated {TERMS_UPDATED} ·{' '}
          <Link component={RouterLink} to={doc.other.to} sx={{ color: site.goldText, fontWeight: 600 }}>
            Read our {doc.other.label}
          </Link>
        </Typography>

        {/* "On This Page": a link to each section */}
        <Paper elevation={0} sx={{ mt: 3, p: { xs: 2, md: 2.5 }, borderRadius: 2, backgroundColor: site.card, border: `1px solid ${site.border}` }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: site.goldText, mb: 1 }}>On This Page</Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, columns: { xs: 1, sm: 2 }, columnGap: 4 }}>
            {sections.map((s) => (
              <Box component="li" key={s.id} sx={{ fontSize: 13.5, lineHeight: 1.9, breakInside: 'avoid' }}>
                <Link href={`#${kind}-${s.id}`} underline="hover" sx={{ color: site.inkSoft }}>
                  {s.heading}
                </Link>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ mt: 3, p: { xs: 2.5, md: 4 }, borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard }}>
          <LegalText sections={sections} idPrefix={kind} colors={{ heading: site.ink, body: site.inkSoft }} />
        </Paper>
      </Container>
      <SiteFooter />
    </Box>
  );
}
