/**
 * Issuance authority service (EIP-712 signer).
 *
 * Required env:
 * - RPC_URL
 * - LEDGER_ADDRESS
 * - ISSUANCE_SIGNER_BACKEND (default `local`; see src/authority/signers/README.md)
 * - ISSUANCE_SIGNER_PRIVATE_KEY (when backend is `local`)
 * - ISSUANCE_SIGNER_ADDRESS + sidecar URLs (when backend is cryptech|opentitan|tkey)
 *
 * Optional:
 * - CHAIN_ID (default mainnet id)
 * - ISSUANCE_AUTH_PORT (default 8790)
 * - ISSUANCE_AUTH_API_KEY (required unless ALLOW_INSECURE_NO_AUTH=true)
 * - ALLOW_INSECURE_NO_AUTH=true (local-only)
 * - CORS_ALLOW_ORIGINS (comma-separated) or ALLOW_INSECURE_CORS_ALL (dev)
 * - HEALTH_MINIMAL, HEALTH_REQUIRE_AUTH, VERBOSE_ERRORS — see src/authority/README.md
 */
import { startIssuanceAuthorityServer } from "./src/authority/issuance_service.ts";

await startIssuanceAuthorityServer();

