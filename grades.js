/**
 * Converts a numeric percentage (or decimal) into a letter grade
 * based on the specified [min, max] scale.
 *
 * Usage in Sheets:
 *   =letterGrade(A1)
 * where A1 contains either:
 *   • a percentage like 87 or 87.3
 *   • a decimal like 0.873  (will be treated as 87.3%)
 */
function letterGrade(percent) {
  // Validate input
  if (percent == null || isNaN(percent)) {
    return "Invalid input";
  }

  // Convert decimal (≤1.0) to percentage
  // Note: We check >= 0 to avoid treating negative numbers as small decimals inadvertently,
  // although original logic just did <= 1.0.
  // Original: if (percent <= 1.0) percent *= 100;
  // If percent is -5, -5 <= 1.0 -> -500. Then < 0 -> ERROR. Consistent.
  if (percent <= 1.0) {
    percent *= 100;
  }

  // Early exit for out-of-bounds to match original "ERROR" behavior
  if (percent < 0 || percent > 100) {
    return "ERROR";
  }

  // Use if/else if chain for O(1) complexity (constant time relative to input)
  // and avoid array allocation overhead.
  if (percent >= 96.51) return "A+";
  if (percent >= 92.51) return "A";
  if (percent >= 89.51) return "A-";
  if (percent >= 86.51) return "B+";
  if (percent >= 82.51) return "B";
  if (percent >= 79.51) return "B-";
  if (percent >= 76.51) return "C+";
  if (percent >= 72.51) return "C";
  if (percent >= 69.51) return "C-";
  if (percent >= 66.51) return "D+";
  if (percent >= 62.51) return "D";
  if (percent >= 59.51) return "D-";

  // Anything below 59.51 (down to 0) is F
  // Original F range was [0, 59.5].
  // This efficiently covers [0, 59.51) which closes the [59.5, 59.51) gap as F.
  return "F";
}

/**
 * Converts a numeric percentage (or decimal) into a letter grade
 * based on a simplified 1–5 scale:
 *   • F for <30%
 *   • D for 30–49%
 *   • C for 50–69%
 *   • B for 70–79%
 *   • A for 80–99%
 *   • A+ for exactly 100%
 *
 * Usage in Sheets:
 *   =letterGradeSimple(A1)
 * where A1 contains either:
 *   • a percentage like 85 or 85.0
 *   • a decimal like 0.85  (will be treated as 85%)
 */
function APLetter(score) {
  // Validate input
  if (score == null || isNaN(score)) {
    return "Invalid input";
  }

  // Convert decimal (≤1.0) to percentage
  if (score <= 1.0) {
    score *= 100;
  }

  // Out-of-bounds check
  if (score < 0 || score > 100) {
    return "Invalid input";
  }

  // Assign grades based on the given scale
  // Using if/else is already efficient.
  if (score < 30) return "F";
  if (score < 50) return "D";
  if (score < 70) return "C";
  if (score < 80) return "B";
  if (score < 100) return "A";

  // score === 100 (since >100 is caught above)
  return "A+";
}
