export const MEZO_TESTNET = {
  chainId: 31611,
  name: 'Mezo Testnet',
  rpc: 'https://rpc.test.mezo.org',
  explorer: 'https://explorer.test.mezo.org',
  currency: 'BTC',
} as const;

export const MEZO_CONTRACTS_TESTNET = {
  TroveManager:      '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
  BorrowerOperations:'0xCdF7028ceAB81fA0C6971208e83fa7872994beE5',
  PriceFeed:         '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
  HintHelpers:       '0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6',
  SortedTroves:      '0x722E4D24FD6Ff8b0AC679450F3D91294607268fA',
  MUSD:              '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
  PoolMUSD_BTC:      '0x52e604c44417233b6CcEDDDc0d640A405Caacefb',
  PoolMUSD_mUSDC:    '0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356',
  PoolMUSD_mUSDT:    '0x10906a9E9215939561597b4C8e4b98F93c02031A',
} as const;

export const MEZO = MEZO_TESTNET;
export const MEZO_CONTRACTS = MEZO_CONTRACTS_TESTNET;

// ABIs
export const TROVE_MANAGER_ABI = [
  'function getTroveDebt(address _borrower) view returns (uint256)',
  'function getTroveColl(address _borrower) view returns (uint256)',
  'function getTroveStatus(address _borrower) view returns (uint256)',
  'function getCurrentICR(address _borrower, uint256 _price) view returns (uint256)',
] as const;

export const PRICE_FEED_ABI = [
  'function fetchPrice() view returns (uint256)',
] as const;

export const BORROWER_OPERATIONS_ABI = [
  'function openTrove(uint256 _maxFeePercentage, uint256 _MUSDAmount, address _upperHint, address _lowerHint) payable',
  'function closeTrove()',
  'function adjustTrove(uint256 _maxFeePercentage, uint256 _collWithdrawal, uint256 _MUSDChange, bool _isDebtIncrease, address _upperHint, address _lowerHint) payable',
] as const;

export const MUSD_DECIMALS = 18;
export const TBTC_DECIMALS = 18;
export const MIN_MUSD_BORROW = 1800;
export const MUSD_GAS_COMPENSATION = 200;
export const MIN_COLLATERAL_RATIO = 1.1;
export const SAFE_COLLATERAL_RATIO = 1.5;
export const BORROW_FEE_MIN = 0.01;

export const TROVE_STATUS = {
  0: 'nonExistent',
  1: 'active',
  2: 'closedByOwner',
  3: 'closedByLiquidation',
  4: 'closedByRedemption',
} as const;
