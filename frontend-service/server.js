import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = Number(process.env.PORT || 3000);
const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8003';
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:8002';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

app.set('trust proxy', true);

// ngrok forwards the original public scheme in X-Forwarded-Proto.
// Internal Docker health checks do not send this header, so they are not redirected.
app.use((req, res, next) => {
  const forwardedProto = req.get('x-forwarded-proto');
  if (forwardedProto && forwardedProto.split(',')[0].trim().toLowerCase() === 'http') {
    return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  }
  next();
});

app.use(express.json());

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail || payload?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function sendError(res, error) {
  const status = Number(error?.status || 503);
  const detail = error?.payload?.detail || error?.message || 'Downstream service unavailable';
  res.status(status).json({ detail });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'frontend-bff', mode: 'private' });
});

app.get('/info', (_req, res) => {
  res.json({
    service: 'frontend-bff',
    version: '3.1.0',
    runtime: 'React static bundle + Node.js/Express BFF',
    container_port: port,
    persistence: 'Stateless',
    networks: ['edge-net', 'service-net'],
    depends_on: ['order-service:8003', 'catalog-service:8002'],
    responsibility: 'Public frontend contract; server-side calls to private microservices',
    exposure: 'ngrok HTTPS -> BFF; only /shop business endpoints are public; raw backend API paths are not proxied'
  });
});

app.get('/shop/products', async (_req, res) => {
  try {
    res.json(await fetchJson(`${catalogServiceUrl}/products`));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/shop/orders', async (_req, res) => {
  try {
    res.json(await fetchJson(`${orderServiceUrl}/orders`));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/shop/checkout', async (req, res) => {
  try {
    const order = await fetchJson(`${orderServiceUrl}/orders`, {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    res.status(201).json(order);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/shop/system', async (_req, res) => {
  const requests = {
    orderInfo: `${orderServiceUrl}/info`,
    orderDependencies: `${orderServiceUrl}/dependencies`,
    orderStats: `${orderServiceUrl}/stats`,
    catalogInfo: `${catalogServiceUrl}/info`,
    catalogDependencies: `${catalogServiceUrl}/dependencies`,
    catalogStats: `${catalogServiceUrl}/stats`
  };

  const entries = await Promise.all(
    Object.entries(requests).map(async ([key, url]) => {
      try {
        return [key, { ok: true, data: await fetchJson(url) }];
      } catch (error) {
        return [key, { ok: false, error: error?.message || String(error) }];
      }
    })
  );

  res.json({ mode: 'private', results: Object.fromEntries(entries) });
});

app.use('/api', (_req, res) => {
  res.status(404).json({
    detail: 'Raw backend APIs are not exposed in private mode. Use the frontend BFF contract under /shop.'
  });
});

app.use(express.static(distDir));

// Express 5 requires a named wildcard; this form also matches the root path.
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`frontend-bff listening on ${port}`);
});
