import { useState } from 'react';
import Box from '@mui/material/Box';
import {
  BANK_DETAILS_LIMITS,
  BusyButton,
  CardTitle,
  DashCard,
  ErrorState,
  FormField,
  ListSkeleton,
  bankDetailsProblem,
  cleanBankDetails,
  paymentApi,
  useNotify,
  useResource
} from '@tm/shared';

const fields = [
  ['bankName', 'Bank name', 'e.g. BPI'],
  ['bankAccountName', 'Account name', 'Name registered with the bank'],
  ['bankAccountNumber', 'Account number', 'Bank account number']
];

export default function PaymentDetailsSection() {
  const resource = useResource(paymentApi.getBankDetails, []);
  const notify = useNotify();
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const values = draft || resource.data;
  const dirty = values && resource.data && JSON.stringify(cleanBankDetails(values)) !== JSON.stringify(resource.data);

  const save = async (event) => {
    event.preventDefault();
    const problem = bankDetailsProblem(values);
    setErrors(problem ? { [problem.field]: problem.message } : {});
    if (problem) return;
    setSaving(true);
    try {
      const saved = await paymentApi.saveBankDetails(cleanBankDetails(values));
      resource.setData(saved);
      setDraft(null);
      notify('Bank details saved. Customers will see the updated account on the Payments page.');
    } catch (error) {
      if (error.meta?.field) setErrors({ [error.meta.field]: error.message });
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard sx={{ maxWidth: 640 }}>
      <CardTitle subtitle="Customers use this account for bank transfers on the Payments page.">
        Payment Details
      </CardTitle>
      {resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : !values ? (
        <ListSkeleton rows={3} />
      ) : (
        <Box component="form" noValidate onSubmit={save} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {fields.map(([field, label, placeholder]) => (
            <FormField
              key={field}
              id={`settings-${field}`}
              label={label}
              required
              value={values[field]}
              disabled={saving}
              error={errors[field]}
              placeholder={placeholder}
              onChange={(event) => {
                setDraft({ ...values, [field]: event.target.value });
                setErrors((current) => ({ ...current, [field]: undefined }));
              }}
              inputProps={{ maxLength: BANK_DETAILS_LIMITS[field] }}
            />
          ))}
          <BusyButton type="submit" busy={saving} disabled={!dirty} sx={{ alignSelf: 'flex-start' }}>
            Save payment details
          </BusyButton>
        </Box>
      )}
    </DashCard>
  );
}
