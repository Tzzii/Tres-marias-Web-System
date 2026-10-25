import { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import {
  PortalShell,
  PortalSearch,
  authApi,
  feedbackApi,
  formatDate,
  messageApi,
  messagePreview,
  outsourceApi,
  paymentApi,
  pendingStep,
  peso,
  reservationApi,
  useResource
} from '@tm/shared';
import { useAuth } from '../auth.js';
import FloatingChat from '../components/FloatingChat.jsx';

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, signOut, updateUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState(null);

  const account = useResource(() => authApi.getAdminProfile(user.id), [user.id]);
  useEffect(() => {
    if (account.error && account.error.code === 'NOT_FOUND') {
      navigate('/login', { replace: true });
      signOut();
      return;
    }
    const fresh = account.data;
    if (fresh && (fresh.name !== user.name || fresh.email !== user.email || fresh.mobile !== user.mobile)) {
      updateUser({ name: fresh.name, email: fresh.email, mobile: fresh.mobile });
    }
  }, [account.data, account.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data } = useResource(async () => {
    const [reservations, payments, threads, contracts, feedbacks] = await Promise.all([
      reservationApi.listReservations(),
      paymentApi.listPayments(),
      messageApi.listThreads({ side: 'admin' }),
      outsourceApi.listContracts(),
      feedbackApi.listFeedbacks()
    ]);
    return { reservations, payments, threads, contracts, feedbacks };
  }, []);

  const { notifications, pending, awaiting, unread, awaitingReply, newFeedback } = useMemo(() => {
    if (!data) return { notifications: [], pending: 0, awaiting: 0, unread: 0, awaitingReply: 0, newFeedback: 0 };
    const list = [];
    const pendingList = data.reservations.filter((r) => ['quote', 'revise'].includes(pendingStep(r)));
    pendingList.forEach((r) =>
      list.push(
        pendingStep(r) === 'revise'
          ? {
              id: `req:${r.ref}:revise`,
              title: 'Quotation to Re-send',
              body: `${r.customerName} · ${r.eventName}: the booking changed after the quotation was sent.`,
              at: r.activity.length ? r.activity[r.activity.length - 1].at : r.createdAt,
              to: `/reservations/${r.ref}`
            }
          : {
              id: `req:${r.ref}`,
              title: 'New Reservation Request',
              body: `${r.customerName} · ${r.eventName} · ${formatDate(r.date)} · ${r.guests} pax`,
              at: r.createdAt,
              to: `/reservations/${r.ref}`
            }
      )
    );
    const awaitingList = data.payments.filter((p) => p.status === 'awaiting');
    awaitingList.forEach((p) =>
      list.push({
        id: `pay:${p.id}`,
        title: 'Payment to Verify',
        body: `${p.customerName} sent ${peso(p.amount)} via ${p.methodLabel} for ${p.eventName}.`,
        at: p.submittedAt,
        to: `/payments?verify=${p.id}`
      })
    );
    const reservationOf = new Map(data.reservations.map((r) => [r.ref, r]));
    const newestVerified = new Map();
    data.payments.forEach((p) => {
      const newest = newestVerified.get(p.ref);
      if (p.status === 'verified' && (!newest || p.verifiedAt > newest.verifiedAt)) newestVerified.set(p.ref, p);
    });
    data.payments
      .filter((p) => p.status === 'verified' && p.method === 'qrph')
      .forEach((p) => {
        const r = reservationOf.get(p.ref);
        const fullyPaid =
          p.kind === 'full' ||
          (p.kind === 'balance' &&
            newestVerified.get(p.ref) === p &&
            Boolean(r) &&
            ['confirmed', 'completed'].includes(r.status) &&
            r.balance === 0);
        const receipt = p.receiptNo ? ` (${p.receiptNo})` : '';
        const [title, body] = fullyPaid
          ? [
              'Fully Paid',
              `${p.customerName} paid ${peso(p.amount)} via QR Ph for ${p.eventName}. The reservation is now fully paid${receipt}.`
            ]
          : p.kind === 'downpayment'
            ? [
                'Downpayment Received',
                `${p.customerName} paid a ${peso(p.amount)} downpayment via QR Ph for ${p.eventName}${receipt}.`
              ]
            : [
                'Balance Payment Received',
                `${p.customerName} paid ${peso(p.amount)} toward the balance via QR Ph for ${p.eventName}${receipt}.`
              ];
        list.push({ id: `paid:${p.id}`, title, body, at: p.verifiedAt || p.submittedAt, to: `/reservations/${p.ref}` });
      });
    const unreadFeedback = data.feedbacks.filter((f) => !f.readByAdmin);
    unreadFeedback.forEach((f) =>
      list.push({
        id: `fbk:${f.id}`,
        title: 'New Customer Feedback',
        body: `${f.customerName} rated ${f.eventName} ${f.rating} of 5 stars.`,
        at: f.createdAt,
        to: '/feedbacks?tab=unread'
      })
    );
    let unreadCount = 0;
    data.threads.forEach((t) => {
      unreadCount += t.unread;
      if (t.unread && t.lastMessage)
        list.push({
          id: `msg:${t.lastMessage.id}`,
          title: `Message from ${t.customerName}`,
          body: messagePreview(t.lastMessage),
          at: t.lastMessage.at,
          to: `/messages?thread=${encodeURIComponent(t.id)}`
        });
    });
    list.sort((a, b) => b.at - a.at);
    return {
      notifications: list,
      pending: pendingList.length,
      awaiting: awaitingList.length,
      unread: unreadCount,
      awaitingReply: data.contracts.filter((c) => c.status === 'sent').length,
      newFeedback: unreadFeedback.length
    };
  }, [data]);

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: DashboardOutlinedIcon, to: '/dashboard' },
    {
      key: 'reservations',
      label: 'Reservations',
      icon: EventNoteOutlinedIcon,
      to: '/reservations',
      badge: pending
    },
    { key: 'calendar', label: 'Calendar', icon: CalendarMonthOutlinedIcon, to: '/calendar' },
    { key: 'packages', label: 'Packages', icon: RestaurantMenuOutlinedIcon, to: '/packages' },
    { key: 'inventory', label: 'Inventory', icon: Inventory2OutlinedIcon, to: '/inventory' },
    { key: 'outsource', label: 'Outsource', icon: HandshakeOutlinedIcon, to: '/outsource', badge: awaitingReply },
    { key: 'customers', label: 'Customers', icon: GroupsOutlinedIcon, to: '/customers' },
    { key: 'messages', label: 'Messages', icon: ChatBubbleOutlineRoundedIcon, to: '/messages', badge: unread },
    { key: 'payments', label: 'Payments', icon: PaymentsOutlinedIcon, to: '/payments', badge: awaiting },
    { key: 'reports', label: 'Reports', icon: AssessmentOutlinedIcon, to: '/reports' },
    { key: 'feedbacks', label: 'Feedbacks', icon: RateReviewOutlinedIcon, to: '/feedbacks', badge: newFeedback }
  ];

  const bottomNav = [
    { key: 'dashboard', label: 'Dashboard', icon: DashboardOutlinedIcon, to: '/dashboard' },
    { key: 'reservations', label: 'Reservations', icon: EventNoteOutlinedIcon, to: '/reservations', badge: pending },
    {
      key: 'payments',
      label: 'Payments',
      icon: PaymentsOutlinedIcon,
      to: '/payments',
      badge: awaiting
    },
    { key: 'messages', label: 'Messages', icon: ChatBubbleOutlineRoundedIcon, to: '/messages', badge: unread },
    { key: 'more', label: 'More', icon: MoreHorizRoundedIcon, drawer: true, badge: awaitingReply + newFeedback }
  ];

  return (
    <PortalShell
      portalKey={`admin.${user.id}`}
      defaultSidebarCollapsed={false}
      navItems={navItems}
      bottomNav={bottomNav}
      secondaryNavItems={[{ key: 'settings', label: 'Settings', icon: SettingsOutlinedIcon, to: '/settings' }]}
      user={user}
      profileItems={[
        { key: 'account', label: 'My Account', icon: ManageAccountsOutlinedIcon, to: '/settings?tab=account' }
      ]}
      search={{
        placeholder: 'Search events, customers or payments',
        onSubmit: setSearchQuery
      }}
      notifications={notifications}
      onLogout={() => {
        navigate('/login', { replace: true });
        signOut();
      }}
    >
      <Outlet />
      <PortalSearch key={user.id} query={searchQuery} admin onClose={() => setSearchQuery(null)} />
      <FloatingChat key={user.id} unread={unread} />
    </PortalShell>
  );
}
