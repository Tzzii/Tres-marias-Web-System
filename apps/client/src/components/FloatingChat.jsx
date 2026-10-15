import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Portal from '@mui/material/Portal';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import { tokens } from '@tm/shared';
import CustomerConversation from './CustomerConversation.jsx';

export default function FloatingChat({ user, unread = 0 }) {
  const { pathname } = useLocation();
  const chatPage = pathname.replace(/\/+$/, '') === '/portal/messages';
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const launcher = useRef(null);
  const windowRef = useRef(null);
  const visible = open && !chatPage;

  useEffect(() => {
    if (chatPage) setOpen(false);
  }, [chatPage]);

  useEffect(() => {
    if (visible) windowRef.current?.focus({ preventScroll: true });
  }, [visible]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true }));
  };

  // Render outside the portal content's container so fixed positioning stays viewport-relative.
  return (
    <Portal>
      <Box
        className="tm-no-print"
        sx={{
          display: chatPage ? 'none' : 'block',
          position: 'fixed',
          right: { xs: 12, md: 24 },
          bottom: 'calc(var(--tm-bottom-nav, 0px) + 16px)',
          zIndex: 1190
        }}
      >
        <Paper
          ref={windowRef}
          id="customer-floating-chat"
          role="dialog"
          aria-modal="false"
          aria-labelledby="customer-floating-chat-title"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
              event.stopPropagation();
              close();
            }
          }}
          elevation={0}
          sx={{
            display: visible ? 'flex' : 'none',
            flexDirection: 'column',
            width: { xs: 'calc(100vw - 24px)', sm: 400 },
            height: 560,
            maxHeight: 'calc(100dvh - var(--tm-bottom-nav, 0px) - 104px - env(safe-area-inset-top))',
            overflow: 'hidden',
            borderRadius: 3,
            border: `1px solid ${tokens.cardLightBorder}`,
            backgroundColor: tokens.bgPanel,
            boxShadow: '0 18px 60px -12px rgba(0, 0, 0, 0.3)',
            '&:focus-visible': { outline: `2px solid ${tokens.gold}`, outlineOffset: 3 }
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              px: 2,
              py: 1.5,
              backgroundColor: tokens.sidebarBg,
              color: tokens.onInk
            }}
          >
            <Avatar sx={{ width: 38, height: 38, backgroundColor: tokens.gold, color: tokens.onGold }}>
              <ChatBubbleOutlineRoundedIcon fontSize="small" />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography id="customer-floating-chat-title" component="h2" sx={{ fontSize: 14, fontWeight: 700 }}>
                Chat with us
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: tokens.sidebarText }}>Tres Marias Catering</Typography>
            </Box>
            <Tooltip title="Open full chat">
              <IconButton
                component={RouterLink}
                to="/portal/messages"
                aria-label="Open full chat"
                size="small"
                sx={{ color: 'inherit' }}
              >
                <OpenInFullRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Minimize chat">
              <IconButton onClick={close} aria-label="Minimize chat" size="small" sx={{ color: 'inherit' }}>
                <CloseRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', overscrollBehavior: 'contain' }}>
            {started && <CustomerConversation user={user} embedded active={visible} />}
          </Box>
        </Paper>
        {!visible && (
          <Tooltip title="Chat with Tres Marias" placement="left">
            <Fab
              ref={launcher}
              aria-label={unread ? `Open chat, ${unread} unread messages` : 'Open chat'}
              aria-haspopup="dialog"
              aria-expanded={false}
              aria-controls="customer-floating-chat"
              onClick={() => {
                setStarted(true);
                setOpen(true);
              }}
              sx={{
                width: 58,
                height: 58,
                backgroundColor: tokens.sidebarBg,
                color: tokens.goldLight,
                border: `1px solid ${tokens.gold}`,
                '&:hover': { backgroundColor: tokens.goldDark, color: tokens.onGold },
                '&:focus-visible': { outline: `2px solid ${tokens.gold}`, outlineOffset: 4 }
              }}
            >
              <Badge badgeContent={unread} color="error" max={99}>
                <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 27 }} />
              </Badge>
            </Fab>
          </Tooltip>
        )}
      </Box>
    </Portal>
  );
}
