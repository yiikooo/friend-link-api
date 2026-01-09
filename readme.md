# 友链自动化管理 API

基于 Express + Octokit 的友链自动化管理系统，支持友链申请、审核、自动创建 GitHub PR。

## 功能特性

- 友链申请提交
- 友链更新申请
- 邮件通知（申请通知、审核结果通知）
- 自动创建 GitHub PR
- 友链审核页面

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/friend-link-api.git
cd friend-link-api
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 4. 本地运行

```bash
npm run dev
```

### 5. 部署到 Vercel

```bash
vercel
```

## 环境变量说明

| 变量名       | 说明                         |
| ------------ | ---------------------------- |
| MONGODB_URI  | MongoDB 连接字符串           |
| GITHUB_TOKEN | GitHub Personal Access Token |
| GITHUB_OWNER | GitHub 用户名                |
| GITHUB_REPO  | 博客仓库名                   |
| ADMIN_EMAIL  | 管理员邮箱                   |
| API_DOMAIN   | API 域名                     |
| PR_PASSWORD  | 审核密码                     |
| SMTP_HOST    | SMTP 服务器地址              |
| SMTP_PORT    | SMTP 端口                    |
| SMTP_USER    | SMTP 用户名                  |
| SMTP_PASS    | SMTP 密码                    |

## API 接口

| 接口                      | 方法 | 说明             |
| ------------------------- | ---- | ---------------- |
| /api/friend/apply         | POST | 提交友链申请     |
| /api/friend/update-friend | POST | 提交友链更新申请 |
| /api/friend/list          | GET  | 获取申请列表     |
| /api/friend/detail        | GET  | 获取申请详情     |
| /api/friend/create-pr     | POST | 创建 PR          |
| /api/friend/reject        | POST | 拒绝申请         |
| /api/friend-review        | GET  | 审核页面         |

## License

MIT
