export const deploymentMode = import.meta.env.VITE_DEPLOYMENT_MODE || 'private';

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

const privateEndpoints = {
  products: '/shop/products',
  orders: '/shop/orders',
  createOrder: '/shop/checkout',
  system: '/shop/system'
};

const publicEndpoints = {
  products: '/api/catalog/products',
  orders: '/api/order/orders',
  createOrder: '/api/order/orders'
};

export const endpoints = deploymentMode === 'public' ? publicEndpoints : privateEndpoints;

async function publicSystem() {
  const urls = {
    orderInfo: '/api/order/info',
    orderDependencies: '/api/order/dependencies',
    orderStats: '/api/order/stats',
    catalogInfo: '/api/catalog/info',
    catalogDependencies: '/api/catalog/dependencies',
    catalogStats: '/api/catalog/stats'
  };

  const entries = await Promise.all(
    Object.entries(urls).map(async ([key, url]) => {
      try {
        return [key, { ok: true, data: await requestJson(url) }];
      } catch (error) {
        return [key, { ok: false, error: error.message }];
      }
    })
  );
  return { mode: 'public', results: Object.fromEntries(entries) };
}

export const api = {
  products: () => requestJson(endpoints.products),
  orders: () => requestJson(endpoints.orders),
  createOrder: (payload) =>
    requestJson(endpoints.createOrder, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  system: () =>
    deploymentMode === 'private' ? requestJson(privateEndpoints.system) : publicSystem()
};
