import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildPortalSearchIndex } from '../domain/portalSearch.js';
import { subscribe } from '../services/events.js';
import * as reservationApi from '../services/remote/reservation.js';
import * as paymentApi from '../services/remote/payment.js';
import * as customerApi from '../services/remote/customer.js';
import * as inventoryApi from '../services/remote/inventory.js';
import * as catalogApi from '../services/remote/catalog.js';

// A cache belongs to this mounted portal session, never shared across signed-in users.
// Calls are lazy and deduplicated; changes invalidate it without fetching while search is closed.
export function usePortalSearch({ admin, customerId }) {
  const [revision, setRevision] = useState(0);
  const cache = useMemo(() => ({ pending: null }), [admin, customerId, revision]);
  const current = useRef(cache);
  current.current = cache;
  const mounted = useRef(false);
  const [state, setState] = useState(null);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribe(() => setRevision((value) => value + 1));
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  const load = useCallback(() => {
    if (cache.pending) return cache.pending;
    setState({ cache, data: null, error: null, loading: true });
    cache.pending = Promise.all([
      reservationApi.listReservations(admin ? {} : { customerId }),
      paymentApi.listPayments(),
      admin ? customerApi.listCustomers() : [],
      admin ? inventoryApi.listInventory() : [],
      catalogApi.listPackages()
    ])
      .then(([reservations, payments, customers, inventory, packages]) => {
        if (!mounted.current || current.current !== cache) return;
        const data = buildPortalSearchIndex({ reservations, payments, customers, inventory, packages }, { admin });
        setState({ cache, data, error: null, loading: false });
      })
      .catch((error) => {
        cache.pending = null;
        if (mounted.current && current.current === cache) setState({ cache, data: null, error, loading: false });
      });
    return cache.pending;
  }, [cache, admin, customerId]);

  return {
    ...(state?.cache === cache ? state : { data: null, error: null, loading: true }),
    load
  };
}
