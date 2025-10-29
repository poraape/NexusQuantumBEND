
import React from 'react';

interface DataPreviewProps {
  data: any[];
  title: string;
}

const DataPreview: React.FC<DataPreviewProps> = ({ data, title }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-700/30 p-4 rounded-lg text-center">
        <p className="text-sm text-gray-400">Nenhum dado para exibir.</p>
      </div>
    );
  }

  const headers = Object.keys(data[0]);

  const renderValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-500 italic">{"<nulo>"}</span>;
    }
    if (value === 0) {
      return <span className="text-blue-400">0</span>;
    }
    if (typeof value === 'string' && value.includes('\ufffd')) {
        return <span className="text-red-400" title="Caractere inválido detectado">⚠ ilegível</span>
    }
    return value.toString();
  };

  return (
    <div className="bg-gray-700/50 p-4 rounded-lg">
      <h3 className="text-lg font-semibold text-gray-200 mb-3">{title}</h3>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              {headers.map((header) => (
                <th key={header} className="p-2 font-semibold text-gray-300 truncate">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-600/50">
                {headers.map((header) => (
                  <td key={header} className="p-2 text-gray-400 truncate max-w-xs">
                    {renderValue(row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataPreview;
