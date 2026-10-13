import { METALLICS } from './styling.js';

const createShade = (name, hex) => ({ name, hex });

export const RAINBOW_COLORS = [
  {
    name: 'Red',
    hex: '#D32F2F',
    shades: [
      ['Red', '#D32F2F'],
      ['Blush Pink', '#F2C4C6'],
      ['Baby Pink', '#F8BBD0'],
      ['Dusty Rose', '#C99A9E'],
      ['Burgundy', '#7B1E2B'],
      ['Maroon', '#800000']
    ]
  },
  {
    name: 'Orange',
    hex: '#F57C00',
    shades: [
      ['Orange', '#F57C00'],
      ['Peach', '#FFCBA4'],
      ['Coral', '#FF7F61'],
      ['Terracotta', '#C8603F']
    ]
  },
  {
    name: 'Yellow',
    hex: '#FFE135',
    shades: [
      ['Yellow', '#FFE135'],
      ['Mustard', '#D9A400'],
      ['Cream', '#F5EBD3'],
      ['Ivory', '#FFFFF0'],
      ['Champagne', '#F1DDB4'],
      ['White', '#FFFFFF']
    ]
  },
  {
    name: 'Green',
    hex: '#1F8A5B',
    shades: [
      ['Emerald', '#1F8A5B'],
      ['Sage Green', '#9CAF88'],
      ['Mint', '#A8E6CF'],
      ['Olive', '#708238'],
      ['Forest Green', '#2E5E3A']
    ]
  },
  {
    name: 'Blue',
    hex: '#2A52BE',
    shades: [
      ['Royal Blue', '#2A52BE'],
      ['Baby Blue', '#A7C7E7'],
      ['Dusty Blue', '#7A93AC'],
      ['Navy Blue', '#1F2F57'],
      ['Teal', '#00808A'],
      ['Tiffany Blue', '#81D8D0']
    ]
  },
  {
    name: 'Indigo',
    hex: '#4B0082',
    shades: [
      ['Indigo', '#4B0082'],
      ['Deep Indigo', '#310055'],
      ['Soft Indigo', '#A99AC8'],
      ['Charcoal', '#3B3F45'],
      ['Black', '#111111']
    ]
  },
  {
    name: 'Violet',
    hex: '#6A3D9A',
    shades: [
      ['Purple', '#6A3D9A'],
      ['Lavender', '#C7B7E3'],
      ['Lilac', '#C8A2C8'],
      ['Mauve', '#B784A7'],
      ['Plum', '#5E2750']
    ]
  }
].map((family) => ({ ...family, shades: family.shades.map(([name, hex]) => createShade(name, hex)) }));

const THEME_COLOR_SCHEMES = {
  Filipiniana: [
    ['Cream', 'Gold', 'Red'],
    ['Ivory', 'Sage Green', 'Gold']
  ],
  'Barrio Fiesta': [
    ['Red', 'Yellow', 'Emerald'],
    ['Orange', 'Royal Blue', 'Yellow']
  ],
  Rustic: [
    ['Terracotta', 'Cream', 'Olive'],
    ['Sage Green', 'Champagne', 'Copper']
  ],
  'Enchanted Garden': [
    ['Sage Green', 'Blush Pink', 'Ivory'],
    ['Lavender', 'Mint', 'Gold']
  ],
  'Classic Elegant': [
    ['Ivory', 'Gold', 'Navy Blue'],
    ['Champagne', 'Dusty Rose', 'Silver']
  ],
  'Hollywood Red Carpet': [
    ['Red', 'Black', 'Gold'],
    ['Burgundy', 'Ivory', 'Gold']
  ],
  Masquerade: [
    ['Purple', 'Black', 'Gold'],
    ['Emerald', 'Navy Blue', 'Silver']
  ],
  'Princess and Fairy Tale': [
    ['Baby Pink', 'Lavender', 'Gold'],
    ['Baby Blue', 'Ivory', 'Silver']
  ],
  Royal: [
    ['Royal Blue', 'Ivory', 'Gold'],
    ['Purple', 'Champagne', 'Gold']
  ],
  Boho: [
    ['Terracotta', 'Cream', 'Sage Green'],
    ['Peach', 'Champagne', 'Copper']
  ],
  'Hawaiian and Tropical': [
    ['Coral', 'Emerald', 'Yellow'],
    ['Tiffany Blue', 'Orange', 'Ivory']
  ],
  'Retro 70s to 90s': [
    ['Orange', 'Mustard', 'Purple'],
    ['Fuchsia', 'Royal Blue', 'Yellow']
  ],
  'Kiddie Character': [
    ['Red', 'Royal Blue', 'Yellow'],
    ['Baby Pink', 'Lilac', 'Baby Blue']
  ],
  'Baby Angels and Clouds': [
    ['Baby Blue', 'White', 'Silver'],
    ['Baby Pink', 'Ivory', 'Gold']
  ],
  'Golden Milestone': [
    ['Gold', 'Ivory', 'Black'],
    ['Gold', 'Champagne', 'Burgundy']
  ],
  'Modern Minimalist': [
    ['White', 'Charcoal', 'Silver'],
    ['Ivory', 'Sage Green', 'Gold']
  ],
  Graduation: [
    ['Navy Blue', 'White', 'Gold'],
    ['Burgundy', 'Ivory', 'Silver']
  ],
  Christmas: [
    ['Red', 'Emerald', 'Gold'],
    ['Navy Blue', 'White', 'Silver']
  ]
};
const AVAILABLE_COLORS = [
  ...RAINBOW_COLORS.flatMap((family) => family.shades),
  ...METALLICS.map((metallic) => ({ hex: metallic.hex, name: metallic.name, metallic: true })),
  createShade('Fuchsia', '#E0218A')
];

export function themeColorSchemes(theme) {
  return (THEME_COLOR_SCHEMES[theme] || []).map((colorNames) => ({
    label: colorNames.join(' + '),
    colors: colorNames.map((name) => AVAILABLE_COLORS.find((color) => color.name === name)).filter(Boolean)
  }));
}
