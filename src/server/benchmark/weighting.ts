export function computeBrandWeight(args: {
  agreementCount: number;
  medianAgreement: number;
}): number {
  if (args.medianAgreement <= 0) return 1.0;
  return Math.min(1.0, args.agreementCount / args.medianAgreement);
}
