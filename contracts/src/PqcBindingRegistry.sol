// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PqcBindingRegistry {
    bytes32 public constant DOMAIN = keccak256("aljama:pqc-binding:v1");
    uint64 public constant VERSION = 1;

    struct BindingCommitment {
        bytes32 bindingHash;
        bytes32 statementHash;
        bytes32 signatureHash;
        bytes32 publicKeyHash;
        bytes32 uriHash;
        uint64 version;
        uint64 updatedAt;
    }

    mapping(address account => BindingCommitment commitment) private latestBindingByAccount;

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

    function bindingOf(address account) external view returns (BindingCommitment memory) {
        return latestBindingByAccount[account];
    }

    function commitBinding(
        bytes32 statementHash,
        bytes32 signatureHash,
        bytes32 publicKeyHash,
        bytes32 uriHash,
        string calldata uri
    ) external returns (bytes32 bindingHash) {
        BindingCommitment memory previous = latestBindingByAccount[msg.sender];
        bindingHash = keccak256(abi.encode(DOMAIN, statementHash, signatureHash, publicKeyHash));

        latestBindingByAccount[msg.sender] = BindingCommitment({
            bindingHash: bindingHash,
            statementHash: statementHash,
            signatureHash: signatureHash,
            publicKeyHash: publicKeyHash,
            uriHash: uriHash,
            version: VERSION,
            updatedAt: uint64(block.timestamp)
        });

        emit BindingCommitted(
            msg.sender,
            bindingHash,
            statementHash,
            signatureHash,
            publicKeyHash,
            uriHash,
            uri,
            VERSION,
            previous.bindingHash
        );
    }

    function clearBinding() external {
        bytes32 previousBindingHash = latestBindingByAccount[msg.sender].bindingHash;
        delete latestBindingByAccount[msg.sender];
        emit BindingCleared(msg.sender, previousBindingHash);
    }
}
