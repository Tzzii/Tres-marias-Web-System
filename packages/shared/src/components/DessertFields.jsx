import { useState } from 'react';
import Box from '@mui/material/Box';
import { DESSERT_CHOICES } from '../domain/menu.js';
import { FormField, SelectField } from './FormField.jsx';
export function DessertFields({ idPrefix, value = {}, onChange, errors = {} }) {
  const [other, setOther] = useState(false);
  const custom = other || Boolean(value.name && !DESSERT_CHOICES.includes(value.name));
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <SelectField id={`${idPrefix}-choice`} label="Dessert" placeholder="Choose a dessert" required value={custom ? 'Other' : value.name || ''} options={DESSERT_CHOICES} onChange={(e) => { setOther(e.target.value === 'Other'); onChange({ ...value, name: e.target.value === 'Other' ? '' : e.target.value }); }} error={custom ? undefined : errors['menu.dessert.name']} />
    {custom && <FormField id={`${idPrefix}-name`} label="Your dessert" required value={value.name || ''} onChange={(e) => onChange({ ...value, name: e.target.value })} error={errors['menu.dessert.name']} inputProps={{ maxLength: 120 }} />}
    <FormField id={`${idPrefix}-description`} label="Dessert description" optional multiline minRows={2} value={value.description || ''} onChange={(e) => onChange({ ...value, description: e.target.value })} error={errors['menu.dessert.description']} placeholder="Flavor, presentation, portions, or special requests" hint="An additional charge, priced in your quotation." inputProps={{ maxLength: 500 }} />
  </Box>;
}
