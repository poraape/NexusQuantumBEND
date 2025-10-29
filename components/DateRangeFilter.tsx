import React, { useState, useEffect, useCallback } from 'react';

interface DateRangeFilterProps {
    onFilterChange: (startDate: string, endDate: string) => void;
    disabled: boolean;
}

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ onFilterChange, disabled }) => {
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');

    const stableOnFilterChange = useCallback(onFilterChange, []);

    useEffect(() => {
        stableOnFilterChange(start, end);
    }, [start, end, stableOnFilterChange]);

    const handleClear = () => {
        setStart('');
        setEnd('');
    };

    return (
        <div className="bg-gray-700/50 p-3 rounded-lg flex items-center justify-center gap-x-4 gap-y-2 flex-wrap animate-fade-in">
            <label htmlFor="start-date" className="text-sm font-semibold text-gray-400">Filtrar por Emissão:</label>
            <input 
                id="start-date"
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
                disabled={disabled}
                className="bg-gray-700 border-gray-600 rounded-md px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Data de início"
            />
            <span className="text-gray-500">até</span>
            <input 
                id="end-date"
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
                disabled={disabled}
                min={start || ''}
                className="bg-gray-700 border-gray-600 rounded-md px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Data de fim"
            />
            <button
                onClick={handleClear}
                disabled={disabled || (!start && !end)}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors underline"
            >
                Limpar
            </button>
        </div>
    );
};

export default DateRangeFilter;