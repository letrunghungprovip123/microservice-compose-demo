# Frontend Service

Frontend presentation dashboard cho Mini Shop microservices.

## Stack

- React 18
- Ant Design 5
- Vite
- Nginx (runtime container)

## Docker mode

`Dockerfile` dùng multi-stage build:

```text
node:22-alpine
  -> npm install
  -> vite build
  -> dist/
  -> nginx:1.27-alpine
```

Compose publish:

```text
localhost:3000 -> frontend-service:80
```

Frontend container nằm trong `service-net`.

## Reverse proxy

Browser chỉ gọi cùng origin:

```text
/api/customer/*
/api/catalog/*
/api/order/*
```

Nginx proxy tới:

```text
/api/customer/* -> customer-service:8001
/api/catalog/*  -> catalog-service:8002
/api/order/*    -> order-service:8003
```

Nginx dùng Docker embedded DNS `127.0.0.11` và re-resolve service names để tránh phụ thuộc vào container IP cố định.

## Dashboard tabs

- Overview
- Customers
- Catalog
- Orders
- Networking

Dashboard đọc các endpoint:

```text
/health
/info
/dependencies
/stats
```

của các backend để trình bày health, topology và dependency connectivity.

## Local development

Khởi động backend bằng Docker:

```bash
docker compose up -d postgres redis customer-service catalog-service order-service
```

Sau đó:

```bash
cd frontend-service
npm install
npm run dev
```

Mở:

```text
http://localhost:5173
```

Vite proxy tới backend đã publish trên host:

```text
localhost:8001
localhost:8002
localhost:8003
```

## Production/demo build

```bash
docker compose up -d --build frontend-service
```

Mở `http://localhost:3000`.
