# Presentation Demo — 2 Microservices / 2 Architecture Cases

Mục tiêu: chứng minh hai deployment model khác nhau dù **cả hai đều dùng ngrok HTTPS**.

## 0. Business architecture

```text
Order Service -> Catalog Service
     |               |
 PostgreSQL         Redis
```

Nói:

> Em bỏ Customer Service để tập trung vào hai business service có ownership rõ: Order sở hữu order data trong PostgreSQL, Catalog sở hữu product/stock trong Redis. Order muốn reserve stock phải gọi Catalog API, không truy cập Redis trực tiếp.

Trước demo: đặt `NGROK_AUTHTOKEN` trong `.env`.

---

# CASE 1 — ngrok -> Frontend/BFF, backend private

## 1. Start

```bash
docker compose down -v
docker compose up -d --build
docker compose ps
docker compose logs ngrok
```

Lấy URL `https://xxxx.ngrok.app`.

Nói:

> Case 1 cũng dùng ngrok làm HTTPS public edge. Nhưng ngrok chỉ tunnel vào Frontend/BFF. Order, Catalog và datastore không publish host port và không được expose native API ra ngoài.

## 2. Chứng minh exposure boundary

```bash
BASE="https://xxxx.ngrok.app"
curl "$BASE/shop/products"
curl -i "$BASE/api/order/orders"
curl -i "$BASE/api/catalog/products"
```

Kỳ vọng `/shop/products` thành công, còn `/api/*` trả `404`.

Chứng minh không có host-port bypass:

```bash
curl http://localhost:3000
curl http://localhost:8002/products
curl http://localhost:8003/orders
```

Đều phải không connect.

Nhưng BFF gọi Catalog nội bộ được:

```bash
docker compose exec frontend-bff node -e "fetch('http://catalog-service:8002/products').then(r=>r.text()).then(console.log)"
```

Nói:

> Public path là `Internet -> ngrok -> BFF`. BFF mới gọi backend qua private `service-net`. Native backend API không public.

## 3. Business flow

Trên UI tạo order:

```text
Nguyen Van An
an@example.com
Mechanical Keyboard
quantity 2
```

Kiểm tra PostgreSQL:

```bash
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT customer_name, product_name, quantity, total FROM orders;"
```

Kiểm tra Redis:

```bash
docker compose exec redis redis-cli HGETALL product:1
```

Nói:

> Order gọi Catalog để reserve stock rồi persist order của chính nó vào PostgreSQL.

## 4. Network boundary

```bash
# Order thấy Catalog
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"

# Order không thấy Redis
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"

# Catalog không thấy PostgreSQL
docker compose exec catalog-service node -e "require('dns').lookup('postgres',(e,a)=>console.log(e||a))"
```

Nếu cần demo sâu:

```bash
docker network connect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker network disconnect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

Xong Case 1:

```bash
docker compose down
```

---

# CASE 2 — ngrok -> Gateway -> Frontend + public backend APIs

## 5. Start public architecture

```bash
docker compose -f compose.public.yaml down -v
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
docker compose -f compose.public.yaml logs ngrok
```

Lấy URL mới dạng `https://xxxx.ngrok.app`.

Nói:

> Case 2 vẫn dùng ngrok, nhưng tunnel đích là Gateway chứ không phải BFF. Gateway quyết định request đi tới frontend hay native backend API.

## 6. Chứng minh frontend và API là destination ngang hàng

```bash
BASE="https://xxxx.ngrok.app"
curl "$BASE/api/catalog/products"
curl "$BASE/api/order/orders"
curl "$BASE/gateway-info"
curl -i "$BASE/api/catalog/products"
```

Kỳ vọng header có:

```text
X-Demo-Route: gateway -> catalog-service:8002
```

Nói:

> Request API đi `ngrok -> Gateway -> backend`, không đi qua frontend service.

Flow:

```text
Browser -> HTTPS 443 -> ngrok -> Gateway -> Frontend
Postman -> HTTPS 443 -> ngrok -> Gateway -> Order/Catalog
```

## 7. Database vẫn private

```bash
docker compose -f compose.public.yaml exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
```

Vẫn fail vì public API không đồng nghĩa public datastore.

## Câu kết

> Cả hai case đều dùng ngrok làm HTTPS edge. Case 1 ngrok chỉ expose Frontend/BFF contract, còn native backend APIs private. Case 2 ngrok đi vào Gateway và Gateway intentionally expose cả frontend lẫn backend APIs. Vì vậy khác biệt nằm ở public exposure boundary, không phải chỉ ở việc có thêm ngrok.
