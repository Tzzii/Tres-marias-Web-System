import { PageHeader, useDocumentTitle } from '@tm/shared';
import PaymentsSection from './payments/PaymentsSection.jsx';

export default function PaymentsPage() {
  useDocumentTitle('Payments', 'Tres Marias Admin');

  return (
    <>
      <PageHeader title="Payments" />
      <PaymentsSection />
    </>
  );
}
