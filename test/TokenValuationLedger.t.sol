// SPDX-License-Identifier: LicenseRef-Commercial
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {TokenValuationLedger} from "../contracts/TokenValuationLedger.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract TokenValuationLedgerTest is Test {
    MockUSD internal usd;
    TokenValuationLedger internal ledger;

    address internal admin = address(this);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        usd = new MockUSD();
        ledger = new TokenValuationLedger(
            usd,
            10, // total slots
            1, // initial active slots
            1e6, // pInitial
            135e4, // pSale = 1.35e6
            1e6, // pCore
            35e4, // pPremium = 0.35e6
            admin,
            admin,
            address(0),
            address(0)
        );

        // bootstrap with enough settlement funds
        uint256 bootstrap = (1e6 + 35e4) * 9;
        usd.mint(admin, bootstrap);
        usd.approve(address(ledger), bootstrap);
        ledger.bootstrapLiquidity(admin);
        ledger.bootstrapTokenRange(1, 10, alice);

        // make slot #2 eligible for reissue
        vm.prank(admin);
        ledger.setSlotAnchor(2, address(0x1234), 22, uint64(block.timestamp + 30 days));
    }

    function testReturnPeriodReplayBlocked() public {
        bytes16 pid = bytes16(uint128(0x1001));
        ledger.applyPeriodReturnWithPeriod(pid, uint64(block.timestamp - 2 days), uint64(block.timestamp - 1 days), 1e16);
        vm.expectRevert(TokenValuationLedger.ReturnPeriodAlreadyUsed.selector);
        ledger.applyPeriodReturnWithPeriod(pid, uint64(block.timestamp - 2 days), uint64(block.timestamp - 1 days), 1e16);
    }

    function testReissueRequiresFunding() public {
        vm.prank(alice);
        vm.expectRevert(); // ERC20 transferFrom failure (insufficient allowance/balance)
        ledger.reissue(2);

        usd.mint(alice, 2_000_000);
        vm.startPrank(alice);
        usd.approve(address(ledger), type(uint256).max);
        ledger.reissue(2);
        vm.stopPrank();
    }

    function testDailyRedemptionLimitEnforced() public {
        vm.prank(admin);
        ledger.setSolvencyPolicy(0, 500_000); // $0.50 max/day, below a 1.00-ish claim

        vm.prank(alice);
        vm.expectRevert(TokenValuationLedger.PolicyViolation.selector);
        ledger.redeem(1);
    }

    function testComplianceTransferGate() public {
        vm.prank(admin);
        ledger.setComplianceMode(true);
        vm.prank(admin);
        ledger.setInstitutionAllowlist(alice, true);
        vm.prank(admin);
        ledger.setInstitutionAllowlist(bob, false);

        vm.prank(alice);
        vm.expectRevert(TokenValuationLedger.ComplianceViolation.selector);
        ledger.transferToken(bob, 1);
    }
}

