import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { DISH_CATEGORIES, MENU_LINE_MAX } from '../services/config.js';
import { tokens } from '../theme/tokens.js';
import { FormField } from './FormField.jsx';

// The radio value of "Others" (never a dish name: dish names are saved as they are)
const OTHERS = '__others__';

/**
 * A buffet's menu as radio buttons (2026-10-10; before, a text box with the dishes as suggestions): for each
 * of DISH_CATEGORIES (Pork, Chicken, Fish, Vegetable), the admin's dishes in that category and "Others",
 * which opens a text box for the customer's own dish (it may name more than one, e.g. "Lechon kawali and
 * pork barbecue"). Used by the booking form and the admin's Edit Menu dialog.
 *
 * The menu is saved as before, one line of text per category ({ pork: 'Lechon Kawali', … }), so nothing
 * else changes: a dish picked from the list is its name, "Others" is the text typed. A saved line that is
 * not one of the dishes (typed before, or a dish archived since) opens with "Others" picked and its text in
 * the box.
 *
 * `idPrefix` names the inputs, `menu` is the menu so far, `dishes` the dishes on offer ([{ id, category,
 * name }]), `onChange(category, text)` gets each change, `errors` the messages by field ('menu.pork', …),
 * shown under the category (or under its box when "Others" is picked). `required` marks each category.
 */
export function MenuPicker({ idPrefix, menu, dishes, onChange, errors = {}, required = false }) {
  // Categories where "Others" is picked; one with a saved line that is not a dish counts too (see below)
  const [othersPicked, setOthersPicked] = useState({});
  const otherBoxes = useRef({}); // each category's "Others" box, to put the cursor there
  const justPicked = useRef(''); // the category whose "Others" was just pressed (never on load)

  const dishesIn = (key) => dishes.filter((d) => d.category === key);
  const listed = (key, text) => dishesIn(key).some((d) => d.name === text);
  // What the category's radio shows: "Others" when picked, or when the saved line is not a dish; else the dish ('' = none)
  const choiceOf = (key) => {
    const text = menu[key] || '';
    if (othersPicked[key] || (text && !listed(key, text))) return OTHERS;
    return text;
  };

  useEffect(() => {
    const key = justPicked.current;
    if (key && otherBoxes.current[key]) otherBoxes.current[key].focus();
    justPicked.current = '';
  }, [othersPicked]);

  // A dish replaces the line; "Others" empties it (unless it already holds the customer's own words)
  const pick = (key, value) => {
    if (value === OTHERS) {
      justPicked.current = key;
      setOthersPicked((o) => ({ ...o, [key]: true }));
      const text = menu[key] || '';
      if (listed(key, text)) onChange(key, '');
      return;
    }
    setOthersPicked((o) => ({ ...o, [key]: false }));
    onChange(key, value);
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      {DISH_CATEGORIES.map(({ key, label }) => {
        const choice = choiceOf(key);
        const error = errors[`menu.${key}`];
        const labelId = `${idPrefix}-${key}-label`;
        return (
          <Box key={key} component="fieldset" aria-labelledby={labelId} sx={{ m: 0, minWidth: 0, p: 1.5, borderRadius: 1.5, border: `1px solid ${error ? tokens.red : tokens.cardLightBorder}`, backgroundColor: tokens.cardLight }}>
            {/* float keeps the title inside the box (a fieldset's legend otherwise sits on its border) */}
            <Typography id={labelId} component="legend" sx={{ float: 'left', width: '100%', p: 0, mb: 0.5, fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
              {label}
              {required && <Box component="span" sx={{ color: tokens.red, ml: 0.25 }} aria-hidden>*</Box>}
            </Typography>
            <RadioGroup name={`${idPrefix}-${key}`} value={choice} onChange={(e) => pick(key, e.target.value)} sx={{ clear: 'both' }}>
              {dishesIn(key).map((d) => (
                <FormControlLabel key={d.id} value={d.name} control={<Radio size="small" id={`${idPrefix}-${key}-${d.id}`} />} label={d.name} sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: 13.5 } }} />
              ))}
              <FormControlLabel value={OTHERS} control={<Radio size="small" id={`${idPrefix}-${key}-others`} />} label="Others" sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: 13.5, fontWeight: choice === OTHERS ? 700 : 400 } }} />
            </RadioGroup>
            {/* The customer's own dish, when it is not on the list */}
            {choice === OTHERS && (
              <FormField
                ref={(el) => { otherBoxes.current[key] = el; }}
                id={`${idPrefix}-${key}-other`}
                label={`Your ${label.toLowerCase()}`}
                required={required}
                value={menu[key] || ''}
                onChange={(e) => onChange(key, e.target.value)}
                error={error}
                placeholder={key === 'pork' ? 'e.g. Lechon kawali and pork barbecue' : `Type your ${label.toLowerCase()}`}
                hint="You can name more than one dish."
                inputProps={{ maxLength: MENU_LINE_MAX, autoComplete: 'off' }}
                sx={{ mt: 1 }}
              />
            )}
            {choice !== OTHERS && error && (
              <Typography role="alert" sx={{ mt: 0.5, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>{error}</Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
