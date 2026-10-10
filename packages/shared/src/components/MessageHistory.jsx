import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { messageVersions } from '../domain/messages.js';
import { useNotify } from '../hooks/useNotify.jsx';
import { BUSINESS } from '../services/config.js';
import { tokens } from '../theme/tokens.js';
import { formatDateTime, toISODate } from '../utils/format.js';
import { saveElementAsPdf } from '../utils/savePdf.js';
import { LightSurface } from './Surface.jsx';

// How each version is labelled in the list
const KIND_LABEL = { original: 'Original', edited: 'Edited', deleted: 'Deleted' };

// "Maria Santos" -> "Maria-Santos", for the PDF's file name
const fileSafe = (text) => String(text || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Chat';

/**
 * The admin's "View history" of a chat message that was edited or deleted (2026-10-10): every version,
 * oldest first (messageVersions in domain/messages.js), with who wrote it and when, as a record if there is
 * a dispute. Print and Save PDF work like the documents' (DocumentDialog): Print opens the browser's print
 * window with only this sheet, Save PDF downloads it ("Message-History-Maria-Santos-2026-10-10.pdf").
 * Customers never see it: the server only sends the earlier texts to the admin.
 * `message` is the admin's copy of the message, `conversation` the customer's name.
 */
export function MessageHistoryDialog({ open, onClose, message, conversation }) {
  const isPhone = useMediaQuery('(max-width:599px)');
  const notify = useNotify();
  const sheetRef = useRef(null); // the record itself, drawn into the PDF
  const [saving, setSaving] = useState(false);
  if (!message) return null;

  const versions = messageVersions(message);
  const writer = message.from === 'admin' ? `${message.senderName} (Admin)` : message.senderName;
  const fileName = `Message-History-${fileSafe(conversation)}-${toISODate(new Date(message.at))}.pdf`;

  // Save as a PDF (the "Save as" window first, where the browser has one; Cancel saves nothing)
  const savePdf = async () => {
    setSaving(true);
    try {
      const saved = await saveElementAsPdf(sheetRef.current, fileName, { title: fileName.replace(/\.pdf$/, ''), footer: `${BUSINESS.name} · Message History` });
      if (saved) notify(`${fileName} saved.`);
    } catch (e) {
      notify("Couldn't create the PDF. Use Print and choose Save as PDF instead.", 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LightSurface>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isPhone} className="tm-print-root" scroll="body">
        {/* Top bar, left out of the printout */}
        <Box className="tm-no-print" sx={{ position: 'sticky', top: 0, zIndex: 1, px: 2, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: `1px solid ${tokens.cardLightBorder}`, backgroundColor: tokens.surfaceSubtle }}>
          <Typography noWrap sx={{ minWidth: 0, fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>Message History</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Button size="small" variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
              Print
            </Button>
            <Button size="small" variant="contained" startIcon={<PictureAsPdfOutlinedIcon />} disabled={saving} onClick={savePdf}>
              {saving ? 'Saving…' : 'Save PDF'}
            </Button>
            <IconButton size="small" onClick={onClose} aria-label="Close message history">
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* The record. Save PDF draws this box; in the PDF the page margins replace its padding. */}
        <Box ref={sheetRef} sx={{ p: { xs: 2.5, sm: 4 }, color: tokens.textPrimary }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textMuted }}>{BUSINESS.name}</Typography>
          <Typography component="h2" sx={{ fontSize: 20, fontWeight: 800, mt: 0.25 }}>Message History</Typography>
          <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 2, rowGap: 0.25, fontSize: 13 }}>
            <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>Conversation</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{conversation}</Typography>
            <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>Written by</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{writer}</Typography>
            <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>Sent</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{formatDateTime(message.at)}</Typography>
            {message.eventName && (
              <>
                <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>About</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{message.eventName}</Typography>
              </>
            )}
          </Box>

          {/* Every version, oldest first */}
          <Box component="ol" sx={{ m: 0, mt: 2.5, p: 0, listStyle: 'none', borderTop: `1px solid ${tokens.cardLightBorder}` }}>
            {versions.map((version, i) => (
              <Box component="li" key={`${version.kind}-${i}`} data-pdf-keep sx={{ py: 1.5, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: version.kind === 'deleted' ? tokens.redPress : tokens.textSecondary }}>
                  {KIND_LABEL[version.kind]} · {formatDateTime(version.at)}
                </Typography>
                {version.kind === 'deleted' ? (
                  <Typography sx={{ mt: 0.5, fontSize: 13, fontStyle: 'italic', color: tokens.textMuted }}>Deleted by its writer. The chat now shows "This message was deleted" on both sides.</Typography>
                ) : (
                  <Typography sx={{ mt: 0.5, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{version.body}</Typography>
                )}
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 2, fontSize: 11.5, color: tokens.textMuted }}>
            Kept as a record of the conversation. Only the admin can see earlier versions; the chat shows the newest text.
          </Typography>
        </Box>
      </Dialog>
    </LightSurface>
  );
}
