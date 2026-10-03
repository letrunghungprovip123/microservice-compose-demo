# Presentation Demo — UI + Docker Compose

Tài liệu này là flow ngắn gọn để trình bày project bằng **giao diện React/Ant Design kết hợp terminal**.

## 0. Reset trước buổi demo

Nếu muốn dữ liệu sạch:

```bash
docker compose down -v
docker compose up -d --build
docker compose ps
```

Mở UI:

```text
http://localhost:3000
```

## 1. Overview — giới thiệu kiến trúc

Mở tab **Overview**.

Nói:

> Browser chỉ gọi frontend ở `localhost:3000`. Frontend được build bằng React + Ant Design và serve bởi Nginx. Nginx nằm trong `service-net`, vì vậy nó có thể proxy request bằng Docker service name sang Customer, Catalog và Order.

Chỉ vào 4 health cards:

```text
frontend-service
customer-service
catalog-service
order-service
```

Chỉ vào architecture panel và giải thích:

```text
Browser
  -> frontend-service
  -> service-net
  -> customer / catalog / order
```

## 2. Customers — chứng minh frontend → API → PostgreSQL

Mở tab **Customers**.

Tạo:

```text
Name: Nguyen Van An
Email: an@example.com
```

Nói:

> Browser gửi request tới `/api/customer/customers`. Nginx proxy request đó tới `customer-service:8001`; Customer Service ghi dữ liệu xuống PostgreSQL qua `postgres:5432` trên `data-net`.

Terminal kiểm tra DB:

```bash
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT * FROM customers;"
```

## 3. Catalog — chứng minh Redis

Mở tab **Catalog** và nhớ stock của product 1.

Terminal:

```bash
docker compose exec redis redis-cli HGETALL product:1
```

Nói:

> Catalog Service sở hữu product/stock state. Redis nằm trên `cache-net` và không được Order truy cập trực tiếp.

## 4. Orders — chứng minh REST giữa microservices

Mở tab **Orders**.

Chọn customer vừa tạo, chọn product và quantity `2`, sau đó **Create order**.

Trên UI sẽ thấy:

- order mới xuất hiện;
- stock giảm;
- remaining stock được trả về;
- dashboard stats thay đổi.

Nói:

> Một click từ frontend tạo ra nhiều request giữa các container. Order gọi Customer để kiểm tra customer, gọi Catalog để lấy product và reserve stock, sau đó mới tạo order.

Flow:

```text
Browser
 -> frontend-service
 -> order-service
    -> customer-service
    -> catalog-service
       -> redis
```

## 5. Networking — phần phản biện mạnh nhất

Mở tab **Networking**.

UI hiển thị:

- `service-net`: frontend, customer, catalog, order
- `data-net`: customer, postgres
- `cache-net`: catalog, redis
- live dependency probes + latency

Terminal inspect:

```bash
docker network ls --filter name=mini-shop
docker network inspect mini-shop_service-net
docker network inspect mini-shop_data-net
docker network inspect mini-shop_cache-net
```

Chứng minh frontend container gọi Customer bằng Docker DNS:

```bash
docker compose exec frontend-service wget -qO- http://customer-service:8001/health
```

Chứng minh Order resolve Customer:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('customer-service'))"
```

Chứng minh isolation — lệnh này **được kỳ vọng thất bại**:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

Nói ngay sau lỗi:

> Đây là lỗi em mong muốn. Order không cùng `data-net` với PostgreSQL nên không được truy cập database trực tiếp. Nó phải đi qua Customer API.

## 6. Logs

```bash
docker compose logs order-service
docker compose logs -f order-service
```

Tạo thêm một order trên UI để log xuất hiện.

`Ctrl+C` chỉ thoát follow log, container vẫn chạy.

## 7. Service metadata / dependency endpoints

Có thể mở hoặc curl:

```bash
curl http://localhost:8001/info
curl http://localhost:8001/dependencies
curl http://localhost:8002/dependencies
curl http://localhost:8003/dependencies
```

Các endpoint này được UI tab Networking sử dụng để show runtime topology thật.

## 8. Persistence — kết thúc demo

Trước khi down, kiểm tra UI đang có customer/order và stock đã giảm.

```bash
docker compose down
docker compose up -d
```

Refresh UI.

Kỳ vọng:

```text
Customer     -> còn
Redis stock  -> còn
Orders       -> mất
```

Giải thích:

> PostgreSQL và Redis dùng named volume nên data survive container recreation. Order cố tình dùng in-memory state nên data mất khi container bị recreate.

## 9. Adminer nếu còn thời gian

```bash
docker compose --profile tools up -d
```

Mở `http://localhost:8080`.

```text
System: PostgreSQL
Server: postgres
Username: shopuser
Password: shoppass
Database: shopdb
```

## 10. Cleanup

Giữ volume:

```bash
docker compose down
```

Reset sạch:

```bash
docker compose down -v
```

## Câu kết

> Dockerfile mô tả cách build từng service. Docker Compose mô tả cách toàn bộ hệ thống chạy, kết nối, kiểm tra health và giữ dữ liệu. Frontend trong demo giúp nhìn trực tiếp các luồng đó thay vì chỉ quan sát bằng `curl`.
