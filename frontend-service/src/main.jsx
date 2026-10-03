import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import 'antd/dist/reset.css';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorBgLayout: '#f3f6fb',
          borderRadius: 12,
          fontSize: 14
        },
        components: {
          Card: {
            headerFontSize: 15
          },
          Table: {
            headerBg: '#f8fafc'
          }
        }
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
