import React from 'react';
import { FileAudio, FileCode, FileSpreadsheet, FileText, Presentation } from 'lucide-react';

/** Ícono según el tipo de adjunto. */
export const AttachmentIcon: React.FC<{ type: string; name: string; size?: number; className?: string }> = ({ type, name, size = 16, className = '' }) => {
    const ext = name.toLowerCase().split('.').pop() || '';
    if (type.startsWith('audio/')) return <FileAudio size={size} className={className} />;
    if (/sheet|excel|spreadsheet/.test(type) || ['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'tsv'].includes(ext)) return <FileSpreadsheet size={size} className={className} />;
    if (/presentation/.test(type) || ['pptx', 'odp'].includes(ext)) return <Presentation size={size} className={className} />;
    if (type === 'application/pdf' || /word|opendocument\.text/.test(type)) return <FileText size={size} className={className} />;
    return <FileCode size={size} className={className} />;
};
