// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DropParty
 * @notice Viral onchain USDC giveaway platform on Arc Network.
 *
 * Flow:
 *   1. Creator calls approve(dropPartyAddress, totalAmount) on USDC
 *   2. Creator calls createDrop() → USDC pulled in atomically, Drop stored, DropCreated emitted
 *   3. Anyone with the share link calls claim(dropId) → receives amountPerClaim USDC
 *   4. Creator can cancel any time to recover remaining USDC
 *   5. After expiry, anyone can trigger refundExpired() → unspent USDC returned to creator
 *
 * Security model:
 *   - Checks-Effects-Interactions (CEI) pattern enforced in ALL write functions:
 *     state is updated BEFORE external token transfers to prevent reentrancy.
 *   - Each drop's funds are accounted for via (maxClaims - claimedCount) * amountPerClaim.
 *     No drop can access another drop's USDC because transfers are always bounded by
 *     the drop's own accounting, not the contract's total balance.
 *   - One address can only claim once per drop (mapping prevents double-claim).
 *   - Creator is the sole beneficiary of all refunds; refundExpired() can be called by
 *     anyone as a gas bounty, but funds always go to d.creator.
 *   - Solidity 0.8.20 reverts on overflow/underflow automatically. The only unchecked
 *     block is the nextDropId increment, which would require 2^256 transactions to wrap.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract DropParty {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_CLAIMS      = 10_000;
    uint256 public constant MAX_TITLE_BYTES = 200;
    // 1 billion USDC (6 dec) per claim — effectively unreachable but prevents
    // any uint256 multiplication reaching values that could cause logical issues
    // even though Solidity 0.8 would revert on actual overflow.
    uint256 public constant MAX_AMOUNT_PER_CLAIM = 1_000_000_000 * 1e6;
    // 10 years in seconds — prevents nonsensical far-future expiry
    uint256 public constant MAX_EXPIRY_OFFSET = 10 * 365 days;

    // ─── State ───────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;

    uint256 public nextDropId;

    struct Drop {
        address creator;
        string  title;
        uint256 amountPerClaim; // USDC with 6 decimals
        uint256 maxClaims;
        uint256 claimedCount;
        bool    active;
        uint256 expiresAt;      // unix seconds; 0 = never
    }

    // dropId → Drop
    mapping(uint256 => Drop) private _drops;

    // dropId → claimer → claimed
    // Two-level mapping ensures each (drop, address) pair is independent.
    mapping(uint256 => mapping(address => bool)) private _claimed;

    // ─── Events ──────────────────────────────────────────────────────────────

    event DropCreated(
        uint256 indexed dropId,
        address indexed creator,
        string  title,
        uint256 totalAmount,
        uint256 amountPerClaim,
        uint256 maxClaims,
        uint256 expiresAt
    );

    event Claimed(
        uint256 indexed dropId,
        address indexed claimer,
        uint256 amount
    );

    event DropCancelled(
        uint256 indexed dropId,
        address indexed creator,
        uint256 refundAmount
    );

    event DropExpiredRefund(
        uint256 indexed dropId,
        address indexed creator,
        uint256 refundAmount
    );

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    // ─── Write functions ─────────────────────────────────────────────────────

    /**
     * @notice Create a new USDC drop.
     * @dev Caller must have approved this contract for at least amountPerClaim * maxClaims.
     *      USDC is pulled atomically in this call — no USDC is held on behalf of other drops.
     * @param title          Human-readable name (max 200 bytes)
     * @param amountPerClaim USDC amount each claimer receives (6 decimals, e.g. 2000000 = $2)
     * @param maxClaims      How many unique wallets can claim (max 10,000)
     * @param expiresAt      Unix timestamp when unclaimed USDC can be refunded (0 = no expiry)
     * @return dropId        The ID of the newly created drop
     */
    function createDrop(
        string calldata title,
        uint256 amountPerClaim,
        uint256 maxClaims,
        uint256 expiresAt
    ) external returns (uint256 dropId) {
        // ── Input validation ──────────────────────────────────────────────────
        require(bytes(title).length > 0,               "Title required");
        require(bytes(title).length <= MAX_TITLE_BYTES, "Title too long (max 200 bytes)");
        require(amountPerClaim > 0,                     "Amount must be > 0");
        require(amountPerClaim <= MAX_AMOUNT_PER_CLAIM, "Amount per claim too large");
        require(maxClaims > 0,                          "Must allow at least 1 claim");
        require(maxClaims <= MAX_CLAIMS,                "Too many claims (max 10000)");
        require(
            expiresAt == 0 ||
            (expiresAt > block.timestamp && expiresAt <= block.timestamp + MAX_EXPIRY_OFFSET),
            "Expiry must be in the future and within 10 years"
        );

        // ── Fund transfer (safe: Solidity 0.8 catches overflow) ──────────────
        uint256 totalAmount = amountPerClaim * maxClaims;

        require(
            usdc.allowance(msg.sender, address(this)) >= totalAmount,
            "Insufficient USDC allowance - call approve() first"
        );

        // EFFECT: assign dropId and increment counter before external call
        dropId = nextDropId;
        unchecked { nextDropId++; } // uint256 counter; wrap requires 2^256 txs

        // EFFECT: write drop state before external call
        _drops[dropId] = Drop({
            creator:        msg.sender,
            title:          title,
            amountPerClaim: amountPerClaim,
            maxClaims:      maxClaims,
            claimedCount:   0,
            active:         true,
            expiresAt:      expiresAt
        });

        // INTERACTION: pull USDC from creator after all state is written
        bool ok = usdc.transferFrom(msg.sender, address(this), totalAmount);
        require(ok, "USDC transferFrom failed");

        emit DropCreated(
            dropId,
            msg.sender,
            title,
            totalAmount,
            amountPerClaim,
            maxClaims,
            expiresAt
        );
    }

    /**
     * @notice Claim USDC from an active drop. One claim per wallet per drop.
     * @dev CEI pattern: all state changes happen before the USDC transfer.
     * @param dropId The drop to claim from
     */
    function claim(uint256 dropId) external {
        Drop storage d = _drops[dropId];

        // ── Checks ────────────────────────────────────────────────────────────
        require(d.active,                         "Drop is not active");
        require(d.claimedCount < d.maxClaims,     "Drop is fully claimed");
        require(!_claimed[dropId][msg.sender],    "Already claimed this drop");
        require(
            d.expiresAt == 0 || block.timestamp <= d.expiresAt,
            "Drop has expired"
        );

        // ── Effects (ALL state changes before any external call) ──────────────
        _claimed[dropId][msg.sender] = true; // mark claimed — prevents double-claim
        d.claimedCount++;                    // track count — bounds subsequent claims

        // Auto-deactivate when last slot is taken
        if (d.claimedCount == d.maxClaims) {
            d.active = false;
        }

        // ── Interaction ───────────────────────────────────────────────────────
        bool ok = usdc.transfer(msg.sender, d.amountPerClaim);
        require(ok, "USDC transfer failed");

        emit Claimed(dropId, msg.sender, d.amountPerClaim);
    }

    /**
     * @notice Creator cancels their drop and recovers all remaining USDC.
     * @dev CEI pattern: drop is deactivated before any transfer.
     *      Only the creator can call this. Remaining = unclaimed slots × amountPerClaim.
     * @param dropId The drop to cancel
     */
    function cancelDrop(uint256 dropId) external {
        Drop storage d = _drops[dropId];

        // ── Checks ────────────────────────────────────────────────────────────
        require(msg.sender == d.creator, "Not the creator");
        require(d.active,                "Drop already closed");

        // ── Effects ───────────────────────────────────────────────────────────
        uint256 remaining = (d.maxClaims - d.claimedCount) * d.amountPerClaim;
        d.active = false; // close before transfer — prevents reentrant cancel

        // ── Interaction ───────────────────────────────────────────────────────
        if (remaining > 0) {
            bool ok = usdc.transfer(d.creator, remaining);
            require(ok, "Refund transfer failed");
        }

        emit DropCancelled(dropId, d.creator, remaining);
    }

    /**
     * @notice Refund remaining USDC after a drop has expired.
     * @dev Can be called by ANYONE after expiry — creator always receives the refund.
     *      CEI pattern: drop is deactivated before any transfer.
     * @param dropId The drop to refund
     */
    function refundExpired(uint256 dropId) external {
        Drop storage d = _drops[dropId];

        // ── Checks ────────────────────────────────────────────────────────────
        require(d.active,        "Drop already closed");
        require(d.expiresAt > 0, "Drop has no expiry - use cancelDrop");
        require(
            block.timestamp > d.expiresAt,
            "Drop has not expired yet"
        );

        // ── Effects ───────────────────────────────────────────────────────────
        uint256 remaining = (d.maxClaims - d.claimedCount) * d.amountPerClaim;
        d.active = false; // close before transfer — prevents reentrant refund

        // ── Interaction ───────────────────────────────────────────────────────
        // NOTE: refund ALWAYS goes to d.creator regardless of who calls this function
        if (remaining > 0) {
            bool ok = usdc.transfer(d.creator, remaining);
            require(ok, "Refund transfer failed");
        }

        emit DropExpiredRefund(dropId, d.creator, remaining);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Get all details for a drop.
     */
    function getDrop(uint256 dropId) external view returns (
        address creator,
        string memory title,
        uint256 amountPerClaim,
        uint256 maxClaims,
        uint256 claimedCount,
        bool    active,
        uint256 expiresAt,
        uint256 remainingSlots,
        uint256 totalAmount
    ) {
        Drop storage d = _drops[dropId];
        creator        = d.creator;
        title          = d.title;
        amountPerClaim = d.amountPerClaim;
        maxClaims      = d.maxClaims;
        claimedCount   = d.claimedCount;
        active         = d.active;
        expiresAt      = d.expiresAt;
        remainingSlots = d.maxClaims - d.claimedCount;
        totalAmount    = d.amountPerClaim * d.maxClaims;
    }

    /**
     * @notice Check whether a specific address has claimed from a drop.
     */
    function hasClaimed(uint256 dropId, address user) external view returns (bool) {
        return _claimed[dropId][user];
    }

    /**
     * @notice Check whether a drop is currently claimable.
     */
    function isClaimable(uint256 dropId) external view returns (bool claimable, string memory reason) {
        Drop storage d = _drops[dropId];

        if (!d.active) {
            return (false, "Drop is closed");
        }
        if (d.claimedCount >= d.maxClaims) {
            return (false, "Fully claimed");
        }
        if (d.expiresAt > 0 && block.timestamp > d.expiresAt) {
            return (false, "Drop has expired");
        }
        return (true, "");
    }

    /**
     * @notice Accounting balance for a drop: unclaimed slots × amountPerClaim.
     *         This exactly matches what the contract owes to this drop's claimers.
     */
    function dropBalance(uint256 dropId) external view returns (uint256) {
        Drop storage d = _drops[dropId];
        return (d.maxClaims - d.claimedCount) * d.amountPerClaim;
    }

    /**
     * @notice Total number of drops ever created (including closed ones).
     */
    function totalDrops() external view returns (uint256) {
        return nextDropId;
    }
}
