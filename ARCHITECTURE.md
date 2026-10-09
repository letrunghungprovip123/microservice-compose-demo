# Architecture — 2 Microservices, 2 Exposure Models

Project chỉ còn hai business microservices: **Order** và **Catalog**. Mục tiêu là tách rõ ba khái niệm: service ownership, Docker network boundary và public exposure boundary.

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

Membership:

| Component | service-net | order-data-net | catalog-data-net |
|---|:---:|:---:|:---:|
| Order | ✅ | ✅ | ❌ |
| Catalog | ✅ | ❌ | ✅ |
| PostgreSQL | ❌ | ✅ | ❌ |
| Redis | ❌ | ❌ | ✅ |

Điều này hỗ trợ datastore ownership ở tầng topology: Order có route trực tiếp tới PostgreSQL của mình nhưng không có Docker service-discovery path tới Redis của Catalog.

---

# Case 1 — Frontend public, backend private

Deployment file: `compose.yaml`.

```text
                    EXTERNAL USER
                         |
                         v
                +----------------+
                | Frontend + BFF |
                | public :3000   |
                +-------+--------+
                        |
                   service-net
                     private
                 /             \
                v               v
          order-service ----> catalog-service
               |                   |
        order-data-net      catalog-data-net
               |                   |
           PostgreSQL             Redis
```

Chỉ `frontend-bff` publish host port. Backend/datastore không có `ports:`.

### Tại sao cần BFF?

React SPA chạy trong browser. Nếu Nginx public một generic route như `/api/order/* -> order-service`, external client vẫn có thể gọi raw Order API qua frontend URL bằng curl/Postman. Khi đó backend container không public trực tiếp nhưng backend API vẫn public gián tiếp.

Case 1 tránh điều đó bằng BFF contract riêng:

```text
GET  /shop/products
GET  /shop/orders
POST /shop/checkout
GET  /shop/system
```

BFF thực hiện internal REST calls server-side. Nó **không** có generic `/api/*` proxy; `/api/*` được trả 404 có chủ đích.

Do đó cần phân biệt:

```text
Public interface:  frontend/BFF business contract
Private interface: native Order/Catalog APIs
```

External user vẫn có thể gọi `/shop/checkout` bằng HTTP client — vì đó là public frontend contract — nhưng không có route public ánh xạ trực tiếp tới toàn bộ native backend API.

---

# Case 2 — Frontend và backend API đều public

Deployment file: `compose.public.yaml`.

```text
                         INTERNET
                            |
                       HTTPS :443
                            |
                            v
                       +---------+
                       |  ngrok  |
                       |  edge   |
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

## HTTPS rule

ngrok cung cấp public TLS edge. Gateway nằm trong Docker network và listen HTTP port 80 nội bộ. ngrok forward original scheme qua `X-Forwarded-Proto`; gateway redirect public requests có scheme `http` sang `https`.

```text
PUBLIC:   HTTPS :443
INTERNAL: ngrok tunnel -> gateway:80
```

Điều này không có nghĩa gateway port 80 được expose ra Internet; gateway không có `ports:`.

---

# Ba lớp boundary trong Case 2

```text
1. Internet boundary
   Internet -> ngrok HTTPS edge

2. Ingress boundary
   ngrok -> gateway -> route được cho phép

3. Service/data boundary
   service-net / order-data-net / catalog-data-net
```

Database vẫn private ở cả hai case.

# Persistence

- PostgreSQL mount named volume `order-data`.
- Redis bật AOF và mount named volume `catalog-data`.
- `docker compose down` xóa containers/networks nhưng giữ named volumes.
- `docker compose down -v` xóa luôn project named volumes.

# Dependency graph

```text
Redis healthy ------> Catalog healthy ----+
                                          |
Postgres healthy ------------------------> Order healthy
                                          |
Catalog healthy --------------------------+
```

Ở Case 1, Frontend/BFF đợi Order + Catalog healthy. Ở Case 2, Gateway đợi Frontend + Order + Catalog healthy; ngrok đợi Gateway healthy.

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

```powershell
docker network connect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker network disconnect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

Biến duy nhất thay đổi là network membership; không sửa code và không restart service.
