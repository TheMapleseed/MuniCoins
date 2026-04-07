// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ValuationLinkRegistry
 * @notice Binds an ERC-721 token from a registered collection to a TokenValuationLedger slot so
 *         off-chain / indexer logic can treat them as one intersected position. Auditors
 *         can verify the link on-chain; valuations are still computed from the ledger math.
 */
contract ValuationLinkRegistry is AccessControl {
    bytes32 public constant LINK_ADMIN_ROLE = keccak256("LINK_ADMIN_ROLE");

    /// @notice keccak256(abi.encode(nftCollection, tokenId)) => ledger slot id (1-based).
    mapping(bytes32 => uint256) public ledgerSlotByNft;

    event LinkUpdated(
        address indexed nftCollection,
        uint256 indexed nftTokenId,
        uint256 ledgerSlot,
        address indexed setBy
    );

    error ZeroAddress();
    error SlotZero();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(LINK_ADMIN_ROLE, admin);
    }

    function linkKey(address nftCollection, uint256 nftTokenId) public pure returns (bytes32) {
        return keccak256(abi.encode(nftCollection, nftTokenId));
    }

    function setLink(address nftCollection, uint256 nftTokenId, uint256 ledgerSlot)
        external
        onlyRole(LINK_ADMIN_ROLE)
    {
        if (nftCollection == address(0)) revert ZeroAddress();
        if (ledgerSlot == 0) revert SlotZero();
        bytes32 k = linkKey(nftCollection, nftTokenId);
        ledgerSlotByNft[k] = ledgerSlot;
        emit LinkUpdated(nftCollection, nftTokenId, ledgerSlot, msg.sender);
    }

    function getLedgerSlot(address nftCollection, uint256 nftTokenId)
        external
        view
        returns (uint256)
    {
        return ledgerSlotByNft[linkKey(nftCollection, nftTokenId)];
    }
}
