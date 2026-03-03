// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

interface Vm {
    function prank(address msgSender) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
}
