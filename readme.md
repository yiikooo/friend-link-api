# 友链自动化管理 API

基于 Express + Octokit 的友链自动化管理系统，支持友链申请、审核、自动创建 GitHub PR。

## 功能特性

- 友链申请提交
- 友链更新申请
- 邮件通知（申请通知、审核结果通知）
- 自动创建 GitHub PR
- 友链审核页面

## 一键部署

点击下方按钮即可部署到 Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyiikooo%2Ffriend-link-api&env=MONGODB_URI,GITHUB_TOKEN,GITHUB_REPO,ADMIN_EMAIL,API_DOMAIN,PR_PASSWORD,SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS)

### 环境变量配置

| 变量名       | 说明                                           | 示例                                           |
| ------------ | ---------------------------------------------- | ---------------------------------------------- |
| MONGODB_URI  | MongoDB 连接字符串                             | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| GITHUB_TOKEN | GitHub Personal Access Token（需要 repo 权限） | `ghp_xxxxxxxxxxxx`                             |
| GITHUB_REPO  | GitHub 仓库（格式：owner/repo）                | `username/blog-repo`                           |
| ADMIN_EMAIL  | 管理员邮箱（接收友链申请通知）                 | `admin@example.com`                            |
| API_DOMAIN   | API 域名（用于生成审核链接）                   | `https://your-api.vercel.app`                  |
| PR_PASSWORD  | 审核密码                                       | `your-secure-password`                         |
| SMTP_HOST    | SMTP 服务器地址                                | `smtp.example.com`                             |
| SMTP_PORT    | SMTP 端口                                      | `465`                                          |
| SMTP_USER    | SMTP 用户名                                    | `user@example.com`                             |
| SMTP_PASS    | SMTP 密码                                      | `your-smtp-password`                           |

## 本地开发

```bash
# 克隆项目
git clone https://github.com/yiikooo/friend-link-api.git
cd friend-link-api

# 安装依赖
npm install

# 配置 .env 文件后运行
npm run dev
```

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
