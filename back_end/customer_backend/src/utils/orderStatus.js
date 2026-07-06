function normalizeOrderStatus(status) {
  const value = String(status || 'pending').toLowerCase();

  const statusMap = {
    pending: {
      key: 'pending',
      label: 'Pending',
      message: 'Your order has been placed and is waiting for seller confirmation.',
      progress: 1
    },
    confirmed: {
      key: 'confirmed',
      label: 'Confirmed',
      message: 'The seller has confirmed your order and it is being prepared.',
      progress: 2
    },
    processing: {
      key: 'processing',
      label: 'Packed',
      message: 'Your order is being packed and prepared for dispatch.',
      progress: 3
    },
    packed: {
      key: 'packed',
      label: 'Packed',
      message: 'Your order is being packed and prepared for dispatch.',
      progress: 3
    },
    shipped: {
      key: 'shipped',
      label: 'Shipped',
      message: 'Your order has been shipped and is on the way.',
      progress: 4
    },
    courier_assigned: {
      key: 'courier_assigned',
      label: 'Courier Assigned',
      message: 'A courier has been assigned and is ready to pick up your order.',
      progress: 4
    },
    ready_for_pickup: {
      key: 'ready_for_pickup',
      label: 'Ready for Pickup',
      message: 'Your order is ready for pickup and awaiting the next step.',
      progress: 4
    },
    delivered: {
      key: 'delivered',
      label: 'Delivered',
      message: 'Your order has been delivered successfully.',
      progress: 5
    },
    cancelled: {
      key: 'cancelled',
      label: 'Cancelled',
      message: 'This order was cancelled before dispatch.',
      progress: 0
    },
    returned: {
      key: 'returned',
      label: 'Returned',
      message: 'This order has been returned.',
      progress: 0
    },
    refunded: {
      key: 'refunded',
      label: 'Refunded',
      message: 'The payment for this order has been refunded.',
      progress: 0
    }
  };

  return statusMap[value] || {
    key: value || 'pending',
    label: value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Pending',
    message: 'Order status is being updated.',
    progress: 1
  };
}

function deriveDisplayStatus(orderStatus, shipmentStatus, courierName) {
  const orderRaw = String(orderStatus || '').toLowerCase();
  const shipmentRaw = String(shipmentStatus || '').toLowerCase();
  const hasCourier = Boolean(courierName);

  if (orderRaw === 'cancelled' || orderRaw === 'returned' || orderRaw === 'refunded') {
    return { status: orderRaw, label: null, message: null };
  }

  if (orderRaw === 'delivered') {
    return { status: 'delivered', label: null, message: null };
  }

  if (orderRaw === 'courier_assigned') {
    return {
      status: 'courier_assigned',
      label: 'Courier Assigned',
      message: 'A courier has been assigned and is ready to pick up your order.'
    };
  }

  if (orderRaw === 'shipped') {
    if (shipmentRaw === 'packed') {
      return { status: 'packed', label: null, message: null };
    }
    if (shipmentRaw === 'in_transit' || shipmentRaw === 'out_for_delivery') {
      return { status: 'shipped', label: null, message: null };
    }
    if (shipmentRaw === 'pending' || !shipmentRaw) {
      return {
        status: 'ready_for_pickup',
        label: hasCourier ? 'Courier Assigned' : 'Ready for Pickup',
        message: hasCourier
          ? 'A courier has been assigned. Pickup is pending before the order is in transit.'
          : 'Your order is ready for pickup and awaiting courier assignment.'
      };
    }
  }

  return { status: orderRaw || 'pending', label: null, message: null };
}

module.exports = {
  normalizeOrderStatus,
  deriveDisplayStatus
};
