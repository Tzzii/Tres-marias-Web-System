import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NavigateNextRoundedIcon from '@mui/icons-material/NavigateNextRounded';
import { tokens } from '../theme/tokens.js';

/**
 * Page title row on the portal background (navy in dark mode, ivory in light):
 * breadcrumb trail, title, subtitle and an actions slot that wraps under the title on phones.
 */
export function PageHeader({ title, subtitle, crumbs, actions, chip }) {
  return (
    <Box sx={{ mb: { xs: 2, md: 3 }, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
      <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
        {crumbs && (
          <Breadcrumbs separator={<NavigateNextRoundedIcon sx={{ fontSize: 15 }} />} sx={{ mb: 0.75, fontSize: 12.5, color: tokens.textOnDarkMuted }}>
            {/* Crumbs with `to` are links; the last one (current page) is plain text.
                On touch screens the link gets a taller hit area (padding on an inline link does not move the text). */}
            {crumbs.map((crumb) =>
              crumb.to ? (
                <Link key={crumb.label} component={RouterLink} to={crumb.to} underline="hover" sx={{ color: tokens.textOnDarkSoft, fontSize: 12.5, '@media (pointer: coarse)': { py: 1.25 } }}>
                  {crumb.label}
                </Link>
              ) : (
                <Typography key={crumb.label} sx={{ fontSize: 12.5, color: tokens.goldText }}>
                  {crumb.label}
                </Typography>
              )
            )}
          </Breadcrumbs>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, color: tokens.textLight, lineHeight: 1.25 }}>
            {title}
          </Typography>
          {chip}
        </Box>
        {subtitle && <Typography sx={{ mt: 0.5, fontSize: 13.5, color: tokens.textOnDarkSoft }}>{subtitle}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}
