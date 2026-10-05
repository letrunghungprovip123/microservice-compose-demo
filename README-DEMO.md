# README Demo — Docker Compose Microservices

File này gom **toàn bộ lệnh cần dùng khi demo** vào một chỗ để mọi người clone project về rồi copy/paste nhanh.

> Khuyến nghị dùng **Windows PowerShell** và chạy lệnh tại **thư mục gốc của repo**, nơi có `compose.yaml`.

---

## 0. Clone và vào project

```powershell
git clone https://github.com/letrunghungprovip123/microservice-compose-demo.git
cd .\microservice-compose-demo
```

Kiểm tra đang đứng đúng chỗ:

```powershell
Get-ChildItem compose.yaml
```

---

# PHẦN A — Demo Dockerfile / docker run thủ công

Mục đích: cho thấy một service có thể chạy bằng Dockerfile + `docker run`, nhưng khi hệ thống có nhiều dependency/network/volume thì thao tác thủ công sẽ dài và khó quản lý.

## A1. Đảm bảo Compose stack chưa chiếm port 8003

```powershell
docker compose down
```

## A2. Build riêng Order Service

```powershell
docker build -t demo-order ./order-service
```

Kiểm tra image:

```powershell
docker images demo-order
```

## A3. Chạy Order Service thủ công

```powershell
docker run -d --name demo-order-container -p 8003:8003 demo-order
```

Kiểm tra container:

```powershell
docker ps
```

Health check:

```powershell
curl.exe http://localhost:8003/health
```

Kỳ vọng trả JSON có `status: ok` và `service: order-service`.

## A4. Cleanup container chạy thủ công

```powershell
docker rm -f demo-order-container
```

---

# PHẦN B — Dựng toàn bộ hệ thống bằng Docker Compose

## B1. Reset sạch dữ liệu nếu muốn demo từ đầu

> Lệnh này xóa cả named volume. Chỉ dùng khi muốn reset toàn bộ customer/stock.

```powershell
docker compose down -v
```

## B2. Build + start toàn bộ stack

```powershell
docker compose up -d --build
```

Kiểm tra:

```powershell
docker compose ps
```

Xem service Compose nhận diện:

```powershell
docker compose config --services
```

Mở frontend:

```powershell
Start-Process http://localhost:3000
```

Các URL chính:

```text
Frontend: http://localhost:3000
Customer Swagger: http://localhost:8001/docs
Catalog API: http://localhost:8002/products
Order Swagger: http://localhost:8003/docs
```

---

# PHẦN C — Customer -> PostgreSQL

Trên UI vào tab **Customers** và tạo ví dụ:

```text
Name: Nguyen Van An
Email: an@example.com
```

Sau đó kiểm tra trực tiếp PostgreSQL:

```powershell
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT * FROM customers;"
```

> Project hiện **không có bảng `orders` trong PostgreSQL**. Order được lưu in-memory trong `order-service` để demo ephemeral state.

Xem order qua API:

```powershell
curl.exe http://localhost:8003/orders
```

---

# PHẦN D — Catalog -> Redis

Xem stock product 1:

```powershell
docker compose exec redis redis-cli HGETALL product:1
```

Xem toàn bộ product keys:

```powershell
docker compose exec redis redis-cli KEYS "product:*"
```

Trên UI vào tab **Orders**, chọn customer + product + quantity `2`, bấm **Create order** rồi quay lại Catalog để thấy stock giảm.

Kiểm tra order:

```powershell
curl.exe http://localhost:8003/orders
```

---

# PHẦN E — Docker DNS và service discovery

## E1. Order resolve Customer — phải thành công

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('customer-service'))"
```

Ý nghĩa: `order-service` và `customer-service` cùng nằm trong `service-net`, Docker DNS resolve service name thành IP runtime.

## E2. Frontend gọi Customer bằng Docker service name

```powershell
docker compose exec frontend-service wget -qO- http://customer-service:8001/health
```

---

# PHẦN F — Chứng minh network boundary / isolation

Đây là phần demo quan trọng nhất.

## F1. Xem các Docker network

```powershell
docker network ls --filter name=mini-shop
```

```powershell
docker network inspect mini-shop_service-net
```

```powershell
docker network inspect mini-shop_data-net
```

```powershell
docker network inspect mini-shop_cache-net
```

## F2. Order resolve PostgreSQL — kỳ vọng THẤT BẠI

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

Giải thích: `order-service` chỉ ở `service-net`; PostgreSQL ở `data-net`. Không có shared network nên Order không resolve được hostname `postgres`.

## F3. Attach nóng Order vào `data-net`

Lấy container ID:

```powershell
$order = docker compose ps -q order-service
```

Kiểm tra:

```powershell
$order
```

Attach vào network:

```powershell
docker network connect mini-shop_data-net $order
```

Hoặc một dòng:

```powershell
docker network connect mini-shop_data-net $(docker compose ps -q order-service)
```

## F4. Chạy lại đúng câu lệnh DNS — lúc này phải THÀNH CÔNG

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

## F5. Chứng minh TCP connection thật tới PostgreSQL port 5432

```powershell
docker compose exec order-service python -c "import socket; s=socket.create_connection(('postgres',5432),3); print('CONNECTED ->',s.getpeername()); s.close()"
```

Kỳ vọng dạng:

```text
CONNECTED -> ('172.x.x.x', 5432)
```

Điểm cần nói khi trình bày:

> Không sửa source code, không đổi hostname, không restart Order. Chỉ thay network membership. Trước attach thì DNS/TCP không tới PostgreSQL; sau attach thì tới được.

## F6. Disconnect để trả kiến trúc về đúng thiết kế Compose

```powershell
docker network disconnect mini-shop_data-net $(docker compose ps -q order-service)
```

Test lại — kỳ vọng THẤT BẠI:

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
```

---

# PHẦN G — Health / dependency / metadata

Health:

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:8001/health
curl.exe http://localhost:8002/health
curl.exe http://localhost:8003/health
```

Dependency probes:

```powershell
curl.exe http://localhost:8001/dependencies
curl.exe http://localhost:8002/dependencies
curl.exe http://localhost:8003/dependencies
```

Metadata:

```powershell
curl.exe http://localhost:8001/info
curl.exe http://localhost:8002/info
curl.exe http://localhost:8003/info
```

Statistics:

```powershell
curl.exe http://localhost:8001/stats
curl.exe http://localhost:8002/stats
curl.exe http://localhost:8003/stats
```

---

# PHẦN H — Logs

Xem toàn bộ log:

```powershell
docker compose logs
```

Theo dõi Order Service:

```powershell
docker compose logs -f order-service
```

Sau đó tạo order trên UI để thấy log mới. Nhấn `Ctrl+C` chỉ dừng chế độ follow log, container vẫn chạy.

Frontend/Nginx logs:

```powershell
docker compose logs -f frontend-service
```

---

# PHẦN I — Persistence demo

Trước bước này nên có:

- ít nhất 1 customer;
- ít nhất 1 order;
- stock đã bị giảm.

Kiểm tra trước:

```powershell
curl.exe http://localhost:8001/customers
curl.exe http://localhost:8002/products
curl.exe http://localhost:8003/orders
```

Remove container/network nhưng **giữ volume**:

```powershell
docker compose down
```

Start lại:

```powershell
docker compose up -d
```

Kiểm tra:

```powershell
docker compose ps
```

Refresh UI hoặc chạy:

```powershell
curl.exe http://localhost:8001/customers
curl.exe http://localhost:8002/products
curl.exe http://localhost:8003/orders
```

Kỳ vọng:

```text
Customer      -> còn
Product stock -> còn
Orders        -> [] / mất
```

Lý do:

- Customer lưu PostgreSQL + `postgres-data` volume.
- Catalog lưu Redis AOF + `redis-data` volume.
- Order cố tình lưu trong RAM của process.

---

# PHẦN J — Adminer (optional)

Start profile tools:

```powershell
docker compose --profile tools up -d
```

Mở:

```powershell
Start-Process http://localhost:8080
```

Thông tin login:

```text
System: PostgreSQL
Server: postgres
Username: shopuser
Password: shoppass
Database: shopdb
```

`Server` phải là `postgres`, không phải `localhost`, vì Adminer cũng chạy trong container.

---

# PHẦN K — Cleanup

Giữ volume:

```powershell
docker compose down
```

Reset sạch cả volume:

```powershell
docker compose down -v
```

Xóa image manual nếu không cần:

```powershell
docker image rm demo-order
```

---

# FLOW DEMO DƯỚI 10 PHÚT — COPY THEO THỨ TỰ

Nếu cần demo nhanh, dùng đúng thứ tự này:

```powershell
# 1. Dockerfile / docker run manual
docker compose down
docker build -t demo-order ./order-service
docker run -d --name demo-order-container -p 8003:8003 demo-order
curl.exe http://localhost:8003/health
docker rm -f demo-order-container

# 2. Compose toàn hệ thống
docker compose up -d --build
docker compose ps
Start-Process http://localhost:3000

# 3. Sau khi tạo Customer trên UI — kiểm tra PostgreSQL
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT * FROM customers;"

# 4. Sau khi tạo Order trên UI — xem order + stock
curl.exe http://localhost:8003/orders
docker compose exec redis redis-cli HGETALL product:1

# 5. Docker DNS: Order -> Customer thành công
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('customer-service'))"

# 6. Boundary: Order -> PostgreSQL thất bại
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"

# 7. Attach Order vào data-net
$order = docker compose ps -q order-service
docker network connect mini-shop_data-net $order

# 8. Cùng câu lệnh -> PostgreSQL thành công
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('postgres'))"
docker compose exec order-service python -c "import socket; s=socket.create_connection(('postgres',5432),3); print('CONNECTED ->',s.getpeername()); s.close()"

# 9. Trả boundary về đúng thiết kế
docker network disconnect mini-shop_data-net $order

# 10. Persistence
docker compose down
docker compose up -d
docker compose ps
```

---

## Câu chốt khi demo network boundary

> Em không dùng code nghiệp vụ để chứng minh isolation. Em test DNS và TCP trực tiếp từ process bên trong `order-service`, sau đó chỉ thay đổi network membership. Khi chưa join `data-net` thì Order không thấy PostgreSQL; khi attach vào `data-net` thì cùng câu lệnh hoạt động; disconnect thì lại fail.

## Câu chốt toàn bài

> Dockerfile mô tả cách build từng service. Docker Compose mô tả cách toàn bộ hệ thống chạy cùng nhau: dependency, healthcheck, environment, network, service discovery và persistence. Frontend React/Ant Design chỉ trực quan hóa hệ thống; communication thật vẫn diễn ra giữa các container thông qua Docker network.
