# Kịch bản demo Docker Compose bằng Windows CMD

> Chạy CMD tại thư mục chứa `compose.yaml`.

## A. Kiểm tra công cụ

```cmd
docker --version
docker compose version
```

## B. Reset sạch trước khi trình bày

```cmd
docker compose down -v
copy .env.example .env
docker compose config
docker compose up -d --build
docker compose ps
```

Mở frontend:

```cmd
start http://localhost:3000
```

## C. Các service chính

```cmd
docker compose config --services
```

Application services:

```text
frontend-service
customer-service
catalog-service
order-service
```

Infrastructure:

```text
postgres
redis
adminer (profile tools)
```

## D. Test health

```cmd
curl http://localhost:3000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
```

Metadata dùng trên tab Networking:

```cmd
curl http://localhost:8001/info
curl http://localhost:8001/dependencies
curl http://localhost:8002/dependencies
curl http://localhost:8003/dependencies
```

## E. Demo bằng giao diện

### Overview

Mở tab **Overview** và giải thích:

```text
Browser
 -> localhost:3000
 -> frontend-service / Nginx
 -> Docker service name
 -> backend service
```

### Customers

Tạo customer trên UI.

Kiểm tra PostgreSQL:

```cmd
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT * FROM customers;"
```

### Catalog

Xem stock trên UI.

Kiểm tra Redis:

```cmd
docker compose exec redis redis-cli HGETALL product:1
```

### Orders

Tạo order trên UI, sau đó quan sát:

```text
order xuất hiện
stock giảm
remaining stock thay đổi
stats cập nhật
```

## F. Demo bằng curl nếu cần

Tạo customer:

```cmd
curl -X POST http://localhost:8001/customers -H "Content-Type: application/json" -d "{\"name\":\"An\",\"email\":\"an@example.com\"}"
```

Products:

```cmd
curl http://localhost:8002/products
```

Tạo order:

```cmd
curl -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d "{\"customer_id\":1,\"product_id\":1,\"quantity\":2}"
```

Kiểm tra:

```cmd
curl http://localhost:8003/orders
curl http://localhost:8002/products/1
```

## G. Chứng minh Docker networks

```cmd
docker network ls --filter name=mini-shop
docker network inspect mini-shop_service-net
docker network inspect mini-shop_data-net
docker network inspect mini-shop_cache-net
```

Frontend container gọi Customer bằng service name:

```cmd
docker compose exec frontend-service wget -qO- http://customer-service:8001/health
```

Order resolve Customer:

```cmd
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('customer-service'))"
```

Customer resolve PostgreSQL:

```cmd
docker compose exec customer-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

Network isolation — lệnh sau **được kỳ vọng lỗi**:

```cmd
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

Nói:

> Order không nằm trong `data-net`, nên không resolve PostgreSQL trực tiếp. Nó phải gọi Customer Service qua REST.

## H. TCP connectivity

Order → Customer:

```cmd
docker compose exec order-service python -c "import socket; s=socket.create_connection(('customer-service',8001),3); print(s.getpeername()); s.close()"
```

Customer → PostgreSQL:

```cmd
docker compose exec customer-service python -c "import socket; s=socket.create_connection(('postgres',5432),3); print(s.getpeername()); s.close()"
```

## I. Logs

```cmd
docker compose logs order-service
docker compose logs -f order-service
```

Trong lúc follow log, tạo order trên UI. Nhấn `Ctrl+C` để thoát follow.

## J. Port mapping

```cmd
docker compose port frontend-service 80
docker compose port customer-service 8001
```

Nhắc lại:

```text
Host/browser -> localhost + host port
Container     -> service name + container port
```

## K. Persistence

Trước khi down, kiểm tra customer/order/stock trên UI.

```cmd
docker compose down
docker compose up -d
docker compose ps
```

Refresh `http://localhost:3000`.

Kỳ vọng:

```text
Customer    còn   -> PostgreSQL named volume
Redis stock còn   -> Redis AOF + named volume
Orders      mất   -> Order in-memory
```

## L. Stop / Start / Restart

```cmd
docker compose stop
docker compose ps -a
docker compose start
docker compose restart order-service
```

## M. Adminer profile

```cmd
docker compose --profile tools up -d
start http://localhost:8080
```

Login:

```text
System: PostgreSQL
Server: postgres
Username: shopuser
Password: shoppass
Database: shopdb
```

## N. Cleanup

Giữ volume:

```cmd
docker compose down
```

Reset sạch cả volume:

```cmd
docker compose down -v
```
