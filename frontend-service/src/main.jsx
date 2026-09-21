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
          borderRadius: 10,
          colorPrimary: '#1677ff'
        }
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
