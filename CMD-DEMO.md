# Kịch bản demo Docker Compose bằng Windows CMD

> Chạy CMD tại thư mục chứa `compose.yaml`.

## A. Kiểm tra công cụ

```cmd
docker --version
docker compose version
```

Nói: Docker Engine/CLI thực thi container; Compose đọc application model và điều phối các resource Docker.

## B. Xem Compose hiểu file như thế nào

```cmd
copy .env.example .env
docker compose config
docker compose config --services
```

Kỳ vọng thấy:

```text
postgres
redis
customer-service
catalog-service
order-service
frontend-service
```

`adminer` thuộc profile `tools`, nên **không được start mặc định**. Có thể xem profile bằng `docker compose config --profiles`.

## C. Build và khởi động

```cmd
docker compose build
docker compose up -d
docker compose ps
```

Hoặc gộp:

```cmd
docker compose up -d --build
```

Nói: frontend + 3 backend service dùng `build`; Postgres/Redis dùng `image` có sẵn.

## D. Quan sát resource mà Compose tạo

```cmd
docker network ls
docker volume ls
docker compose ps
```

Tìm các resource có prefix `mini-shop`.

Inspect network chính:

```cmd
docker network inspect mini-shop_service-net
```

Chứng minh frontend container gọi backend trực tiếp qua Docker network:

```cmd
docker compose exec frontend-service wget -qO- http://customer-service:8001/health
```

## E. Test health

```cmd
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:3000/health
```

Mở giao diện React + Ant Design:

```cmd
start http://localhost:3000
```

Nói: Browser chỉ truy cập `localhost:3000`. Nginx trong `frontend-service` proxy sang các backend bằng Docker service name trên `service-net`.

## F. Tạo dữ liệu

```cmd
curl -X POST http://localhost:8001/customers -H "Content-Type: application/json" -d "{\"name\":\"An\",\"email\":\"an@example.com\"}"
```

```cmd
curl http://localhost:8002/products
```

## G. Demo REST giữa microservices

```cmd
curl -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d "{\"customer_id\":1,\"product_id\":1,\"quantity\":2}"
```

Sau đó:

```cmd
curl http://localhost:8003/orders
curl http://localhost:8002/products/1
```

Giải thích: `order-service` gọi `customer-service:8001` và `catalog-service:8002` qua Docker DNS/service discovery.

## H. Logs

```cmd
docker compose logs
```

Theo dõi order service:

```cmd
docker compose logs -f order-service
```

Nhấn `Ctrl+C` chỉ thoát chế độ follow log; container vẫn chạy.

## I. Exec vào container

Customer service:

```cmd
docker compose exec customer-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

Chứng minh hostname `postgres` được Docker DNS resolve.

Kiểm tra DB trực tiếp:

```cmd
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT * FROM customers;"
```

Kiểm tra Redis:

```cmd
docker compose exec redis redis-cli KEYS "product:*"
```

## J. Chứng minh network isolation

`order-service` ở `service-net`, nhưng không được nối vào `data-net` hoặc `cache-net`.

```cmd
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('customer-service'))"
```

Lệnh trên thành công.

Thử resolve PostgreSQL:

```cmd
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

Kỳ vọng lỗi DNS vì `order-service` và `postgres` không có shared network. Đây là demo rất tốt cho network isolation.

## K. Stop / Start / Restart

```cmd
docker compose stop
docker compose ps -a
docker compose start
docker compose restart order-service
```

`stop`: dừng nhưng giữ container.  
`start`: chạy lại container có sẵn.  
`restart`: restart container, không dùng để áp dụng mọi thay đổi cấu hình mới.

## L. Demo persistence

Xem customer trước:

```cmd
curl http://localhost:8001/customers
```

Sau đó:

```cmd
docker compose down
docker compose up -d
curl http://localhost:8001/customers
```

Customer vẫn còn vì PostgreSQL dùng named volume.

Trong khi order-service lưu order **in-memory**, nên sau recreate:

```cmd
curl http://localhost:8003/orders
```

sẽ về danh sách rỗng. Đây là cách minh họa rất trực quan sự khác nhau giữa ephemeral container state và persistent volume.

## M. Adminer profile

```cmd
docker compose --profile tools up -d
```

Mở http://localhost:8080.

Điểm demo: profile cho phép service phụ trợ chỉ chạy khi cần.

## N. Dọn môi trường

Giữ dữ liệu:

```cmd
docker compose down
```

Xóa cả volume để reset hoàn toàn:

```cmd
docker compose down -v
```
