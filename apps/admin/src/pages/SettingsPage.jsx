import { SettingsPanel, useDocumentTitle } from '@tm/shared';
import AccountPage from './AccountPage.jsx';
import PaymentDetailsSection from './settings/PaymentDetailsSection.jsx';
import HeroPhotoSection from './settings/HeroPhotoSection.jsx';

export default function SettingsPage() {
  useDocumentTitle('Settings', 'Tres Marias Admin');

  return (
    <SettingsPanel
      accountLabel="My Account"
      paymentDetails={<PaymentDetailsSection />}
      appearanceSettings={<HeroPhotoSection />}
    >
      <AccountPage />
    </SettingsPanel>
  );
}
