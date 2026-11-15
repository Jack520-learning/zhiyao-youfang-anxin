# MCP 工具接口

服务端提供基于 HTTP JSON-RPC 2.0 的 MCP 工具接口：

```text
POST /api/mcp
Authorization: Bearer <登录后返回的 token>
Content-Type: application/json
```

## 初始化

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "clientInfo": { "name": "demo-client", "version": "1.0.0" }
  }
}
```

## 工具列表

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

当前工具：

- `get_active_medications`
- `get_medication_schedule`
- `get_family_risk_summary`
- `get_emergency_contacts`

## 调用工具

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_active_medications",
    "arguments": {
      "familyCode": "ABCDEF"
    }
  }
}
```

服务端会校验登录账号是否关联对应家庭连接码。返回结果同时包含文本内容和 `structuredContent`，便于通用 MCP 客户端或自定义 Agent 读取。

## 安全边界

- MCP 工具只读取已授权的家庭摘要；
- 不提供停药、改剂量或补服决策；
- 高风险问题仍应联系医生、药师或 120。
