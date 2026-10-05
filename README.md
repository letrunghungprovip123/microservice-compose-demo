# Mini Shop Microservices — Docker Compose Demo

Dự án demo Docker Compose theo mô hình **1 frontend + 3 backend microservices + 2 datastore**. Mục tiêu chính là trình bày rõ Dockerfile, Compose, service discovery, healthcheck, network isolation, volume persistence và giao tiếp REST giữa các container.

## Thành phần

| Service | Công nghệ | Host port | Vai trò |
|---|---|---:|---|
| `frontend-service` | React + Ant Design + Nginx | `3000` | Giao diện trình bày, reverse proxy tới backend |
| `customer-service` | FastAPI + PostgreSQL | `8001` | Quản lý customer |
| `catalog-service` | Express + Redis | `8002` | Product catalog + stock |
| `order-service` | FastAPI + HTTPX | `8003` | Gọi Customer/Catalog và tạo order |
| `postgres` | PostgreSQL 17 | internal | Persistent customer data |
| `redis` | Redis 7 + AOF | internal | Persistent catalog/stock state |
| `adminer` | Adminer | `8080` | Tool tùy chọn qua profile `tools` |

## Kiến trúc

```text
                              Browser
                                 |
                         http://localhost:3000
                                 |
                      +--------------------+
                      |  frontend-service  |
                      | React + Ant Design |
                      |   Nginx reverse    |
                      |       proxy        |
                      +---------+----------+
                                |
                           service-net
               +----------------+----------------+
               |                |                |
               v                v                v
       customer-service   order-service    catalog-service
          :8001              :8003             :8002
               |              /  \               |
               |             /    \ REST          |
               |            v      v              |
               +------ customer   catalog --------+
               |
            data-net                         cache-net
               |                                |
               v                                v
          postgres:5432                     redis:6379
```

`order-service` **không nằm trong `data-net` hoặc `cache-net`**, vì vậy nó không truy cập trực tiếp PostgreSQL/Redis. Nó phải gọi API của `customer-service` và `catalog-service` qua `service-net`.

## Frontend trình bày được gì?

Mở `http://localhost:3000` sẽ có 5 tab:

- **Overview** — health của 4 app services, số lượng customer/product/order, kiến trúc request flow.
- **Customers** — tạo customer và xem dữ liệu đang persist trong PostgreSQL.
- **Catalog** — xem product/stock trong Redis.
- **Orders** — tạo order; Order Service gọi Customer + Catalog và stock giảm ngay trên UI.
- **Networking** — xem network segmentation, service metadata và dependency probes thực tế.

Browser không gọi `customer-service:8001` trực tiếp. Browser chỉ biết `localhost:3000`; Nginx trong `frontend-service` mới resolve Docker service name và proxy request:

```text
Browser
  -> localhost:3000/api/customer/...
  -> frontend-service / Nginx
  -> customer-service:8001
```

Nhờ vậy frontend và backend cùng origin từ góc nhìn browser, không cần bật CORS cho từng backend trong demo.

## Chạy project

### Windows CMD

```cmd
copy .env.example .env
docker compose config
docker compose up -d --build
docker compose ps
```

### macOS / Linux

```bash
cp .env.example .env
docker compose config
docker compose up -d --build
docker compose ps
```

Mở:

```text
http://localhost:3000
```

## Health / metadata endpoints

```text
Frontend: http://localhost:3000/health
Customer: http://localhost:8001/health
Catalog:  http://localhost:8002/health
Order:    http://localhost:8003/health
```

Mỗi backend còn có các endpoint dùng cho dashboard:

```text
/info
/dependencies
/stats
```

Ví dụ:

```bash
curl http://localhost:8001/info
curl http://localhost:8001/dependencies
curl http://localhost:8002/stats
curl http://localhost:8003/dependencies
```

## API nghiệp vụ

### Customer

```text
POST /customers
GET  /customers
GET  /customers/{id}
```

### Catalog

```text
GET  /products
GET  /products/{id}
POST /products/{id}/reserve
```

### Order

```text
GET  /orders
POST /orders
```

Khi tạo order, `order-service` thực hiện:

1. `GET http://customer-service:8001/customers/{id}`
2. `GET http://catalog-service:8002/products/{id}`
3. `POST http://catalog-service:8002/products/{id}/reserve`
4. Lưu order vào memory và trả response cho frontend.

## Docker Compose concepts có trong project

- **`build`** — frontend + 3 backend tự build từ Dockerfile.
- **`image`** — PostgreSQL, Redis, Adminer dùng image có sẵn.
- **`ports`** — publish frontend và API ra host phục vụ demo.
- **`environment`** — truyền DB URL, Redis URL và downstream URLs.
- **`depends_on` + `service_healthy`** — Customer đợi PostgreSQL; Catalog đợi Redis; Order đợi Customer/Catalog.
- **`healthcheck`** — kiểm tra datastore và application container.
- **`volumes`** — `postgres-data` và `redis-data` giữ dữ liệu qua container recreation.
- **`networks`** — `service-net`, `data-net`, `cache-net` tạo segmentation.
- **service discovery** — dùng `postgres`, `redis`, `customer-service`, `catalog-service`, `order-service` thay vì hard-code IP.
- **`profiles`** — Adminer chỉ chạy khi bật profile `tools`.

## Chứng minh network

```bash
docker network ls --filter name=mini-shop
docker network inspect mini-shop_service-net
docker network inspect mini-shop_data-net
docker network inspect mini-shop_cache-net
```

Frontend gọi Customer bằng service name:

```bash
docker compose exec frontend-service wget -qO- http://customer-service:8001/health
```

Order resolve Customer thành công:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('customer-service'))"
```

Order resolve PostgreSQL được kỳ vọng **thất bại** vì không có shared network:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

## Persistence demo

Tạo customer + order trên UI, sau đó:

```bash
docker compose down
docker compose up -d
```

Kỳ vọng:

- Customer vẫn còn — PostgreSQL dùng `postgres-data`.
- Product stock vẫn giữ — Redis dùng AOF + `redis-data`.
- Orders trở về rỗng — `order-service` cố tình lưu trong memory.

Reset hoàn toàn:

```bash
docker compose down -v
```

## Adminer

```bash
docker compose --profile tools up -d
```

Mở `http://localhost:8080`:

```text
System: PostgreSQL
Server: postgres
Username: shopuser
Password: shoppass
Database: shopdb
```

`Server` phải là `postgres`, không phải `localhost`, vì Adminer cũng chạy trong container.

## Swagger / direct API

- Customer Swagger: `http://localhost:8001/docs`
- Order Swagger: `http://localhost:8003/docs`
- Catalog API: `http://localhost:8002/products`

## Frontend local development

Giữ backend chạy bằng Docker rồi:

```bash
cd frontend-service
npm install
npm run dev
```

Vite chạy tại `http://localhost:5173` và proxy `/api/customer`, `/api/catalog`, `/api/order` tới các backend port trên host.

## Tài liệu demo

- **`README-DEMO.md` — bản copy/paste nhanh toàn bộ command demo (khuyên dùng khi thuyết trình).**
- `PRESENTATION-DEMO.md` — flow trình bày bằng UI + terminal.
- `CMD-DEMO.md` — kịch bản terminal Windows CMD.
- `ARCHITECTURE.md` — giải thích topology/network/persistence.

> `.env` được commit có chủ đích cho classroom demo. Không commit real secrets theo cách này trong production.
