import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Layout,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail || data?.message || ('HTTP ' + response.status);
    throw new Error(detail);
  }

  return data;
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

function ServiceCard({ name, description, state }) {
  const healthy = state === 'ok';

  return (
    <Card className="service-card" size="small">
      <Space direction="vertical" size={6}>
        <Space>
          <Text strong>{name}</Text>
          <Tag color={healthy ? 'success' : state === 'checking' ? 'processing' : 'error'}>
            {state === 'checking' ? 'CHECKING' : healthy ? 'HEALTHY' : 'DOWN'}
          </Tag>
        </Space>
        <Text type="secondary">{description}</Text>
      </Space>
    </Card>
  );
}

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [customerForm] = Form.useForm();
  const [orderForm] = Form.useForm();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [health, setHealth] = useState({
    frontend: 'checking',
    customer: 'checking',
    catalog: 'checking',
    order: 'checking'
  });
  const [loading, setLoading] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  const healthTargets = useMemo(
    () => [
      ['frontend', '/health'],
      ['customer', '/api/customer/health'],
      ['catalog', '/api/catalog/health'],
      ['order', '/api/order/health']
    ],
    []
  );

  async function refreshHealth() {
    const next = {};

    await Promise.all(
      healthTargets.map(async ([key, url]) => {
        try {
          const data = await requestJson(url);
          next[key] = data?.status === 'ok' ? 'ok' : 'down';
        } catch {
          next[key] = 'down';
        }
      })
    );

    setHealth(next);
  }

  async function refreshData(showMessage = false) {
    setLoading(true);

    const [customerResult, productResult, orderResult] = await Promise.allSettled([
      requestJson('/api/customer/customers'),
      requestJson('/api/catalog/products'),
      requestJson('/api/order/orders')
    ]);

    if (customerResult.status === 'fulfilled') setCustomers(customerResult.value);
    if (productResult.status === 'fulfilled') setProducts(productResult.value);
    if (orderResult.status === 'fulfilled') setOrders(orderResult.value);

    const failed = [customerResult, productResult, orderResult].some(
      (item) => item.status === 'rejected'
    );

    if (showMessage) {
      if (failed) messageApi.warning('Một số service chưa phản hồi.');
      else messageApi.success('Đã tải lại dữ liệu.');
    }

    setLoading(false);
  }

  async function refreshAll(showMessage = false) {
    await Promise.all([refreshHealth(), refreshData(showMessage)]);
  }

  useEffect(() => {
    refreshAll(false);
  }, []);

  async function createCustomer(values) {
    setCreatingCustomer(true);

    try {
      await requestJson('/api/customer/customers', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      customerForm.resetFields();
      messageApi.success('Đã tạo customer.');
      await refreshData(false);
    } catch (error) {
      messageApi.error(error.message);
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function createOrder(values) {
    setCreatingOrder(true);

    try {
      await requestJson('/api/order/orders', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      orderForm.resetFields();
      messageApi.success('Đã tạo order. Stock của product đã được cập nhật.');
      await refreshData(false);
    } catch (error) {
      messageApi.error(error.message);
    } finally {
      setCreatingOrder(false);
    }
  }

  const customerColumns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Created',
      dataIndex: 'created_at',
      render: (value) => (value ? new Date(value).toLocaleString() : '-')
    }
  ];

  const productColumns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: 'Product', dataIndex: 'name' },
    {
      title: 'Price',
      dataIndex: 'price',
      render: (value) => money.format(value)
    },
    {
      title: 'Stock',
      dataIndex: 'stock',
      render: (value) => (
        <Tag color={value > 5 ? 'success' : value > 0 ? 'warning' : 'error'}>{value}</Tag>
      )
    }
  ];

  const orderColumns = [
    {
      title: 'Order ID',
      dataIndex: 'id',
      ellipsis: true,
      width: 180
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      render: (value) => value?.name || '-'
    },
    {
      title: 'Product',
      dataIndex: 'product',
      render: (value) => value?.name || '-'
    },
    { title: 'Qty', dataIndex: 'quantity', width: 70 },
    {
      title: 'Total',
      dataIndex: 'total',
      render: (value) => money.format(value || 0)
    }
  ];

  return (
    <Layout className="page-shell">
      {contextHolder}

      <Header className="topbar">
        <div>
          <div className="eyebrow">DOCKER COMPOSE DEMO</div>
          <Title level={3} className="header-title">
            Mini Shop Microservices
          </Title>
        </div>
        <Button onClick={() => refreshAll(true)} loading={loading}>
          Refresh all
        </Button>
      </Header>

      <Content className="content">
        <Alert
          type="info"
          showIcon
          message="Luồng network của frontend"
          description="Browser -> localhost:3000 -> frontend-service (Nginx) -> customer-service / catalog-service / order-service qua service-net và Docker DNS."
        />

        <Title level={4}>Service health</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <ServiceCard
              name="frontend-service"
              description="React + Ant Design + Nginx"
              state={health.frontend}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <ServiceCard
              name="customer-service"
              description="FastAPI -> PostgreSQL"
              state={health.customer}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <ServiceCard
              name="catalog-service"
              description="Express -> Redis"
              state={health.catalog}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <ServiceCard
              name="order-service"
              description="FastAPI -> Customer + Catalog"
              state={health.order}
            />
          </Col>
        </Row>

        <Divider />

        <Row gutter={[20, 20]}>
          <Col xs={24} xl={10}>
            <Card title="Create customer">
              <Form layout="vertical" form={customerForm} onFinish={createCustomer}>
                <Form.Item
                  label="Name"
                  name="name"
                  rules={[{ required: true, message: 'Nhập tên customer' }]}
                >
                  <Input placeholder="Nguyen Van An" />
                </Form.Item>

                <Form.Item
                  label="Email"
                  name="email"
                  rules={[
                    { required: true, message: 'Nhập email' },
                    { type: 'email', message: 'Email không hợp lệ' }
                  ]}
                >
                  <Input placeholder="an@example.com" />
                </Form.Item>

                <Button type="primary" htmlType="submit" loading={creatingCustomer}>
                  Create customer
                </Button>
              </Form>
            </Card>
          </Col>

          <Col xs={24} xl={14}>
            <Card title="Customers">
              <Table
                rowKey="id"
                loading={loading}
                dataSource={customers}
                columns={customerColumns}
                pagination={false}
                scroll={{ x: 650 }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[20, 20]} className="section-row">
          <Col xs={24} xl={14}>
            <Card title="Catalog / Redis stock">
              <Table
                rowKey="id"
                loading={loading}
                dataSource={products}
                columns={productColumns}
                pagination={false}
              />
            </Card>
          </Col>

          <Col xs={24} xl={10}>
            <Card title="Create order">
              <Paragraph type="secondary">
                Request đi vào Order Service. Order sẽ gọi Customer và Catalog bằng service
                name bên trong Docker network.
              </Paragraph>

              <Form layout="vertical" form={orderForm} onFinish={createOrder}>
                <Form.Item
                  label="Customer"
                  name="customer_id"
                  rules={[{ required: true, message: 'Chọn customer' }]}
                >
                  <Select
                    placeholder="Chọn customer"
                    options={customers.map((customer) => ({
                      label: customer.name + ' (#' + customer.id + ')',
                      value: customer.id
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  label="Product"
                  name="product_id"
                  rules={[{ required: true, message: 'Chọn product' }]}
                >
                  <Select
                    placeholder="Chọn product"
                    options={products.map((product) => ({
                      label:
                        product.name +
                        ' - ' +
                        money.format(product.price) +
                        ' - stock ' +
                        product.stock,
                      value: product.id,
                      disabled: product.stock <= 0
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  label="Quantity"
                  name="quantity"
                  initialValue={1}
                  rules={[{ required: true, message: 'Nhập quantity' }]}
                >
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                </Form.Item>

                <Button
                  type="primary"
                  htmlType="submit"
                  loading={creatingOrder}
                  disabled={!customers.length || !products.length}
                >
                  Create order
                </Button>
              </Form>
            </Card>
          </Col>
        </Row>

        <Card title="Orders (in-memory)" className="section-row">
          <Paragraph type="secondary">
            Order data cố tình lưu trong memory để demo: sau docker compose down rồi up lại,
            customer vẫn còn nhờ PostgreSQL volume nhưng orders sẽ mất.
          </Paragraph>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={orders}
            columns={orderColumns}
            pagination={false}
            scroll={{ x: 720 }}
          />
        </Card>
      </Content>

      <Footer className="footer">
        React + Ant Design frontend served by Nginx inside Docker Compose
      </Footer>
    </Layout>
  );
}
