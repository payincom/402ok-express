# 402ok-express

Express middleware for HTTP 402 Payment Required protocol with multi-network support.

## Features

- ✅ HTTP 402 Payment Required standard implementation
- ✅ Multi-network support (XLayer, Base, Base Sepolia, etc.)
- ✅ OKX facilitator integration with signature authentication
- ✅ Standard facilitator support
- ✅ Multiple payment options per endpoint
- ✅ Automatic payment verification and settlement

## Installation

```bash
npm install 402ok-express
```

## Usage

```typescript
import express from "express";
import { payment402Middleware } from "402ok-express";

const app = express();

// Configure payment middleware
app.use(
  payment402Middleware(
    "0xe8fb62154382af0812539cfe61b48321d8f846a8", // Seller address
    {
      // Single payment option
      "/protected/single": {
        price: "0.1",
        chainId: 196,
        token: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
        usdcName: "USD Coin",
        usdcVersion: "2",
        network: "xlayer",
        config: {
          description: "Premium content"
        }
      },
      // Multiple payment options
      "/protected/multi": [
        {
          price: "0.1",
          chainId: 196,
          token: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
          usdcName: "USD Coin",
          usdcVersion: "2",
          network: "xlayer"
        },
        {
          price: "0.1",
          chainId: 84532,
          token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          usdcName: "USDC",
          usdcVersion: "2",
          network: "base-sepolia"
        }
      ]
    },
    // Facilitator configs
    {
      "xlayer": {
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

// Protected route
app.get("/protected/single", (req, res) => {
  res.json({ message: "Access granted!" });
});

app.listen(3000);
```

## API

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
  usdcName: string;       // USDC contract name
  usdcVersion: string;    // USDC contract version
  network: string;        // Network name
  config?: {
    description?: string;
    metadata?: Record<string, any>;
  };
}

interface RouteConfig {
  [route: string]: PaymentConfig | PaymentConfig[];
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

type FacilitatorConfigs = FacilitatorConfig | { [network: string]: FacilitatorConfig };
```

## Supported Networks

- **XLayer** (mainnet & testnet) - via OKX facilitator
- **Base** - via standard facilitator
- **Base Sepolia** - via standard facilitator
- Any EVM-compatible network with USDC

## License

MIT
