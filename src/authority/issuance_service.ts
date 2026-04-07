import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";
import { createIssuanceAccount } from "./signers/factory.ts";
import { corsHeadersForRequest, corsPreflightResponse } from "../http/cors.ts";

const ledgerAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function pSale() view returns (uint256)",
]);

type IssueRequest = {
  tokenId: string;
  caller: Address;
  nonce: string;
  deadline: string;
};

function verboseErrors(): boolean {
  return Deno.env.get("VERBOSE_ERRORS") === "true";
}

export async function startIssuanceAuthorityServer() {
  const rpcUrl = required("RPC_URL");
  const ledgerAddress = requiredAddress("LEDGER_ADDRESS");
  const insecureNoAuth = Deno.env.get("ALLOW_INSECURE_NO_AUTH") === "true";
  const expectedApiKey = Deno.env.get("ISSUANCE_AUTH_API_KEY");
  if (!expectedApiKey && !insecureNoAuth) {
    throw new Error(
      "Missing ISSUANCE_AUTH_API_KEY. Set ALLOW_INSECURE_NO_AUTH=true only for isolated local development.",
    );
  }
  const chainId = Number(Deno.env.get("CHAIN_ID") ?? `${mainnet.id}`);
  const port = Number(Deno.env.get("ISSUANCE_AUTH_PORT") ?? "8790");

  const healthMinimal = Deno.env.get("HEALTH_MINIMAL") === "true";
  const healthRequireAuth = Deno.env.get("HEALTH_REQUIRE_AUTH") === "true";

  const account = await createIssuanceAccount();
  const chain = { ...mainnet, id: chainId };
  const pub = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ chain, transport: http(rpcUrl), account });

  Deno.serve({ port }, async (req) => {
    const pre = corsPreflightResponse(req);
    if (pre) return pre;

    const url = new URL(req.url);

    if (url.pathname === "/health") {
      if (healthRequireAuth && expectedApiKey) {
        const got = req.headers.get("x-api-key") ?? "";
        if (!timingSafeEqual(got, expectedApiKey)) {
          return json(req, { error: "unauthorized" }, 401);
        }
      }
      if (healthMinimal) {
        return json(req, { ok: true }, 200);
      }
      return json(req, { ok: true, signer: account.address, chainId }, 200);
    }

    if (url.pathname !== "/cert/issuance" || req.method !== "POST") {
      return json(req, { error: "not_found" }, 404);
    }

    if (expectedApiKey) {
      const got = req.headers.get("x-api-key") ?? "";
      if (!timingSafeEqual(got, expectedApiKey)) return json(req, { error: "unauthorized" }, 401);
    }

    let body: IssueRequest;
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    try {
      const tokenId = BigInt(body.tokenId);
      const nonce = BigInt(body.nonce);
      const deadline = BigInt(body.deadline);
      if (!body.caller?.startsWith("0x")) return json(req, { error: "invalid_caller" }, 400);

      const now = BigInt(Math.floor(Date.now() / 1000));
      if (deadline <= now) return json(req, { error: "deadline_expired" }, 400);

      const [slotOwner, pSale] = await Promise.all([
        pub.readContract({
          address: ledgerAddress,
          abi: ledgerAbi,
          functionName: "ownerOf",
          args: [tokenId],
        }),
        pub.readContract({
          address: ledgerAddress,
          abi: ledgerAbi,
          functionName: "pSale",
        }),
      ]);

      if (slotOwner.toLowerCase() !== body.caller.toLowerCase()) {
        if (verboseErrors()) {
          return json(req, { error: "caller_not_slot_owner", slotOwner }, 409);
        }
        return json(req, { error: "caller_not_slot_owner" }, 409);
      }

      const signature = await wallet.signTypedData({
        account,
        domain: {
          name: "TokenValuationLedger",
          version: "1",
          chainId,
          verifyingContract: ledgerAddress,
        },
        types: {
          IssuanceCertificate: [
            { name: "tokenId", type: "uint256" },
            { name: "slotOwner", type: "address" },
            { name: "saleAmount", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint64" },
            { name: "caller", type: "address" },
          ],
        },
        primaryType: "IssuanceCertificate",
        message: {
          tokenId,
          slotOwner,
          saleAmount: pSale,
          nonce,
          deadline,
          caller: body.caller,
        },
      });

      return json(req, {
        ok: true,
        signature,
        payload: {
          tokenId: tokenId.toString(),
          slotOwner,
          saleAmount: pSale.toString(),
          nonce: nonce.toString(),
          deadline: deadline.toString(),
          caller: body.caller,
        },
      });
    } catch (e) {
      console.error("[issuance] sign_failed", e);
      if (verboseErrors()) {
        return json(req, { error: "sign_failed", detail: String(e) }, 500);
      }
      return json(req, { error: "sign_failed" }, 500);
    }
  });

  console.log(
    `Issuance authority listening on :${port} signer=${account.address} chainId=${chainId} auth=${
      expectedApiKey ? "api-key" : "disabled(local-only)"
    } healthMinimal=${healthMinimal} healthRequireAuth=${healthRequireAuth}`,
  );
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function requiredAddress(name: string): Address {
  const v = required(name);
  if (!v.startsWith("0x")) throw new Error(`Invalid ${name}`);
  return v as Address;
}

function json(req: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeadersForRequest(req) },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
