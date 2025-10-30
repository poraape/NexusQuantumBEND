import { logger } from '../services/logger';

/**
 * Safely parses a value into a floating-point number.
 * Handles both Brazilian currency format (e.g., "R$ 1.234,56") and standard/XML format (e.g., "1,234.56").
 * It intelligently determines the decimal separator based on the last occurrence of a dot or comma.
 * Returns 0 for null, undefined, NaN, or non-numeric strings.
 * @param value The value to parse.
 * @returns The parsed number, or 0 if parsing fails.
 */
export const parseSafeFloat = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value !== 'string' || value.trim() === '') return 0;

    let s = value.trim();
    
    // Remove any non-numeric characters except for dots, commas, and the minus sign at the beginning.
    s = s.replace(/[^\d.,-]/g, '');

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    // Determine which is the decimal separator by its last position.
    // This is more robust than simply checking for presence.
    if (lastComma > lastDot) {
        // Comma is likely the decimal separator (e.g., "1.234,56").
        // Remove all dots (thousands separators) and replace the last comma with a dot.
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
        // Dot is likely the decimal separator (e.g., "1,234.56").
        // Remove all commas (thousands separators).
        s = s.replace(/,/g, '');
    } else {
        // No thousands separators, or only one type of separator exists.
        // It might be "1234,56" or "1234.56". Replace comma if it exists.
        s = s.replace(',', '.');
    }

    const num = parseFloat(s);
    
    if (isNaN(num)) {
        logger.log('parseSafeFloat', 'WARN', `Falha ao converter valor para número: '${value}' se tornou '${s}'`, { original: value, processed: s });
        return 0;
    }

    return num;
};
