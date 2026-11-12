// src/contractConfig.ts

export const DOGE1_CONTRACT_ADDRESS = "0x034e3Da87c5cE36e23a010ba3c3Dc746ac7c5075";

export const DOGE1_ABI = [
  // Read Functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
  "function approvalWhitelist(address account) view returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",

  // Public / User Write Functions
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",

  // Owner-Only Administrative Functions
  "function mintMore(address to, uint256 amount)",
  "function burn(address from, uint256 amount)",
  "function recoverERC20(address tokenAddress, uint256 tokenAmount)",
  "function setApprovalWhitelist(address account, bool status)",
  "function transferOwnership(address newOwner)",
  "function renounceOwnership()",
  "function withdrawETH()"
];