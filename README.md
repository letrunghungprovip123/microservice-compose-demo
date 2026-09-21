# Mini Shop Microservices — Docker Compose Demo

Dự án nhỏ để demo Docker Compose trong môn Microservices. Có **1 frontend service + 3 backend microservices giao tiếp bằng REST**, không dùng message queue:

- `frontend-service` — React + Ant Design, build bằng Vite và serve bằng Nginx
- `customer-service` — FastAPI + PostgreSQL
- `catalog-service` — Express + Redis
- `order-service` — FastAPI, gọi REST sang `customer-service` và `catalog-service`

Ngoài ra có `adminer` (profile `tools`) để xem PostgreSQL bằng trình duyệt.

## Kiến trúc

```text
                         Browser
                            |
                     localhost:3000
                            |
                  frontend-service
                  React + Nginx proxy
                            |
                       service-net
             +--------------+--------------+
             |              |              |
      customer-service catalog-service order-service
             |              |          /       \\
             |              |         / REST    \\
          data-net       cache-net   +-----------+
             |              |
         PostgreSQL        Redis
```

Backend API vẫn được publish trực tiếp ở `8001`, `8002`, `8003` để tiện demo bằng `curl`/Swagger.



## Những case Docker Compose có trong project

- `build`: frontend + 3 backend service tự viết đều build từ Dockerfile.
- `image`: PostgreSQL, Redis, Adminer dùng image có sẵn.
- `ports`: publish API ra host.
- `environment`: truyền URL DB/Redis/downstream service.
- `depends_on`: dependency startup.
- `healthcheck`: kiểm tra PostgreSQL, Redis, frontend và 3 backend services.
- `volumes`: PostgreSQL và Redis giữ dữ liệu khi container bị recreate.
- `networks`: `service-net`, `data-net`, `cache-net` để demo network isolation.
- `profiles`: Adminer chỉ chạy khi bật profile `tools`.
- service discovery: gọi `postgres`, `redis`, `customer-service`, `catalog-service` bằng service name.
- frontend proxy: browser chỉ gọi `localhost:3000`; Nginx trong `frontend-service` proxy request sang backend bằng Docker service name, nên không cần CORS giữa browser và các backend.

## Chạy nhanh

Windows CMD:

```cmd
copy .env.example .env
docker compose config
docker compose up -d --build
docker compose ps
```

Mở giao diện:

```text
http://localhost:3000
```

Kiểm tra:

```cmd
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:3000/health
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

## Giao diện

- Frontend React + Ant Design: http://localhost:3000

Luồng request trên giao diện:

```text
Browser -> frontend-service/Nginx -> Docker service name -> backend service
```

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
