# 402ok-express

[English](./README.md)

支持 **XLayer 兼容**的 Express 中间件，实现 HTTP 402 支付必需协议，支持多网络区块链支付。

## 特性

- 🔥 **XLayer 兼容** - 完整支持 OKX XLayer 网络，原生集成 OKX facilitator
- ✅ **HTTP 402 支付必需** - 标准实现 x402 协议
- 🌐 **多网络支持** - XLayer、Base、Base Sepolia 以及任何 EVM 兼容网络
- 🔐 **OKX Facilitator** - 内置 OKX 签名认证，专为 XLayer 优化
- 🔌 **标准 Facilitator** - 支持 x402.org 及其他标准 facilitator
- 💳 **USDC 支付** - 基于 EIP-712 签名的 USDC 转账
- 🎯 **多支付选项** - 允许用户为每个端点选择首选网络
- ⚡ **完整生命周期** - 自动执行 verify → fulfill → settle 流程

## 为什么选择 XLayer？

XLayer 是 OKX 构建的 Layer 2 区块链，提供：
- 低交易费用
- 快速确认时间
- 与 OKX 生态系统无缝集成
- 原生 USDC 支持

本中间件提供 **一流的 XLayer 支持**，并优化了 OKX facilitator 集成。

## 安装

```bash
npm install 402ok-express
```

## 快速开始

### 基础用法（XLayer）

```typescript
import express from "express";
import { payment402Middleware } from "402ok-express";

const app = express();

// 配置 XLayer 支付中间件
app.use(
  payment402Middleware(
    "0xe8fb62154382af0812539cfe61b48321d8f846a8", // 你的钱包地址
    {
      "/premium-content": {
        price: "0.1",              // 0.1 USDC
        chainId: 196,              // XLayer 主网
        token: "0x74b7f16337b8972027f6196a17a631ac6de26d22", // XLayer 上的 USDC
        usdcName: "USD Coin",
        usdcVersion: "2",
        network: "xlayer",
        config: {
          description: "访问高级内容"
        }
      }
    },
    {
      xlayer: {
        url: "https://www.okx.com",
        type: "okx",
        okxCredentials: {
          apiKey: process.env.OKX_API_KEY,
          secretKey: process.env.OKX_SECRET_KEY,
          passphrase: process.env.OKX_PASSPHRASE
        }
      }
    }
  )
);

// 受保护的路由 - 需要支付
app.get("/premium-content", (req, res) => {
  res.json({
    message: "欢迎访问高级内容！",
    data: "..."
  });
});

app.listen(3000, () => {
  console.log("服务器已启动，启用 XLayer 支付保护");
});
```

### 多网络配置

允许用户使用 XLayer 或 Base Sepolia 支付：

```typescript
app.use(
  payment402Middleware(
    "0xe8fb62154382af0812539cfe61b48321d8f846a8",
    {
      "/api/protected": [
        // 选项 1: XLayer（推荐，手续费更低）
        {
          price: "0.1",
          chainId: 196,
          token: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
          usdcName: "USD Coin",
          usdcVersion: "2",
          network: "xlayer",
          config: {
            description: "使用 XLayer 支付（手续费更低）"
          }
        },
        // 选项 2: Base Sepolia
        {
          price: "0.1",
          chainId: 84532,
          token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          usdcName: "USDC",
          usdcVersion: "2",
          network: "base-sepolia",
          config: {
            description: "使用 Base Sepolia 支付"
          }
        }
      ]
    },
    {
      xlayer: {
        url: "https://www.okx.com",
        type: "okx",
        okxCredentials: {
          apiKey: process.env.OKX_API_KEY,
          secretKey: process.env.OKX_SECRET_KEY,
          passphrase: process.env.OKX_PASSPHRASE
        }
      },
      "base-sepolia": {
        url: "https://x402.org/facilitator",
        type: "standard"
      }
    }
  )
);
```

## 工作原理

1. **客户端请求受保护资源** → 服务器返回 402 支付必需
2. **客户端签名支付** → 创建 USDC 转账的 EIP-712 签名
3. **客户端发送带 X-Payment header 的请求** → 包含签名的支付
4. **中间件验证支付** → 调用 facilitator 验证签名
5. **中间件执行请求** → 执行你的路由处理器
6. **中间件结算支付** → 调用 facilitator 执行链上转账
7. **服务器返回 X-PAYMENT-RESPONSE header** → 包含结算确认

所有这些都是自动完成的！

## API 参考

### `payment402Middleware(sellerAddress, routeConfig, facilitatorConfig)`

创建用于处理 402 支付的 Express 中间件。

#### 参数

- **sellerAddress** `string` - 接收支付的以太坊地址
- **routeConfig** `RouteConfig` - 带有支付要求的路由配置
- **facilitatorConfig** `FacilitatorConfigs` - 每个网络的 facilitator 配置

#### 类型

```typescript
interface PaymentConfig {
  price: string;           // USDC 价格（例如 "0.1"）
  chainId: number;        // 网络链 ID
  token: string;          // USDC 代币合约地址
  usdcName: string;       // USDC 合约名称（用于 EIP-712）
  usdcVersion: string;    // USDC 合约版本（用于 EIP-712）
  network: string;        // 网络名称（例如 "xlayer"）
  config?: {
    description?: string;
    metadata?: Record<string, any>;
  };
}

interface RouteConfig {
  [route: string]: PaymentConfig | PaymentConfig[];  // 单个或多个选项
}

interface FacilitatorConfig {
  url: string;
  type?: "okx" | "standard";
  okxCredentials?: {
    apiKey: string;
    secretKey: string;
    passphrase: string;
    project?: string;
  };
}

type FacilitatorConfigs = { [network: string]: FacilitatorConfig };
```

## 支持的网络

### XLayer（推荐）
- **主网**: Chain ID `196`
- **测试网**: Chain ID `195`
- **USDC 合约**: `0x74b7f16337b8972027f6196a17a631ac6de26d22`（主网）
- **Facilitator**: 带 API 认证的 OKX facilitator

### 其他网络
- **Base**: 标准 facilitator
- **Base Sepolia**: 标准 facilitator
- **任何支持 USDC 的 EVM 兼容网络**

## 获取 OKX 凭证

要使用 XLayer 和 OKX facilitator：

1. 在 https://www.okx.com 创建 OKX 账户
2. 进入 API 设置
3. 创建具有 x402 权限的 API 密钥
4. 将 API Key、Secret Key 和 Passphrase 复制到你的 `.env`：

```env
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
```

## 示例

查看 [examples](./examples) 目录获取完整示例：
- XLayer 单一支付
- 多网络支付选项
- 自定义支付验证

## 客户端集成

用户需要兼容 x402 的客户端来进行支付。使用 `x402-fetch` 的示例：

```typescript
import { createPaymentHeader } from "x402-fetch";

// 请求受保护资源
const response = await fetch("http://localhost:3000/premium-content");

if (response.status === 402) {
  const paymentRequired = await response.json();

  // 用户签名支付（使用他们的钱包）
  const paymentHeader = await createPaymentHeader(paymentRequired.accepts[0]);

  // 带支付重试
  const paidResponse = await fetch("http://localhost:3000/premium-content", {
    headers: {
      "X-Payment": paymentHeader
    }
  });

  const content = await paidResponse.json();
}
```

## 安全性

- 所有支付的 EIP-712 签名验证
- Facilitator 双重验证（verify + settle）
- 无需直接区块链访问
- 仅在请求成功时自动结算支付

## 许可证

MIT

## 链接

- [XLayer 官方网站](https://www.okx.com/xlayer)
- [x402 协议](https://x402.org)
- [GitHub 仓库](https://github.com/payincom/402ok-express)
