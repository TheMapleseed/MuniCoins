// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface INftExpiryOracle {
    function tokenExpiry(address nftCollection, uint256 nftTokenId) external view returns (uint64);
}

/**
 * @title TokenValuationLedger
 * @notice On-chain implementation of the Token Valuation and Redemption specification:
 *         operational fund, premium reserve, per-token compounding via a global return index,
 *         redemption against the fund, and reissuance. All state transitions emit events for
 *         third-party auditors. Token IDs are transferable positions (“slots”) — any address
 *         (including custodial bank wallets) may hold and transfer them.
 *
 * @dev Numerical model (WAD = 1e18):
 *      - cumulativeFactor starts at 1 WAD and is multiplied by (WAD + R) / WAD each period.
 *      - For an active token: value = P_initial * cumulativeFactor / indexAtActivation.
 *      - This matches v_i(t) = P_initial * ∏(1 + R) with one global return series.
 *
 *      Large N: bootstrap token metadata in batches via bootstrapTokenRange (gas limits).
 *      Return posting is permissioned (RETURN_ROLE); use a multisig or oracle in production.
 */
contract TokenValuationLedger is AccessControl, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant RETURN_ROLE = keccak256("RETURN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant POLICY_ROLE = keccak256("POLICY_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant TOPUP_ROLE = keccak256("TOPUP_ROLE");
    bytes32 public constant ISSUER_POLICY_ROLE = keccak256("ISSUER_POLICY_ROLE");

    /// @notice Settlement asset (e.g. USDC). All balances in raw token units (not WAD).
    IERC20 public immutable asset;
    uint8 public immutable assetDecimals;

    /// @notice Total logical token slots (spec N).
    uint256 public immutable totalTokenSlots;
    /// @notice Count of slots that start active at genesis (spec N_active initial).
    uint256 public immutable initialActiveSlots;
    /// @notice Inactive slots at inception = N - N_active — drives premium reserve target (spec).
    uint256 public immutable inactiveSlotsAtInception;

    /// @notice P_initial in asset minor units (e.g. 1e6 for $1 USDC).
    uint256 public immutable pInitial;
    uint256 public immutable pSale;
    uint256 public immutable pCore;
    uint256 public immutable pPremium;

    /// @notice Global compounding factor for valuation, scaled by WAD (starts at 1 WAD).
    uint256 public cumulativeFactorWad;

    uint256 public operationalFund;
    uint256 public premiumReserve;
    /// @notice Cumulative sale deposits received on reissuance (audit trail).
    uint256 public totalIssuanceDeposits;
    /// @notice Last accepted period end; enforces monotonic return posting windows.
    uint64 public lastPeriodEnd;
    /// @notice Optional oracle used to verify NFT expiry before reissuance.
    INftExpiryOracle public nftExpiryOracle;
    /// @notice Global switch for transfer/reissue allowlist checks.
    bool public complianceModeEnabled;
    /// @notice If true, slot anchor can no longer be modified.
    mapping(uint256 tokenId => bool) public anchorFrozen;
    /// @notice Optional address allowlist for institutional policy controls.
    mapping(address account => bool) public allowedInstitution;
    /// @notice Risk guard: max absolute per-period return (WAD). 0 means unset/no cap.
    uint256 public maxAbsReturnWad;
    /// @notice Risk guard: max period length in seconds. 0 means unset/no cap.
    uint64 public maxReturnPeriodSeconds;
    /// @notice Risk guard: max age of period end vs now (seconds). 0 means unset/no cap.
    uint64 public maxReturnStalenessSeconds;
    /// @notice Optional floor to preserve minimum premium reserve buffer.
    uint256 public minPremiumReserveFloor;
    /// @notice Solvency guard: min collateral ratio in basis points (op fund / face claims).
    uint16 public minCollateralRatioBps;
    /// @notice Daily redemption limiter in settlement minor units. 0 disables cap.
    uint256 public maxDailyRedemptionAmount;
    /// @notice Redemption total per UTC day key (timestamp / 1 days).
    mapping(uint64 dayKey => uint256 redeemedAmount) public redeemedPerDay;
    /// @notice Optional signer for EIP-712 expiry attestations.
    address public expirySigner;
    /// @notice Optional signer for issuance certifications.
    address public issuanceSigner;
    /// @notice Require signed expiry proof on reissue (instead of relying only on read oracle).
    bool public enforceSignedExpiryProof;
    /// @notice Require issuer-signed certification before any reissue.
    bool public enforceIssuanceCertificates;
    mapping(bytes32 digest => bool) public usedExpiryProofDigests;
    mapping(bytes32 digest => bool) public usedIssuanceCertDigests;

    bytes32 public constant EXPIRY_PROOF_TYPEHASH =
        keccak256(
            "ExpiryProof(uint256 tokenId,address nftCollection,uint256 nftTokenId,uint64 expectedExpiry,uint256 nonce,uint64 deadline,address owner)"
        );
    bytes32 public constant ISSUANCE_CERT_TYPEHASH =
        keccak256(
            "IssuanceCertificate(uint256 tokenId,address slotOwner,uint256 saleAmount,uint256 nonce,uint64 deadline,address caller)"
        );

    /// @notice Number of tokens currently marked active (for analytics).
    uint256 public activeTokenCount;

    struct TokenSlot {
        bool exists;
        bool active;
        uint64 activationTime;
        /// @dev cumulativeFactorWad snapshot at activation / reissue (WAD scale).
        uint256 indexAtActivationWad;
    }

    struct SlotAnchor {
        bool exists;
        address nftCollection;
        uint256 nftTokenId;
        uint64 expectedExpiry;
    }

    mapping(uint256 tokenId => TokenSlot) private _slots;
    mapping(uint256 tokenId => address) private _owner;
    mapping(uint256 tokenId => SlotAnchor) private _slotAnchors;
    mapping(bytes16 periodId => bool) public usedReturnPeriodIds;

    bool public liquidityBootstrapped;

    // --- Audit / public ledger (indexers reconstruct full history from these) ---
    event LiquidityBootstrapped(
        address indexed payer,
        uint256 operationalFundAmount,
        uint256 premiumReserveAmount
    );
    event TokenRangeBootstrapped(uint256 indexed fromId, uint256 indexed toId, address initialHolder);
    event ReturnApplied(
        address indexed caller,
        int256 returnWad,
        uint256 cumulativeFactorWadAfter,
        uint256 operationalFundAfter
    );
    event ReturnPeriodApplied(
        bytes16 indexed periodId,
        uint64 periodStart,
        uint64 periodEnd,
        address indexed caller,
        int256 returnWad,
        uint256 cumulativeFactorWadAfter,
        uint256 operationalFundAfter
    );
    event PremiumReserveIntegrityRestored(uint256 expected, uint256 actualBefore);
    event TokenRedeemed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 payout,
        uint256 operationalFundAfter
    );
    event TokenReissued(
        uint256 indexed tokenId,
        address indexed owner,
        uint64 activationTime,
        uint256 indexAtActivationWad
    );
    event TokenTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        bool active
    );
    event OperationalTopUp(address indexed from, uint256 amount, uint256 operationalFundAfter);
    event SlotAnchorSet(
        uint256 indexed tokenId,
        address indexed nftCollection,
        uint256 indexed nftTokenId,
        uint64 expectedExpiry
    );
    event NftExpiryOracleUpdated(address indexed oracle);
    event ComplianceModeSet(bool enabled);
    event InstitutionAllowlistSet(address indexed account, bool allowed);
    event AnchorFrozen(uint256 indexed tokenId);
    event PolicyUpdated(
        uint256 maxAbsReturnWad,
        uint64 maxReturnPeriodSeconds,
        uint64 maxReturnStalenessSeconds,
        uint256 minPremiumReserveFloor
    );
    event SolvencyPolicyUpdated(uint16 minCollateralRatioBps, uint256 maxDailyRedemptionAmount);
    event ExpiryProofPolicyUpdated(address indexed signer, bool enforceSignedProof);
    event IssuanceCertificationPolicyUpdated(address indexed signer, bool enforceCertificates);
    event PausedBy(address indexed account);
    event UnpausedBy(address indexed account);
    event ReissueFunded(
        uint256 indexed tokenId,
        address indexed payer,
        uint256 saleAmount,
        uint256 operationalFundAfter,
        uint256 premiumReserveAfter
    );

    error InvalidParameters();
    error InvalidToken();
    error NotTokenOwner();
    error TokenNotActive();
    error AlreadyActive();
    error InsufficientOperationalFund();
    error LiquidityAlreadyBootstrapped();
    error LiquidityNotBootstrapped();
    error InvalidReturnRate();
    error UnsupportedUnanchoredReturn();
    error ReturnPeriodAlreadyUsed();
    error InvalidPeriodWindow();
    error SlotNotAnchored();
    error ExpiryMismatch();
    error ClaimExpired();
    error ContractPaused();
    error ComplianceViolation();
    error AnchorFrozenError();
    error UnauthorizedTopUpSource();
    error PolicyViolation();
    error SignedExpiryProofRequired();
    error InvalidExpiryProof();
    error ExpiryProofExpired();
    error IssuanceCertificateRequired();
    error InvalidIssuanceCertificate();
    error IssuanceCertificateExpired();
    error BatchBounds();
    error ZeroAddress();

    constructor(
        IERC20 asset_,
        uint256 totalTokenSlots_,
        uint256 initialActiveSlots_,
        uint256 pInitial_,
        uint256 pSale_,
        uint256 pCore_,
        uint256 pPremium_,
        address admin,
        address returnPoster,
        address nftExpiryOracle_,
        address expirySigner_
    ) EIP712("TokenValuationLedger", "1") {
        if (admin == address(0) || returnPoster == address(0)) revert ZeroAddress();
        if (totalTokenSlots_ == 0 || initialActiveSlots_ > totalTokenSlots_) revert InvalidParameters();
        if (pSale_ <= pInitial_) revert InvalidParameters();

        asset = asset_;
        uint8 d = _tryDecimals(address(asset_));
        assetDecimals = d;

        totalTokenSlots = totalTokenSlots_;
        initialActiveSlots = initialActiveSlots_;
        inactiveSlotsAtInception = totalTokenSlots_ - initialActiveSlots_;

        pInitial = pInitial_;
        pSale = pSale_;
        pCore = pCore_;
        pPremium = pPremium_;
        if (nftExpiryOracle_ != address(0)) {
            nftExpiryOracle = INftExpiryOracle(nftExpiryOracle_);
        }
        expirySigner = expirySigner_;

        cumulativeFactorWad = 1e18;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RETURN_ROLE, returnPoster);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(POLICY_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(TOPUP_ROLE, admin);
        _grantRole(ISSUER_POLICY_ROLE, admin);
    }

    modifier onlyWhenOperational() {
        if (paused()) revert ContractPaused();
        _;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit PausedBy(msg.sender);
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
        emit UnpausedBy(msg.sender);
    }

    function setComplianceMode(bool enabled) external onlyRole(COMPLIANCE_ROLE) {
        complianceModeEnabled = enabled;
        emit ComplianceModeSet(enabled);
    }

    function setInstitutionAllowlist(address account, bool allowed) external onlyRole(COMPLIANCE_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        allowedInstitution[account] = allowed;
        emit InstitutionAllowlistSet(account, allowed);
    }

    function _enforceCompliance(address account) internal view {
        if (complianceModeEnabled && !allowedInstitution[account]) revert ComplianceViolation();
    }

    function setNftExpiryOracle(address oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        nftExpiryOracle = INftExpiryOracle(oracle);
        emit NftExpiryOracleUpdated(oracle);
    }

    function setPolicy(
        uint256 maxAbsReturnWad_,
        uint64 maxReturnPeriodSeconds_,
        uint64 maxReturnStalenessSeconds_,
        uint256 minPremiumReserveFloor_
    ) external onlyRole(POLICY_ROLE) {
        maxAbsReturnWad = maxAbsReturnWad_;
        maxReturnPeriodSeconds = maxReturnPeriodSeconds_;
        maxReturnStalenessSeconds = maxReturnStalenessSeconds_;
        minPremiumReserveFloor = minPremiumReserveFloor_;
        emit PolicyUpdated(
            maxAbsReturnWad_,
            maxReturnPeriodSeconds_,
            maxReturnStalenessSeconds_,
            minPremiumReserveFloor_
        );
    }

    function setSolvencyPolicy(uint16 minCollateralRatioBps_, uint256 maxDailyRedemptionAmount_)
        external
        onlyRole(POLICY_ROLE)
    {
        if (minCollateralRatioBps_ > 10_000) revert PolicyViolation();
        minCollateralRatioBps = minCollateralRatioBps_;
        maxDailyRedemptionAmount = maxDailyRedemptionAmount_;
        emit SolvencyPolicyUpdated(minCollateralRatioBps_, maxDailyRedemptionAmount_);
    }

    function setExpiryProofPolicy(address signer, bool enforceSignedProof)
        external
        onlyRole(POLICY_ROLE)
    {
        if (enforceSignedProof && signer == address(0)) revert ZeroAddress();
        expirySigner = signer;
        enforceSignedExpiryProof = enforceSignedProof;
        emit ExpiryProofPolicyUpdated(signer, enforceSignedProof);
    }

    function setIssuanceCertificationPolicy(address signer, bool enforceCertificates)
        external
        onlyRole(ISSUER_POLICY_ROLE)
    {
        if (enforceCertificates && signer == address(0)) revert ZeroAddress();
        issuanceSigner = signer;
        enforceIssuanceCertificates = enforceCertificates;
        emit IssuanceCertificationPolicyUpdated(signer, enforceCertificates);
    }

    /// @notice Pulls initial operational + premium amounts from `payer` per spec (7)-(8).
    function bootstrapLiquidity(address payer) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) onlyWhenOperational {
        if (liquidityBootstrapped) revert LiquidityAlreadyBootstrapped();

        uint256 op = pCore * inactiveSlotsAtInception;
        uint256 prem = pPremium * inactiveSlotsAtInception;

        operationalFund = op;
        premiumReserve = prem;

        asset.safeTransferFrom(payer, address(this), op + prem);
        liquidityBootstrapped = true;

        emit LiquidityBootstrapped(payer, op, prem);
    }

    /**
     * @notice Assigns ownership for token IDs [fromId, toId] and sets genesis activation state.
     * @dev Call in chunks to respect block gas limit. IDs are 1-based: 1 .. totalTokenSlots.
     */
    function bootstrapTokenRange(
        uint256 fromId,
        uint256 toId,
        address initialHolder
    ) external onlyRole(DEFAULT_ADMIN_ROLE) onlyWhenOperational {
        if (!liquidityBootstrapped) revert LiquidityNotBootstrapped();
        if (initialHolder == address(0)) revert ZeroAddress();
        _enforceCompliance(initialHolder);
        if (fromId == 0 || toId < fromId || toId > totalTokenSlots) revert BatchBounds();

        uint256 cf = cumulativeFactorWad;

        for (uint256 id = fromId; id <= toId; id++) {
            if (_slots[id].exists) revert InvalidToken();

            _owner[id] = initialHolder;
            _slots[id].exists = true;

            if (id <= initialActiveSlots) {
                _slots[id].active = true;
                _slots[id].activationTime = uint64(block.timestamp);
                _slots[id].indexAtActivationWad = cf;
                activeTokenCount += 1;
            } else {
                _slots[id].active = false;
                _slots[id].activationTime = 0;
                _slots[id].indexAtActivationWad = 0;
            }
        }

        emit TokenRangeBootstrapped(fromId, toId, initialHolder);
    }

    /**
     * @notice Applies one period return R (WAD): e.g. 10% => 0.1e18.
     *         Updates operational fund and cumulative factor; enforces premium reserve target.
     */
    function applyPeriodReturn(int256 returnWad) external onlyRole(RETURN_ROLE) {
        returnWad; // silence unused warning in favor of explicit anchored API.
        revert UnsupportedUnanchoredReturn();
    }

    /**
     * @notice Applies one period return R anchored to a unique period id (UUIDv7-friendly).
     * @dev `periodId` should be globally unique. UUIDv7 bytes can be passed as bytes16.
     */
    function applyPeriodReturnWithPeriod(
        bytes16 periodId,
        uint64 periodStart,
        uint64 periodEnd,
        int256 returnWad
    ) external onlyRole(RETURN_ROLE) onlyWhenOperational {
        if (!liquidityBootstrapped) revert LiquidityNotBootstrapped();
        if (returnWad < -1e18) revert InvalidReturnRate();
        if (usedReturnPeriodIds[periodId]) revert ReturnPeriodAlreadyUsed();
        if (periodStart >= periodEnd) revert InvalidPeriodWindow();
        if (periodStart < lastPeriodEnd) revert InvalidPeriodWindow();
        if (periodEnd > block.timestamp) revert InvalidPeriodWindow();
        if (maxReturnPeriodSeconds != 0 && periodEnd - periodStart > maxReturnPeriodSeconds) revert PolicyViolation();
        if (maxReturnStalenessSeconds != 0 && block.timestamp - periodEnd > maxReturnStalenessSeconds) {
            revert PolicyViolation();
        }

        uint256 wad;
        bool neg = returnWad < 0;
        if (neg) {
            wad = uint256(-returnWad);
        } else {
            wad = uint256(returnWad);
        }
        if (maxAbsReturnWad != 0 && wad > maxAbsReturnWad) revert PolicyViolation();

        uint256 cf = cumulativeFactorWad;
        uint256 op = operationalFund;

        if (neg) {
            cf = (cf * (1e18 - wad)) / 1e18;
            op = (op * (1e18 - wad)) / 1e18;
        } else {
            cf = (cf * (1e18 + wad)) / 1e18;
            op = (op * (1e18 + wad)) / 1e18;
        }

        cumulativeFactorWad = cf;
        operationalFund = op;
        usedReturnPeriodIds[periodId] = true;
        lastPeriodEnd = periodEnd;

        uint256 expectedPrem = pPremium * inactiveSlotsAtInception;
        if (premiumReserve != expectedPrem) {
            emit PremiumReserveIntegrityRestored(expectedPrem, premiumReserve);
            premiumReserve = expectedPrem;
        }

        _enforceCollateralRatio();
        emit ReturnApplied(msg.sender, returnWad, cf, operationalFund);
        emit ReturnPeriodApplied(periodId, periodStart, periodEnd, msg.sender, returnWad, cf, operationalFund);
    }

    /// @notice Redeem active token: pays current valuation from operational fund (spec 15-17).
    function redeem(uint256 tokenId) external nonReentrant onlyWhenOperational {
        if (!liquidityBootstrapped) revert LiquidityNotBootstrapped();
        TokenSlot storage t = _slots[tokenId];
        if (!t.exists) revert InvalidToken();
        if (_owner[tokenId] != msg.sender) revert NotTokenOwner();
        if (!t.active) revert TokenNotActive();

        uint256 payout = currentTokenValue(tokenId);
        if (payout > operationalFund) revert InsufficientOperationalFund();
        uint64 dayKey = uint64(block.timestamp / 1 days);
        if (maxDailyRedemptionAmount != 0) {
            uint256 dayTotal = redeemedPerDay[dayKey] + payout;
            if (dayTotal > maxDailyRedemptionAmount) revert PolicyViolation();
            redeemedPerDay[dayKey] = dayTotal;
        } else {
            redeemedPerDay[dayKey] += payout;
        }

        operationalFund -= payout;
        t.active = false;
        t.activationTime = 0;
        t.indexAtActivationWad = 0;
        if (activeTokenCount > 0) activeTokenCount -= 1;

        asset.safeTransfer(msg.sender, payout);

        emit TokenRedeemed(tokenId, msg.sender, payout, operationalFund);
    }

    /// @notice Reissue: sets token active at P_initial equivalent (spec 18-20). Caller must fund sale if you charge Psale off-chain.
    function reissue(uint256 tokenId) external nonReentrant onlyWhenOperational {
        if (!liquidityBootstrapped) revert LiquidityNotBootstrapped();
        TokenSlot storage t = _slots[tokenId];
        if (!t.exists) revert InvalidToken();
        if (_owner[tokenId] != msg.sender) revert NotTokenOwner();
        if (t.active) revert AlreadyActive();
        if (enforceIssuanceCertificates) revert IssuanceCertificateRequired();
        _enforceCompliance(msg.sender);
        SlotAnchor memory a = _slotAnchors[tokenId];
        if (!a.exists) revert SlotNotAnchored();
        if (block.timestamp > a.expectedExpiry) revert ClaimExpired();
        if (enforceSignedExpiryProof) revert SignedExpiryProofRequired();
        if (address(nftExpiryOracle) != address(0)) {
            uint64 onchainExpiry = nftExpiryOracle.tokenExpiry(a.nftCollection, a.nftTokenId);
            if (onchainExpiry != a.expectedExpiry) revert ExpiryMismatch();
        }

        // Escrow/issue funding: claim activation is capitalized at issue.
        asset.safeTransferFrom(msg.sender, address(this), pSale);
        totalIssuanceDeposits += pSale;
        operationalFund += pCore;
        premiumReserve += pPremium;
        if (premiumReserve < minPremiumReserveFloor) revert PolicyViolation();

        t.active = true;
        t.activationTime = uint64(block.timestamp);
        t.indexAtActivationWad = cumulativeFactorWad;
        activeTokenCount += 1;
        _enforceCollateralRatio();

        emit ReissueFunded(tokenId, msg.sender, pSale, operationalFund, premiumReserve);
        emit TokenReissued(tokenId, msg.sender, t.activationTime, t.indexAtActivationWad);
    }

    /**
     * @notice Reissue with signed expiry proof (EIP-712), reducing oracle hot-key trust.
     */
    function reissueWithExpiryProof(
        uint256 tokenId,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external nonReentrant onlyWhenOperational {
        if (!liquidityBootstrapped) revert LiquidityNotBootstrapped();
        TokenSlot storage t = _slots[tokenId];
        if (!t.exists) revert InvalidToken();
        if (_owner[tokenId] != msg.sender) revert NotTokenOwner();
        if (t.active) revert AlreadyActive();
        if (enforceIssuanceCertificates) revert IssuanceCertificateRequired();
        _enforceCompliance(msg.sender);

        SlotAnchor memory a = _slotAnchors[tokenId];
        if (!a.exists) revert SlotNotAnchored();
        if (block.timestamp > a.expectedExpiry) revert ClaimExpired();
        if (deadline < block.timestamp) revert ExpiryProofExpired();
        if (expirySigner == address(0)) revert InvalidExpiryProof();

        bytes32 structHash = keccak256(
            abi.encode(
                EXPIRY_PROOF_TYPEHASH,
                tokenId,
                a.nftCollection,
                a.nftTokenId,
                a.expectedExpiry,
                nonce,
                deadline,
                msg.sender
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (usedExpiryProofDigests[digest]) revert InvalidExpiryProof();
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != expirySigner) revert InvalidExpiryProof();
        usedExpiryProofDigests[digest] = true;

        asset.safeTransferFrom(msg.sender, address(this), pSale);
        totalIssuanceDeposits += pSale;
        operationalFund += pCore;
        premiumReserve += pPremium;
        if (premiumReserve < minPremiumReserveFloor) revert PolicyViolation();

        t.active = true;
        t.activationTime = uint64(block.timestamp);
        t.indexAtActivationWad = cumulativeFactorWad;
        activeTokenCount += 1;
        _enforceCollateralRatio();

        emit ReissueFunded(tokenId, msg.sender, pSale, operationalFund, premiumReserve);
        emit TokenReissued(tokenId, msg.sender, t.activationTime, t.indexAtActivationWad);
    }

    /**
     * @notice Reissue with issuer certification. This is the primary path when
     *         `enforceIssuanceCertificates` is enabled.
     */
    function reissueCertified(
        uint256 tokenId,
        uint256 certNonce,
        uint64 certDeadline,
        bytes calldata certSignature
    ) external nonReentrant onlyWhenOperational {
        if (!liquidityBootstrapped) revert LiquidityNotBootstrapped();
        TokenSlot storage t = _slots[tokenId];
        if (!t.exists) revert InvalidToken();
        if (_owner[tokenId] != msg.sender) revert NotTokenOwner();
        if (t.active) revert AlreadyActive();
        _enforceCompliance(msg.sender);
        _requireIssuanceCert(tokenId, msg.sender, certNonce, certDeadline, certSignature);

        SlotAnchor memory a = _slotAnchors[tokenId];
        if (!a.exists) revert SlotNotAnchored();
        if (block.timestamp > a.expectedExpiry) revert ClaimExpired();
        if (enforceSignedExpiryProof) revert SignedExpiryProofRequired();
        if (address(nftExpiryOracle) != address(0)) {
            uint64 onchainExpiry = nftExpiryOracle.tokenExpiry(a.nftCollection, a.nftTokenId);
            if (onchainExpiry != a.expectedExpiry) revert ExpiryMismatch();
        }

        asset.safeTransferFrom(msg.sender, address(this), pSale);
        totalIssuanceDeposits += pSale;
        operationalFund += pCore;
        premiumReserve += pPremium;
        if (premiumReserve < minPremiumReserveFloor) revert PolicyViolation();

        t.active = true;
        t.activationTime = uint64(block.timestamp);
        t.indexAtActivationWad = cumulativeFactorWad;
        activeTokenCount += 1;
        _enforceCollateralRatio();

        emit ReissueFunded(tokenId, msg.sender, pSale, operationalFund, premiumReserve);
        emit TokenReissued(tokenId, msg.sender, t.activationTime, t.indexAtActivationWad);
    }

    /// @notice Transfer position to another institution or wallet (inter-bank rail on ETH).
    function transferToken(address to, uint256 tokenId) external onlyWhenOperational {
        if (to == address(0)) revert ZeroAddress();
        if (_owner[tokenId] != msg.sender) revert NotTokenOwner();
        _enforceCompliance(msg.sender);
        _enforceCompliance(to);

        address from = msg.sender;
        _owner[tokenId] = to;

        emit TokenTransferred(tokenId, from, to, _slots[tokenId].active);
    }

    /// @notice Optional: treasury tops up operational fund (e.g. yield shortfall).
    function topUpOperational(address from, uint256 amount) external nonReentrant onlyWhenOperational {
        if (!liquidityBootstrapped) revert LiquidityNotBootstrapped();
        if (amount == 0) return;
        if (from != msg.sender && !hasRole(TOPUP_ROLE, msg.sender)) revert UnauthorizedTopUpSource();
        asset.safeTransferFrom(from, address(this), amount);
        operationalFund += amount;
        emit OperationalTopUp(from, amount, operationalFund);
    }

    // --- Views (auditors / indexers) ---

    function ownerOf(uint256 tokenId) external view returns (address) {
        if (!_slots[tokenId].exists) revert InvalidToken();
        return _owner[tokenId];
    }

    function tokenSlot(uint256 tokenId) external view returns (TokenSlot memory) {
        return _slots[tokenId];
    }

    /**
     * @notice Anchors a slot to an NFT identity + expected expiry for claim activation checks.
     */
    function setSlotAnchor(
        uint256 tokenId,
        address nftCollection,
        uint256 nftTokenId,
        uint64 expectedExpiry
    ) external onlyRole(DEFAULT_ADMIN_ROLE) onlyWhenOperational {
        if (!_slots[tokenId].exists) revert InvalidToken();
        if (nftCollection == address(0)) revert ZeroAddress();
        if (anchorFrozen[tokenId]) revert AnchorFrozenError();
        if (_slots[tokenId].active) revert PolicyViolation();
        if (expectedExpiry <= block.timestamp) revert ClaimExpired();
        _slotAnchors[tokenId] = SlotAnchor({
            exists: true,
            nftCollection: nftCollection,
            nftTokenId: nftTokenId,
            expectedExpiry: expectedExpiry
        });
        emit SlotAnchorSet(tokenId, nftCollection, nftTokenId, expectedExpiry);
    }

    function freezeSlotAnchor(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_slotAnchors[tokenId].exists) revert SlotNotAnchored();
        anchorFrozen[tokenId] = true;
        emit AnchorFrozen(tokenId);
    }

    function slotAnchor(uint256 tokenId) external view returns (SlotAnchor memory) {
        return _slotAnchors[tokenId];
    }

    /// @notice Spec-style valuation for an active token at current cumulative factor.
    function currentTokenValue(uint256 tokenId) public view returns (uint256) {
        TokenSlot memory t = _slots[tokenId];
        if (!t.exists || !t.active) return 0;
        if (t.indexAtActivationWad == 0) return 0;
        return (pInitial * cumulativeFactorWad) / t.indexAtActivationWad;
    }

    function expectedPremiumReserve() external view returns (uint256) {
        return pPremium * inactiveSlotsAtInception;
    }

    function collateralRatioBps() public view returns (uint16) {
        uint256 liabilities = activeTokenCount * pInitial;
        if (liabilities == 0) return type(uint16).max;
        uint256 ratio = (operationalFund * 10_000) / liabilities;
        if (ratio > type(uint16).max) return type(uint16).max;
        return uint16(ratio);
    }

    function _enforceCollateralRatio() internal view {
        if (minCollateralRatioBps == 0) return;
        if (collateralRatioBps() < minCollateralRatioBps) revert PolicyViolation();
    }

    function _requireIssuanceCert(
        uint256 tokenId,
        address slotOwner,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) internal {
        if (!enforceIssuanceCertificates) return;
        if (issuanceSigner == address(0)) revert InvalidIssuanceCertificate();
        if (deadline < block.timestamp) revert IssuanceCertificateExpired();
        bytes32 structHash = keccak256(
            abi.encode(
                ISSUANCE_CERT_TYPEHASH,
                tokenId,
                slotOwner,
                pSale,
                nonce,
                deadline,
                msg.sender
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (usedIssuanceCertDigests[digest]) revert InvalidIssuanceCertificate();
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != issuanceSigner) revert InvalidIssuanceCertificate();
        usedIssuanceCertDigests[digest] = true;
    }

    /// @dev Best-effort decimals read for off-chain tooling.
    function _tryDecimals(address token) private view returns (uint8) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (ok && data.length >= 32) return abi.decode(data, (uint8));
        return 18;
    }
}
