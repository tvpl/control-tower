export function inventoryCoverage(
  program: Record<string, any>,
  identified: number,
) {
  const denominator =
      program.inventory_estimate == null
        ? null
        : Number(program.inventory_estimate),
    outdated = denominator !== null && denominator < identified;
  return {
    formulaVersion: "inventory-coverage-1.0.0",
    status:
      denominator === null
        ? "UNKNOWN"
        : outdated
          ? "ESTIMATE_OUTDATED"
          : "ESTIMATED",
    numerator: identified,
    denominator,
    percentage:
      denominator && !outdated
        ? Math.round((identified / denominator) * 100)
        : null,
    asOf: program.inventory_estimate_as_of || null,
    source: program.inventory_estimate_notes || null,
    programVersion: Number(program.version),
  };
}
