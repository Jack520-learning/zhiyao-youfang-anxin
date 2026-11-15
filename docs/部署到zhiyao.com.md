# 部署到 zhiyao.com

## 前置条件

1. 拥有 `zhiyao.com` 的 DNS 管理权限。
2. 准备一台具有公网 IPv4 地址的云服务器。
3. 云服务器安全组和系统防火墙开放 TCP `80`、TCP `443` 和 UDP `443`。
4. 安装 Docker Engine 与 Docker Compose。

当前域名使用 `ns1.4.cn` 至 `ns4.4.cn`。需要在域名当前 DNS 服务商中新增：

```text
类型：A
主机记录：@
记录值：<云服务器公网 IPv4>
```

如服务器具有固定 IPv6，可同时添加 `AAAA` 记录。

## 配置

在服务器项目目录中创建 `.env`，至少填写：

```dotenv
PORT=8788
APP_ORIGIN=https://zhiyao.com
VAPID_CONTACT=mailto:你的联系邮箱
DASHSCOPE_API_KEY=你的服务端密钥
```

密钥只保留在服务器 `.env` 中，不提交到 Git。

## 启动

```bash
docker compose up -d --build
docker compose ps
```

Caddy 会在 DNS 正确且 80/443 端口可达后，自动申请并续期 HTTPS 证书。

## 验证

```bash
curl -I https://zhiyao.com
curl https://zhiyao.com/api/health
```

预期首页返回 `200`，健康检查返回 `{"ok":true,"aiConfigured":true}`。
