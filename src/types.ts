export interface MargenesConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
  scale: number;
}

export interface ProductQtyMap {
  [shopName: string]: number;
}

export interface ProductCatalogMap {
  [productName: string]: ProductQtyMap;
}

export interface SaboresCategorizados {
  empanadas: string[];
  pastelitos: string[];
  pizzas: string[];
}

export interface Planilla {
  id: string;
  nombre: string;
  fechaExcel: string;
  fechaCreacion: string;
  creadoPor: string;
  creadoPorEmail: string;
  archivoNombre: string;
  locales: string[];
  productos: ProductCatalogMap;
  saboresCategorizados: SaboresCategorizados;
}

export interface TotalesDespacho {
  carrosExclusivos: number;
  carrosCompartidos: number;
  totalCarros: number;
  totalCajonesPizza: number;
}

export interface CarroItem {
  local: string;
  cant: number;
}

export interface CarroCompartido {
  capacidadRestante: number;
  items: CarroItem[];
}

export interface Despacho {
  id: string;
  planillaId: string;
  nombreDespacho: string;
  fechaExcel: string;
  fechaCreacion: string;
  creadoPor: string;
  creadoPorEmail: string;
  localesSeleccionados: string[];
  empanadas: {
    [sabor: string]: {
      unidades: number;
      bandejas: number;
    }
  };
  pastelitos: {
    [sabor: string]: {
      unidades: number;
      bandejas: number;
    }
  };
  pizzas: {
    [sabor: string]: {
      unidades: number;
    }
  };
  carrosExclusivos: {
    local: string;
    carros: number;
    bandejas: number;
  }[];
  carrosCompartidos: CarroCompartido[];
  totales: TotalesDespacho;
  margenesConfig: MargenesConfig;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}
