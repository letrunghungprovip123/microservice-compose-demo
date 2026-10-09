# Windows CMD Demo

## Case 1 — private backend

```cmd
docker compose down -v
docker compose up -d --build
docker compose ps
```

Mở UI:

```cmd
start http://localhost:3000
```

BFF hoạt động:

```cmd
curl http://localhost:3000/shop/products
```

Raw backend route qua frontend bị chặn:

```cmd
curl http://localhost:3000/api/order/orders
```

Backend host ports không publish:

```cmd
curl http://localhost:8002/products
curl http://localhost:8003/orders
```

Business data:

```cmd
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT customer_name, product_name, quantity, total FROM orders;"
docker compose exec redis redis-cli HGETALL product:1
```

Docker DNS:

```cmd
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"
```

Boundary expected fail:

```cmd
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker compose exec catalog-service node -e "require('dns').lookup('postgres',(e,a)=>console.log(e||a))"
```

Lấy Order container ID trong CMD:

```cmd
for /f %i in ('docker compose ps -q order-service') do set ORDER_ID=%i
```

Attach network:

```cmd
docker network connect mini-shop-private_catalog-data-net %ORDER_ID%
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
```

Disconnect:

```cmd
docker network disconnect mini-shop-private_catalog-data-net %ORDER_ID%
```

Persistence:

```cmd
docker compose down
docker compose up -d
```

## Case 2 — ngrok + Gateway + public APIs

Điền `NGROK_AUTHTOKEN` vào `.env`, sau đó:

```cmd
docker compose -f compose.public.yaml down -v
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
docker compose -f compose.public.yaml logs ngrok
```

Lấy URL HTTPS trong log, ví dụ:

```text
https://xxxx.ngrok.app
```

Test:

```cmd
curl https://xxxx.ngrok.app/api/catalog/products
curl https://xxxx.ngrok.app/api/order/orders
curl https://xxxx.ngrok.app/gateway-info
```

Cleanup:

```cmd
docker compose -f compose.public.yaml down
```
