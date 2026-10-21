import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { includesFood, peso, tokens } from '@tm/shared';

export function QuoteLines({ quote, pkg, serviceType, addons, addonQty }) {
  const rows = [
    [pkg ? `Package · ${pkg.name}` : 'Package', pkg ? peso(quote.packageTotal) : '—'],
    ...(quote.extraGuests ? [[`Extra ${quote.extraGuests} guests (equipment)`, 'To be quoted']] : []),
    ...(includesFood(serviceType)
      ? [
          [
            quote.plates
              ? `Buffet · ${quote.plates} × ${peso(quote.pricePerPlate)}`
              : 'Buffet · enter your guest count',
            quote.plates ? peso(quote.food) : '—'
          ]
        ]
      : []),
    ...addons.map((a) => [
      a.hasQuantity ? `${a.name} × ${Number(addonQty[a.id]) || 1}` : a.name,
      a.price ? peso(quote.addonTotals[a.id]) : 'To be quoted'
    ])
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {rows.map(([label, value]) => (
        <Box
          key={label}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            columnGap: 2,
            rowGap: 0.5,
            px: 2,
            py: 1.25,
            borderBottom: `1px solid ${tokens.cardLightBorder}`
          }}
        >
          <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 13.5, color: tokens.textSecondary }}>
            {label}
          </Typography>
          <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 13.5, fontWeight: 600 }}>
            {value}
          </Typography>
        </Box>
      ))}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          columnGap: 2,
          rowGap: 0.5,
          px: 2,
          py: 1.5,
          backgroundColor: tokens.surfaceSubtle
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Starting total</Typography>
        <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 16, fontWeight: 800 }}>
          {pkg ? `${peso(quote.net)}${quote.extraGuests ? ' + quoted' : ''}` : '—'}
        </Typography>
      </Box>
    </Box>
  );
}

export function RentalQuoteLines({ quote, delivered }) {
  const rows = [
    ...quote.rentalItems.map((line) => [`${line.name} · ${line.qty} × ${peso(line.price)}`, peso(line.total)]),
    [delivered ? 'Delivery (standard fee)' : 'Pick up', delivered ? peso(quote.deliveryFee) : 'Free']
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {quote.rentalItems.length === 0 && (
        <Typography
          sx={{
            px: 2,
            py: 1.25,
            fontSize: 13.5,
            color: tokens.textSecondary,
            borderBottom: `1px solid ${tokens.cardLightBorder}`
          }}
        >
          No items yet
        </Typography>
      )}
      {rows.map(([label, value]) => (
        <Box
          key={label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            px: 2,
            py: 1.25,
            borderBottom: `1px solid ${tokens.cardLightBorder}`
          }}
        >
          <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{label}</Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</Typography>
        </Box>
      ))}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          px: 2,
          py: 1.5,
          backgroundColor: tokens.surfaceSubtle
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Rental total</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
          {quote.rentalItems.length ? peso(quote.net) : '—'}
        </Typography>
      </Box>
    </Box>
  );
}
