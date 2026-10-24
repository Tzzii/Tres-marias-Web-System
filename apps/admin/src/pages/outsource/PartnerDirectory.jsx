import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import { Pill, formatMobile, tokens } from '@tm/shared';
import { RecordIdentity } from '../../components/OperationsWorkspace.jsx';

export default function PartnerDirectory({ partners, onEdit, onMenu, onRequest }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
        gap: 1.75,
        pt: 0.5
      }}
    >
      {partners.map((partner) => (
        <Box
          key={partner.id}
          sx={{
            border: `1px solid ${tokens.cardLightBorder}`,
            borderRadius: '14px',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            bgcolor: tokens.cardLight
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <RecordIdentity name={partner.name} description={partner.service} />
            <IconButton
              size="small"
              aria-label={`Actions for ${partner.name}`}
              onClick={(event) => onMenu({ anchor: event.currentTarget, partner })}
            >
              <MoreVertRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
          <Typography sx={{ mt: 2, mb: 1, fontSize: 11, color: tokens.textSecondary }}>
            {partner.contactPerson || 'No contact person added'}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              mb: 0.75,
              minWidth: 0,
              color: partner.email ? tokens.textMuted : tokens.warningText
            }}
          >
            <MailOutlineRoundedIcon sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: 11, overflowWrap: 'anywhere' }}>
              {partner.email || 'Email address needed'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: tokens.textMuted }}>
            <PhoneOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: 11 }}>
              {partner.mobile ? formatMobile(partner.mobile) : 'No mobile number'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mt: 2, mb: 2 }}>
            <Pill
              size="sm"
              dot={false}
              label={`${partner.contractCount} request${partner.contractCount === 1 ? '' : 's'}`}
              bg={tokens.surfaceSubtle}
              fg={tokens.textSecondary}
            />
            {partner.archived ? (
              <Pill size="sm" label="Archived" bg={tokens.surfaceMuted} fg={tokens.textMuted} />
            ) : partner.openCount > 0 ? (
              <Pill
                size="sm"
                label={`${partner.openCount} awaiting reply`}
                bg={tokens.warningBg}
                fg={tokens.warningText}
              />
            ) : (
              <Pill
                size="sm"
                label={partner.channels.includes('email') ? 'Email ready' : 'No email'}
                bg={partner.channels.includes('email') ? tokens.successBg : tokens.warningBg}
                fg={partner.channels.includes('email') ? tokens.successText : tokens.warningText}
              />
            )}
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mt: 'auto',
              pt: 1.5,
              borderTop: `1px solid ${tokens.dividerFaint}`
            }}
          >
            <Button size="small" onClick={() => onEdit({ id: partner.id })} sx={{ color: tokens.textSecondary }}>
              Edit details
            </Button>
            {!partner.archived && (
              <Button
                size="small"
                endIcon={<ArrowForwardRoundedIcon />}
                onClick={() => onRequest(partner.id)}
                sx={{ color: tokens.goldText }}
              >
                New request
              </Button>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
