# Mini Shop — Docker Compose Microservices Demo

Project được thiết kế lại để tập trung vào **2 business microservices** và 2 kiểu public/private exposure khác nhau.

- `order-service` — FastAPI, sở hữu order data trong PostgreSQL.
- `catalog-service` — Express, sở hữu product/stock trong Redis.
- `frontend-service` — React UI; chạy ở BFF mode cho Case 1 hoặc static Nginx mode cho Case 2.
- `gateway` + `ngrok` — chỉ có trong Case 2 để public frontend và API qua một HTTPS edge.

`customer-service` đã được bỏ. Thông tin customer được lưu như snapshot trong mỗi order (`customer_name`, `customer_email`) để demo tập trung vào service-to-service REST, data ownership, network boundary và ingress architecture.

## Business flow

```text
Frontend
   |
   v
Order Service --------------------> Catalog Service
   |                                  |
   |                                  |
order-data-net                 catalog-data-net
   |                                  |
PostgreSQL                           Redis
```

Order **không truy cập Redis trực tiếp**. Catalog **không truy cập PostgreSQL trực tiếp**. Hai service giao tiếp với nhau qua `service-net`.

---

# CASE 1 — Frontend public, backend private

File mặc định: `compose.yaml`.

```text
Internet / Browser
       |
       v
Frontend + BFF :3000     <- PUBLIC ENTRY POINT DUY NHẤT
       |
       | service-net (private)
       +-----------> Order Service -----------> Catalog Service
                         |                           |
                  order-data-net              catalog-data-net
                         |                           |
                     PostgreSQL                    Redis
```

Chỉ `frontend-bff` có `ports:`. `order-service`, `catalog-service`, PostgreSQL và Redis không publish host port.

Frontend React không có generic `/api/*` reverse proxy. Browser chỉ dùng BFF contract:

```text
GET  /shop/products
GET  /shop/orders
POST /shop/checkout
GET  /shop/system
```

Raw backend paths không được expose qua frontend. Ví dụ `/api/order/orders` ở Case 1 trả `404` có chủ đích.

### Chạy Case 1

```bash
docker compose down -v
docker compose up -d --build
docker compose ps
```

Mở:

```text
http://localhost:3000
```

Test boundary từ host:

```bash
curl http://localhost:3000/shop/products
curl http://localhost:3000/api/order/orders
curl http://localhost:8002/products
curl http://localhost:8003/orders
```

Kỳ vọng:

- `/shop/products` thành công qua BFF.
- `/api/order/orders` bị chặn ở BFF.
- `localhost:8002` và `localhost:8003` không kết nối vì backend không publish port.

BFF vẫn gọi backend được qua private Docker DNS:

```bash
docker compose exec frontend-bff node -e "fetch('http://catalog-service:8002/products').then(r=>r.text()).then(console.log)"
```

---

# CASE 2 — Frontend + backend APIs public qua ngrok HTTPS

File: `compose.public.yaml`.

```text
Internet
   |
HTTPS :443
   |
   v
ngrok edge
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

Backend API là public interface, nhưng container backend vẫn không publish `8002/8003` trực tiếp ra host/Internet.

### Chuẩn bị ngrok

Tạo token tại tài khoản ngrok của bạn rồi đặt vào `.env`:

```env
NGROK_AUTHTOKEN=your_token_here
```

Không commit token thật lên repository.

### Chạy Case 2

```bash
docker compose -f compose.public.yaml down -v
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
docker compose -f compose.public.yaml logs ngrok
```

Trong log ngrok lấy URL HTTPS dạng:

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

Network membership:

```text
service-net
order-data-net
```

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

Controlled experiment trên PowerShell:

```powershell
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

Kỳ vọng:

- orders vẫn còn trong PostgreSQL (`order-data`);
- stock đã giảm vẫn còn trong Redis (`catalog-data`).

Reset sạch:

```bash
docker compose down -v
```

---

# Files quan trọng

```text
compose.yaml                 Case 1 — public Frontend/BFF, private backend
compose.public.yaml          Case 2 — ngrok + gateway + public APIs
gateway/nginx.conf           public routing + HTTPS redirect policy
frontend-service/Dockerfile.bff  Case 1 Node/Express BFF runtime
frontend-service/Dockerfile      Case 2 static React/Nginx runtime
frontend-service/server.js       BFF business contract
ARCHITECTURE.md              giải thích kiến trúc và network boundary
README-DEMO.md               command copy/paste cho buổi demo
PRESENTATION-DEMO.md         flow trình bày ngắn
```

> `.env` trong repo chỉ chứa demo DB credentials và để trống `NGROK_AUTHTOKEN`. Không commit real secrets trong production.
