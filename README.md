# 402ok-express

[中文文档](./README.zh-CN.md)

Express middleware for HTTP 402 Payment Required protocol with **XLayer-compatible** multi-network blockchain payment support.

## Features

- 🔥 **XLayer Compatible** - Full support for OKX XLayer network with native facilitator integration
- ✅ **HTTP 402 Payment Required** - Standard implementation of the x402 protocol
- 🌐 **Multi-Network Support** - XLayer, Base, Base Sepolia, and any EVM-compatible networks
- 🔐 **OKX Facilitator** - Built-in OKX signature authentication for XLayer
- 🔌 **Standard Facilitator** - Support for x402.org and other standard facilitators
- 💳 **USDC Payments** - EIP-712 signature-based USDC transfers
- 🎯 **Multiple Payment Options** - Allow users to choose their preferred network per endpoint
- ⚡ **Complete Lifecycle** - Automatic verify → fulfill → settle flow

## Why XLayer?

XLayer is a Layer 2 blockchain built by OKX, offering:
- Low transaction fees
- Fast confirmation times
- Seamless integration with OKX ecosystem
- Native USDC support

This middleware provides **first-class XLayer support** with optimized OKX facilitator integration.

## Installation

```bash
npm install 402ok-express
```

## Quick Start

### Basic Usage with XLayer

```typescript
import express from "express";
import { payment402Middleware } from "402ok-express";

const app = express();

// Configure payment middleware with XLayer
app.use(
  payment402Middleware(
    "0xe8fb62154382af0812539cfe61b48321d8f846a8", // Your wallet address
    {
      "/premium-content": {
        price: "0.1",              // 0.1 USDC
        chainId: 196,              // XLayer mainnet
        token: "0x74b7f16337b8972027f6196a17a631ac6de26d22", // USDC on XLayer
        usdcName: "USD Coin",
        usdcVersion: "2",
        network: "xlayer",
        config: {
          description: "Access premium content"
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

// Protected route - payment required
app.get("/premium-content", (req, res) => {
  res.json({
    message: "Welcome to premium content!",
    data: "..."
  });
});

app.listen(3000, () => {
  console.log("Server running with XLayer payment protection");
});
```

### Multi-Network Setup

Allow users to pay with XLayer OR Base Sepolia:

```typescript
app.use(
  payment402Middleware(
    "0xe8fb62154382af0812539cfe61b48321d8f846a8",
    {
      "/api/protected": [
        // Option 1: XLayer (recommended for lower fees)
        {
          price: "0.1",
          chainId: 196,
          token: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
          usdcName: "USD Coin",
          usdcVersion: "2",
          network: "xlayer",
          config: {
            description: "Pay with XLayer (lower fees)"
          }
        },
        // Option 2: Base Sepolia
        {
          price: "0.1",
          chainId: 84532,
          token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          usdcName: "USDC",
          usdcVersion: "2",
          network: "base-sepolia",
          config: {
            description: "Pay with Base Sepolia"
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

## How It Works

1. **Client requests protected resource** → Server responds with 402 Payment Required
2. **Client signs payment** → Creates EIP-712 signature for USDC transfer
3. **Client sends request with X-Payment header** → Includes signed payment
4. **Middleware verifies payment** → Calls facilitator to verify signature
5. **Middleware fulfills request** → Executes your route handler
6. **Middleware settles payment** → Calls facilitator to execute on-chain transfer
7. **Server responds with X-PAYMENT-RESPONSE header** → Contains settlement confirmation

All of this happens automatically!

## API Reference

### `payment402Middleware(sellerAddress, routeConfig, facilitatorConfig)`

Creates an Express middleware for handling 402 payments.

#### Parameters

- **sellerAddress** `string` - Ethereum address to receive payments
- **routeConfig** `RouteConfig` - Route configuration with payment requirements
- **facilitatorConfig** `FacilitatorConfigs` - Facilitator configuration per network

#### Types

```typescript
interface PaymentConfig {
  price: string;           // Price in USDC (e.g., "0.1")
  chainId: number;        // Network chain ID
  token: string;          // USDC token contract address
  usdcName: string;       // USDC contract name (for EIP-712)
  usdcVersion: string;    // USDC contract version (for EIP-712)
  network: string;        // Network name (e.g., "xlayer")
  config?: {
    description?: string;
    metadata?: Record<string, any>;
  };
}

interface RouteConfig {
  [route: string]: PaymentConfig | PaymentConfig[];  // Single or multiple options
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

## Supported Networks

### XLayer (Recommended)
- **Mainnet**: Chain ID `196`
- **Testnet**: Chain ID `195`
- **USDC Contract**: `0x74b7f16337b8972027f6196a17a631ac6de26d22` (mainnet)
- **Facilitator**: OKX facilitator with API authentication

### Other Networks
- **Base**: Standard facilitator
- **Base Sepolia**: Standard facilitator
- **Any EVM-compatible network** with USDC support

## Getting OKX Credentials

To use XLayer with OKX facilitator:

1. Create an OKX account at https://www.okx.com
2. Go to API settings
3. Create API key with x402 permissions
4. Copy API Key, Secret Key, and Passphrase to your `.env`:

```env
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
```

## Examples

See the [examples](./examples) directory for complete examples:
- XLayer single payment
- Multi-network payment options
- Custom payment verification

## Client Integration

Users need an x402-compatible client to make payments. Example using `x402-fetch`:

```typescript
import { createPaymentHeader } from "x402-fetch";

// Request protected resource
const response = await fetch("http://localhost:3000/premium-content");

if (response.status === 402) {
  const paymentRequired = await response.json();

  // User signs payment (with their wallet)
  const paymentHeader = await createPaymentHeader(paymentRequired.accepts[0]);

  // Retry with payment
  const paidResponse = await fetch("http://localhost:3000/premium-content", {
    headers: {
      "X-Payment": paymentHeader
    }
  });

  const content = await paidResponse.json();
}
```

## Security

- EIP-712 signature verification for all payments
- Facilitator double-verification (verify + settle)
- No direct blockchain access required
- Automatic payment settlement on successful requests only

## License

MIT

## Links

- [XLayer Official Site](https://www.okx.com/xlayer)
- [x402 Protocol](https://x402.org)
- [GitHub Repository](https://github.com/payincom/402ok-express)
