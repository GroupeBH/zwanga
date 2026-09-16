import { formatDate, getPaymentDetailRows } from './paymentHistoryModel';
import type { PaymentHistoryItem } from '@/types';

export const toPdfSafeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const escapePdfText = (value: string) =>
  toPdfSafeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

export const wrapPdfText = (value: string, maxLength = 58) => {
  const words = toPdfSafeText(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    if (!currentLine) {
      currentLine = word;
      return;
    }

    if (`${currentLine} ${word}`.length <= maxLength) {
      currentLine = `${currentLine} ${word}`;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : ['Non disponible'];
};

export const encodeBase64 = (input: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';

  for (let index = 0; index < input.length; index += 3) {
    const byte1 = input.charCodeAt(index) & 0xff;
    const byte2 = input.charCodeAt(index + 1) & 0xff;
    const byte3 = input.charCodeAt(index + 2) & 0xff;
    const hasByte2 = index + 1 < input.length;
    const hasByte3 = index + 2 < input.length;

    output += chars.charAt(byte1 >> 2);
    output += chars.charAt(((byte1 & 3) << 4) | (hasByte2 ? byte2 >> 4 : 0));
    output += hasByte2 ? chars.charAt(((byte2 & 15) << 2) | (hasByte3 ? byte3 >> 6 : 0)) : '=';
    output += hasByte3 ? chars.charAt(byte3 & 63) : '=';
  }

  return output;
};

export const buildPaymentPdfBase64 = (payment: PaymentHistoryItem) => {
  const rows = getPaymentDetailRows(payment);
  const operations: string[] = [];
  let y = 742;

  const addText = (x: number, textY: number, size: number, font: 'F1' | 'F2', text: string) => {
    operations.push(`BT /${font} ${size} Tf 1 0 0 1 ${x} ${textY} Tm (${escapePdfText(text)}) Tj ET`);
  };

  operations.push('0.98 0.98 0.98 rg 0 0 612 792 re f');
  operations.push('1 1 1 rg 40 40 532 712 re f');
  operations.push('0.95 0.95 0.95 rg 40 680 532 1 re f');
  operations.push('0 0 0 rg');
  addText(58, y, 20, 'F2', 'ZWANGA');
  y -= 26;
  addText(58, y, 16, 'F2', 'Détail du paiement');
  y -= 18;
  addText(58, y, 10, 'F1', `Généré le ${formatDate(new Date().toISOString())}`);
  y -= 42;

  rows.forEach((row) => {
    if (y < 72) {
      return;
    }

    addText(58, y, 10, 'F2', row.label);
    const valueLines = wrapPdfText(String(row.value), 62).slice(0, 4);
    valueLines.forEach((line, index) => {
      addText(210, y - index * 14, 10, 'F1', line);
    });
    y -= Math.max(24, valueLines.length * 14 + 8);
  });

  addText(58, 58, 9, 'F1', 'Document généré depuis l’application Zwanga.');

  const stream = operations.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return encodeBase64(pdf);
};
