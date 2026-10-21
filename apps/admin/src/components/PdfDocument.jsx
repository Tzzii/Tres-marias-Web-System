import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import {
  BUSINESS,
  LOGO_SRC,
  PaperSurface,
  paperSurfaceSx,
  formatDateTime,
  peso,
  saveElementAsPdf,
  tokens,
  useNotify
} from '@tm/shared';

function PdfDocument({ document: doc, sheetRef }) {
  const columns = doc.rows?.length ? Object.keys(doc.rows[0]) : [];
  const money = doc.money || [];
  return createPortal(
    <PaperSurface>
      <Box
        ref={sheetRef}
        aria-hidden="true"
        className={`tm-print-sheet tm-no-print${doc.orientation === 'landscape' ? ' tm-print-landscape' : ''}`}
        sx={{ ...paperSurfaceSx, color: tokens.textPrimary, fontSize: 12, lineHeight: 1.5 }}
      >
        <Box data-pdf-keep>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box
              component="img"
              src={LOGO_SRC}
              alt=""
              sx={{ width: 56, height: 56, borderRadius: '50%', border: `2px solid ${tokens.gold}` }}
            />
            <Box>
              <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{BUSINESS.name}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>{BUSINESS.address}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                {BUSINESS.phone} · {BUSINESS.email}
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 2, borderColor: tokens.gold, borderBottomWidth: 2 }} />
          <Typography sx={{ fontSize: 22, fontWeight: 800, color: tokens.goldDark }}>{doc.title}</Typography>
          {doc.subtitle && <Typography sx={{ fontSize: 12.5 }}>{doc.subtitle}</Typography>}
          <Typography sx={{ mb: 2, fontSize: 11.5, color: tokens.textMuted }}>
            Generated: {formatDateTime(doc.generatedAt)}
          </Typography>
        </Box>

        {doc.details && (
          <Box component="dl" sx={{ m: 0, mb: 2 }}>
            {doc.details.map(([label, value]) => (
              <Box
                key={label}
                data-pdf-keep
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '140px minmax(0, 1fr)',
                  gap: 2,
                  py: 0.75,
                  borderBottom: `1px solid ${tokens.cardLightBorder}`
                }}
              >
                <Box component="dt" sx={{ fontWeight: 700 }}>
                  {label}
                </Box>
                <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                  {value}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {doc.rows && (
          <Box
            component="table"
            sx={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              fontSize: 11.5,
              '& th, & td': {
                px: 1,
                py: 0.75,
                verticalAlign: 'top',
                overflowWrap: 'anywhere',
                borderBottom: `1px solid ${tokens.cardLightBorder}`
              },
              '& th': { backgroundColor: tokens.surfaceSubtle, color: tokens.textSecondary, fontWeight: 700 }
            }}
          >
            <thead data-pdf-repeat>
              <tr>
                {columns.map((key) => (
                  <th
                    key={key}
                    style={{
                      textAlign: money.includes(key) || typeof doc.rows[0][key] === 'number' ? 'right' : 'left'
                    }}
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((key) => (
                    <td
                      key={key}
                      style={{ textAlign: money.includes(key) || typeof row[key] === 'number' ? 'right' : 'left' }}
                    >
                      {money.includes(key) ? peso(row[key]) : String(row[key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        )}

        {doc.message !== undefined && (
          <Box sx={{ mt: 2 }}>
            <Typography data-pdf-keep sx={{ mb: 1, fontSize: 13, fontWeight: 800, color: tokens.goldDark }}>
              Request message
            </Typography>
            <Box sx={{ overflowWrap: 'anywhere' }}>
              {doc.message.split(/\r?\n/).map((line, index) => (
                <Box key={index} data-pdf-keep sx={{ mb: 0.5, minHeight: '1.5em', whiteSpace: 'pre-wrap' }}>
                  {line}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </PaperSurface>,
    document.body
  );
}

export function usePdfDocument() {
  const notify = useNotify();
  const sheetRef = useRef(null);
  const busyRef = useRef(false);
  const [document, setDocument] = useState(null);
  const savePdfDocument = async (options) => {
    if (busyRef.current) return;
    busyRef.current = true;
    flushSync(() => setDocument({ ...options, generatedAt: Date.now() }));
    try {
      const saved = await saveElementAsPdf(sheetRef.current, options.fileName, {
        title: `${BUSINESS.name} - ${options.title}`,
        footer: `${BUSINESS.name} - ${options.title}`,
        orientation: options.orientation || 'portrait'
      });
      if (saved) notify('Saved as PDF.');
    } catch (error) {
      notify('Could not save the PDF. Please try again.', 'error');
    } finally {
      busyRef.current = false;
      setDocument(null);
    }
  };
  return {
    savePdfDocument,
    savingPdfDocument: Boolean(document),
    pdfDocument: document ? <PdfDocument document={document} sheetRef={sheetRef} /> : null
  };
}
