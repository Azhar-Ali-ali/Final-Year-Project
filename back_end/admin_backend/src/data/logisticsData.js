const logisticsState = {
  admin: { id: 'ADMIN-1', name: 'Operations Admin' },
  couriers: [
    {
      id: 'CUR-1001',
      name: 'RapidX Logistics',
      contactPerson: 'Ali Raza',
      phone: '+92-300-1001001',
      email: 'ali@rapidx.com',
      codSupported: true,
      apiIntegrated: true,
      apiKey: 'RAPIDX_KEY_01',
      apiSecret: 'RAPIDX_SECRET',
      webhookUrl: 'https://marketplace.local/webhooks/rapidx',
      baseShippingCharges: 95,
      codFeePercent: 2.5,
      deliveryZones: 'Same City, Same State, Different State',
      estimatedDeliveryTime: '2-4 days',
      status: 'Active'
    },
    {
      id: 'CUR-1002',
      name: 'BlueJet Courier',
      contactPerson: 'Hassan Khan',
      phone: '+92-300-2002002',
      email: 'hassan@bluejet.com',
      codSupported: true,
      apiIntegrated: false,
      apiKey: '',
      apiSecret: '',
      webhookUrl: '',
      baseShippingCharges: 85,
      codFeePercent: 3,
      deliveryZones: 'Same City, Same State',
      estimatedDeliveryTime: '1-3 days',
      status: 'Active'
    },
    {
      id: 'CUR-1003',
      name: 'CargoNation',
      contactPerson: 'Naveed Iqbal',
      phone: '+92-300-3003003',
      email: 'ops@cargonation.com',
      codSupported: false,
      apiIntegrated: true,
      apiKey: 'CARGONATION_KEY',
      apiSecret: 'CARGONATION_SECRET',
      webhookUrl: 'https://marketplace.local/webhooks/cargonation',
      baseShippingCharges: 120,
      codFeePercent: 0,
      deliveryZones: 'Different State, Remote Area',
      estimatedDeliveryTime: '3-6 days',
      status: 'Inactive'
    }
  ],
  orders: [
    {
      id: 'ORD-9001',
      sellerStoreName: 'Tech Hub',
      sellerPickupAddress: 'Shahrah-e-Faisal, Karachi',
      sellerPhone: '+92-321-1111111',
      customerDeliveryAddress: 'Johar Town, Lahore',
      customerPhone: '+92-322-2222222',
      customerCityType: 'Different State',
      orderWeight: 1.5,
      paymentType: 'COD',
      codAmount: 150,
      status: 'Ready for Pickup',
      courierId: null,
      courierLocked: false,
      shippingCharge: 0,
      trackingId: null
    },
    {
      id: 'ORD-9002',
      sellerStoreName: 'Urban Home',
      sellerPickupAddress: 'I-8 Markaz, Islamabad',
      sellerPhone: '+92-333-3333333',
      customerDeliveryAddress: 'DHA Phase 6, Karachi',
      customerPhone: '+92-344-4444444',
      customerCityType: 'Different State',
      orderWeight: 0.8,
      paymentType: 'Online',
      codAmount: 0,
      status: 'Ready for Pickup',
      courierId: null,
      courierLocked: false,
      shippingCharge: 0,
      trackingId: null
    },
    {
      id: 'ORD-9003',
      sellerStoreName: 'Style Corner',
      sellerPickupAddress: 'Gulberg, Lahore',
      sellerPhone: '+92-355-5555555',
      customerDeliveryAddress: 'Model Town, Lahore',
      customerPhone: '+92-366-6666666',
      customerCityType: 'Same City',
      orderWeight: 3.8,
      paymentType: 'COD',
      codAmount: 220,
      status: 'Confirmed',
      courierId: null,
      courierLocked: false,
      shippingCharge: 0,
      trackingId: null
    }
  ],
  shipments: [],
  shippingRules: {
    weightPricing: { range0to1: 40, range1to3: 70, range3to5: 110, extraPerKg: 20 },
    zonePricing: { sameCity: 0, sameState: 15, differentState: 35, remoteArea: 60 },
    codFee: { mode: 'percentage', value: 2.5 },
    freeShipping: { aboveAmount: 100, categories: 'Books', selectedSellers: 'Tech Hub', promotional: false }
  }
};

const shipmentStatuses = [
  'Awaiting Pickup',
  'Picked Up',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'RTO (Return to Origin)',
  'Failed Delivery'
];

function activeCouriers() {
  return logisticsState.couriers.filter((item) => item.status === 'Active');
}

function codFeeAmount(codAmount) {
  const codFee = logisticsState.shippingRules.codFee;
  if (codFee.mode === 'fixed') return Number(codFee.value);
  return Number(((codAmount * codFee.value) / 100).toFixed(2));
}

function weightCharge(weightKg) {
  const ranges = logisticsState.shippingRules.weightPricing;
  if (weightKg <= 1) return ranges.range0to1;
  if (weightKg <= 3) return ranges.range1to3;
  if (weightKg <= 5) return ranges.range3to5;
  return ranges.range3to5 + (weightKg - 5) * ranges.extraPerKg;
}

function zoneCharge(cityType) {
  const zone = logisticsState.shippingRules.zonePricing;
  if (cityType === 'Same City') return zone.sameCity;
  if (cityType === 'Same State') return zone.sameState;
  if (cityType === 'Remote Area') return zone.remoteArea;
  return zone.differentState;
}

function calculateShipping(order, courier) {
  const rules = logisticsState.shippingRules;

  if (order.paymentType === 'Online' && rules.freeShipping.promotional) return 0;

  const freeSellerList = rules.freeShipping.selectedSellers
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (freeSellerList.includes(order.sellerStoreName.toLowerCase())) return 0;
  if (order.codAmount >= rules.freeShipping.aboveAmount) return 0;

  return Number((Number(courier.baseShippingCharges) + weightCharge(order.orderWeight) + zoneCharge(order.customerCityType)).toFixed(2));
}

function apiTracking(orderId) {
  return `API-${orderId}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function manualTracking(orderId) {
  return `MAN-${orderId}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function netSellerAmount(shipment) {
  return Number((shipment.codAmount - shipment.shippingCharges - codFeeAmount(shipment.codAmount) - shipment.platformCommission).toFixed(2));
}

function computeKpis() {
  const readyForPickup = logisticsState.orders.filter((item) => item.status === 'Ready for Pickup' && !item.courierLocked).length;
  const active = activeCouriers().length;
  const inTransit = logisticsState.shipments.filter((item) => ['Awaiting Pickup', 'Picked Up', 'In Transit', 'Out for Delivery'].includes(item.shipmentStatus)).length;
  const codPending = logisticsState.shipments.filter((item) => item.paymentType === 'COD' && item.shipmentStatus === 'Delivered' && item.settlementStatus !== 'Paid').length;
  return { readyForPickup, activeCouriers: active, inTransitShipments: inTransit, codPendingSettlements: codPending };
}

module.exports = {
  logisticsState,
  shipmentStatuses,
  activeCouriers,
  codFeeAmount,
  calculateShipping,
  apiTracking,
  manualTracking,
  netSellerAmount,
  computeKpis
};
