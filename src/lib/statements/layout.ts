// The group's BS and PL presentation, line for line as the Databook's BS and PL tabs build them.
// DETAIL lines are the Databook L1 values (accounts map to them). SUBTOTAL lines add earlier lines.
// All amounts are signed debit − credit. Presentation (sign flip, $000s) is a display concern.

import type { LineKind, Statement } from '@prisma/client';

export type LineDef = {
  code: string;
  statement: Statement;
  nameEn: string;
  nameEs: string;
  kind: LineKind;
  /** SUBTOTAL only: codes of the lines it sums. */
  sumOf?: string[];
  /** DETAIL lines fed by something other than mapped accounts. */
  computed?: 'PL_NET_INCOME';
};

const d = (statement: Statement, code: string, nameEn: string, nameEs: string, computed?: LineDef['computed']): LineDef =>
  ({ code: `${statement}.${code}`, statement, nameEn, nameEs, kind: 'DETAIL', ...(computed ? { computed } : {}) });
const s = (statement: Statement, code: string, nameEn: string, nameEs: string, sumOf: string[]): LineDef =>
  ({ code: `${statement}.${code}`, statement, nameEn, nameEs, kind: 'SUBTOTAL', sumOf: sumOf.map(c => `${statement}.${c}`) });

export const BS_LINES: LineDef[] = [
  d('BS', 'CASH', 'Cash and cash equivalents', 'Efectivo y equivalentes'),
  d('BS', 'AR', 'Accounts receivable, net', 'Cuentas por cobrar, neto'),
  d('BS', 'NOTES_RECEIVABLE', 'Notes Receivable', 'Documentos por cobrar'),
  d('BS', 'INVENTORY', 'Inventory', 'Inventario'),
  d('BS', 'PREPAID', 'Prepaid expenses', 'Gastos pagados por anticipado'),
  d('BS', 'OTHER_CURRENT_ASSETS', 'Other current assets', 'Otros activos corrientes'),
  s('BS', 'TOTAL_CURRENT_ASSETS', 'Total current assets', 'Total activos corrientes',
    ['CASH', 'AR', 'NOTES_RECEIVABLE', 'INVENTORY', 'PREPAID', 'OTHER_CURRENT_ASSETS']),
  d('BS', 'FIXED_ASSETS', 'Fixed assets, net', 'Activo fijo, neto'),
  d('BS', 'GOODWILL', 'Goodwill', 'Crédito mercantil'),
  d('BS', 'TRADENAME', 'Tradename', 'Nombre comercial'),
  d('BS', 'ACCUM_AMORT', 'Accum Amort', 'Amortización acumulada'),
  d('BS', 'OTHER_ASSETS', 'Other assets', 'Otros activos'),
  s('BS', 'TOTAL_ASSETS', 'Total assets', 'Total activos',
    ['TOTAL_CURRENT_ASSETS', 'FIXED_ASSETS', 'GOODWILL', 'TRADENAME', 'ACCUM_AMORT', 'OTHER_ASSETS']),
  d('BS', 'AP', 'Accounts payable', 'Cuentas por pagar'),
  d('BS', 'ACCRUED_PAYROLL', 'Accrued payroll & benefits', 'Nómina y beneficios por pagar'),
  d('BS', 'ACCRUED_TAXES', 'Accrued taxes', 'Impuestos por pagar'),
  d('BS', 'CURRENT_DEBT', 'Current debt', 'Deuda corriente'),
  d('BS', 'CUSTOMER_DEPOSITS', 'Customer deposits', 'Depósitos de clientes'),
  d('BS', 'OTHER_CURRENT_LIABILITIES', 'Other current liabilities', 'Otros pasivos corrientes'),
  s('BS', 'TOTAL_CURRENT_LIABILITIES', 'Total current liabilities', 'Total pasivos corrientes',
    ['AP', 'ACCRUED_PAYROLL', 'ACCRUED_TAXES', 'CURRENT_DEBT', 'CUSTOMER_DEPOSITS', 'OTHER_CURRENT_LIABILITIES']),
  d('BS', 'OTHER_LIABILITIES', 'Other liabilities', 'Otros pasivos'),
  d('BS', 'NOTES_PAYABLE', 'Notes payables', 'Documentos por pagar'),
  s('BS', 'TOTAL_LIABILITIES', 'Total liabilities', 'Total pasivos',
    ['TOTAL_CURRENT_LIABILITIES', 'OTHER_LIABILITIES', 'NOTES_PAYABLE']),
  d('BS', 'COMMON_STOCK', 'Common stock', 'Capital social'),
  d('BS', 'GOTERA_EQUITY', 'Gotera equity', 'Patrimonio Gotera'),
  d('BS', 'APIC', 'Additional paid in capital', 'Capital adicional pagado'),
  d('BS', 'DISTRIBUTIONS', 'Distributions', 'Distribuciones'),
  d('BS', 'RETAINED_EARNINGS', 'Retained earnings', 'Utilidades retenidas'),
  // The Databook takes this from the PL (=PL!X50): current-year result, not an account balance.
  d('BS', 'NET_INCOME', 'Net income', 'Utilidad neta', 'PL_NET_INCOME'),
  s('BS', 'TOTAL_EQUITY', 'Total equity', 'Total patrimonio',
    ['COMMON_STOCK', 'GOTERA_EQUITY', 'APIC', 'DISTRIBUTIONS', 'RETAINED_EARNINGS', 'NET_INCOME']),
  s('BS', 'TOTAL_LIABILITIES_EQUITY', 'Total liabilities and equity', 'Total pasivos y patrimonio',
    ['TOTAL_LIABILITIES', 'TOTAL_EQUITY']),
];

export const PL_LINES: LineDef[] = [
  d('PL', 'PRODUCT_SALES', 'Product sales', 'Ventas de producto'),
  d('PL', 'FREIGHT_INCOME', 'Freight income', 'Ingresos por flete'),
  d('PL', 'DISCOUNTS', 'Discounts & allowances', 'Descuentos y bonificaciones'),
  d('PL', 'RETURNS', 'Returns', 'Devoluciones'),
  s('PL', 'NET_REVENUE', 'Net revenue', 'Ingresos netos', ['PRODUCT_SALES', 'FREIGHT_INCOME', 'DISCOUNTS', 'RETURNS']),
  d('PL', 'PRODUCT_COST', 'Product cost', 'Costo de producto'),
  d('PL', 'FREIGHT_IN', 'Freight in', 'Flete de entrada'),
  d('PL', 'DIRECT_LABOR', 'Direct labor', 'Mano de obra directa'),
  d('PL', 'PACKAGING', 'Packaging', 'Empaque'),
  d('PL', 'OTHER_COGS', 'Other cost of goods sold', 'Otros costos de venta'),
  d('PL', 'PURCHASE_DISCOUNTS', 'Purchase discounts', 'Descuentos en compras'),
  s('PL', 'COGS', 'Cost of goods sold', 'Costo de ventas',
    ['PRODUCT_COST', 'FREIGHT_IN', 'DIRECT_LABOR', 'PACKAGING', 'OTHER_COGS', 'PURCHASE_DISCOUNTS']),
  s('PL', 'GROSS_PROFIT', 'Gross profit', 'Utilidad bruta', ['NET_REVENUE', 'COGS']),
  d('PL', 'PAYROLL', 'Payroll & benefits', 'Nómina y beneficios'),
  d('PL', 'RENT_UTILITIES', 'Rent and utilities', 'Renta y servicios'),
  d('PL', 'OTHER_OPEX', 'Other operating expenses', 'Otros gastos de operación'),
  d('PL', 'DEPRECIATION', 'Depreciation expense', 'Gasto por depreciación'),
  d('PL', 'REPAIRS', 'Repairs and maintenance', 'Reparaciones y mantenimiento'),
  d('PL', 'AUTO', 'Auto expenses', 'Gastos de vehículos'),
  d('PL', 'PROFESSIONAL_FEES', 'Professional fees', 'Honorarios profesionales'),
  d('PL', 'FREIGHT_COSTS', 'Freight costs', 'Costos de flete'),
  d('PL', 'INSURANCE', 'Insurance expense', 'Gasto de seguros'),
  d('PL', 'ADVERTISING', 'Advertising and marketing', 'Publicidad y mercadeo'),
  d('PL', 'MANAGEMENT_FEE', 'Management fee', 'Honorarios de administración'),
  s('PL', 'OPEX', 'Operating expenses', 'Gastos de operación',
    ['PAYROLL', 'RENT_UTILITIES', 'OTHER_OPEX', 'DEPRECIATION', 'REPAIRS', 'AUTO', 'PROFESSIONAL_FEES',
      'FREIGHT_COSTS', 'INSURANCE', 'ADVERTISING', 'MANAGEMENT_FEE']),
  s('PL', 'OPERATING_PROFIT', 'Operating profit', 'Utilidad de operación', ['GROSS_PROFIT', 'OPEX']),
  d('PL', 'OTHER_EXPENSE', 'Other expense', 'Otros gastos'),
  d('PL', 'INTEREST', 'Interest expense / (income)', 'Gasto (ingreso) por intereses'),
  d('PL', 'INCOME_TAX', 'Income tax', 'Impuesto sobre la renta'),
  d('PL', 'TAX_EXPENSE', 'Tax Expense / Income', 'Gasto (ingreso) por impuestos'),
  d('PL', 'OTHER_INCOME', 'Other income', 'Otros ingresos'),
  s('PL', 'NON_OPERATING', 'Non-operating expenses / (income)', 'Gastos (ingresos) no operativos',
    ['OTHER_EXPENSE', 'INTEREST', 'INCOME_TAX', 'TAX_EXPENSE', 'OTHER_INCOME']),
  s('PL', 'NET_INCOME', 'Net income', 'Utilidad neta', ['OPERATING_PROFIT', 'NON_OPERATING']),
];

export const ALL_LINES: LineDef[] = [...BS_LINES, ...PL_LINES];

/** Excel's SUMIF matches text case-insensitively; the Databook relies on it ("Accounts Payable" = "Accounts payable"). */
export const normalizeLabel = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const byName = new Map(ALL_LINES.filter(l => l.kind === 'DETAIL' && !l.computed)
  .map(l => [`${l.statement}:${normalizeLabel(l.nameEn)}`, l]));

/** The DETAIL line a Databook L1 value feeds, or undefined when the label is unknown. */
export function lineForL1(statement: Statement, l1: string): LineDef | undefined {
  return byName.get(`${statement}:${normalizeLabel(l1)}`);
}
