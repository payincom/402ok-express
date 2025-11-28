import { Request, Response, NextFunction } from "express";
import { makeOKXRequest, OKXCredentials } from "./utils/okx-signature.js";

interface PaymentConfig {
  price: string;
  chainId: number;
  token: string;
  usdcName: string;    // USDC contract name
  usdcVersion: string; // USDC contract version
  network: string;  // Network name like "xlayer-test", "base-sepolia", etc.
  config?: {
    description?: string;
    metadata?: Record<string, any>;
  };
}

interface RouteConfig {
  [route: string]: PaymentConfig | PaymentConfig[];  // Support single or multiple payment options
}

interface FacilitatorConfig {
  url: string;
  type?: "okx" | "standard";  // Type of facilitator (OKX requires special auth)
  okxCredentials?: OKXCredentials;  // OKX API credentials if type is "okx"
}

type FacilitatorConfigs = FacilitatorConfig | { [network: string]: FacilitatorConfig };

/**
 * Custom HTTP 402 Payment Required middleware
 * Implements the 402 payment protocol without using x402-express
 */
export function payment402Middleware(
  sellerAddress: string,
  routeConfig: RouteConfig,
  facilitatorConfig: FacilitatorConfigs
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if this route requires payment
    const route = req.path;
    const config = routeConfig[route];

    if (!config) {
      // Route not configured for payment, skip middleware
      return next();
    }

    // Normalize config to array for uniform handling
    const configs = Array.isArray(config) ? config : [config];

    // Check if payment header is present
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      // No payment provided, return 402 challenge with all payment options
      const accepts = configs.map(cfg => {
        // Convert price to smallest unit (6 decimals for USDC)
        const priceInSmallestUnit = Math.floor(parseFloat(cfg.price) * 1_000_000).toString();

        // Build payment requirements in x402 standard format
        return {
          scheme: "exact" as const,
          network: cfg.network,
          maxAmountRequired: priceInSmallestUnit,
          resource: `${req.protocol}://${req.headers.host}${req.path}`,
          description: cfg.config?.description || "Payment required for access",
          mimeType: "",
          payTo: sellerAddress,
          maxTimeoutSeconds: 180,  // 3 minutes
          asset: cfg.token,
          outputSchema: {},
          extra: {
            name: cfg.usdcName,      // USDC contract name
            version: cfg.usdcVersion, // USDC contract version
          },
        };
      });

      return res.status(402).json({
        x402Version: 1,
        error: "X-PAYMENT header is required",
        accepts,  // Return all payment options
      });
    }

    // Payment header provided, verify it with facilitator
    try {
      // Decode the payment header (base64 encoded JSON)
      const decodedPayment = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));

      // Identify which network the user chose from the payment payload
      const selectedNetwork = decodedPayment.network;

      if (!selectedNetwork) {
        return res.status(400).json({
          error: "Invalid payment",
          details: "Payment payload must include 'network' field to indicate which payment option was chosen",
        });
      }

      // Find the matching config from the available options
      const selectedConfig = configs.find(cfg => cfg.network === selectedNetwork);

      if (!selectedConfig) {
        return res.status(400).json({
          error: "Invalid payment",
          details: `Network '${selectedNetwork}' is not an accepted payment option for this resource`,
        });
      }

      // Get the appropriate facilitator config for the selected network
      const currentFacilitatorConfig =
        "url" in facilitatorConfig
          ? facilitatorConfig  // Single config (backward compatible)
          : facilitatorConfig[selectedNetwork];  // Network-specific config

      if (!currentFacilitatorConfig) {
        console.error(`No facilitator config found for network: ${selectedNetwork}`);
        return res.status(500).json({
          error: "Internal server error",
          details: `No facilitator configured for network ${selectedNetwork}`,
        });
      }

      // Build payment requirements object matching x402 format
      // Convert price to smallest unit (USDC has 6 decimals)
      const priceInSmallestUnit = Math.floor(parseFloat(selectedConfig.price) * 1_000_000).toString();

      const paymentRequirements: any = {
        scheme: "exact",
        maxAmountRequired: priceInSmallestUnit,
        resource: `${req.protocol}://${req.headers.host}${req.path}`,
        description: selectedConfig.config?.description || "",
        mimeType: "",
        payTo: sellerAddress,
        maxTimeoutSeconds: 60,
        asset: selectedConfig.token,
        outputSchema: {},
        extra: {
          name: selectedConfig.usdcName,  // Must match the actual USDC contract name for EIP-712 signature
          version: selectedConfig.usdcVersion,
        },
      };

      // Build payload according to facilitator type
      let paymentPayload = decodedPayment;

      if (currentFacilitatorConfig.type === "okx") {
        // OKX: Remove network field from paymentPayload if it exists
        paymentPayload = { ...decodedPayment };
        delete paymentPayload.network;

        // OKX: Don't add chainIndex to paymentRequirements, only at outer level
        // Remove network from requirements too
        delete paymentRequirements.network;
      } else {
        // Standard facilitator: use network field
        paymentRequirements.network = selectedConfig.network;
      }

      // Build payload in x402 format
      const verifyPayload: any = {
        x402Version: 1,
        paymentPayload: paymentPayload,
        paymentRequirements: paymentRequirements,
      };

      // OKX: chainIndex ONLY at the outer level (not in paymentPayload or paymentRequirements)
      if (currentFacilitatorConfig.type === "okx") {
        verifyPayload.chainIndex = selectedConfig.chainId.toString();  // Use string as per documentation
      }

      console.log("🔍 Verifying payment with facilitator:", JSON.stringify(verifyPayload, null, 2));

      let verifyResponse;

      if (currentFacilitatorConfig.type === "okx" && currentFacilitatorConfig.okxCredentials) {
        // OKX facilitator - use authenticated request
        const requestPath = "/api/v6/x402/verify";
        const verifyUrl = `${currentFacilitatorConfig.url}${requestPath}`;

        verifyResponse = await makeOKXRequest(
          verifyUrl,
          "POST",
          requestPath,
          verifyPayload,
          currentFacilitatorConfig.okxCredentials as OKXCredentials
        );
      } else {
        // Standard facilitator - use regular fetch
        const verifyUrl = `${currentFacilitatorConfig.url}/verify`;

        verifyResponse = await fetch(verifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(verifyPayload),
        });
      }

      if (!verifyResponse.ok) {
        const errorText = await verifyResponse.text();
        console.error("Payment verification failed:", errorText);
        return res.status(402).json({
          error: "Payment verification failed",
          details: errorText,
        });
      }

      const verifyResult = await verifyResponse.json();

      console.log("✅ Verification result:", JSON.stringify(verifyResult, null, 2));

      // Check verification result based on facilitator type
      let isValid = false;
      let invalidReason = "";

      if (currentFacilitatorConfig.type === "okx") {
        // OKX format: { code: "0", data: [{ isValid: true }] }
        if (verifyResult.code === "0" && verifyResult.data && verifyResult.data.length > 0) {
          isValid = verifyResult.data[0].isValid;
          invalidReason = verifyResult.data[0].invalidReason || "";
        } else {
          invalidReason = verifyResult.msg || "Unknown error from OKX facilitator";
        }
      } else {
        // Standard facilitator format: { isValid: true }
        isValid = verifyResult.isValid;
        invalidReason = verifyResult.invalidReason || "";
      }

      if (!isValid) {
        return res.status(402).json({
          error: "Invalid payment",
          details: invalidReason || "Payment verification failed",
        });
      }

      console.log("✅ Payment verified successfully");

      // Intercept the response to settle payment after successful execution
      const originalEnd = res.end.bind(res);
      let endArgs: any = null;

      res.end = function(...args: any[]) {
        endArgs = args;
        return res;
      };

      // Execute the route handler
      await next();

      // Check if response was successful
      if (res.statusCode >= 400) {
        // Request failed, don't settle
        res.end = originalEnd;
        if (endArgs) {
          originalEnd(...endArgs);
        }
        return;
      }

      // Settle the payment with facilitator
      try {
        const settlePayload: any = {
          x402Version: 1,
          paymentPayload: paymentPayload,
          paymentRequirements: paymentRequirements,
        };

        // OKX: chainIndex ONLY at the outer level (same as verify)
        if (currentFacilitatorConfig.type === "okx") {
          settlePayload.chainIndex = selectedConfig.chainId.toString();  // Use string as per documentation
        }

        console.log("💰 Settling payment with facilitator...");

        let settleResponse;

        if (currentFacilitatorConfig.type === "okx" && currentFacilitatorConfig.okxCredentials) {
          // OKX facilitator - use authenticated request
          const requestPath = "/api/v6/x402/settle";
          const settleUrl = `${currentFacilitatorConfig.url}${requestPath}`;

          settleResponse = await makeOKXRequest(
            settleUrl,
            "POST",
            requestPath,
            settlePayload,
            currentFacilitatorConfig.okxCredentials as OKXCredentials
          );
        } else {
          // Standard facilitator - use regular fetch
          const settleUrl = `${currentFacilitatorConfig.url}/settle`;

          settleResponse = await fetch(settleUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(settlePayload),
          });
        }

        if (!settleResponse.ok) {
          const errorText = await settleResponse.text();
          console.error("Payment settlement failed:", errorText);
          res.status(402).json({
            error: "Payment settlement failed",
            details: errorText,
          });
          return;
        }

        const settleResult = await settleResponse.json();

        console.log("✅ Settlement result:", JSON.stringify(settleResult, null, 2));

        // Check settlement result based on facilitator type
        let settleSuccess = false;
        let txHash = "";
        let errorReason = "";

        if (currentFacilitatorConfig.type === "okx") {
          // OKX format: { code: "0", data: [{ success: true, txHash: "..." }] }
          if (settleResult.code === "0" && settleResult.data && settleResult.data.length > 0) {
            settleSuccess = settleResult.data[0].success;
            txHash = settleResult.data[0].txHash || "";
            errorReason = settleResult.data[0].errorReason || "";
          } else {
            errorReason = settleResult.msg || "Unknown error from OKX facilitator";
          }
        } else {
          // Standard facilitator format: { success: true, txHash: "..." }
          settleSuccess = settleResult.success;
          txHash = settleResult.txHash || "";
          errorReason = settleResult.errorReason || "";
        }

        if (!settleSuccess) {
          res.status(402).json({
            error: "Payment settlement failed",
            details: errorReason || "Settlement unsuccessful",
          });
          return;
        }

        // Add X-PAYMENT-RESPONSE header
        const responseHeader = Buffer.from(JSON.stringify({
          settled: true,
          txHash: txHash,
        })).toString("base64");

        res.setHeader("X-PAYMENT-RESPONSE", responseHeader);

        console.log("✅ Payment settled successfully");
      } catch (error) {
        console.error("Error settling payment:", error);
        if (!res.headersSent) {
          res.status(402).json({
            error: "Payment settlement error",
            details: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      } finally {
        // Restore original end and send response
        res.end = originalEnd;
        if (endArgs) {
          originalEnd(...endArgs);
        }
      }
    } catch (error) {
      console.error("Error verifying payment:", error);
      return res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
