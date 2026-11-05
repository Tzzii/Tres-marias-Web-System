import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import { DISH_CATEGORIES, MENU_LINE_MAX } from '../services/config.js';
import { dishesInMenu, menuCount } from '../domain/menu.js';
import { tokens } from '../theme/tokens.js';
import { FormField } from './FormField.jsx';

export function MenuPicker({ idPrefix, menu, dishes, onChange, errors = {} }) {
  const total = menuCount(menu);
  const pickedDishes = DISH_CATEGORIES.flatMap(({ key, label }) =>
    dishesInMenu(menu, key).map((name) => ({ category: label, name: name.trim() || `Custom ${label.toLowerCase()}` }))
  );

  return (
    <Box sx={{ minWidth: 0, containerType: 'inline-size', containerName: 'menu-fields' }}>
      <Box
        sx={{
          p: { xs: 1.75, sm: 2 },
          mb: 2.25,
          borderRadius: 2,
          backgroundColor: tokens.surfaceSubtle,
          border: `1px solid ${total === 4 ? tokens.successBorder : tokens.cardLightBorder}`
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
            <RestaurantOutlinedIcon sx={{ fontSize: 17, color: total === 4 ? tokens.successText : tokens.goldText }} />
            <Typography aria-live="polite" sx={{ fontWeight: 700, fontSize: 13.5, color: tokens.textPrimary }}>
              {total} of 4 dishes selected
            </Typography>
          </Box>
          <Typography
            sx={{
              px: 1.1,
              py: 0.25,
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 700,
              color: total === 4 ? tokens.successText : tokens.goldText,
              backgroundColor: total === 4 ? tokens.successBg : tokens.goldSubtle
            }}
          >
            {total === 4 ? 'Menu complete' : `${Math.max(0, 4 - total)} more needed`}
          </Typography>
        </Box>
        <Typography sx={{ mb: 1.5, fontSize: 12.5, lineHeight: 1.55, color: tokens.textSecondary }}>
          Choose exactly 4 dishes in total, with a maximum of 2 per category. You may skip any category. For example,
          choose 2 pork dishes, 1 vegetable dish and 1 chicken dish, with no fish.
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            '@container menu-fields (min-width: 560px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
            gap: 1
          }}
        >
          {[0, 1, 2, 3].map((slotIndex) => {
            const picked = pickedDishes[slotIndex];
            return (
              <Box
                key={slotIndex}
                sx={{
                  px: 1.25,
                  py: 0.85,
                  borderRadius: 1.5,
                  minWidth: 0,
                  border: `1px ${picked ? 'solid' : 'dashed'} ${picked ? tokens.goldDark : tokens.borderInput}`,
                  backgroundColor: picked ? tokens.goldWash : tokens.cardLight,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.85
                }}
              >
                {picked ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: 16, color: tokens.goldDark, flexShrink: 0 }} />
                ) : (
                  <Box
                    component="span"
                    sx={{
                      width: 19,
                      height: 19,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: tokens.textMuted,
                      backgroundColor: tokens.surfaceMuted
                    }}
                  >
                    {slotIndex + 1}
                  </Box>
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: picked ? 700 : 500,
                      color: picked ? tokens.textPrimary : tokens.textMuted,
                      overflowWrap: 'anywhere'
                    }}
                  >
                    {picked ? picked.name : `Dish ${slotIndex + 1}`}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>
                    {picked ? picked.category : 'Empty slot'}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {errors['menu.total'] && (
        <Typography role="alert" sx={{ mb: 1.75, fontSize: 13, fontWeight: 600, color: tokens.redPress }}>
          {errors['menu.total']}
        </Typography>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          '@container menu-fields (min-width: 540px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
          alignItems: 'start',
          gap: 1.75
        }}
      >
        {DISH_CATEGORIES.map(({ key, label }) => {
          const choices = dishesInMenu(menu, key);
          const offered = dishes.filter((d) => d.category === key);
          const custom = choices
            .map((name, index) => ({ name, index }))
            .filter(({ name }) => !offered.some((d) => d.name === name));
          const hasSelection = choices.length > 0;
          return (
            <Box
              component="fieldset"
              key={key}
              sx={{
                m: 0,
                minWidth: 0,
                p: { xs: 1.5, sm: 2 },
                borderRadius: 2,
                border: `1.5px solid ${hasSelection ? tokens.goldDark : tokens.cardLightBorder}`,
                backgroundColor: tokens.cardLight
              }}
            >
              <Typography
                component="legend"
                sx={{
                  px: 0.75,
                  fontWeight: 700,
                  fontSize: 13,
                  color: hasSelection ? tokens.goldText : tokens.textPrimary
                }}
              >
                {label} · {choices.length}/2
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35, mt: 0.25 }}>
                {offered.map((dish) => {
                  const isChecked = choices.includes(dish.name);
                  const isDisabled = !isChecked && (choices.length >= 2 || total >= 4);
                  return (
                    <FormControlLabel
                      key={dish.id}
                      sx={{
                        display: 'flex',
                        m: 0,
                        px: 1,
                        py: 0.35,
                        borderRadius: 1.25,
                        backgroundColor: isChecked ? tokens.goldWash : 'transparent',
                        border: `1px solid ${isChecked ? tokens.shellBorder : 'transparent'}`,
                        transition: 'background-color 0.15s ease',
                        '& .MuiFormControlLabel-label': {
                          fontSize: 13,
                          fontWeight: isChecked ? 600 : 400,
                          color: tokens.textPrimary
                        }
                      }}
                      control={
                        <Checkbox
                          size="small"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={(e) =>
                            onChange(
                              key,
                              e.target.checked ? [...choices, dish.name] : choices.filter((name) => name !== dish.name)
                            )
                          }
                        />
                      }
                      label={dish.name}
                    />
                  );
                })}
              </Box>
              {custom.map(({ name, index }) => (
                <Box
                  key={index}
                  sx={{
                    mt: 1.25,
                    p: 1.25,
                    borderRadius: 1.5,
                    backgroundColor: tokens.surfaceSubtle,
                    border: `1px solid ${tokens.cardLightBorder}`
                  }}
                >
                  <FormField
                    id={`${idPrefix}-${key}-other-${index}`}
                    label={`Other ${label.toLowerCase()} ${index + 1}`}
                    value={name}
                    onChange={(e) =>
                      onChange(
                        key,
                        choices.map((v, i) => (i === index ? e.target.value : v))
                      )
                    }
                    inputProps={{ maxLength: MENU_LINE_MAX }}
                  />
                  <Button
                    size="small"
                    sx={{ mt: 0.5 }}
                    onClick={() =>
                      onChange(
                        key,
                        choices.filter((_, i) => i !== index)
                      )
                    }
                  >
                    Remove this dish
                  </Button>
                </Box>
              ))}
              <Button
                size="small"
                sx={{ mt: 0.75 }}
                disabled={choices.length >= 2 || total >= 4}
                onClick={() => onChange(key, [...choices, ''])}
              >
                Add other dish
              </Button>
              {errors[`menu.${key}`] && (
                <Typography role="alert" sx={{ mt: 0.5, color: tokens.redPress, fontSize: 12, fontWeight: 600 }}>
                  {errors[`menu.${key}`]}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
