// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PqcBindingRegistry} from "../src/PqcBindingRegistry.sol";

contract PqcBindingRegistryTest is Test {
    event BindingCommitted(
        address indexed account,
        bytes32 indexed bindingHash,
        bytes32 indexed statementHash,
        bytes32 signatureHash,
        bytes32 publicKeyHash,
        bytes32 uriHash,
        string uri,
        uint64 version,
        bytes32 previousBindingHash
    );

    event BindingCleared(address indexed account, bytes32 previousBindingHash);

    PqcBindingRegistry private registry;

    function setUp() public {
        registry = new PqcBindingRegistry();
    }

    function testCommitBindingStoresLatestStateForMsgSender() public {
        bytes32 statementHash = keccak256("statement-1");
        bytes32 signatureHash = keccak256("signature-1");
        bytes32 publicKeyHash = keccak256("pubkey-1");
        bytes32 uriHash = keccak256("uri-1");

        bytes32 bindingHash = registry.commitBinding(
            statementHash,
            signatureHash,
            publicKeyHash,
            uriHash,
            "https://app.example.com/api/public/pqc-bindings/hash-1"
        );
        PqcBindingRegistry.BindingCommitment memory commitment = registry.bindingOf(address(this));

        assertEq(commitment.bindingHash, bindingHash);
        assertEq(commitment.statementHash, statementHash);
        assertEq(commitment.signatureHash, signatureHash);
        assertEq(commitment.publicKeyHash, publicKeyHash);
        assertEq(commitment.uriHash, uriHash);
        assertEq(commitment.version, 1);
        assertTrue(commitment.updatedAt > 0);
    }

    function testCommitBindingEmitsExpectedEventFields() public {
        bytes32 statementHash = keccak256("statement-2");
        bytes32 signatureHash = keccak256("signature-2");
        bytes32 publicKeyHash = keccak256("pubkey-2");
        bytes32 uriHash = keccak256("uri-2");
        string memory uri = "https://app.example.com/api/public/pqc-bindings/hash-2";
        bytes32 bindingHash =
            keccak256(abi.encode(registry.DOMAIN(), statementHash, signatureHash, publicKeyHash));

        vm.expectEmit(true, true, true, true);
        emit BindingCommitted(
            address(this),
            bindingHash,
            statementHash,
            signatureHash,
            publicKeyHash,
            uriHash,
            uri,
            1,
            bytes32(0)
        );

        registry.commitBinding(statementHash, signatureHash, publicKeyHash, uriHash, uri);
    }

    function testRecommitUpdatesStateAndIncludesPreviousBindingHash() public {
        bytes32 firstStatementHash = keccak256("statement-3");
        bytes32 firstSignatureHash = keccak256("signature-3");
        bytes32 firstPublicKeyHash = keccak256("pubkey-3");
        bytes32 firstUriHash = keccak256("uri-3");
        bytes32 firstBindingHash = registry.commitBinding(
            firstStatementHash,
            firstSignatureHash,
            firstPublicKeyHash,
            firstUriHash,
            "https://app.example.com/api/public/pqc-bindings/hash-3"
        );

        bytes32 secondStatementHash = keccak256("statement-4");
        bytes32 secondSignatureHash = keccak256("signature-4");
        bytes32 secondPublicKeyHash = keccak256("pubkey-4");
        bytes32 secondUriHash = keccak256("uri-4");
        string memory secondUri = "https://app.example.com/api/public/pqc-bindings/hash-4";
        bytes32 secondBindingHash =
            keccak256(abi.encode(registry.DOMAIN(), secondStatementHash, secondSignatureHash, secondPublicKeyHash));

        vm.expectEmit(true, true, true, true);
        emit BindingCommitted(
            address(this),
            secondBindingHash,
            secondStatementHash,
            secondSignatureHash,
            secondPublicKeyHash,
            secondUriHash,
            secondUri,
            1,
            firstBindingHash
        );

        registry.commitBinding(
            secondStatementHash,
            secondSignatureHash,
            secondPublicKeyHash,
            secondUriHash,
            secondUri
        );

        PqcBindingRegistry.BindingCommitment memory commitment = registry.bindingOf(address(this));
        assertEq(commitment.bindingHash, secondBindingHash);
    }

    function testClearBindingZerosStateAndEmitsEvent() public {
        bytes32 previousBindingHash = registry.commitBinding(
            keccak256("statement-5"),
            keccak256("signature-5"),
            keccak256("pubkey-5"),
            keccak256("uri-5"),
            "https://app.example.com/api/public/pqc-bindings/hash-5"
        );

        vm.expectEmit(true, false, false, true);
        emit BindingCleared(address(this), previousBindingHash);

        registry.clearBinding();

        PqcBindingRegistry.BindingCommitment memory cleared = registry.bindingOf(address(this));
        assertEq(cleared.bindingHash, bytes32(0));
        assertEq(cleared.statementHash, bytes32(0));
        assertEq(cleared.signatureHash, bytes32(0));
        assertEq(cleared.publicKeyHash, bytes32(0));
        assertEq(cleared.uriHash, bytes32(0));
        assertEq(cleared.version, 0);
        assertEq(cleared.updatedAt, 0);
    }

    function testOneAccountCannotOverwriteAnotherAccountsState() public {
        address alice = address(0xA11CE);
        address bob = address(0xB0B);

        vm.prank(alice);
        registry.commitBinding(
            keccak256("alice-statement"),
            keccak256("alice-signature"),
            keccak256("alice-pubkey"),
            keccak256("alice-uri"),
            "https://app.example.com/api/public/pqc-bindings/alice"
        );

        vm.prank(bob);
        registry.commitBinding(
            keccak256("bob-statement"),
            keccak256("bob-signature"),
            keccak256("bob-pubkey"),
            keccak256("bob-uri"),
            "https://app.example.com/api/public/pqc-bindings/bob"
        );

        PqcBindingRegistry.BindingCommitment memory aliceCommitment = registry.bindingOf(alice);
        PqcBindingRegistry.BindingCommitment memory bobCommitment = registry.bindingOf(bob);

        assertTrue(aliceCommitment.bindingHash != bytes32(0));
        assertTrue(bobCommitment.bindingHash != bytes32(0));
        assertTrue(aliceCommitment.bindingHash != bobCommitment.bindingHash);
    }
}
