// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Free ERC-721 mint: 900 lifetime allowlist tokens plus 100 owner reserve.
/// @dev No burn, proxy, oracle, payment, withdrawal or royalty extension.
contract SqueekRunnerHamsters is ERC721, Ownable2Step, ReentrancyGuard {
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public constant RESERVE = 100;
    uint256 public constant ALLOWLIST_SUPPLY = MAX_SUPPLY - RESERVE;

    enum Phase { Closed, Allowlist }
    Phase public phase;
    bytes32 public merkleRoot;
    uint256 public totalSupply;
    uint256 public allowlistMinted;
    uint256 public reserveMinted;
    mapping(address => uint256) public claimed;
    string public baseURI;
    bool public metadataFrozen;

    error MintClosed();
    error InvalidQuantity();
    error InvalidProof();
    error InvalidMerkleRoot();
    error AllowanceExceeded();
    error AllowlistSupplyExceeded();
    error ReserveSupplyExceeded();
    error MaxSupplyExceeded();
    error MetadataIsFrozen();
    error EmptyBaseURI();

    event MerkleRootUpdated(bytes32 indexed previousRoot, bytes32 indexed newRoot);
    event PhaseUpdated(Phase previousPhase, Phase newPhase);
    event Claimed(address indexed account, uint256 quantity, uint256 firstTokenId);
    event ReserveMinted(address indexed recipient, uint256 quantity, uint256 firstTokenId);
    event BaseURIUpdated(string previousBaseURI, string newBaseURI);
    event MetadataFrozen(string baseURI);

    constructor(string memory name_, string memory symbol_, address initialOwner, string memory initialBaseURI)
        ERC721(name_, symbol_) Ownable(initialOwner)
    {
        baseURI = initialBaseURI;
    }

    /// @param allowance Cumulative entitlement for msg.sender across ALL root versions.
    function claim(uint256 allowance, uint256 qty, bytes32[] calldata proof) external nonReentrant {
        if (phase != Phase.Allowlist) revert MintClosed();
        if (qty == 0) revert InvalidQuantity();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, allowance))));
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) revert InvalidProof();
        uint256 alreadyClaimed = claimed[msg.sender];
        // Subtraction avoids overflow for adversarial uint256 allowance/qty.
        if (alreadyClaimed > allowance || qty > allowance - alreadyClaimed) revert AllowanceExceeded();
        if (qty > ALLOWLIST_SUPPLY - allowlistMinted) revert AllowlistSupplyExceeded();
        claimed[msg.sender] = alreadyClaimed + qty;
        allowlistMinted += qty;
        uint256 firstId = _mintBatch(msg.sender, qty);
        emit Claimed(msg.sender, qty, firstId);
    }

    /// @notice Reserve is separate from allowlist, available even when the phase is Closed.
    function ownerMint(address to, uint256 qty) external onlyOwner nonReentrant {
        if (qty == 0) revert InvalidQuantity();
        if (qty > RESERVE - reserveMinted) revert ReserveSupplyExceeded();
        reserveMinted += qty;
        uint256 firstId = _mintBatch(to, qty);
        emit ReserveMinted(to, qty, firstId);
    }

    function setMerkleRoot(bytes32 newRoot) external onlyOwner {
        if (newRoot == bytes32(0)) revert InvalidMerkleRoot();
        emit MerkleRootUpdated(merkleRoot, newRoot);
        merkleRoot = newRoot;
    }

    function setPhase(Phase newPhase) external onlyOwner {
        if (newPhase == Phase.Allowlist && merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        emit PhaseUpdated(phase, newPhase);
        phase = newPhase;
    }

    /// @dev Supply a prefix including the trailing slash, e.g. ipfs://CID/.
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        if (bytes(newBaseURI).length == 0) revert EmptyBaseURI();
        emit BaseURIUpdated(baseURI, newBaseURI);
        baseURI = newBaseURI;
    }

    function freezeMetadata() external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        if (bytes(baseURI).length == 0) revert EmptyBaseURI();
        metadataFrozen = true;
        emit MetadataFrozen(baseURI);
    }

    /// @return URI Empty until a base is set; otherwise prefix + decimal id + .json.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (bytes(baseURI).length == 0) return "";
        return string.concat(baseURI, Strings.toString(tokenId), ".json");
    }

    function _mintBatch(address to, uint256 qty) private returns (uint256 firstId) {
        if (qty > MAX_SUPPLY - totalSupply) revert MaxSupplyExceeded();
        firstId = totalSupply + 1;
        // Reserve every id/counter before any ERC721Receiver callback. A failed
        // callback reverts the entire batch, including all counters and events.
        totalSupply += qty;
        for (uint256 id = firstId; id < firstId + qty; ++id) _safeMint(to, id);
    }
}
