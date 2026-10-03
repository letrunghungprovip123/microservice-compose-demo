# Architecture Notes

## 1 frontend + 3 backend microservices

### `frontend-service` — React + Ant Design + Nginx

- Host port: `3000` → container port `80`
- Network: `service-net`
- Runtime state: stateless
- Browser chỉ gọi frontend origin.
- Nginx reverse proxy:
  - `/api/customer/*` → `customer-service:8001`
  - `/api/catalog/*` → `catalog-service:8002`
  - `/api/order/*` → `order-service:8003`
- Nginx dùng Docker embedded DNS `127.0.0.11` và service name thay vì container IP.

### `customer-service` — FastAPI

- Container port: `8001`
- Networks: `service-net`, `data-net`
- Persistence: PostgreSQL
- Dependency: `postgres:5432`
- Business API: create/list/get customers
- Presentation endpoints: `/health`, `/info`, `/dependencies`, `/stats`

### `catalog-service` — Express

- Container port: `8002`
- Networks: `service-net`, `cache-net`
- Persistence: Redis AOF + named volume
- Dependency: `redis:6379`
- Business API: list/get/reserve product stock
- Presentation endpoints: `/health`, `/info`, `/dependencies`, `/stats`

### `order-service` — FastAPI + HTTPX

- Container port: `8003`
- Network: `service-net` only
- Dependencies:
  - `customer-service:8001`
  - `catalog-service:8002`
- Business API: list/create order
- Order state intentionally in-memory for persistence demo
- Presentation endpoints: `/health`, `/info`, `/dependencies`, `/stats`

## Infrastructure

### `postgres`

- Chỉ attach `data-net`
- Data directory `/var/lib/postgresql/data`
- Named volume `postgres-data`

### `redis`

- Chỉ attach `cache-net`
- AOF enabled
- Named volume `redis-data`

### `adminer`

- Optional profile `tools`
- Attach `data-net`
- Truy cập PostgreSQL bằng hostname `postgres`

## Complete topology

```text
                               HOST
                                |
                         Browser / curl
                                |
                       localhost:3000
                                |
                    +-----------------------+
                    |   frontend-service    |
                    | React + Ant Design    |
                    | Nginx reverse proxy   |
                    +-----------+-----------+
                                |
                           service-net
          +---------------------+----------------------+
          |                     |                      |
          v                     v                      v
 +------------------+   +------------------+   +------------------+
 | customer-service |   |  order-service   |   | catalog-service  |
 |      :8001       |<--|      :8003       |-->|      :8002       |
 +---------+--------+   +------------------+   +---------+--------+
           |                                          |
        data-net                                   cache-net
           |                                          |
           v                                          v
 +------------------+                       +------------------+
 | postgres:5432    |                       | redis:6379       |
 | postgres-data    |                       | redis-data + AOF |
 +------------------+                       +------------------+
```

## Browser addressing vs Docker addressing

From host/browser:

```text
frontend  -> localhost:3000
customer  -> localhost:8001
catalog   -> localhost:8002
order     -> localhost:8003
```

Inside Docker networks:

```text
frontend -> customer-service:8001
frontend -> catalog-service:8002
frontend -> order-service:8003
customer -> postgres:5432
catalog  -> redis:6379
order    -> customer-service:8001
order    -> catalog-service:8002
```

`localhost` trong container luôn là chính container đó, không phải container khác và không phải host.

## Why three networks?

### `service-net`

Application communication:

```text
frontend
customer
catalog
order
```

### `data-net`

Database boundary:

```text
customer
postgres
adminer(optional)
```

### `cache-net`

Catalog datastore boundary:

```text
catalog
redis
```

`order-service` không có shared network với PostgreSQL/Redis. Điều này cố tình ép Order giao tiếp qua microservice API thay vì bypass service boundary để đọc datastore trực tiếp.

## Request flow: create customer

```text
Browser
 -> localhost:3000/api/customer/customers
 -> frontend Nginx
 -> customer-service:8001
 -> postgres:5432
 -> postgres-data
```

## Request flow: create order

```text
Browser
 -> localhost:3000/api/order/orders
 -> frontend Nginx
 -> order-service:8003
    -> customer-service:8001
       -> postgres:5432
    -> catalog-service:8002
       -> redis:6379
 -> response to Browser
```

## Health and dependency model

Compose startup dependencies:

```text
postgres healthy
  -> customer-service can start

redis healthy
  -> catalog-service can start

customer + catalog healthy
  -> order-service can start
```

`frontend-service` không bắt buộc đợi backend healthy. UI có thể lên trước và hiển thị backend `DOWN`, sau đó tự refresh health/dependency status.

Application presentation endpoints:

```text
/health        basic/current service health
/info          runtime, port, networks, persistence
/dependencies  live dependency probe + latency
/stats         dashboard counters
```

## Persistence behavior

```text
customer data
 -> PostgreSQL
 -> postgres-data named volume
 -> survives docker compose down/up

catalog stock
 -> Redis AOF
 -> redis-data named volume
 -> survives docker compose down/up

orders
 -> Python process memory
 -> lost after order container recreation
```

Điều này cố tình tạo một demo trực quan giữa **persistent volume state** và **ephemeral container/process state**.

## Deliberate simplifications

- Frontend Nginx là reverse proxy cho demo, không phải full API gateway.
- Không có authentication/authorization.
- Không có tracing, message queue, saga, circuit breaker hoặc service mesh.
- `order-service` lưu order in-memory có chủ đích.
- Catalog stock reservation vẫn là demo đơn giản, không phải distributed transaction production-grade.
- Backend ports vẫn publish ra host để tiện Swagger/curl; production có thể chỉ expose frontend/gateway.
