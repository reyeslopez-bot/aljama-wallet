// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import {Vm} from "./Vm.sol";

abstract contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(bytes32 left, bytes32 right) internal pure {
        assert(left == right);
    }

    function assertEq(uint64 left, uint64 right) internal pure {
        assert(left == right);
    }

    function assertEq(address left, address right) internal pure {
        assert(left == right);
    }

    function assertTrue(bool value) internal pure {
        assert(value);
    }
}
