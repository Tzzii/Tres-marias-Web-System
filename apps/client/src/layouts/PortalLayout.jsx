import { useEffect, useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { PortalShell, authApi, formatDate, messageApi, reservationApi, useResource } from '@tm/shared';
import { useAuth } from '../auth.js';

/** The customer account frame (1g–1l, 1p): sidebar on desktop, bottom tabs on phones. */
export default function PortalLayout() {
  const navigate = useNavigate();
  const { user, signOut, updateUser } = useAuth();

  // The session keeps a copy of the customer's details from log-in. Compare it with the account record
  // (re-checked whenever data changes) so the portal never shows an old name, mobile or company. With the
  // API this is also the first call a portal page makes, so a token the server no longer accepts
  // (expired, edited, or older than a password change) signs the customer out right away (a 401 does that).
  const account = useResource(() => authApi.getCustomerProfile(user.id), [user.id]);
  useEffect(() => {
    // The account no longer exists (e.g. the browser data was reset): end this session
    if (account.error && account.error.code === 'NOT_FOUND') {
      navigate('/login', { replace: true });
      signOut();
      return;
    }
    const fresh = account.data;
    if (fresh && (fresh.name !== user.name || fresh.mobile !== user.mobile || fresh.company !== (user.company || ''))) {
      updateUser(fresh);
    }
  }, [account.data, account.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load this customer's reservations and chat threads for the notification bell and badges
  const { data } = useResource(async () => {
    const [reservations, threads] = await Promise.all([
      reservationApi.listReservations({ customerId: user.id }),
      messageApi.listThreads({ customerId: user.id, side: 'customer' })
    ]);
    return { reservations, threads };
  }, [user.id]);

  // Build notifications from each reservation's status and from unread messages.
  // Recalculated only when `data` changes.
  const { notifications, unreadMessages, paymentsDue } = useMemo(() => {
    if (!data) return { notifications: [], unreadMessages: 0, paymentsDue: 0 };
    const list = [];
    let due = 0; // reservations that still need a downpayment
    data.reservations.forEach((r) => {
      // Use the time of the latest activity as the notification time
      const lastAt = r.activity.length ? r.activity[r.activity.length - 1].at : r.createdAt;
      const to = `/portal/reservations/${r.ref}`;
      // Approved but unpaid: link to Payments, unless proof was already uploaded
      if (r.status === 'approved' && !r.downpaymentPaid) {
        if (!r.awaitingCount) due += 1;
        list.push({ id: `${r.ref}:approved`, title: 'Reservation approved', body: `${r.eventName}: pay the downpayment by ${formatDate(r.downpaymentDue)} to secure your date.`, at: lastAt, to: r.awaitingCount ? to : `/portal/payments?ref=${r.ref}` });
      }
      if (r.status === 'downpayment_paid') list.push({ id: `${r.ref}:downpayment_paid`, title: 'Downpayment received', body: `${r.eventName} is waiting for final confirmation from our team.`, at: lastAt, to });
      if (r.status === 'confirmed') list.push({ id: `${r.ref}:confirmed`, title: 'Booking confirmed', body: `${r.eventName} on ${formatDate(r.date)} is confirmed. Your contract is in Documents.`, at: lastAt, to });
      if (r.status === 'declined') list.push({ id: `${r.ref}:declined`, title: 'Reservation declined', body: `${r.eventName}: ${r.declineReason}`, at: lastAt, to });
      if (r.quotation && r.status === 'pending') list.push({ id: `${r.ref}:quoted:${r.quotation.sentAt}`, title: 'Quotation ready', body: `Your quotation for ${r.eventName} is ready to review.`, at: r.quotation.sentAt, to });
    });
    // Count unread chat messages and add a notification for each thread with new ones
    let unread = 0;
    data.threads.forEach((t) => {
      unread += t.unread;
      if (t.unread && t.lastMessage) {
        list.push({ id: `msg:${t.lastMessage.id}`, title: 'New message from Admin', body: t.lastMessage.body, at: t.lastMessage.at, to: '/portal/messages' });
      }
    });
    // Newest first, keep the latest 20
    list.sort((a, b) => b.at - a.at);
    return { notifications: list.slice(0, 20), unreadMessages: unread, paymentsDue: due };
  }, [data]);

  // Desktop sidebar links. `match` keeps "My Reservations" highlighted on the booking form too.
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: DashboardOutlinedIcon, to: '/portal', exact: true },
    { key: 'reservations', label: 'My Reservations', icon: EventNoteOutlinedIcon, to: '/portal/reservations', match: ['/portal/reservations', '/portal/book'] },
    { key: 'payments', label: 'Payments', icon: PaymentsOutlinedIcon, to: '/portal/payments', badge: paymentsDue },
    { key: 'documents', label: 'Documents', icon: DescriptionOutlinedIcon, to: '/portal/documents' },
    { key: 'calendar', label: 'Calendar', icon: CalendarMonthOutlinedIcon, to: '/portal/calendar' },
    { key: 'messages', label: 'Chat', icon: ChatBubbleOutlineRoundedIcon, to: '/portal/messages', badge: unreadMessages },
    { key: 'packages', label: 'Available Packages', icon: Inventory2OutlinedIcon, to: '/portal/packages' },
    { key: 'testimonials', label: 'My Testimonials', icon: RateReviewOutlinedIcon, to: '/portal/testimonials' }
  ];

  // Phone bottom tab bar (fewer items than the sidebar)
  const bottomNav = [
    { key: 'home', label: 'Home', icon: HomeOutlinedIcon, to: '/portal', exact: true },
    { key: 'reservations', label: 'Reservations', icon: EventNoteOutlinedIcon, to: '/portal/reservations', match: ['/portal/reservations', '/portal/book'] },
    { key: 'payments', label: 'Payments', icon: PaymentsOutlinedIcon, to: '/portal/payments', badge: paymentsDue },
    { key: 'messages', label: 'Chat', icon: ChatBubbleOutlineRoundedIcon, to: '/portal/messages', badge: unreadMessages },
    { key: 'profile', label: 'Profile', icon: AccountCircleOutlinedIcon, to: '/portal/profile' }
  ];

  return (
    <PortalShell
      portalKey={`client.${user.id}`}
      navItems={navItems}
      secondaryNavItems={[{ key: 'profile', label: 'My Profile', icon: AccountCircleOutlinedIcon, to: '/portal/profile' }]}
      bottomNav={bottomNav}
      user={{ ...user, role: 'Customer' }}
      profileItems={[
        { key: 'profile', label: 'My profile', icon: AccountCircleOutlinedIcon, to: '/portal/profile' },
        { key: 'site', label: 'Browse packages', icon: HomeOutlinedIcon, to: '/' }
      ]}
      search={{ placeholder: 'Search your reservations', onSubmit: (q) => navigate(`/portal/reservations?q=${encodeURIComponent(q)}`) }}
      notifications={notifications}
      // Go back to the public home page, then clear the session
      onLogout={() => {
        navigate('/', { replace: true });
        signOut();
      }}
    >
      <Outlet />
    </PortalShell>
  );
}
