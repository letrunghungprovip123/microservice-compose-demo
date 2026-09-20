import express from 'express';
import { createClient } from 'redis';

const app = express();
app.use(express.json());

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

app.get('/health', async (_req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ status: pong === 'PONG' ? 'ok' : 'degraded', service: 'catalog-service' });
  } catch {
    res.status(503).json({ status: 'down', service: 'catalog-service' });
  }
});

app.get('/products', async (_req, res) => {
  const products = [];
  for (const product of seedProducts) {
    const data = await redis.hGetAll(`product:${product.id}`);
    products.push(normalizeProduct(data));
  }
  res.json(products.filter(Boolean));
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
  const data = await redis.hGetAll(key);
  const product = normalizeProduct(data);
  if (!product) return res.status(404).json({ detail: 'Product not found' });
  if (product.stock < quantity) {
    return res.status(409).json({ detail: 'Not enough stock', available: product.stock });
  }

  const newStock = await redis.hIncrBy(key, 'stock', -quantity);
  res.json({ productId: product.id, reserved: quantity, remainingStock: newStock });
});

async function main() {
  await redis.connect();
  await seedIfNeeded();
  app.listen(port, '0.0.0.0', () => {
    console.log(`catalog-service listening on ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
