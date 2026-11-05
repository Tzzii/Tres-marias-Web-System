import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { includesFood, isInclusiveBuffet, peso, tokens } from '@tm/shared';

export function QuoteLines({ quote, pkg, serviceType, addons, addonQty }) {
  const inclusive = isInclusiveBuffet(quote);
  const rows = [
    [
      pkg ? `Package · ${pkg.name}` : 'Package',
      pkg ? (inclusive ? 'Included in buffet rate' : peso(quote.packageTotal)) : '—',
      pkg ? `Covers ${inclusive ? quote.plates || pkg.guests : pkg.guests} guests` : 'Select a package above'
    ],
    ...(quote.extraGuests && !inclusive
      ? [[`Extra ${quote.extraGuests} guests (equipment)`, 'To be quoted', 'Scaled equipment for additional guests']]
      : []),
    ...(quote.durationCharge > 0
      ? [['6-hour event charge', peso(quote.durationCharge), 'Extended 6-hour event duration']]
      : []),
    ...(includesFood(serviceType)
      ? [
          [
            quote.plates
              ? `Buffet · ${quote.plates} × ${peso(quote.pricePerPlate)}`
              : 'Buffet · enter your guest count',
            quote.plates ? peso(quote.food) : '—',
            'Four dishes + unlimited water & preferred juice'
          ]
        ]
      : []),
    ...addons.map((a) => [
      a.hasQuantity ? `${a.name} × ${Number(addonQty[a.id]) || 1}` : a.name,
      a.price ? peso(quote.addonTotals[a.id]) : 'To be quoted',
      a.hasQuantity && a.price ? `${peso(a.price)} each` : 'Optional additional service'
    ])
  ];
  const hasQuoted = (quote.extraGuests && !inclusive) || addons.some((a) => a.price == null);

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${tokens.cardLightBorder}`,
        backgroundColor: tokens.cardLight,
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 2,
          py: 1.25,
          backgroundColor: tokens.surfaceSubtle,
          borderBottom: `1px solid ${tokens.cardLightBorder}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, minWidth: 0 }}>
          <ReceiptLongOutlinedIcon sx={{ fontSize: 17, color: tokens.goldText, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.textPrimary }}>
            Itemized Estimate Breakdown
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: tokens.textMuted }}>
          Confirmed in your quotation
        </Typography>
      </Box>
      {rows.map(([label, value, note]) => {
        const isQuoted = value === 'To be quoted';
        return (
          <Box
            key={label}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              columnGap: 2,
              rowGap: 0.5,
              px: 2,
              py: 1.15,
              borderBottom: `1px solid ${tokens.dividerFaint}`
            }}
          >
            <Box sx={{ minWidth: 0, flex: '1 1 180px' }}>
              <Typography
                sx={{
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                  fontSize: 13,
                  fontWeight: 600,
                  color: tokens.textPrimary
                }}
              >
                {label}
              </Typography>
              {note && <Typography sx={{ fontSize: 11.5, color: tokens.textMuted, mt: 0.15 }}>{note}</Typography>}
            </Box>
            <Typography
              sx={{
                minWidth: 0,
                overflowWrap: 'anywhere',
                fontSize: isQuoted ? 11.5 : 13,
                fontWeight: 700,
                ...(isQuoted && {
                  px: 1,
                  py: 0.25,
                  borderRadius: 999,
                  color: tokens.goldText,
                  backgroundColor: tokens.goldSubtle
                })
              }}
            >
              {value}
            </Typography>
          </Box>
        );
      })}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          columnGap: 2,
          rowGap: 0.5,
          px: 2,
          py: 1.5,
          backgroundColor: tokens.goldWash,
          borderTop: `1px solid ${tokens.shellBorder}`
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>Starting total</Typography>
          <Typography sx={{ fontSize: 11.5, color: tokens.textSecondary }}>
            No payment is collected until you review and accept our quotation
          </Typography>
        </Box>
        <Typography
          sx={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 17, fontWeight: 800, color: tokens.textPrimary }}
        >
          {pkg ? `${peso(quote.net)}${hasQuoted ? ' + quoted' : ''}` : '—'}
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
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${tokens.cardLightBorder}`,
        backgroundColor: tokens.cardLight,
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 2,
          py: 1.25,
          backgroundColor: tokens.surfaceSubtle,
          borderBottom: `1px solid ${tokens.cardLightBorder}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, minWidth: 0 }}>
          <ReceiptLongOutlinedIcon sx={{ fontSize: 17, color: tokens.goldText, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.textPrimary }}>
            Rental Item Summary
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: tokens.textMuted }}>
          {quote.rentalItems.length
            ? `${quote.rentalItems.reduce((sum, l) => sum + l.qty, 0)} total pieces`
            : 'No items selected'}
        </Typography>
      </Box>
      {quote.rentalItems.length === 0 && (
        <Typography
          sx={{
            px: 2,
            py: 1.25,
            fontSize: 13,
            color: tokens.textSecondary,
            borderBottom: `1px solid ${tokens.dividerFaint}`
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
            alignItems: 'center',
            gap: 2,
            px: 2,
            py: 1.15,
            borderBottom: `1px solid ${tokens.dividerFaint}`
          }}
        >
          <Typography
            sx={{ fontSize: 13, fontWeight: 500, color: tokens.textSecondary, minWidth: 0, overflowWrap: 'anywhere' }}
          >
            {label}
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: tokens.textPrimary }}>
            {value}
          </Typography>
        </Box>
      ))}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 2,
          px: 2,
          py: 1.5,
          backgroundColor: tokens.goldWash,
          borderTop: `1px solid ${tokens.shellBorder}`
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>Rental total</Typography>
          <Typography sx={{ fontSize: 11.5, color: tokens.textSecondary }}>
            Confirmed in your rental quotation
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 800, color: tokens.textPrimary }}>
          {quote.rentalItems.length ? peso(quote.net) : '—'}
        </Typography>
      </Box>
    </Box>
  );
}
