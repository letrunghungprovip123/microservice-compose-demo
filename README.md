# Mini Shop Microservices — Docker Compose Demo

Dự án nhỏ để demo Docker Compose trong môn Microservices. Có **3 application services giao tiếp bằng REST**, không dùng message queue:

- `customer-service` — FastAPI + PostgreSQL
- `catalog-service` — Express + Redis
- `order-service` — FastAPI, gọi REST sang `customer-service` và `catalog-service`

Ngoài ra có `adminer` (profile `tools`) để xem PostgreSQL bằng trình duyệt.

## Kiến trúc

```text
                     Host / Browser / CMD
                            |
           +----------------+----------------+
           |                |                |
       :8001            :8002            :8003
           |                |                |
  customer-service   catalog-service    order-service
      FastAPI           Express           FastAPI
           |                ^              /    \
           | REST           | REST        /      \\ REST
           +----------------+------------+        \\
                                                   \\
                              service-net           \\
                                                     \\
                          customer-service <---------+
                          catalog-service  <---------+

customer-service -- data-net --> PostgreSQL
catalog-service  -- cache-net -> Redis

order-service KHÔNG nằm trong data-net/cache-net,
nên nó phải giao tiếp đúng kiểu microservice: qua REST API.
```

## Những case Docker Compose có trong project

- `build`: 3 service code tự viết đều build từ Dockerfile.
- `image`: PostgreSQL, Redis, Adminer dùng image có sẵn.
- `ports`: publish API ra host.
- `environment`: truyền URL DB/Redis/downstream service.
- `depends_on`: dependency startup.
- `healthcheck`: kiểm tra PostgreSQL, Redis và 3 app services.
- `volumes`: PostgreSQL và Redis giữ dữ liệu khi container bị recreate.
- `networks`: `service-net`, `data-net`, `cache-net` để demo network isolation.
- `profiles`: Adminer chỉ chạy khi bật profile `tools`.
- service discovery: gọi `postgres`, `redis`, `customer-service`, `catalog-service` bằng service name.

## Chạy nhanh

Windows CMD:

```cmd
copy .env.example .env
docker compose config
docker compose up -d --build
docker compose ps
```

Kiểm tra:

```cmd
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
```

### 1. Tạo customer

```cmd
curl -X POST http://localhost:8001/customers -H "Content-Type: application/json" -d "{\"name\":\"An\",\"email\":\"an@example.com\"}"
```

### 2. Xem product

```cmd
curl http://localhost:8002/products
```

### 3. Tạo order — chứng minh REST giữa 3 service

```cmd
curl -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d "{\"customer_id\":1,\"product_id\":1,\"quantity\":2}"
```

`order-service` sẽ:

1. GET `http://customer-service:8001/customers/1`
2. GET `http://catalog-service:8002/products/1`
3. POST `http://catalog-service:8002/products/1/reserve`
4. Tạo order trong memory

Điểm cần nhấn mạnh khi thuyết trình: bên trong Docker network nó dùng **service name**, không dùng `localhost`.

## Swagger / API docs

- Customer: http://localhost:8001/docs
- Order: http://localhost:8003/docs
- Catalog: http://localhost:8002/products

## Adminer (optional)

Chạy thêm profile tools:

```cmd
docker compose --profile tools up -d
```

Mở http://localhost:8080 và nhập:

- System: PostgreSQL
- Server: `postgres`
- Username: giá trị `POSTGRES_USER` (`shopuser` mặc định)
- Password: giá trị `POSTGRES_PASSWORD` (`shoppass` mặc định)
- Database: giá trị `POSTGRES_DB` (`shopdb` mặc định)

Lưu ý: trong Adminer phải dùng server `postgres`, không dùng `localhost`, vì Adminer cũng là container.

## Reset

Dừng và xóa container/network nhưng giữ volume:

```cmd
docker compose down
```

Xóa luôn dữ liệu PostgreSQL/Redis để demo lại từ đầu:

```cmd
docker compose down -v
```

Sau đó:

```cmd
docker compose up -d --build
```

> Demo note: `.env` is intentionally committed for classroom/demo purposes only. Do not commit real secrets in production projects.
