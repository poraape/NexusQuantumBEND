import { logger } from '../services/logger';

interface ParseOptions {
    treatEmptyAsZero?: boolean;
}

/**
 * Safely parses a value into a floating-point number.
 * Handles both Brazilian currency format (e.g., "R$ 1.234,56") and standard/XML format (e.g., "1,234.56").
 * It intelligently determines the decimal separator based on the last occurrence of a dot or comma.
 * Returns NaN for null, undefined, NaN, or non-numeric strings unless explicitly configured.
 * @param value The value to parse.
 * @param options Optional parsing configuration.
 * @returns The parsed number, or NaN if parsing fails.
 */
export const parseSafeFloat = (value: any, { treatEmptyAsZero = false }: ParseOptions = {}): number => {
    if (value === null || value === undefined) {
        return NaN;
    }

    if (typeof value === 'number') {
        return Number.isNaN(value) ? NaN : value;
    }

    if (typeof value !== 'string') {
        return NaN;
    }

    let trimmed = value.trim();
    if (trimmed === '') {
        return treatEmptyAsZero ? 0 : NaN;
    }

    // Remove any non-numeric characters except for dots, commas, and the minus sign at the beginning.
    let sanitized = trimmed.replace(/[^\d.,-]/g, '');

    const lastComma = sanitized.lastIndexOf(',');
    const lastDot = sanitized.lastIndexOf('.');

    // Determine which is the decimal separator by its last position.
    if (lastComma > lastDot) {
        // Comma is likely the decimal separator (e.g., "1.234,56").
        sanitized = sanitized.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
        // Dot is likely the decimal separator (e.g., "1,234.56").
        sanitized = sanitized.replace(/,/g, '');
    } else {
        // No thousands separators, or only one type of separator exists.
        sanitized = sanitized.replace(',', '.');
    }

    const result = parseFloat(sanitized);

    if (Number.isNaN(result)) {
        logger.log('parseSafeFloat', 'WARN', `Falha ao converter valor para numero: '${value}' se tornou '${sanitized}'`, {
            original: value,
            processed: sanitized,
        });
    }

    return result;
};
