import type { Messages } from './en';

export const es: Messages = {
  app: { name: 'Portal del Contralor', group: 'Grupo Mama Lycha' },
  nav: {
    dashboard: 'Tablero ejecutivo',
    statements: 'Estados financieros',
    trialBalances: 'Entidades y balanzas',
    consolidation: 'Consolidación e intercompañías',
    journalEntries: 'Asientos contables',
    close: 'Cierre mensual',
    fixedAssets: 'Activos fijos',
    intangibles: 'Activos intangibles',
    leases: 'Arrendamientos',
    accruals: 'Provisiones',
    tax: 'Impuestos',
    audit: 'Auditoría y solicitudes PBC',
    messages: 'Mensajes y solicitudes',
    reports: 'Reportes y conciliaciones',
    admin: 'Administración y políticas',
    phase: (n: number) => `Fase ${n}`,
  },
  auth: {
    signIn: 'Iniciar sesión', signOut: 'Cerrar sesión', email: 'Correo', password: 'Contraseña',
    invalid: 'Correo o contraseña incorrectos.',
    locked: 'Demasiados intentos. Intente de nuevo en 15 minutos.',
    inactive: 'Esta cuenta está desactivada.',
  },
  dashboard: {
    period: 'Período', entity: 'Entidad', tbStatus: 'Balanza de comprobación',
    missing: 'Faltante', preliminary: 'Preliminar', final: 'Final',
    noData: 'Aún no hay balanzas cargadas. Las cifras aparecen al importar el Databook.',
  },
  submissionStatus: {
    DRAFT: 'Borrador', VALIDATED: 'Validada', APPROVED: 'Aprobada', REJECTED: 'Rechazada', SUPERSEDED: 'Reemplazada',
  },
  periodStatus: { OPEN: 'Abierto', LOCKED: 'Cerrado' },
  language: { label: 'Idioma', en: 'English', es: 'Español' },
};
