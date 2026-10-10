# Architecture — 2 Microservices, 2 Exposure Models

Project chỉ còn hai business microservices: **Order** và **Catalog**. Mục tiêu là tách rõ service ownership, Docker network boundary và public exposure boundary.

## Business ownership

```text
Order Service                          Catalog Service
- create/list orders                   - list products
- customer snapshot                    - price + stock
- persist order                        - reserve stock
       |                                      |
       v                                      v
   PostgreSQL                               Redis
```

Order gọi Catalog bằng REST. Order không đọc Redis trực tiếp; Catalog không đọc PostgreSQL trực tiếp.

## Network model chung

```text
                     service-net
             +-----------------------+
             |                       |
             v                       v
       order-service ----------> catalog-service
             |                       |
      order-data-net          catalog-data-net
             |                       |
             v                       v
          postgres                  redis
```

| Component | service-net | order-data-net | catalog-data-net |
|---|:---:|:---:|:---:|
| Order | ✅ | ✅ | ❌ |
| Catalog | ✅ | ❌ | ✅ |
| PostgreSQL | ❌ | ✅ | ❌ |
| Redis | ❌ | ❌ | ✅ |

Điều này hỗ trợ datastore ownership ở tầng topology: Order có route trực tiếp tới PostgreSQL của mình nhưng không có Docker service-discovery path tới Redis của Catalog.

---

# Case 1 — ngrok public edge, frontend/BFF public, backend private

Deployment file: `compose.yaml`.

```text
                         INTERNET
                            |
                       HTTPS :443
                            |
                            v
                       +---------+
                       |  ngrok  |
                       +----+----+
                            |
                         edge-net
                            |
                            v
                    +---------------+
                    | Frontend/BFF  |
                    | public app    |
                    +-------+-------+
                            |
                       service-net
                         private
                    /               \
                   v                 v
            order-service -----> catalog-service
                 |                    |
          order-data-net       catalog-data-net
                 |                    |
             PostgreSQL              Redis
```

Không service nào publish host port. Ngrok là public entry point duy nhất.

Network membership bổ sung của Case 1:

| Component | edge-net | service-net |
|---|:---:|:---:|
| ngrok | ✅ | ❌ |
| frontend-bff | ✅ | ✅ |
| order-service | ❌ | ✅ |
| catalog-service | ❌ | ✅ |

Điểm này làm public exposure boundary rõ hơn: ngrok chỉ có route tới BFF qua `edge-net`; backend chỉ nằm sau BFF trên `service-net`.

### Tại sao cần BFF?

React SPA chạy trong browser. Nếu public một generic route như `/api/order/* -> order-service`, external client vẫn có thể gọi raw Order API qua public URL bằng curl/Postman. Khi đó backend container không public trực tiếp nhưng backend API vẫn public gián tiếp.

Case 1 tránh điều đó bằng BFF contract riêng:

```text
GET  /shop/products
GET  /shop/orders
POST /shop/checkout
GET  /shop/system
```

BFF thực hiện internal REST calls server-side. Nó **không** có generic `/api/*` proxy; `/api/*` được trả 404 có chủ đích.

Do đó:

```text
Public interface:  ngrok -> frontend/BFF business contract
Private interface: native Order/Catalog APIs
```

External user vẫn có thể gọi `/shop/checkout` bằng HTTP client vì đó là public frontend contract. Điều bị ẩn là native backend contract, không phải toàn bộ HTTP interaction của frontend.

Không có host-port bypass:

```text
localhost:3000  ❌
localhost:8002  ❌
localhost:8003  ❌
```

---

# Case 2 — ngrok public edge + Gateway + public backend APIs

Deployment file: `compose.public.yaml`.

```text
                         INTERNET
                            |
                       HTTPS :443
                            |
                            v
                       +---------+
                       |  ngrok  |
                       +----+----+
                            |
                         edge-net
                            |
                            v
                       +---------+
                       | Gateway |
                       |  Nginx  |
                       +----+----+
                            |
                       service-net
          +-----------------+------------------+
          |                 |                  |
          v                 v                  v
       frontend        order-service      catalog-service
                           |                  |
                    order-data-net     catalog-data-net
                           |                  |
                       PostgreSQL            Redis
```

Gateway routing:

```text
/                  -> frontend-service:80
/api/order/*       -> order-service:8003
/api/catalog/*     -> catalog-service:8002
```

Frontend và API là **các destination ngang hàng** sau gateway. Public API request không đi qua frontend service.

### Public request flows

Website:

```text
Browser -> HTTPS 443 -> ngrok -> Gateway -> Frontend
```

API client:

```text
Mobile/Postman/Partner -> HTTPS 443 -> ngrok -> Gateway -> Order/Catalog
```

Internal microservice call:

```text
Order -> service-net -> Catalog
```

Order không đi vòng ra ngrok để gọi Catalog.

---

# So sánh public exposure boundary

```text
CASE 1
Internet -> ngrok -> Frontend/BFF -> private Order/Catalog

CASE 2
Internet -> ngrok -> Gateway -> Frontend
                            -> Order API
                            -> Catalog API
```

Cả hai case đều dùng ngrok làm HTTPS public edge. Điểm khác biệt là **thành phần nhận tunnel và contract được expose**:

- Case 1: ngrok tunnel thẳng vào BFF; native backend API private.
- Case 2: ngrok tunnel vào Gateway; Gateway intentionally expose frontend và native backend APIs.

---

# HTTPS rule

Ngrok cung cấp public TLS edge. Traffic public dùng HTTPS/443. Tunnel nội bộ có thể forward HTTP tới container đích mà không đồng nghĩa port HTTP đó được expose ra Internet.

```text
Case 1 public: HTTPS -> ngrok -> frontend-bff:3000 (internal)
Case 2 public: HTTPS -> ngrok -> gateway:80 (internal)
```

Case 2 Gateway còn kiểm tra `X-Forwarded-Proto` và redirect original HTTP requests sang HTTPS.

---

# Persistence

- PostgreSQL mount named volume `order-data`.
- Redis bật AOF và mount named volume `catalog-data`.
- `docker compose down` xóa containers/networks nhưng giữ named volumes.
- `docker compose down -v` xóa luôn project named volumes.
- Ngrok URL có thể thay đổi khi tunnel/container được tạo lại.

# Dependency graph

```text
Redis healthy ------> Catalog healthy ----+
                                          |
Postgres healthy ------------------------> Order healthy
                                          |
Catalog healthy --------------------------+
```

Case 1:

```text
Order + Catalog healthy -> Frontend/BFF healthy -> ngrok starts
```

Case 2:

```text
Frontend + Order + Catalog healthy -> Gateway healthy -> ngrok starts
```

# Boundary proof

Cùng network:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"
```

Không cùng datastore network:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker compose exec catalog-service node -e "require('dns').lookup('postgres',(e,a)=>console.log(e||a))"
```

Controlled experiment:

```bash
docker network connect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker network disconnect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

Biến duy nhất thay đổi là network membership; không sửa code và không restart service.
