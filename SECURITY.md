# 安全与密钥处理

## 本地密钥

- 模型密钥只允许保存在项目根目录的 `.env`。
- `.env`、`.env.local`、`*.pem`、`*.key` 和 `secrets/` 均已加入 `.gitignore`。
- 仓库只提交 `.env.example`，其中不得填写真实密钥。
- 服务端通过环境变量读取密钥，浏览器端不会接触密钥。

## 提交 GitHub 前

```bash
git check-ignore -v .env
git ls-files '.env*'
git grep -lE 'sk-[A-Za-z0-9_-]{20,}'
```

期望结果：

- `.env` 被 `.gitignore` 命中；
- `git ls-files '.env*'` 最多只显示 `.env.example`；
- 密钥扫描命令没有输出。

## 如果密钥曾被公开

只要密钥曾出现在截图、聊天、公开仓库或日志中，就应视为已经泄露：

1. 立即在模型服务商控制台撤销旧密钥；
2. 创建新密钥；
3. 只写入本地 `.env` 或部署平台的环境变量；
4. 检查 Git 历史中是否出现过密钥；
5. 必要时使用专门的历史清理工具处理 Git 历史。

删除当前文件并不能自动清除 Git 历史中的密钥。

