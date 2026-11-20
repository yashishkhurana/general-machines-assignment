// Number text that never contradicts the comparison it sits in, and strict parsing of typed numbers.

/** Format x with the fewest decimals (1–3) that keep it on the same side of `threshold` as the true value,
 *  so 9.99 against 10 reads "9.99", never "10.0 m is under 10 m". */
export function fmtVs(x: number, threshold: number, minDecimals = 1): string {
  if (!Number.isFinite(x)) return String(x);
  for (let d = minDecimals; d <= 3; d++) {
    const shown = Number(x.toFixed(d));
    const sameSide = x < threshold ? shown < threshold : x > threshold ? shown > threshold : shown === threshold;
    if (sameSide) return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  return x.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export type Parsed = { ok: true; value: number } | { ok: false; empty: boolean; error: string };

/** Strict decimal parsing for typed inputs. Accepts "12", "12.5", "-3", and a single comma as the decimal
 *  point ("12,5") only when there is no other separator. Rejects hex ("0x10"), exponents ("1e3"),
 *  thousands separators ("1,000", "1,000.5", "1 000") and anything else. */
export function parseDecimal(raw: string): Parsed {
  const s = raw.trim();
  if (s === '') return { ok: false, empty: true, error: 'Enter a number.' };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { ok: true, value: Number(s) };
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^-?\d{1,3}( \d{3})+(\.\d+)?$/.test(s)) {
    return { ok: false, empty: false, error: 'Leave out thousands separators: type 1000, not 1,000.' };
  }
  if (/^-?\d+,\d+$/.test(s)) return { ok: true, value: Number(s.replace(',', '.')) };
  if (/^-?0x/i.test(s)) return { ok: false, empty: false, error: 'Hexadecimal numbers are not accepted.' };
  if (/e/i.test(s)) return { ok: false, empty: false, error: 'Type the number in full, without an exponent.' };
  return { ok: false, empty: false, error: 'Not a number. Use digits, with a dot for decimals.' };
}
