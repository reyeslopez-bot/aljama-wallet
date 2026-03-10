// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {PqcBindingRegistry} from "../src/PqcBindingRegistry.sol";

contract PqcBindingRegistryHandler {
    PqcBindingRegistry internal immutable registry;

    constructor(PqcBindingRegistry _registry) {
        registry = _registry;
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
}

contract PqcBindingRegistryInvariantTest is StdInvariant, Test {
    PqcBindingRegistry private registry;
    PqcBindingRegistryHandler private handler;

    function setUp() public {
        registry = new PqcBindingRegistry();
        handler = new PqcBindingRegistryHandler(registry);
        targetContract(address(handler));
    }

    function invariant_BindingStateIsAlwaysConsistent() public view {
        PqcBindingRegistry.BindingCommitment memory commitment = registry.bindingOf(address(handler));

        if (commitment.bindingHash == bytes32(0)) {
            assertEq(commitment.statementHash, bytes32(0));
            assertEq(commitment.signatureHash, bytes32(0));
            assertEq(commitment.publicKeyHash, bytes32(0));
            assertEq(commitment.uriHash, bytes32(0));
            assertEq(commitment.version, 0);
            assertEq(commitment.updatedAt, 0);
            return;
        }

        bytes32 expectedBindingHash = keccak256(
            abi.encode(
                registry.DOMAIN(),
                commitment.statementHash,
                commitment.signatureHash,
                commitment.publicKeyHash
            )
        );

        assertEq(commitment.bindingHash, expectedBindingHash);
        assertEq(commitment.version, registry.VERSION());
        assertTrue(commitment.updatedAt > 0);
    }
}
