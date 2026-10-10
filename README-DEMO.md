# README Demo — Copy/Paste Commands

Chạy lệnh tại thư mục gốc repo.

## 0. Clone

```powershell
git clone https://github.com/letrunghungprovip123/microservice-compose-demo.git
cd .\microservice-compose-demo
```

Trước khi chạy **bất kỳ case nào**, đặt ngrok token trong `.env`:

```env
NGROK_AUTHTOKEN=your_real_token
```

Không push token thật lên GitHub.

---

# CASE 1 — ngrok -> FE/BFF, BE + DB private

## Start sạch

```powershell
docker compose down -v
docker compose up -d --build
docker compose ps
docker compose logs ngrok
```

Tìm URL dạng:

```text
https://xxxx.ngrok.app
```

PowerShell:

```powershell
$base = "https://xxxx.ngrok.app"
Start-Process $base
```

macOS/Linux:

```bash
BASE="https://xxxx.ngrok.app"
open "$BASE"
```

## Chứng minh public entry chỉ đi vào BFF

PowerShell:

```powershell
curl.exe "$base/health"
curl.exe "$base/shop/products"
```

Raw backend API qua public URL bị chặn ở BFF:

```powershell
curl.exe -i "$base/api/order/orders"
curl.exe -i "$base/api/catalog/products"
```

Kỳ vọng `404`.

Không có host port để bypass ngrok:

```powershell
curl.exe http://localhost:3000
curl.exe http://localhost:8002/products
curl.exe http://localhost:8003/orders
```

Kỳ vọng đều không connect.

Nhưng BFF container gọi Catalog qua private Docker DNS được:

```powershell
docker compose exec frontend-bff node -e "fetch('http://catalog-service:8002/products').then(r=>r.text()).then(console.log)"
```

Luồng cần nói:

```text
External user
  -> HTTPS 443
  -> ngrok
  -> frontend-bff
  -> private Order/Catalog
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

## Service DNS + datastore boundary

Order thấy Catalog vì cùng `service-net`:

```powershell
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"
```

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

```powershell
docker network connect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker compose exec order-service python -c "import socket; s=socket.create_connection(('redis',6379),3); print('CONNECTED ->',s.getpeername()); s.close()"
docker network disconnect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

## Inspect networks

```powershell
docker network inspect mini-shop-private_edge-net
docker network inspect mini-shop-private_service-net
docker network inspect mini-shop-private_order-data-net
docker network inspect mini-shop-private_catalog-data-net
```

## Persistence

```powershell
docker compose down
docker compose up -d
docker compose ps
docker compose logs ngrok
```

Order và stock vẫn còn vì PostgreSQL/Redis dùng named volumes. Ngrok URL có thể đổi sau khi tunnel được tạo lại.

Xong Case 1:

```powershell
docker compose down
```

---

# CASE 2 — ngrok -> Gateway -> FE + public APIs

## Start

```powershell
docker compose -f compose.public.yaml down -v
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
docker compose -f compose.public.yaml logs ngrok
```

Tìm URL dạng:

```text
https://xxxx.ngrok.app
```

PowerShell:

```powershell
$base = "https://xxxx.ngrok.app"
Start-Process $base
```

## Public backend APIs KHÔNG đi qua frontend

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

Header routing proof:

```powershell
curl.exe -i "$base/api/catalog/products"
curl.exe -i "$base/api/order/orders"
```

Kỳ vọng thấy `X-Demo-Route` cho biết Gateway route trực tiếp tới Catalog/Order.

Luồng cần nói:

```text
Website:
Browser -> HTTPS 443 -> ngrok -> gateway -> frontend

Public API:
Postman/App -> HTTPS 443 -> ngrok -> gateway -> order/catalog
```

Frontend không nằm trong request path của public API.

## Create order trực tiếp bằng public API

```powershell
curl.exe -X POST "$base/api/order/orders" -H "Content-Type: application/json" -d '{"customer_name":"Nguyen Van An","customer_email":"an@example.com","product_id":1,"quantity":1}'
```

Nếu PowerShell của máy xử lý quote JSON khác, dùng UI hoặc Postman. Trên macOS/Linux command tương đương dùng `curl` bình thường.

## HTTPS enforcement

Public URL chuẩn:

```text
https://xxxx.ngrok.app
```

Gateway nhận `X-Forwarded-Proto` từ ngrok và redirect request có original scheme `http` sang HTTPS.

## Internal call vẫn không đi vòng ngrok

```powershell
docker compose -f compose.public.yaml exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"
```

Order gọi `catalog-service:8002` trực tiếp qua `service-net`.

## Cleanup Case 2

```powershell
docker compose -f compose.public.yaml down
```

---

# Flow demo ngắn nên nhớ

```text
CASE 1
set token -> compose up -> logs ngrok
-> open HTTPS URL
-> /shop/products OK
-> /api/* 404
-> localhost:3000/:8002/:8003 fail
-> BFF container gọi Catalog OK

CASE 2
public compose up -> logs ngrok
-> open HTTPS URL
-> /api/catalog OK
-> /api/order OK
-> header X-Demo-Route chứng minh Gateway route trực tiếp
```

Điểm chốt:

```text
Case 1: ngrok -> BFF -> private backend
Case 2: ngrok -> Gateway -> FE OR public backend API
```
