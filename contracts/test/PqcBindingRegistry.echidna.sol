// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PqcBindingRegistry} from "../src/PqcBindingRegistry.sol";

contract PqcBindingRegistryEchidna {
    PqcBindingRegistry private immutable registry;

    constructor() {
        registry = new PqcBindingRegistry();
    }

    function commitBinding(
        bytes32 statementHash,
        bytes32 signatureHash,
        bytes32 publicKeyHash,
        bytes32 uriHash,
        string calldata uri
    ) external {
        registry.commitBinding(statementHash, signatureHash, publicKeyHash, uriHash, uri);
    }

    function clearBinding() external {
        registry.clearBinding();
    }

    function echidna_binding_hash_matches_committed_inputs() external view returns (bool) {
        PqcBindingRegistry.BindingCommitment memory commitment = registry.bindingOf(address(this));

        if (commitment.bindingHash == bytes32(0)) {
            return
                commitment.statementHash == bytes32(0) &&
                commitment.signatureHash == bytes32(0) &&
                commitment.publicKeyHash == bytes32(0) &&
                commitment.uriHash == bytes32(0) &&
                commitment.version == 0 &&
                commitment.updatedAt == 0;
        }

        bytes32 expectedBindingHash = keccak256(
            abi.encode(
                registry.DOMAIN(),
                commitment.statementHash,
                commitment.signatureHash,
                commitment.publicKeyHash
            )
        );

        return
            commitment.bindingHash == expectedBindingHash &&
            commitment.version == registry.VERSION() &&
            commitment.updatedAt > 0;
    }
}
