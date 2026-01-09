import express from 'express';
import api from './src/api/@router.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const app = express();

// CORS 配置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 视图引擎配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'static')));

// 请求日志
app.use((req, res, next) => {
  console.log(`[${req.method}]`, req.url);
  next();
});

app.use(express.json());

// API 路由
app.use('/api', api);

app.get('/', (req, res) => {
  res.send('Friend Link API Service');
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`app listening on http://localhost:${port}`);
});

export default app;
