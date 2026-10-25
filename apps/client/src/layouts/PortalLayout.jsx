import { useEffect, useMemo, useState } from 'react';
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
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import {
  PortalShell,
  PortalSearch,
  TERMS_VERSION,
  authApi,
  formatDate,
  messageApi,
  messagePreview,
  pendingStep,
  reservationApi,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../auth.js';
import TermsUpdateDialog from '../components/TermsUpdateDialog.jsx';
import FloatingChat from '../components/FloatingChat.jsx';

export default function PortalLayout() {
  const navigate = useNavigate();
  const notify = useNotify();
  const { user, signOut, updateUser } = useAuth();
  const [termsLater, setTermsLater] = useState(false);
  const [searchQuery, setSearchQuery] = useState(null);

  const account = useResource(() => authApi.getCustomerProfile(user.id), [user.id]);
  useEffect(() => {
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

  const fresh = account.data;
  const termsDue = Boolean(fresh) && fresh.termsVersion !== TERMS_VERSION && !termsLater;

  const { data } = useResource(async () => {
    const [reservations, threads] = await Promise.all([
      reservationApi.listReservations({ customerId: user.id }),
      messageApi.listThreads({ customerId: user.id, side: 'customer' })
    ]);
    return { reservations, threads };
  }, [user.id]);

  const { notifications, unreadMessages, paymentsDue } = useMemo(() => {
    if (!data) return { notifications: [], unreadMessages: 0, paymentsDue: 0 };
    const list = [];
    let due = 0;
    data.reservations.forEach((r) => {
      const lastAt = r.activity.length ? r.activity[r.activity.length - 1].at : r.createdAt;
      const to = `/portal/reservations/${r.ref}`;
      if (r.status === 'approved' && !r.downpaymentPaid) {
        if (!r.awaitingCount) due += 1;
        list.push({
          id: `${r.ref}:approved`,
          title: 'Reservation Approved',
          body: `${r.eventName}: pay the downpayment by ${formatDate(r.downpaymentDue)} to secure your date.`,
          at: lastAt,
          to: r.awaitingCount ? to : `/portal/payments?ref=${r.ref}`
        });
      }
      if (r.status === 'downpayment_paid')
        list.push({
          id: `${r.ref}:downpayment_paid`,
          title: 'Downpayment Received',
          body: `${r.eventName} is waiting for final confirmation from our team.`,
          at: lastAt,
          to
        });
      if (r.status === 'confirmed')
        list.push({
          id: `${r.ref}:confirmed`,
          title: 'Booking Confirmed',
          body: `${r.eventName} on ${formatDate(r.date)} is confirmed. Your contract is in Documents.`,
          at: lastAt,
          to
        });
      if (r.status === 'declined')
        list.push({
          id: `${r.ref}:declined`,
          title: 'Reservation Declined',
          body: `${r.eventName}: ${r.declineReason}`,
          at: lastAt,
          to
        });
      if (pendingStep(r) === 'accept')
        list.push({
          id: `${r.ref}:quoted:${r.quotation.sentAt}`,
          title: 'Quotation Ready',
          body: `Your quotation for ${r.eventName} is ready. Review it and accept it to approve your reservation.`,
          at: r.quotation.sentAt,
          to
        });
    });
    let unread = 0;
    data.threads.forEach((t) => {
      unread += t.unread;
      if (t.unread && t.lastMessage) {
        list.push({
          id: `msg:${t.lastMessage.id}`,
          title: 'New Message From Admin',
          body: messagePreview(t.lastMessage),
          at: t.lastMessage.at,
          to: '/portal/messages'
        });
      }
    });
    list.sort((a, b) => b.at - a.at);
    return { notifications: list, unreadMessages: unread, paymentsDue: due };
  }, [data]);

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: DashboardOutlinedIcon, to: '/portal', exact: true },
    {
      key: 'reservations',
      label: 'My Reservations',
      icon: EventNoteOutlinedIcon,
      to: '/portal/reservations',
      match: ['/portal/reservations', '/portal/book']
    },
    { key: 'payments', label: 'Payments', icon: PaymentsOutlinedIcon, to: '/portal/payments', badge: paymentsDue },
    { key: 'documents', label: 'Documents', icon: DescriptionOutlinedIcon, to: '/portal/documents' },
    { key: 'calendar', label: 'Calendar', icon: CalendarMonthOutlinedIcon, to: '/portal/calendar' },
    {
      key: 'messages',
      label: 'Chat',
      icon: ChatBubbleOutlineRoundedIcon,
      to: '/portal/messages',
      badge: unreadMessages
    },
    { key: 'packages', label: 'Available Packages', icon: Inventory2OutlinedIcon, to: '/portal/packages' },
    { key: 'testimonials', label: 'My Testimonials', icon: RateReviewOutlinedIcon, to: '/portal/testimonials' }
  ];

  const bottomNav = [
    { key: 'home', label: 'Home', icon: HomeOutlinedIcon, to: '/portal', exact: true },
    {
      key: 'reservations',
      label: 'Reservations',
      icon: EventNoteOutlinedIcon,
      to: '/portal/reservations',
      match: ['/portal/reservations', '/portal/book']
    },
    { key: 'payments', label: 'Payments', icon: PaymentsOutlinedIcon, to: '/portal/payments', badge: paymentsDue },
    {
      key: 'messages',
      label: 'Chat',
      icon: ChatBubbleOutlineRoundedIcon,
      to: '/portal/messages',
      badge: unreadMessages
    },
    { key: 'settings', label: 'Settings', icon: SettingsOutlinedIcon, to: '/portal/settings' }
  ];

  return (
    <PortalShell
      portalKey={`client.${user.id}`}
      defaultSidebarCollapsed
      navItems={navItems}
      secondaryNavItems={[{ key: 'settings', label: 'Settings', icon: SettingsOutlinedIcon, to: '/portal/settings' }]}
      bottomNav={bottomNav}
      user={{ ...user, role: 'Customer' }}
      profileItems={[
        { key: 'profile', label: 'My Profile', icon: AccountCircleOutlinedIcon, to: '/portal/settings?tab=account' },
        { key: 'site', label: 'Browse Packages', icon: HomeOutlinedIcon, to: '/' }
      ]}
      search={{
        placeholder: 'Search your events or payments',
        onSubmit: setSearchQuery
      }}
      notifications={notifications}
      onLogout={() => {
        navigate('/', { replace: true });
        signOut();
      }}
    >
      <Outlet />
      <PortalSearch key={user.id} query={searchQuery} customerId={user.id} onClose={() => setSearchQuery(null)} />
      <FloatingChat key={user.id} user={user} unread={unreadMessages} />
      <TermsUpdateDialog
        open={termsDue}
        firstTime={Boolean(fresh) && !fresh.termsVersion}
        onClose={() => setTermsLater(true)}
        onAccepted={(profile) => {
          setTermsLater(true);
          updateUser({ termsVersion: profile.termsVersion });
          account.reload();
          notify('Thank you. Your agreement to our terms is saved.');
        }}
      />
    </PortalShell>
  );
}
