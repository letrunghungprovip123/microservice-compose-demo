import express from 'express';
import { createClient } from 'redis';

const app = express();
app.use(express.json());

const serviceName = process.env.SERVICE_NAME || 'catalog-service';
const port = Number(process.env.PORT || 8002);
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const redis = createClient({ url: redisUrl });

redis.on('error', (err) => console.error('Redis error:', err));

const seedProducts = [
  { id: 1, name: 'Mechanical Keyboard', price: 79.9, stock: 10 },
  { id: 2, name: 'Wireless Mouse', price: 39.5, stock: 20 },
  { id: 3, name: 'USB-C Hub', price: 49.0, stock: 15 }
];

async function seedIfNeeded() {
  for (const product of seedProducts) {
    const key = `product:${product.id}`;
    if (!(await redis.exists(key))) {
      await redis.hSet(key, {
        id: String(product.id),
        name: product.name,
        price: String(product.price),
        stock: String(product.stock)
      });
    }
  }
}

function normalizeProduct(data) {
  if (!data || Object.keys(data).length === 0) return null;
  return {
    id: Number(data.id),
    name: data.name,
    price: Number(data.price),
    stock: Number(data.stock)
  };
}

async function loadProducts() {
  const products = [];
  for (const product of seedProducts) {
    const data = await redis.hGetAll(`product:${product.id}`);
    const normalized = normalizeProduct(data);
    if (normalized) products.push(normalized);
  }
  return products;
}

async function redisStatus() {
  const started = performance.now();
  try {
    const pong = await redis.ping();
    return {
      name: 'redis',
      target: 'redis:6379',
      status: pong === 'PONG' ? 'ok' : 'degraded',
      latency_ms: Number((performance.now() - started).toFixed(2))
    };
  } catch (error) {
    return {
      name: 'redis',
      target: 'redis:6379',
      status: 'down',
      latency_ms: Number((performance.now() - started).toFixed(2)),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

app.get('/health', async (_req, res) => {
  const dependency = await redisStatus();
  const healthy = dependency.status === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: serviceName,
    dependency
  });
});

app.get('/info', (_req, res) => {
  res.json({
    service: serviceName,
    version: '3.0.0',
    runtime: 'Node.js / Express',
    container_port: port,
    persistence: 'Redis AOF + named volume',
    networks: ['service-net', 'catalog-data-net'],
    depends_on: ['redis:6379'],
    responsibility: 'Own product catalog, pricing and inventory stock'
  });
});

app.get('/dependencies', async (_req, res) => {
  const dependency = await redisStatus();
  res.json({
    service: serviceName,
    status: dependency.status === 'ok' ? 'ok' : 'degraded',
    dependencies: [dependency]
  });
});

app.get('/stats', async (_req, res) => {
  const products = await loadProducts();
  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);
  const inventoryValue = products.reduce(
    (sum, product) => sum + product.price * product.stock,
    0
  );
  res.json({
    service: serviceName,
    product_count: products.length,
    total_stock: totalStock,
    inventory_value: Number(inventoryValue.toFixed(2))
  });
});

app.get('/products', async (_req, res) => {
  res.json(await loadProducts());
});

app.get('/products/:id', async (req, res) => {
  const data = await redis.hGetAll(`product:${req.params.id}`);
  const product = normalizeProduct(data);
  if (!product) return res.status(404).json({ detail: 'Product not found' });
  res.json(product);
});

app.post('/products/:id/reserve', async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ detail: 'quantity must be a positive integer' });
  }

  const key = `product:${req.params.id}`;
  const result = await redis.eval(
    `
      local stock = redis.call('HGET', KEYS[1], 'stock')
      if not stock then return {-1, -1} end
      stock = tonumber(stock)
      local quantity = tonumber(ARGV[1])
      if stock < quantity then return {0, stock} end
      local remaining = redis.call('HINCRBY', KEYS[1], 'stock', -quantity)
      return {1, remaining}
    `,
    { keys: [key], arguments: [String(quantity)] }
  );

  const code = Number(result[0]);
  const value = Number(result[1]);
  if (code === -1) return res.status(404).json({ detail: 'Product not found' });
  if (code === 0) {
    return res.status(409).json({ detail: 'Not enough stock', available: value });
  }

  const productData = await redis.hGetAll(key);
  const product = normalizeProduct(productData);
  res.json({
    productId: product.id,
    reserved: quantity,
    remainingStock: value
  });
});

async function main() {
  await redis.connect();
  await seedIfNeeded();
  app.listen(port, '0.0.0.0', () => {
    console.log(`${serviceName} listening on ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
