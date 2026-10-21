import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { formatPackageItem, isRentalPackage, peso, tokens } from '@tm/shared';

export default function PackageComparison({ packages = [] }) {
  const options = packages.filter((pkg) => !isRentalPackage(pkg));
  const [selected, setSelected] = useState([]);
  if (options.length < 2) return null;
  const compared = options.filter((pkg) => selected.includes(pkg.slug));
  const toggle = (slug) =>
    setSelected((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : current.length < 3 ? [...current, slug] : current
    );
  return (
    <Paper
      elevation={0}
      sx={{
        my: 4,
        p: { xs: 2, md: 3.5 },
        border: `1px solid ${tokens.cardLightBorder}`,
        borderRadius: '20px',
        color: tokens.textPrimary,
        bgcolor: tokens.cardLight
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: 20, fontWeight: 600 }}>
            Find your perfect fit
          </Typography>
          <Typography sx={{ mt: 0.75, fontSize: 13, color: tokens.textSecondary }}>
            Compare up to 3 setup packages. Buffet food and additional charges are separate.
          </Typography>
        </Box>
        {selected.length > 0 && (
          <Button size="small" onClick={() => setSelected([])}>
            Clear
          </Button>
        )}
      </Box>
      <Box role="group" aria-label="Packages to compare" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, my: 2 }}>
        {options.map((pkg) => (
          <Button
            key={pkg.slug}
            type="button"
            variant="outlined"
            aria-pressed={selected.includes(pkg.slug)}
            disabled={selected.length >= 3 && !selected.includes(pkg.slug)}
            onClick={() => toggle(pkg.slug)}
            sx={{
              flex: '1 1 auto',
              px: 1.75,
              py: 0.85,
              minHeight: 40,
              border: `1px solid ${selected.includes(pkg.slug) ? tokens.gold : tokens.cardLightBorder}`,
              borderRadius: '999px',
              fontSize: 12.5,
              fontWeight: selected.includes(pkg.slug) ? 600 : 500,
              color: selected.includes(pkg.slug) ? tokens.onInk : tokens.textPrimary,
              backgroundColor: selected.includes(pkg.slug) ? tokens.ink : tokens.cardLight,
              '&:hover': {
                borderColor: tokens.gold,
                backgroundColor: selected.includes(pkg.slug) ? tokens.inkHover : tokens.goldSubtle
              },
              '&.Mui-disabled': {
                borderColor: tokens.cardLightBorder,
                color: tokens.textSecondary,
                opacity: 0.5
              }
            }}
          >
            {pkg.name}
          </Button>
        ))}
      </Box>
      {compared.length < 2 ? (
        <Typography role="status" sx={{ fontSize: 13, color: tokens.textSecondary }}>
          Select {compared.length ? 'one more package' : 'at least two packages'} to see the differences side by side.
        </Typography>
      ) : (
        <TableContainer sx={{ borderRadius: 2, border: `1px solid ${tokens.cardLightBorder}` }}>
          <Table size="small" aria-label="Package comparison" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell scope="col">Your setup</TableCell>
                {compared.map((pkg) => (
                  <TableCell key={pkg.slug} scope="col" sx={{ fontWeight: 700 }}>
                    {pkg.name}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                ['Setup price', (p) => peso(p.price)],
                ['Default guest count', (p) => `${p.guests} guests`],
                [
                  'Inclusions',
                  (p) => (
                    <Box component="ul" sx={{ pl: 2, m: 0 }}>
                      {(p.items || []).map((item, i) => (
                        <li key={i}>{formatPackageItem(item)}</li>
                      ))}
                    </Box>
                  )
                ],
                ['Buffet food', () => 'Separate per-person charge when selected'],
                ['Extra guests & extras', () => 'Final pricing confirmed in your quotation'],
                [
                  'Explore',
                  (p) => (
                    <Button component={RouterLink} to={`/packages/${p.slug}`} size="small">
                      View package
                    </Button>
                  )
                ]
              ].map(([label, render]) => (
                <TableRow key={label}>
                  <TableCell component="th" scope="row" sx={{ verticalAlign: 'top', fontWeight: 600 }}>
                    {label}
                  </TableCell>
                  {compared.map((pkg) => (
                    <TableCell key={pkg.slug} sx={{ verticalAlign: 'top', py: 1.75, fontSize: 12.5 }}>
                      {render(pkg)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
