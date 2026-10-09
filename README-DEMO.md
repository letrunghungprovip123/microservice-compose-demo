# README Demo — Copy/Paste Commands

Chạy lệnh tại thư mục gốc repo.

## 0. Clone

```powershell
git clone https://github.com/letrunghungprovip123/microservice-compose-demo.git
cd .\microservice-compose-demo
```

---

# CASE 1 — FE public, BE + DB private

## Start sạch

```powershell
docker compose down -v
docker compose up -d --build
docker compose ps
```

Mở UI:

```powershell
Start-Process http://localhost:3000
```

macOS:

```bash
open http://localhost:3000
```

## Chứng minh chỉ FE/BFF được publish

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:3000/shop/products
```

Raw backend API qua FE bị chặn:

```powershell
curl.exe http://localhost:3000/api/order/orders
```

Kỳ vọng `404`.

Backend host ports không mở:

```powershell
curl.exe http://localhost:8002/products
curl.exe http://localhost:8003/orders
```

Kỳ vọng không connect.

Nhưng BFF container gọi Catalog qua private Docker DNS được:

```powershell
docker compose exec frontend-bff node -e "fetch('http://catalog-service:8002/products').then(r=>r.text()).then(console.log)"
```

## Business flow

Tạo order trên UI với:

```text
Name: Nguyen Van An
Email: an@example.com
Product: Mechanical Keyboard
Quantity: 2
```

Xem orders trong PostgreSQL:

```powershell
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT id, customer_name, product_name, quantity, total, created_at FROM orders ORDER BY created_at DESC;"
```

Xem stock trong Redis:

```powershell
docker compose exec redis redis-cli HGETALL product:1
```

## Service DNS

Order thấy Catalog vì cùng `service-net`:

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"
```

## Datastore boundary

Order không thấy Redis:

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
```

Catalog không thấy PostgreSQL:

```powershell
docker compose exec catalog-service node -e "require('dns').lookup('postgres',(e,a)=>console.log(e||a))"
```

Hai lỗi trên là kết quả mong muốn.

## Controlled network experiment

Attach Order vào network của Redis:

```powershell
docker network connect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

Chạy lại đúng lệnh DNS:

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
```

Bây giờ resolve thành công.

Test TCP tới Redis:

```powershell
docker compose exec order-service python -c "import socket; s=socket.create_connection(('redis',6379),3); print('CONNECTED ->',s.getpeername()); s.close()"
```

Khôi phục boundary:

```powershell
docker network disconnect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

Chạy lại sẽ fail:

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
```

## Inspect networks

```powershell
docker network inspect mini-shop-private_service-net
docker network inspect mini-shop-private_order-data-net
docker network inspect mini-shop-private_catalog-data-net
```

## Persistence

```powershell
docker compose down
docker compose up -d
docker compose ps
```

Refresh UI. Order và stock vẫn còn vì PostgreSQL/Redis dùng named volumes.

Reset sạch:

```powershell
docker compose down -v
```

---

# CASE 2 — FE + public APIs qua HTTPS ngrok

## 1. Set ngrok token

Mở `.env` và điền:

```env
NGROK_AUTHTOKEN=your_real_token
```

Không push token thật lên GitHub.

## 2. Start

```powershell
docker compose -f compose.public.yaml down -v
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
```

## 3. Lấy public HTTPS URL

```powershell
docker compose -f compose.public.yaml logs ngrok
```

Tìm URL dạng:

```text
https://xxxx.ngrok.app
```

Gán nhanh trong PowerShell nếu muốn:

```powershell
$base = "https://xxxx.ngrok.app"
```

## 4. Website public

```powershell
Start-Process $base
```

## 5. Public backend APIs KHÔNG đi qua frontend

Catalog:

```powershell
curl.exe "$base/api/catalog/products"
```

Order:

```powershell
curl.exe "$base/api/order/orders"
```

Gateway info:

```powershell
curl.exe "$base/gateway-info"
```

Luồng cần nói:

```text
External client
  -> HTTPS 443
  -> ngrok
  -> gateway
  -> order-service OR catalog-service
```

Frontend không nằm trong request path của các API này.

## 6. Create order trực tiếp bằng public API

```powershell
curl.exe -X POST "$base/api/order/orders" -H "Content-Type: application/json" -d '{"customer_name":"Nguyen Van An","customer_email":"an@example.com","product_id":1,"quantity":1}'
```

> Nếu PowerShell của máy xử lý quote JSON khác, dùng UI hoặc Postman. Trên macOS/Linux command trên dùng được trực tiếp với `curl`.

## 7. HTTPS enforcement

Public URL chuẩn phải là:

```text
https://xxxx.ngrok.app
```

Gateway nhận `X-Forwarded-Proto` từ ngrok và redirect request có original scheme `http` sang HTTPS.

## 8. Internal call vẫn không đi vòng ngrok

```powershell
docker compose -f compose.public.yaml exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"
```

Order gọi `catalog-service:8002` trực tiếp qua `service-net`.

## 9. Cleanup Case 2

Giữ volume:

```powershell
docker compose -f compose.public.yaml down
```

Reset volume:

```powershell
docker compose -f compose.public.yaml down -v
```

---

# Flow demo ngắn nên nhớ

```text
CASE 1
up -> UI -> /shop OK -> /api raw 404 -> :8002/:8003 fail
-> Order sees Catalog -> Order cannot see Redis
-> network connect -> sees Redis -> disconnect -> fail

CASE 2
set token -> public compose up -> logs ngrok
-> open HTTPS URL -> call /api/catalog directly
-> call /api/order directly -> explain Gateway, not Frontend
```
