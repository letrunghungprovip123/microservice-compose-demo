# Presentation Demo — 2 Microservices / 2 Architecture Cases

Mục tiêu: chứng minh hai deployment model khác nhau, không phải chỉ “thêm ngrok”.

## 0. Business architecture

```text
Order Service -> Catalog Service
     |               |
 PostgreSQL         Redis
```

Nói:

> Em bỏ Customer Service để tập trung vào hai business service có ownership rõ: Order sở hữu order data trong PostgreSQL, Catalog sở hữu product/stock trong Redis. Order muốn reserve stock phải gọi Catalog API, không truy cập Redis trực tiếp.

---

# CASE 1 — Frontend public, backend private

## 1. Start

```bash
docker compose down -v
docker compose up -d --build
docker compose ps
```

Mở `http://localhost:3000`.

Nói:

> Chỉ Frontend/BFF publish port 3000. Order, Catalog, PostgreSQL và Redis chỉ tồn tại trong private Docker networks.

## 2. Chứng minh exposure boundary

```bash
curl http://localhost:3000/shop/products
```

Thành công qua BFF.

```bash
curl http://localhost:3000/api/order/orders
```

Kỳ vọng `404`.

```bash
curl http://localhost:8002/products
curl http://localhost:8003/orders
```

Kỳ vọng không connect.

Nói:

> Case 1 không dùng generic `/api` proxy. External client chỉ thấy frontend/BFF contract; native backend APIs không được expose.

## 3. Business flow

Trên UI tạo order:

```text
Nguyen Van An
an@example.com
Mechanical Keyboard
quantity 2
```

Kiểm tra PostgreSQL:

```bash
docker compose exec postgres psql -U shopuser -d shopdb -c "SELECT customer_name, product_name, quantity, total FROM orders;"
```

Kiểm tra Redis:

```bash
docker compose exec redis redis-cli HGETALL product:1
```

Nói:

> Order gọi Catalog để reserve stock rồi persist order của chính nó vào PostgreSQL.

## 4. Network boundary

Order thấy Catalog:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('catalog-service'))"
```

Order không thấy Redis:

```bash
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
```

Catalog không thấy PostgreSQL:

```bash
docker compose exec catalog-service node -e "require('dns').lookup('postgres',(e,a)=>console.log(e||a))"
```

## 5. Controlled experiment

PowerShell:

```powershell
docker network connect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
docker compose exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
docker network disconnect mini-shop-private_catalog-data-net $(docker compose ps -q order-service)
```

Nói:

> Em không sửa code và không restart container. Em chỉ thay network membership; khả năng service discovery thay đổi theo network.

---

# CASE 2 — Frontend + API public qua HTTPS ngrok

Trước demo cần điền `NGROK_AUTHTOKEN` trong `.env`.

## 6. Start public architecture

```bash
docker compose down
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
docker compose -f compose.public.yaml logs ngrok
```

Lấy URL dạng `https://xxxx.ngrok.app`.

Nói:

> Case 2 thay đổi public exposure boundary. ngrok là HTTPS edge, sau đó Gateway quyết định request đi tới frontend hay backend API.

## 7. Chứng minh frontend và API là hai destination ngang hàng

Website:

```text
https://xxxx.ngrok.app/
```

Catalog public API:

```bash
curl https://xxxx.ngrok.app/api/catalog/products
```

Order public API:

```bash
curl https://xxxx.ngrok.app/api/order/orders
```

Nói:

> Hai API request này đi ngrok -> Gateway -> backend. Frontend service không nằm trên đường request.

Flow:

```text
Browser -> HTTPS 443 -> ngrok -> Gateway -> Frontend
Postman -> HTTPS 443 -> ngrok -> Gateway -> Order/Catalog
```

## 8. Database vẫn private

```bash
docker compose -f compose.public.yaml exec order-service python -c "import socket; print(socket.gethostbyname('redis'))"
```

Vẫn fail vì public API không đồng nghĩa public datastore.

## Câu kết

> Case 1 chỉ public frontend application contract và giữ native backend APIs private. Case 2 intentionally public backend APIs cho external clients, nhưng mọi public traffic phải qua HTTPS ngrok và một Gateway riêng. Ở cả hai case, datastore ownership và Docker network segmentation vẫn được giữ nguyên.
