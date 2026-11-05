export const budgetCatalog = () => ({
  pricePerPlate: 600,
  sixHourFee: 5000,
  packages: [
    { id: 'p', name: 'Standard', visible: true, guests: 100, price: 12000, items: [{ name: 'Plates', qty: 100 }] }
  ],
  addons: [
    {
      id: 'stage',
      name: 'Stage decoration',
      price: 5000,
      budgetPolicy: { allowRemove: true, minQty: null, replacementIds: [], requires: [] }
    },
    {
      id: 'helpers',
      name: 'Helpers',
      hasQuantity: true,
      price: 800,
      budgetPolicy: { allowRemove: true, minQty: 2, replacementIds: [], requires: [] }
    },
    {
      id: 'unknown',
      name: 'Custom service',
      price: null,
      budgetPolicy: { allowRemove: true, minQty: null, replacementIds: [], requires: [] }
    },
    {
      id: 'sound',
      hasPackages: true,
      sizes: [
        {
          id: 'premium',
          parentId: 'sound',
          isPackage: true,
          name: 'Premium sound',
          description: '4 speakers',
          price: 4000,
          budgetPolicy: { allowRemove: true, minQty: null, replacementIds: ['basic'], requires: [] }
        },
        { id: 'basic', parentId: 'sound', isPackage: true, name: 'Basic sound', description: '2 speakers', price: 1500 }
      ]
    }
  ],
  rentals: [],
  dishes: [],
  minDownpayment: 3000
});
export const budgetContext = (fingerprint = 'a'.repeat(64)) => ({
  serviceType: 'Buffet and Catering',
  packageId: 'p',
  guests: 200,
  date: '2030-12-20',
  startTime: '12:00',
  endTime: '16:00',
  occasion: 'Birthday',
  budget: 150000,
  selection: { addonIds: ['stage', 'helpers', 'premium'], addonQty: { helpers: 5, stage: 1, premium: 1 } },
  protectedAddonIds: [],
  preferences: 'Keep the stage if possible; a simpler sound option is fine.',
  reviewedCatalogFingerprint: fingerprint
});
