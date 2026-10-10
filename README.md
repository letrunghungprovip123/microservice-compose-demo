# Mini Shop — Docker Compose Microservices Demo

Project tập trung vào **2 business microservices** và **2 kiểu public exposure khác nhau**.

- `order-service` — FastAPI, sở hữu order data trong PostgreSQL.
- `catalog-service` — Express, sở hữu product/stock trong Redis.
- `frontend-service` — React UI; chạy ở BFF mode cho Case 1 hoặc static Nginx mode cho Case 2.
- `ngrok` — public HTTPS edge ở **cả hai case**.
- `gateway` — chỉ có trong Case 2 để public frontend và native backend APIs qua cùng một ingress.

`customer-service` đã được bỏ. Thông tin customer được lưu như snapshot trong mỗi order (`customer_name`, `customer_email`) để demo tập trung vào service-to-service REST, data ownership, network boundary và ingress architecture.

## Business flow

```text
Order Service --------------------> Catalog Service
   |                                  |
   |                                  |
order-data-net                 catalog-data-net
   |                                  |
PostgreSQL                           Redis
```

Order **không truy cập Redis trực tiếp**. Catalog **không truy cập PostgreSQL trực tiếp**. Hai service giao tiếp với nhau qua `service-net`.

## Chuẩn bị ngrok cho cả hai case

Tạo ngrok authtoken rồi đặt vào `.env`:

```env
NGROK_AUTHTOKEN=your_real_token
```

Không commit token thật lên repository.

---

# CASE 1 — ngrok -> Frontend/BFF, backend private

File mặc định: `compose.yaml`.

```text
Internet
   |
HTTPS :443
   |
   v
ngrok
   |
edge-net
   |
   v
Frontend + BFF
   |
service-net (private)
   +-----------> Order Service -----------> Catalog Service
                      |                           |
               order-data-net              catalog-data-net
                      |                           |
                  PostgreSQL                    Redis
```

**Không container nào publish host port.** Ngrok là public entry point duy nhất. `frontend-bff` nằm trên `edge-net` để nhận tunnel từ ngrok và trên `service-net` để gọi Order/Catalog. Ngrok **không** nằm trên `service-net`, nên nó không có đường Docker-network trực tiếp tới backend.

Browser chỉ dùng BFF contract:

```text
GET  /shop/products
GET  /shop/orders
POST /shop/checkout
GET  /shop/system
```

BFF không có generic `/api/*` reverse proxy. Raw backend paths như `/api/order/orders` trả `404` có chủ đích.

### Chạy Case 1

```bash
docker compose down -v
docker compose up -d --build
docker compose ps
docker compose logs ngrok
```

Trong log ngrok lấy URL dạng:

```text
https://xxxx.ngrok.app
```

Ví dụ:

```bash
BASE="https://xxxx.ngrok.app"
curl "$BASE/health"
curl "$BASE/shop/products"
curl -i "$BASE/api/order/orders"
```

Kỳ vọng:

- `/shop/products` thành công qua ngrok -> BFF.
- `/api/order/orders` trả `404` ở BFF.
- `localhost:3000`, `localhost:8002`, `localhost:8003` đều không kết nối vì không service nào publish host port.

BFF vẫn gọi backend qua private Docker DNS:

```bash
docker compose exec frontend-bff node -e "fetch('http://catalog-service:8002/products').then(r=>r.text()).then(console.log)"
```

Case 1 therefore public **frontend/BFF contract**, nhưng giữ native Order/Catalog APIs private.

---

# CASE 2 — ngrok -> Gateway -> Frontend + public backend APIs

File: `compose.public.yaml`.

```text
Internet
   |
HTTPS :443
   |
   v
ngrok
   |
edge-net
   |
   v
Gateway Nginx
   |------------- / ----------------> frontend-service
   |------------- /api/order/* -----> order-service
   |------------- /api/catalog/* ---> catalog-service
                                         |
                         service/data networks remain private
```

Điểm quan trọng: **Frontend không nằm trên đường đi của public API**.

```text
Browser      -> ngrok -> gateway -> frontend
Postman/App  -> ngrok -> gateway -> order/catalog API
```

Backend API là public interface, nhưng backend containers vẫn không publish `8002/8003` trực tiếp ra host/Internet.

### Chạy Case 2

```bash
docker compose -f compose.public.yaml down -v
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
docker compose -f compose.public.yaml logs ngrok
```

Lấy URL HTTPS dạng:

```text
https://xxxx.ngrok.app
```

Các public route:

```text
https://xxxx.ngrok.app/                       -> React frontend
https://xxxx.ngrok.app/api/catalog/products  -> Catalog API
https://xxxx.ngrok.app/api/order/orders       -> Order API
```

Gateway kiểm tra `X-Forwarded-Proto`; request public đi bằng HTTP được redirect sang HTTPS.

---

# Khác nhau cốt lõi giữa hai case

```text
CASE 1
Internet -> HTTPS ngrok -> Frontend/BFF -> private Order/Catalog

CASE 2
Internet -> HTTPS ngrok -> Gateway -> Frontend
                                \-> Order API
                                \-> Catalog API
```

Cả hai đều có ngrok. Khác biệt không phải "có/không có ngrok", mà là **public exposure boundary**:

- Case 1: external client chỉ thấy frontend/BFF business contract.
- Case 2: external client được gọi native backend APIs thông qua Gateway.

---

# Service ownership

## Catalog Service

API:

```text
GET  /products
GET  /products/{id}
POST /products/{id}/reserve
GET  /health
GET  /info
GET  /dependencies
GET  /stats
```

Datastore: Redis với AOF + named volume `catalog-data`.

Network membership:

```text
service-net
catalog-data-net
```

## Order Service

API:

```text
GET  /orders
GET  /orders/{id}
POST /orders
GET  /health
GET  /info
GET  /dependencies
GET  /stats
```

Order payload:

```json
{
  "customer_name": "Nguyen Van An",
  "customer_email": "an@example.com",
  "product_id": 1,
  "quantity": 2
}
```

Order Service gọi Catalog để đọc product + reserve stock, sau đó persist order vào PostgreSQL.

Datastore: PostgreSQL named volume `order-data`.

> Demo limitation: reserve stock ở Redis và insert order ở PostgreSQL không phải một distributed transaction. Production có thể dùng Saga/outbox/idempotency tùy yêu cầu consistency.

---

# Network boundary demo

Case 1:

```bash
# Order thấy Catalog vì cùng service-net
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"

# Order KHÔNG thấy Redis vì không thuộc catalog-data-net
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"

# Catalog KHÔNG thấy PostgreSQL vì không thuộc order-data-net
docker compose exec catalog-service node -e "require('dns').lookup('postgres',(e,a)=>console.log(e||a))"
```

Controlled experiment:

```bash
docker network connect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker network disconnect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

Không sửa code, không restart container; chỉ thay network membership.

---

# Persistence demo

Tạo một order trên UI, nhớ stock hiện tại, sau đó:

```bash
docker compose down
docker compose up -d
```

Kỳ vọng orders vẫn còn trong PostgreSQL (`order-data`) và stock đã giảm vẫn còn trong Redis (`catalog-data`). Ngrok URL có thể thay đổi sau khi tunnel/container được tạo lại.

Reset sạch:

```bash
docker compose down -v
```

---

# Files quan trọng

```text
compose.yaml                     Case 1 — ngrok -> Frontend/BFF, private backend
compose.public.yaml              Case 2 — ngrok -> Gateway -> FE + public APIs
gateway/nginx.conf               Case 2 routing + HTTPS redirect policy
frontend-service/Dockerfile.bff  Case 1 Node/Express BFF runtime
frontend-service/Dockerfile      Case 2 static React/Nginx runtime
frontend-service/server.js       BFF business contract
ARCHITECTURE.md                  giải thích kiến trúc và network boundary
README-DEMO.md                   command copy/paste cho buổi demo
PRESENTATION-DEMO.md             flow trình bày ngắn
```
