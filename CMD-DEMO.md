# Windows CMD Demo

Trước khi chạy, điền `NGROK_AUTHTOKEN` vào `.env`.

## Case 1 — ngrok -> Frontend/BFF, backend private

```cmd
docker compose down -v
docker compose up -d --build
docker compose ps
docker compose logs ngrok
```

Lấy URL HTTPS trong log, ví dụ:

```text
https://xxxx.ngrok.app
```

Mở UI:

```cmd
start https://xxxx.ngrok.app
```

BFF contract hoạt động:

```cmd
curl https://xxxx.ngrok.app/shop/products
```

Raw backend route bị chặn:

```cmd
curl -i https://xxxx.ngrok.app/api/order/orders
curl -i https://xxxx.ngrok.app/api/catalog/products
```

Kỳ vọng `404`.

Không có host-port bypass:

```cmd
curl http://localhost:3000
curl http://localhost:8002/products
curl http://localhost:8003/orders
```

Kỳ vọng không connect.

BFF vẫn gọi Catalog nội bộ:

```cmd
docker compose exec frontend-bff node -e "fetch('http://catalog-service:8002/products').then(r=>r.text()).then(console.log)"
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

Xong Case 1:

```cmd
docker compose down
```

## Case 2 — ngrok -> Gateway -> FE + public APIs

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
curl -i https://xxxx.ngrok.app/api/catalog/products
```

Cleanup:

```cmd
docker compose -f compose.public.yaml down
```
