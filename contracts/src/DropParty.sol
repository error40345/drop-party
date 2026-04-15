// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DropParty
 * @notice Viral onchain USDC giveaway platform on Arc Network.
 *
 * Flow:
 *   1. Creator calls approve(dropPartyAddress, totalAmount) on USDC
 *   2. Creator calls createDrop() → USDC pulled in, Drop stored, DropCreated event emitted
 *   3. Anyone calls claim(dropId) → receives amountPerClaim USDC, Claimed event emitted
 *   4. After expiry, creator calls refundRemaining(dropId) → unspent USDC returned
 *
 * Design choices:
 *   - One contract holds multiple drops (identified by dropId uint256)
 *   - Each drop is independent: separate USDC pool, separate claim tracking
 *   - One address can only claim once per drop (anti-bot)
 *   - Creator can cancel their own active drop and recover remaining USDC at any time
 *   - Drops auto-deactivate when fully claimed
 *   - All USDC amounts use 6 decimals (Arc Testnet USDC ERC-20 standard)
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract DropParty {
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

    // ─── Write functions ──────────────────────────────────────────────────────

    /**
     * @notice Create a new USDC drop.
     * @dev Caller must have approved this contract for at least amountPerClaim * maxClaims.
     * @param title        Human-readable name shown on the UI
     * @param amountPerClaim USDC amount each claimer receives (6 decimals, e.g. 2000000 = $2)
     * @param maxClaims    How many unique wallets can claim
     * @param expiresAt    Unix timestamp when unclaimed USDC can be refunded (0 = no expiry)
     * @return dropId      The ID of the newly created drop
     */
    function createDrop(
        string calldata title,
        uint256 amountPerClaim,
        uint256 maxClaims,
        uint256 expiresAt
    ) external returns (uint256 dropId) {
        require(bytes(title).length > 0,  "Title required");
        require(amountPerClaim > 0,        "Amount must be > 0");
        require(maxClaims > 0,             "Must allow at least 1 claim");
        require(maxClaims <= 10000,        "Too many claims (max 10000)");
        require(
            expiresAt == 0 || expiresAt > block.timestamp,
            "Expiry must be in the future"
        );

        uint256 totalAmount = amountPerClaim * maxClaims;

        require(
            usdc.allowance(msg.sender, address(this)) >= totalAmount,
            "Insufficient USDC allowance - call approve() first"
        );

        bool ok = usdc.transferFrom(msg.sender, address(this), totalAmount);
        require(ok, "USDC transferFrom failed");

        dropId = nextDropId;
        unchecked { nextDropId++; }

        _drops[dropId] = Drop({
            creator:       msg.sender,
            title:         title,
            amountPerClaim: amountPerClaim,
            maxClaims:     maxClaims,
            claimedCount:  0,
            active:        true,
            expiresAt:     expiresAt
        });

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
     * @param dropId The drop to claim from
     */
    function claim(uint256 dropId) external {
        Drop storage d = _drops[dropId];

        require(d.active,                         "Drop is not active");
        require(d.claimedCount < d.maxClaims,     "Drop is fully claimed");
        require(!_claimed[dropId][msg.sender],    "Already claimed this drop");
        require(
            d.expiresAt == 0 || block.timestamp <= d.expiresAt,
            "Drop has expired"
        );

        _claimed[dropId][msg.sender] = true;
        d.claimedCount++;

        // Auto-deactivate when last slot is taken
        if (d.claimedCount == d.maxClaims) {
            d.active = false;
        }

        bool ok = usdc.transfer(msg.sender, d.amountPerClaim);
        require(ok, "USDC transfer failed");

        emit Claimed(dropId, msg.sender, d.amountPerClaim);
    }

    /**
     * @notice Creator cancels their drop and recovers all remaining USDC.
     * @dev Only callable by the original creator. Closes the drop immediately.
     * @param dropId The drop to cancel
     */
    function cancelDrop(uint256 dropId) external {
        Drop storage d = _drops[dropId];

        require(msg.sender == d.creator, "Not the creator");
        require(d.active,                "Drop already closed");

        uint256 remaining = (d.maxClaims - d.claimedCount) * d.amountPerClaim;
        d.active = false;

        if (remaining > 0) {
            bool ok = usdc.transfer(d.creator, remaining);
            require(ok, "Refund transfer failed");
        }

        emit DropCancelled(dropId, d.creator, remaining);
    }

    /**
     * @notice Refund remaining USDC after a drop has expired.
     * @dev Can be called by anyone after expiry (gas incentive for creator).
     * @param dropId The drop to refund
     */
    function refundExpired(uint256 dropId) external {
        Drop storage d = _drops[dropId];

        require(d.active,         "Drop already closed");
        require(d.expiresAt > 0,  "Drop has no expiry - use cancelDrop");
        require(
            block.timestamp > d.expiresAt,
            "Drop has not expired yet"
        );

        uint256 remaining = (d.maxClaims - d.claimedCount) * d.amountPerClaim;
        d.active = false;

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
     * @return claimable  True if active, not expired, and has remaining slots
     * @return reason     Human-readable reason if not claimable
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
     * @notice How many USDC (6 dec) the contract currently holds for a drop.
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
