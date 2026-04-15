// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title DropParty
/// @notice Viral onchain USDC giveaway — creator funds a pool, first N claimers get instant USDC
contract DropParty {
    IERC20 public immutable usdc;

    struct Drop {
        address creator;
        string title;
        uint256 amountPerClaim;   // in USDC (with 6 decimals)
        uint256 maxClaims;
        uint256 claimedCount;
        bool active;
        uint256 expiresAt;        // unix timestamp, 0 = no expiry
    }

    uint256 public nextDropId;
    mapping(uint256 => Drop) public drops;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event DropCreated(
        uint256 indexed dropId,
        address indexed creator,
        string title,
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

    event DropRefunded(
        uint256 indexed dropId,
        address indexed creator,
        uint256 amount
    );

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    /// @notice Create a new USDC drop. Creator must approve this contract first.
    /// @param title Human-readable name for the drop
    /// @param amountPerClaim USDC amount each claimer receives (6 decimals)
    /// @param maxClaims Maximum number of claimers
    /// @param expiresAt Unix timestamp when the drop expires (0 = no expiry)
    function createDrop(
        string calldata title,
        uint256 amountPerClaim,
        uint256 maxClaims,
        uint256 expiresAt
    ) external returns (uint256 dropId) {
        require(amountPerClaim > 0, "Amount must be > 0");
        require(maxClaims > 0, "Must allow at least 1 claim");
        require(expiresAt == 0 || expiresAt > block.timestamp, "Expiry in past");

        uint256 totalAmount = amountPerClaim * maxClaims;
        require(
            usdc.allowance(msg.sender, address(this)) >= totalAmount,
            "Insufficient USDC allowance"
        );

        bool ok = usdc.transferFrom(msg.sender, address(this), totalAmount);
        require(ok, "USDC transfer failed");

        dropId = nextDropId++;
        drops[dropId] = Drop({
            creator: msg.sender,
            title: title,
            amountPerClaim: amountPerClaim,
            maxClaims: maxClaims,
            claimedCount: 0,
            active: true,
            expiresAt: expiresAt
        });

        emit DropCreated(dropId, msg.sender, title, totalAmount, amountPerClaim, maxClaims, expiresAt);
    }

    /// @notice Claim USDC from an active drop
    /// @param dropId The ID of the drop to claim from
    function claim(uint256 dropId) external {
        Drop storage drop = drops[dropId];
        require(drop.active, "Drop is not active");
        require(drop.claimedCount < drop.maxClaims, "Drop fully claimed");
        require(!hasClaimed[dropId][msg.sender], "Already claimed");
        require(
            drop.expiresAt == 0 || block.timestamp <= drop.expiresAt,
            "Drop has expired"
        );

        hasClaimed[dropId][msg.sender] = true;
        drop.claimedCount++;

        if (drop.claimedCount == drop.maxClaims) {
            drop.active = false;
        }

        bool ok = usdc.transfer(msg.sender, drop.amountPerClaim);
        require(ok, "USDC transfer failed");

        emit Claimed(dropId, msg.sender, drop.amountPerClaim);
    }

    /// @notice Creator can refund remaining USDC after drop expires or closes early
    /// @param dropId The drop to refund
    function refundRemaining(uint256 dropId) external {
        Drop storage drop = drops[dropId];
        require(msg.sender == drop.creator, "Not the creator");
        require(drop.active, "Drop already closed");
        require(
            drop.expiresAt > 0 && block.timestamp > drop.expiresAt,
            "Drop has not expired yet"
        );

        uint256 remaining = (drop.maxClaims - drop.claimedCount) * drop.amountPerClaim;
        drop.active = false;

        if (remaining > 0) {
            bool ok = usdc.transfer(drop.creator, remaining);
            require(ok, "Refund transfer failed");
            emit DropRefunded(dropId, drop.creator, remaining);
        }
    }

    /// @notice Get full drop info
    function getDrop(uint256 dropId) external view returns (
        address creator,
        string memory title,
        uint256 amountPerClaim,
        uint256 maxClaims,
        uint256 claimedCount,
        bool active,
        uint256 expiresAt
    ) {
        Drop storage d = drops[dropId];
        return (d.creator, d.title, d.amountPerClaim, d.maxClaims, d.claimedCount, d.active, d.expiresAt);
    }

    /// @notice Check if an address has claimed from a drop
    function checkClaimed(uint256 dropId, address user) external view returns (bool) {
        return hasClaimed[dropId][user];
    }
}
