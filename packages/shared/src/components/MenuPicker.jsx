import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { DISH_CATEGORIES, MENU_LINE_MAX } from '../services/config.js';
import { dishesInMenu, menuCount } from '../domain/menu.js';
import { tokens } from '../theme/tokens.js';
import { FormField } from './FormField.jsx';
export function MenuPicker({ idPrefix, menu, dishes, onChange, errors = {} }) {
 const total = menuCount(menu);
 return <Box>
  <Typography aria-live="polite" sx={{ mb: 1.5, fontWeight: 700 }}>{total} of 4 dishes selected</Typography>
  <Typography sx={{ mb: 2, fontSize: 13, color: tokens.textSecondary }}>Choose up to 2 dishes per category. You may skip a category and use its choice in another category. Exactly 4 dishes are required.</Typography>
  {errors['menu.total'] && <Typography role="alert" sx={{ mb: 1, color: tokens.redPress }}>{errors['menu.total']}</Typography>}
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start', gap: 2 }}>
   {DISH_CATEGORIES.map(({ key, label }) => {
    const choices = dishesInMenu(menu, key);
    const offered = dishes.filter((d) => d.category === key);
    const custom = choices.map((name, index) => ({ name, index })).filter(({ name }) => !offered.some((d) => d.name === name));
    return <Box component="fieldset" key={key} sx={{ m: 0, minWidth: 0, p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
     <Typography component="legend" sx={{ fontWeight: 700, fontSize: 14 }}>{label} · {choices.length}/2</Typography>
     {offered.map((dish) => <FormControlLabel key={dish.id} sx={{ display: 'flex', mr: 0, '& .MuiFormControlLabel-label': { fontSize: 13.5 } }} control={<Checkbox size="small" checked={choices.includes(dish.name)} disabled={!choices.includes(dish.name) && (choices.length >= 2 || total >= 4)} onChange={(e) => onChange(key, e.target.checked ? [...choices, dish.name] : choices.filter((name) => name !== dish.name))} />} label={dish.name} />)}
     {custom.map(({ name, index }) => <Box key={index} sx={{ mt: 1 }}><FormField id={`${idPrefix}-${key}-other-${index}`} label={`Other ${label.toLowerCase()} ${index + 1}`} value={name} onChange={(e) => onChange(key, choices.map((v, i) => i === index ? e.target.value : v))} inputProps={{ maxLength: MENU_LINE_MAX }} /><Button size="small" onClick={() => onChange(key, choices.filter((_, i) => i !== index))}>Remove this dish</Button></Box>)}
     <Button size="small" disabled={choices.length >= 2 || total >= 4} onClick={() => onChange(key, [...choices, ''])}>Add other dish</Button>
     {errors[`menu.${key}`] && <Typography role="alert" sx={{ color: tokens.redPress, fontSize: 13 }}>{errors[`menu.${key}`]}</Typography>}
    </Box>;
   })}
  </Box>
 </Box>;
}
