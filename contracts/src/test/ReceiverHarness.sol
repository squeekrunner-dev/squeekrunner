// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SqueekRunnerHamsters} from "../SqueekRunnerHamsters.sol";

/// @dev Test fixture only; never deployed by scripts/deploy.mjs.
contract ReceiverHarness is IERC721Receiver {
    SqueekRunnerHamsters public immutable target;
    uint8 public mode;
    bool public attempted;
    bool public reentrySucceeded;
    bytes4 public blockedSelector;
    uint256 public supplyDuringCallback;
    uint256 private allowance;
    bytes32[] private proof;

    constructor(SqueekRunnerHamsters target_) { target = target_; }
    function configure(uint8 mode_, uint256 allowance_, bytes32[] calldata proof_) external {
        mode = mode_; allowance = allowance_; proof = proof_; attempted = false;
    }
    function mintClaim(uint256 qty) external { target.claim(allowance, qty, proof); }
    function mintReserve(uint256 qty) external { target.ownerMint(address(this), qty); }
    function acceptOwnership() external { target.acceptOwnership(); }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        require(msg.sender == address(target), "Wrong collection");
        supplyDuringCallback = target.totalSupply();
        if (mode == 3) revert("Receiver refuses token");
        if (mode != 0 && !attempted) {
            attempted = true;
            bytes memory callData = mode == 1
                ? abi.encodeCall(target.claim, (allowance, 1, proof))
                : abi.encodeCall(target.ownerMint, (address(this), 1));
            (bool success, bytes memory result) = address(target).call(callData);
            reentrySucceeded = success;
            if (result.length >= 4) blockedSelector = bytes4(result);
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract NonReceiver {
    function mintClaim(SqueekRunnerHamsters target, uint256 allowance, bytes32[] calldata proof) external {
        target.claim(allowance, 1, proof);
    }
}
