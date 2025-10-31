import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { AuditReport, KeyMetric, ChartData } from '../types';
import { parseSafeFloat } from '../utils/parsingUtils';
import Chart from './Chart';

interface IcmsSimulationSettingsProps {
    filteredDocuments: AuditReport['documents'];
}

// Tabela de alíquotas de ICMS interestadual.
// Chave: 'ORIGEM-DESTINO'. O sistema usa fallbacks para casos não listados.
const ICMS_RATE_TABLE: Record<string, number> = {
    'SP-RJ': 12, 'SP-MG': 12, 'SP-ES': 12, 'SP-PR': 12, 'SP-SC': 12, 'SP-RS': 12,
    'RJ-SP': 12, 'RJ-MG': 12, 'RJ-ES': 12,
    'MG-SP': 12, 'MG-RJ': 12, 'MG-ES': 12,
    'BA-SP': 7, 'BA-RJ': 7, 'PE-SP': 7,
    'DEFAULT_INTERSTATE_SE_CO': 12, // Alíquota do S/SE/CO para N/NE/ES
    'DEFAULT_INTERSTATE_N_NE': 7, // Alíquota do N/NE/ES para S/SE/CO
    'DEFAULT_INTRASTATE': 18,
};

const UF_REGIONS: Record<string, 'S' | 'SE' | 'CO' | 'N' | 'NE'> = {
    SP: 'SE', RJ: 'SE', MG: 'SE', ES: 'SE',
    PR: 'S', SC: 'S', RS: 'S',
    MS: 'CO', MT: 'CO', GO: 'CO', DF: 'CO',
    AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
    AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
};

const getIcmsRate = (originUf: string, destUf: string): number => {
    if (originUf === destUf) return ICMS_RATE_TABLE.DEFAULT_INTRASTATE;
    const key = `${originUf}-${destUf}`;
    if (ICMS_RATE_TABLE[key]) return ICMS_RATE_TABLE[key];

    const originRegion = UF_REGIONS[originUf];
    const destRegion = UF_REGIONS[destUf];

    if (originRegion && destRegion) {
        if ((originRegion === 'S' || originRegion === 'SE' || originRegion === 'CO') && (destRegion === 'N' || destRegion === 'NE')) {
            return ICMS_RATE_TABLE.DEFAULT_INTERSTATE_SE_CO;
        }
        if ((originRegion === 'N' || originRegion === 'NE') && (destRegion === 'S' || destRegion === 'SE' || destRegion === 'CO')) {
            return ICMS_RATE_TABLE.DEFAULT_INTERSTATE_N_NE;
        }
    }
    // Default for S-S, SE-SE, etc.
    return ICMS_RATE_TABLE.DEFAULT_INTERSTATE_SE_CO;
}

interface SimulationScenario {
    id: string;
    name: string;
    type: 'generic' | 'uf_specific';
    genericRate?: number;
    ufRates?: Record<string, number>; // { 'SP': 18, 'RJ': 12 }
    estimatedIcms: number;
    baseValue: number;
    referenceRate: number;
}

const IcmsSimulationSettings: React.FC<IcmsSimulationSettingsProps> = ({ filteredDocuments }) => {
    const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
    const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
    const [newScenarioName, setNewScenarioName] = useState('');
    const [newScenarioType, setNewScenarioType] = useState<'generic' | 'uf_specific'>('generic');
    const [genericRateInput, setGenericRateInput] = useState<number>(18.0);
    const [ufRateInputs, setUfRateInputs] = useState<Record<string, number>>({});
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const { baseValueForSim, referenceRate, uniqueUFs } = useMemo(() => {
        const validDocs = filteredDocuments.filter(d => d.status !== 'ERRO' && d.doc.data && d.doc.data.length > 0);
        const allItems = validDocs.flatMap(d => d.doc.data!);
        
        let totalProductValue = 0;
        let weightedIcmsSum = 0;
        const ufs = new Set<string>();

        for (const item of allItems) {
            const value = parseSafeFloat(item.produto_valor_total);
            if (Number.isNaN(value)) {
                continue;
            }

            totalProductValue += value;

            const originUf = item.emitente_uf?.toUpperCase() || 'SP';
            const destUf = item.destinatario_uf?.toUpperCase() || 'SP';
            ufs.add(originUf);
            ufs.add(destUf);

            const rate = getIcmsRate(originUf, destUf);
            weightedIcmsSum += value * (rate / 100);
        }

        const avgRate = totalProductValue > 0 ? (weightedIcmsSum / totalProductValue) * 100 : 18.0;

        return { baseValueForSim: totalProductValue, referenceRate: avgRate, uniqueUFs: Array.from(ufs).sort() };
    }, [filteredDocuments]);

    useEffect(() => {
        // Initialize generic rate input with reference rate if no scenarios exist
        if (scenarios.length === 0) {
            setGenericRateInput(referenceRate);
        }
    }, [referenceRate, scenarios.length]);

    const calculateEstimatedIcms = useCallback((scenario: SimulationScenario): number => {
        if (baseValueForSim === 0) return 0;

        if (scenario.type === 'generic' && scenario.genericRate !== undefined) {
            return baseValueForSim * (scenario.genericRate / 100);
        } else if (scenario.type === 'uf_specific' && scenario.ufRates) {
            let totalEstimatedIcms = 0;
            const validDocs = filteredDocuments.filter(d => d.status !== 'ERRO' && d.doc.data && d.doc.data.length > 0);
            const allItems = validDocs.flatMap(d => d.doc.data!);

            for (const item of allItems) {
                const value = parseSafeFloat(item.produto_valor_total);
                if (Number.isNaN(value) || value === 0) continue;

                const destUf = item.destinatario_uf?.toUpperCase();
                const rate = destUf && scenario.ufRates[destUf] !== undefined 
                             ? scenario.ufRates[destUf] 
                             : getIcmsRate(item.emitente_uf?.toUpperCase() || 'SP', destUf || 'SP'); // Fallback to default if not specified
                
                totalEstimatedIcms += value * (rate / 100);
            }
            return totalEstimatedIcms;
        }
        return 0;
    }, [baseValueForSim, filteredDocuments]);

    const validateInputs = useCallback(() => {
        const errors: string[] = [];
        if (!newScenarioName.trim()) {
            errors.push('O nome do cenário não pode ser vazio.');
        }
        if (scenarios.some(s => s.name === newScenarioName.trim())) {
            errors.push('Já existe um cenário com este nome.');
        }

        if (newScenarioType === 'generic') {
            if (genericRateInput < 0 || genericRateInput > 100) {
                errors.push('A alíquota genérica deve estar entre 0 e 100%.');
            }
        } else if (newScenarioType === 'uf_specific') {
            for (const uf of uniqueUFs) {
                const rate = ufRateInputs[uf] !== undefined ? ufRateInputs[uf] : getIcmsRate('SP', uf);
                if (rate < 0 || rate > 100) {
                    errors.push(`A alíquota para ${uf} deve estar entre 0 e 100%.`);
                }
            }
        }
        setValidationErrors(errors);
        return errors.length === 0;
    }, [newScenarioName, newScenarioType, genericRateInput, ufRateInputs, scenarios, uniqueUFs]);

    const addScenario = useCallback(() => {
        if (!validateInputs()) {
            return;
        }

        let newScenario: SimulationScenario;
        if (newScenarioType === 'generic') {
            newScenario = {
                id: `scenario-${Date.now()}`,
                name: newScenarioName.trim(),
                type: 'generic',
                genericRate: genericRateInput,
                baseValue: baseValueForSim,
                referenceRate: referenceRate,
                estimatedIcms: 0, // Will be calculated below
            };
        } else {
            newScenario = {
                id: `scenario-${Date.now()}`,
                name: newScenarioName.trim(),
                type: 'uf_specific',
                ufRates: ufRateInputs,
                baseValue: baseValueForSim,
                referenceRate: referenceRate,
                estimatedIcms: 0, // Will be calculated below
            };
        }
        newScenario.estimatedIcms = calculateEstimatedIcms(newScenario);
        setScenarios(prev => [...prev, newScenario]);
        setNewScenarioName('');
        setActiveScenarioId(newScenario.id);
        setValidationErrors([]); // Clear errors on successful add
    }, [newScenarioName, newScenarioType, genericRateInput, ufRateInputs, scenarios, baseValueForSim, referenceRate, calculateEstimatedIcms, validateInputs]);

    const updateScenario = useCallback((id: string, updates: Partial<SimulationScenario>) => {
        setScenarios(prev => prev.map(s => {
            if (s.id === id) {
                const updatedScenario = { ...s, ...updates };
                updatedScenario.estimatedIcms = calculateEstimatedIcms(updatedScenario);
                return updatedScenario;
            }
            return s;
        }));
    }, [calculateEstimatedIcms]);

    const removeScenario = useCallback((id: string) => {
        setScenarios(prev => prev.filter(s => s.id !== id));
        if (activeScenarioId === id) {
            setActiveScenarioId(null);
        }
    }, [activeScenarioId]);

    const activeScenario = useMemo(() => scenarios.find(s => s.id === activeScenarioId), [scenarios, activeScenarioId]);

    const ufRateChange = useCallback((uf: string, rate: number) => {
        setUfRateInputs(prev => ({ ...prev, [uf]: rate }));
    }, []);

    const comparisonData = useMemo(() => {
        if (scenarios.length < 2) return null;

        const baseScenario = scenarios[0]; // Use the first scenario as base for comparison
        const data = scenarios.map(s => ({
            label: s.name,
            value: s.estimatedIcms,
        }));

        const tableData = scenarios.map(s => {
            const diff = s.estimatedIcms - baseScenario.estimatedIcms;
            const percentDiff = baseScenario.estimatedIcms !== 0 ? (diff / baseScenario.estimatedIcms) * 100 : 0;
            return {
                Cenário: s.name,
                'ICMS Estimado': formatCurrency(s.estimatedIcms),
                'Diferença (vs. Base)': formatCurrency(diff),
                '% Diferença (vs. Base)': `${percentDiff.toFixed(2)}%`,
            };
        });

        return {
            chart: {
                type: 'bar',
                title: 'Comparativo de ICMS Estimado',
                data: data,
                yAxisLabel: 'Valor (R$)',
            } as ChartData,
            table: tableData,
        };
    }, [scenarios]);

    return (
        <div className="bg-gray-700/30 p-4 rounded-lg space-y-4">
            <h3 className="text-lg font-bold text-gray-200">Simulação ICMS (What-If)</h3>
            
            {baseValueForSim === 0 ? (
                <div className="text-sm text-gray-500 text-center">Nenhum valor de produto válido encontrado para simulação.</div>
            ) : (
                <div className="space-y-4">
                    <p className="text-xs text-gray-400">
                        Base de Cálculo Total dos Produtos: <span className="font-bold text-teal-300">{formatCurrency(baseValueForSim)}</span>.
                        Alíquota de Referência Calculada: <span className="font-bold text-blue-300">{referenceRate.toFixed(2)}%</span>.
                    </p>

                    {/* Scenario Creation */}
                    <div className="border-t border-gray-600 pt-4">
                        <h4 className="text-md font-semibold text-gray-200 mb-2">Criar Novo Cenário</h4>
                        <input
                            type="text"
                            placeholder="Nome do Cenário"
                            value={newScenarioName}
                            onChange={(e) => setNewScenarioName(e.target.value)}
                            className="w-full bg-gray-800 text-white px-3 py-2 rounded-md mb-2"
                        />
                        <div className="flex items-center gap-4 mb-2">
                            <label className="flex items-center text-sm text-gray-300">
                                <input
                                    type="radio"
                                    name="scenarioType"
                                    value="generic"
                                    checked={newScenarioType === 'generic'}
                                    onChange={() => setNewScenarioType('generic')}
                                    className="mr-2"
                                />
                                Alíquota Genérica
                            </label>
                            <label className="flex items-center text-sm text-gray-300">
                                <input
                                    type="radio"
                                    name="scenarioType"
                                    value="uf_specific"
                                    checked={newScenarioType === 'uf_specific'}
                                    onChange={() => setNewScenarioType('uf_specific')}
                                    className="mr-2"
                                />
                                Alíquotas por UF
                            </label>
                        </div>

                        {newScenarioType === 'generic' && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={genericRateInput}
                                    onChange={(e) => setGenericRateInput(parseFloat(e.target.value))}
                                    className="w-24 bg-gray-800 text-white px-3 py-2 rounded-md"
                                />
                                <span className="text-gray-300">%</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="40"
                                    step="0.1"
                                    value={genericRateInput}
                                    onChange={(e) => setGenericRateInput(parseFloat(e.target.value))}
                                    className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}

                        {newScenarioType === 'uf_specific' && (
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-800 rounded-md">
                                {uniqueUFs.map(uf => (
                                    <div key={uf} className="flex items-center gap-2">
                                        <label className="text-sm text-gray-300 w-12">{uf}:</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                            value={ufRateInputs[uf] !== undefined ? ufRateInputs[uf] : getIcmsRate('SP', uf)} // Default to a reasonable rate
                                            onChange={(e) => ufRateChange(uf, parseFloat(e.target.value))}
                                            className="w-24 bg-gray-900 text-white px-2 py-1 rounded-md text-xs"
                                        />
                                        <span className="text-gray-400 text-xs">%</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {validationErrors.length > 0 && (
                            <div className="bg-red-900/30 text-red-300 text-sm p-2 rounded-md mt-2">
                                <ul>
                                    {validationErrors.map((error, index) => (
                                        <li key={index}>{error}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <button
                            onClick={addScenario}
                            className="w-full mt-3 bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                        >
                            Adicionar Cenário
                        </button>
                    </div>

                    {/* Scenario List and Comparison */}
                    {scenarios.length > 0 && (
                        <div className="border-t border-gray-600 pt-4">
                            <h4 className="text-md font-semibold text-gray-200 mb-2">Cenários de Simulação</h4>
                            <div className="space-y-2">
                                {scenarios.map(s => (
                                    <div key={s.id} className="flex items-center justify-between bg-gray-800 p-2 rounded-md">
                                        <span className="text-gray-300">{s.name} ({s.type === 'generic' ? `${s.genericRate}%` : 'UF Específico'})</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-teal-300 font-mono">{formatCurrency(s.estimatedIcms)}</span>
                                            <button onClick={() => setActiveScenarioId(s.id)} className="text-blue-400 hover:text-blue-300 text-sm">Ver</button>
                                            <button onClick={() => removeScenario(s.id)} className="text-red-400 hover:text-red-300 text-sm">Remover</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Active Scenario Display */}
                    {activeScenario && (
                        <div className="border-t border-gray-600 pt-4">
                            <h4 className="text-md font-semibold text-gray-200 mb-2">Cenário Ativo: {activeScenario.name}</h4>
                            <div className="bg-gray-800/50 p-3 rounded-lg text-center">
                                <p className="text-sm text-gray-400">ICMS Estimado</p>
                                <p className="text-2xl font-bold text-teal-300 font-mono">
                                    {formatCurrency(activeScenario.estimatedIcms)}
                                </p>
                                {activeScenario.type === 'generic' && (
                                    <p className="text-sm text-gray-400">Alíquota Genérica: {activeScenario.genericRate?.toFixed(2)}%</p>
                                )}
                                {activeScenario.type === 'uf_specific' && activeScenario.ufRates && (
                                    <div className="text-sm text-gray-400 mt-2">
                                        Alíquotas por UF:
                                        <ul className="list-disc list-inside text-left mx-auto w-fit">
                                            {Object.entries(activeScenario.ufRates).map(([uf, rate]) => (
                                                <li key={uf}>{uf}: {rate.toFixed(2)}%</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Comparison Chart/Table */}
                    {comparisonData && ( // Only render if there's data to compare
                        <div className="border-t border-gray-600 pt-4">
                            <h4 className="text-md font-semibold text-gray-200 mb-2">Comparativo de Cenários</h4>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="bg-gray-800/50 p-3 rounded-lg">
                                    <Chart {...comparisonData.chart} />
                                </div>
                                <div className="bg-gray-800/50 p-3 rounded-lg overflow-x-auto">
                                    <table className="w-full text-left text-sm text-gray-400">
                                        <thead className="text-xs text-gray-200 uppercase bg-gray-700">
                                            <tr>
                                                {Object.keys(comparisonData.table[0]).map(header => (
                                                    <th key={header} scope="col" className="px-6 py-3">{header}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {comparisonData.table.map((row, index) => (
                                                <tr key={index} className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700">
                                                    {Object.values(row).map((value, i) => (
                                                        <td key={i} className="px-6 py-4 whitespace-nowrap">{value}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default IcmsSimulationSettings;
