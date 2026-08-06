export const COMMON_AMOUNTS: number[] = [
  500, 1000, 1500, 2000, 2500, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 50000, 100000, 250000, 500000,
];

export const OTHER_AMOUNT = '__OTHER__';

export const amountOptions = COMMON_AMOUNTS.map(a => ({
  value: String(a),
  label: '₦' + a.toLocaleString(),
}));
