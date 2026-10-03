function normalizeError(detail, status) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join(', ');
  }
  if (detail && typeof detail === 'object') {
    if (detail.message) {
      return detail.available !== undefined
        ? `${detail.message} (available: ${detail.available})`
        : detail.message;
    }
    return JSON.stringify(detail);
  }
  return `HTTP ${status}`;
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(normalizeError(payload?.detail ?? payload?.message, response.status));
  }
  return payload;
}

export const endpoints = {
  frontend: {
    health: '/health',
    info: '/info'
  },
  customer: {
    health: '/api/customer/health',
    info: '/api/customer/info',
    dependencies: '/api/customer/dependencies',
    stats: '/api/customer/stats',
    customers: '/api/customer/customers'
  },
  catalog: {
    health: '/api/catalog/health',
    info: '/api/catalog/info',
    dependencies: '/api/catalog/dependencies',
    stats: '/api/catalog/stats',
    products: '/api/catalog/products'
  },
  order: {
    health: '/api/order/health',
    info: '/api/order/info',
    dependencies: '/api/order/dependencies',
    stats: '/api/order/stats',
    orders: '/api/order/orders'
  }
};

export const api = {
  createCustomer: (payload) =>
    requestJson(endpoints.customer.customers, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createOrder: (payload) =>
    requestJson(endpoints.order.orders, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
