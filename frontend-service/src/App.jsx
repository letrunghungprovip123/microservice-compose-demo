import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Layout,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message
} from 'antd';
import { api, endpoints, requestJson } from './api';

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

const serviceRegistry = {
  frontend: {
    label: 'frontend-service',
    subtitle: 'React + Ant Design + Nginx',
    color: 'blue'
  },
  customer: {
    label: 'customer-service',
    subtitle: 'FastAPI → PostgreSQL',
    color: 'cyan'
  },
  catalog: {
    label: 'catalog-service',
    subtitle: 'Express → Redis',
    color: 'purple'
  },
  order: {
    label: 'order-service',
    subtitle: 'FastAPI → Customer + Catalog',
    color: 'geekblue'
  }
};

function statusTag(status) {
  if (status === 'ok') return <Tag color="success">HEALTHY</Tag>;
  if (status === 'degraded') return <Tag color="warning">DEGRADED</Tag>;
  if (status === 'checking') return <Tag color="processing">CHECKING</Tag>;
  return <Tag color="error">DOWN</Tag>;
}

function ServiceStatusCard({ serviceKey, health, info }) {
  const meta = serviceRegistry[serviceKey];
  const currentStatus = health?.status || 'checking';

  return (
    <Card className="service-card" bordered={false}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div className="service-card-header">
          <Tag color={meta.color}>{meta.label}</Tag>
          {statusTag(currentStatus)}
        </div>
        <Text strong>{meta.subtitle}</Text>
        <Text type="secondary" className="service-description">
          {info?.responsibility || 'Loading service metadata...'}
        </Text>
        <div className="service-meta-line">
          <Text type="secondary">Port</Text>
          <Text code>{info?.container_port ?? '—'}</Text>
        </div>
        <div className="service-meta-line">
          <Text type="secondary">Networks</Text>
          <Text>{info?.networks?.join(', ') || '—'}</Text>
        </div>
      </Space>
    </Card>
  );
}

function ArchitecturePanel() {
  return (
    <Card title="Request flow & Docker network" bordered={false}>
      <div className="architecture-flow">
        <div className="architecture-node browser-node">
          <Text strong>Browser</Text>
          <Text type="secondary">Host machine</Text>
        </div>
        <div className="architecture-arrow">↓ localhost:3000</div>
        <div className="architecture-node frontend-node">
          <Text strong>frontend-service</Text>
          <Text type="secondary">React build + Nginx reverse proxy</Text>
        </div>
        <div className="architecture-arrow">↓ service-net · Docker DNS</div>
        <div className="architecture-backends">
          <div className="architecture-node">
            <Text strong>customer-service:8001</Text>
            <Text type="secondary">data-net → postgres:5432</Text>
          </div>
          <div className="architecture-node order-node">
            <Text strong>order-service:8003</Text>
            <Text type="secondary">REST → Customer + Catalog</Text>
          </div>
          <div className="architecture-node">
            <Text strong>catalog-service:8002</Text>
            <Text type="secondary">cache-net → redis:6379</Text>
          </div>
        </div>
      </div>
      <Alert
        className="architecture-note"
        type="info"
        showIcon
        message="Điểm trình bày"
        description="Browser không resolve được Docker service name. Browser chỉ gọi localhost:3000; Nginx nằm trong frontend container mới gọi customer-service, catalog-service và order-service bằng Docker DNS."
      />
    </Card>
  );
}

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [customerForm] = Form.useForm();
  const [orderForm] = Form.useForm();

  const [health, setHealth] = useState({
    frontend: { status: 'checking' },
    customer: { status: 'checking' },
    catalog: { status: 'checking' },
    order: { status: 'checking' }
  });
  const [info, setInfo] = useState({});
  const [dependencies, setDependencies] = useState({});
  const [stats, setStats] = useState({});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadHealth() {
    const targets = Object.entries({
      frontend: endpoints.frontend.health,
      customer: endpoints.customer.health,
      catalog: endpoints.catalog.health,
      order: endpoints.order.health
    });
    const results = await Promise.allSettled(
      targets.map(([, url]) => requestJson(url))
    );
    const next = {};
    results.forEach((result, index) => {
      const key = targets[index][0];
      next[key] =
        result.status === 'fulfilled'
          ? result.value
          : { status: 'down', error: result.reason?.message || 'Request failed' };
    });
    setHealth(next);
  }

  async function loadInfo() {
    const targets = Object.entries({
      frontend: endpoints.frontend.info,
      customer: endpoints.customer.info,
      catalog: endpoints.catalog.info,
      order: endpoints.order.info
    });
    const results = await Promise.allSettled(
      targets.map(([, url]) => requestJson(url))
    );
    const next = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') next[targets[index][0]] = result.value;
    });
    setInfo(next);
  }

  async function loadDependencies() {
    const targets = Object.entries({
      customer: endpoints.customer.dependencies,
      catalog: endpoints.catalog.dependencies,
      order: endpoints.order.dependencies
    });
    const results = await Promise.allSettled(
      targets.map(([, url]) => requestJson(url))
    );
    const next = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') next[targets[index][0]] = result.value;
    });
    setDependencies(next);
  }

  async function loadStats() {
    const targets = Object.entries({
      customer: endpoints.customer.stats,
      catalog: endpoints.catalog.stats,
      order: endpoints.order.stats
    });
    const results = await Promise.allSettled(
      targets.map(([, url]) => requestJson(url))
    );
    const next = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') next[targets[index][0]] = result.value;
    });
    setStats(next);
  }

  async function loadBusinessData() {
    const results = await Promise.allSettled([
      requestJson(endpoints.customer.customers),
      requestJson(endpoints.catalog.products),
      requestJson(endpoints.order.orders)
    ]);
    if (results[0].status === 'fulfilled') setCustomers(results[0].value);
    if (results[1].status === 'fulfilled') setProducts(results[1].value);
    if (results[2].status === 'fulfilled') setOrders(results[2].value);
    return results.some((result) => result.status === 'rejected');
  }

  async function refreshAll(showToast = false) {
    setLoading(true);
    const [, , , businessFailed] = await Promise.all([
      loadHealth(),
      loadInfo(),
      loadDependencies(),
      loadBusinessData()
    ]);
    await loadStats();
    setLastUpdated(new Date());
    setLoading(false);

    if (showToast) {
      if (businessFailed) messageApi.warning('Một số service chưa phản hồi.');
      else messageApi.success('Đã đồng bộ toàn bộ dữ liệu demo.');
    }
  }

  useEffect(() => {
    refreshAll(false);
    const timer = window.setInterval(() => {
      Promise.all([loadHealth(), loadDependencies()]).then(() => setLastUpdated(new Date()));
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  async function createCustomer(values) {
    setCreatingCustomer(true);
    try {
      await api.createCustomer(values);
      customerForm.resetFields();
      messageApi.success('Customer đã được ghi xuống PostgreSQL.');
      await Promise.all([loadBusinessData(), loadStats()]);
    } catch (error) {
      messageApi.error(error.message);
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function createOrder(values) {
    setCreatingOrder(true);
    try {
      const order = await api.createOrder(values);
      orderForm.resetFields();
      orderForm.setFieldValue('quantity', 1);
      messageApi.success(
        `Order thành công. Stock còn lại: ${order.remaining_stock ?? 'n/a'}`
      );
      await Promise.all([loadBusinessData(), loadStats(), loadDependencies()]);
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
      render: (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—')
    }
  ];

  const productColumns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: 'Product', dataIndex: 'name' },
    { title: 'Price', dataIndex: 'price', render: (value) => money.format(value) },
    {
      title: 'Stock',
      dataIndex: 'stock',
      render: (value) => (
        <Tag color={value > 5 ? 'success' : value > 0 ? 'warning' : 'error'}>
          {value}
        </Tag>
      )
    }
  ];

  const orderColumns = [
    { title: 'Order ID', dataIndex: 'id', ellipsis: true, width: 170 },
    {
      title: 'Customer',
      dataIndex: 'customer',
      render: (value) => value?.name || '—'
    },
    {
      title: 'Product',
      dataIndex: 'product',
      render: (value) => value?.name || '—'
    },
    { title: 'Qty', dataIndex: 'quantity', width: 70 },
    { title: 'Total', dataIndex: 'total', render: (value) => money.format(value || 0) },
    {
      title: 'Stock left',
      dataIndex: 'remaining_stock',
      width: 100,
      render: (value) => (value ?? '—')
    }
  ];

  const dependencyRows = useMemo(() => {
    const rows = [];
    const networkBySource = {
      customer: 'data-net',
      catalog: 'cache-net',
      order: 'service-net'
    };
    Object.entries(dependencies).forEach(([source, payload]) => {
      (payload?.dependencies || []).forEach((dependency, index) => {
        rows.push({
          key: `${source}-${dependency.name}-${index}`,
          source: serviceRegistry[source]?.label || source,
          target: dependency.target,
          network: networkBySource[source],
          status: dependency.status,
          latency_ms: dependency.latency_ms
        });
      });
    });
    return rows;
  }, [dependencies]);

  const dependencyColumns = [
    { title: 'Source', dataIndex: 'source' },
    { title: 'Target', dataIndex: 'target', render: (value) => <Text code>{value}</Text> },
    { title: 'Network', dataIndex: 'network', render: (value) => <Tag>{value}</Tag> },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (value) => statusTag(value)
    },
    {
      title: 'Latency',
      dataIndex: 'latency_ms',
      render: (value) => (value === undefined ? '—' : `${value} ms`)
    }
  ];

  const serviceInfoRows = Object.entries(serviceRegistry).map(([key, meta]) => ({
    key,
    service: meta.label,
    runtime: info[key]?.runtime || '—',
    port: info[key]?.container_port || '—',
    networks: info[key]?.networks?.join(', ') || '—',
    persistence: info[key]?.persistence || '—'
  }));

  const serviceInfoColumns = [
    { title: 'Service', dataIndex: 'service', render: (value) => <Text strong>{value}</Text> },
    { title: 'Runtime', dataIndex: 'runtime' },
    { title: 'Port', dataIndex: 'port', render: (value) => <Text code>{value}</Text> },
    { title: 'Networks', dataIndex: 'networks' },
    { title: 'State / Persistence', dataIndex: 'persistence' }
  ];

  const dashboard = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        {Object.keys(serviceRegistry).map((key) => (
          <Col xs={24} sm={12} xl={6} key={key}>
            <ServiceStatusCard serviceKey={key} health={health[key]} info={info[key]} />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <Card bordered={false}><Statistic title="Customers" value={stats.customer?.customer_count || 0} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card bordered={false}><Statistic title="Products" value={stats.catalog?.product_count || 0} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card bordered={false}><Statistic title="Units in stock" value={stats.catalog?.total_stock || 0} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card bordered={false}><Statistic title="Orders" value={stats.order?.order_count || 0} /></Card>
        </Col>
        <Col xs={24} md={8} xl={8}>
          <Card bordered={false}>
            <Statistic
              title="Order gross total (in-memory)"
              value={stats.order?.gross_total || 0}
              precision={2}
              prefix="$"
            />
          </Card>
        </Col>
      </Row>

      <ArchitecturePanel />
    </Space>
  );

  const customersTab = (
    <Row gutter={[20, 20]}>
      <Col xs={24} lg={8}>
        <Card title="Create customer" bordered={false}>
          <Paragraph type="secondary">
            Frontend → Nginx → <Text code>customer-service:8001</Text> → PostgreSQL.
          </Paragraph>
          <Form layout="vertical" form={customerForm} onFinish={createCustomer}>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, whitespace: true, message: 'Nhập tên customer' }]}
            >
              <Input placeholder="Nguyen Van An" />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Nhập email' },
                { type: 'email', message: 'Email không hợp lệ' }
              ]}
            >
              <Input placeholder="an@example.com" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={creatingCustomer} block>
              Create customer
            </Button>
          </Form>
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        <Card title="Customer data — PostgreSQL volume" bordered={false}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={customers}
            columns={customerColumns}
            pagination={false}
            scroll={{ x: 680 }}
          />
        </Card>
      </Col>
    </Row>
  );

  const catalogTab = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Alert
        showIcon
        type="success"
        message="Catalog state nằm trong Redis"
        description="Tạo order sẽ gọi Catalog reserve API và giảm stock. Redis dùng AOF + named volume nên stock survive container recreation."
      />
      <Card title="Product catalog" bordered={false}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={products}
          columns={productColumns}
          pagination={false}
        />
      </Card>
    </Space>
  );

  const ordersTab = (
    <Row gutter={[20, 20]}>
      <Col xs={24} xl={9}>
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <Card title="Create order" bordered={false}>
            <Form
              layout="vertical"
              form={orderForm}
              onFinish={createOrder}
              initialValues={{ quantity: 1 }}
            >
              <Form.Item
                name="customer_id"
                label="Customer"
                rules={[{ required: true, message: 'Chọn customer' }]}
              >
                <Select
                  placeholder="Select customer"
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: `${customer.name} (#${customer.id})`
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="product_id"
                label="Product"
                rules={[{ required: true, message: 'Chọn product' }]}
              >
                <Select
                  placeholder="Select product"
                  options={products.map((product) => ({
                    value: product.id,
                    disabled: product.stock <= 0,
                    label: `${product.name} · ${money.format(product.price)} · stock ${product.stock}`
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="quantity"
                label="Quantity"
                rules={[{ required: true, message: 'Nhập quantity' }]}
              >
                <InputNumber min={1} max={100} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={creatingOrder}
                disabled={!customers.length || !products.length}
                block
              >
                Create order
              </Button>
            </Form>
          </Card>

          <Card title="What happens behind one click?" bordered={false}>
            <Timeline
              items={[
                { children: 'Browser POST /api/order/orders to frontend origin' },
                { children: 'Nginx proxy → order-service:8003 via service-net' },
                { children: 'Order GET → customer-service:8001' },
                { children: 'Order GET + POST reserve → catalog-service:8002' },
                { children: 'Catalog updates Redis stock and Order stores result in memory' }
              ]}
            />
          </Card>
        </Space>
      </Col>
      <Col xs={24} xl={15}>
        <Card title="Orders — intentionally in-memory" bordered={false}>
          <Alert
            type="warning"
            showIcon
            className="inline-alert"
            message="Persistence demo"
            description="Sau docker compose down/up, customer và Redis stock vẫn còn nhờ named volumes; danh sách order về rỗng vì Order Service lưu trong RAM."
          />
          <Table
            rowKey="id"
            loading={loading}
            dataSource={orders}
            columns={orderColumns}
            pagination={false}
            scroll={{ x: 820 }}
          />
        </Card>
      </Col>
    </Row>
  );

  const networkingTab = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Alert
        showIcon
        type="info"
        message="Host address khác container-to-container address"
        description="Host dùng localhost + published port. Container gọi nhau bằng Docker service name + container port. Ví dụ browser dùng localhost:3000, còn Nginx gọi customer-service:8001."
      />

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={10}>
          <Card title="Network segmentation" bordered={false}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                {
                  key: 'service-net',
                  label: 'service-net',
                  children: 'frontend, customer, catalog, order'
                },
                {
                  key: 'data-net',
                  label: 'data-net',
                  children: 'customer, postgres, adminer(optional)'
                },
                {
                  key: 'cache-net',
                  label: 'cache-net',
                  children: 'catalog, redis'
                }
              ]}
            />
            <Divider />
            <Paragraph>
              <Badge status="success" /> Order → Customer / Catalog: allowed on <Text code>service-net</Text>
            </Paragraph>
            <Paragraph>
              <Badge status="error" /> Order → PostgreSQL / Redis: no shared network, intentionally isolated
            </Paragraph>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="Live dependency probes" bordered={false}>
            <Table
              size="small"
              dataSource={dependencyRows}
              columns={dependencyColumns}
              pagination={false}
              scroll={{ x: 650 }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Service metadata returned by each container" bordered={false}>
        <Table
          size="small"
          dataSource={serviceInfoRows}
          columns={serviceInfoColumns}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>
    </Space>
  );

  const tabs = [
    { key: 'dashboard', label: 'Overview', children: dashboard },
    { key: 'customers', label: 'Customers', children: customersTab },
    { key: 'catalog', label: 'Catalog', children: catalogTab },
    { key: 'orders', label: 'Orders', children: ordersTab },
    { key: 'networking', label: 'Networking', children: networkingTab }
  ];

  return (
    <Layout className="page-shell">
      {contextHolder}
      <Header className="topbar">
        <div>
          <div className="eyebrow">DOCKER COMPOSE · MICROSERVICES DEMO</div>
          <Title level={2} className="header-title">Mini Shop Control Center</Title>
          <Space size={6} wrap>
            <Tag color="blue">React</Tag>
            <Tag color="geekblue">Ant Design</Tag>
            <Tag color="cyan">Nginx</Tag>
            <Tag color="purple">Docker Compose</Tag>
          </Space>
        </div>
        <Space direction="vertical" align="end" size={4}>
          <Button type="primary" onClick={() => refreshAll(true)} loading={loading}>
            Refresh all
          </Button>
          <Text type="secondary" className="last-updated">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('vi-VN')}` : 'Loading...'}
          </Text>
        </Space>
      </Header>

      <Content className="content">
        <Tabs items={tabs} defaultActiveKey="dashboard" size="large" />
      </Content>

      <Footer className="footer">
        Mini Shop · Frontend served by Nginx · Backend communication through Docker service discovery
      </Footer>
    </Layout>
  );
}
