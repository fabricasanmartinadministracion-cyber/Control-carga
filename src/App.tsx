import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  MapPin, 
  Printer, 
  Layout, 
  Plus, 
  Trash2, 
  LogOut, 
  Save, 
  LogIn, 
  FileText, 
  Settings, 
  Scale, 
  Download, 
  History, 
  Check, 
  FileIcon, 
  Info,
  ChevronRight,
  Loader
} from 'lucide-react';
import { 
  guardarPlanilla, 
  guardarDespacho, 
  eliminarPlanilla, 
  eliminarDespacho, 
  suscribirPlanillas, 
  suscribirDespachos,
  verificarAdminPin,
  cambiarAdminPin,
  exportarBaseDatos,
  importarBaseDatos
} from './firestoreUtils';
import { 
  Planilla, 
  Despacho, 
  ProductCatalogMap, 
  SaboresCategorizados, 
  MargenesConfig, 
  CarroCompartido,
  TotalesDespacho
} from './types';

export default function App() {
  // Authentication & DB states
  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string; displayName: string; role: 'admin' | 'armador' } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<{ code: string; message: string; title: string; steps?: string[] } | null>(null);
  const [planillasHistorial, setPlanillasHistorial] = useState<Planilla[]>([]);
  const [despachosHistorial, setDespachosHistorial] = useState<Despacho[]>([]);
  
  // Custom Login Flow States
  const [loginMode, setLoginMode] = useState<'select' | 'admin' | 'armador'>('select');
  const [pinInput, setPinInput] = useState('');
  const [nombreArmadorInput, setNombreArmadorInput] = useState('');
  const [verificandoPin, setVerificandoPin] = useState(false);

  // Backup & Restore states
  const [errorConfig, setErrorConfig] = useState<string | null>(null);
  const [successConfig, setSuccessConfig] = useState<string | null>(null);
  const [nuevoPinInput, setNuevoPinInput] = useState('');
  const [mostrandoAjustesBase, setMostrandoAjustesBase] = useState(false);

  // App interface states
  const [planillaActiva, setPlanillaActiva] = useState<Planilla | null>(null);
  const [localesSeleccionados, setLocalesSeleccionados] = useState<string[]>([]);
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const [nombreDespacho, setNombreDespacho] = useState('');
  const [buscandoHistorial, setBuscandoHistorial] = useState(false);
  const [activeTab, setActiveTab] = useState<'operar' | 'planilla-historial' | 'despacho-historial'>('operar');
  
  // Custom print layout configurations
  const [margenes, setMargenes] = useState<MargenesConfig>({
    top: 15,
    bottom: 15,
    left: 15,
    right: 15,
    scale: 95
  });
  const [modoVistaPrevia, setModoVistaPrevia] = useState(false);
  
  // Selection feedback flags
  const [guardandoPlanillaState, setGuardandoPlanillaState] = useState(false);
  const [guardandoDespachoState, setGuardandoDespachoState] = useState(false);
  
  // Filter settings for category groupings
  const filtrosCategorias = useMemo(() => ({
    empanadas: [
      'JAMON Y QUESO', 'CARNE SUAVE', 'POLLO', 'CARNE PICANTE', 
      'HUMITA', 'ESPINACA', 'CALABAZA Y QUESO', 'ROQUEFORT Y JAMON', 
      'QUESO Y CEBOLLA', 'CERDO Y BARBACOA', 'CHEESEBURGER'
    ],
    pastelitos: ['PASTELITO BATATA', 'PASTELITO MEMBRILLO'],
    pizzas: ['PIZZA JAMON CAJON X 5U', 'PIZZA PEPPERONI CAJON X 5U', 'PIZZA MUZZA CAJON X 5U']
  }), []);

  // Sync session on load
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('la_empanaderia_user');
      if (savedUser) {
        setCurrentUser(JSON.parse(savedUser));
      }
    } catch (err) {
      console.error("Error reading cached local session:", err);
    }
    setLoadingAuth(false);
  }, []);

  // Subscribe to real-time collections if user is logged in
  useEffect(() => {
    if (!currentUser) {
      setPlanillasHistorial([]);
      setDespachosHistorial([]);
      return;
    }

    const unsubPlanillas = suscribirPlanillas(
      (data) => setPlanillasHistorial(data),
      (err) => console.error('Error suscribiendo planillas:', err)
    );

    const unsubDespachos = suscribirDespachos(
      (data) => setDespachosHistorial(data),
      (err) => console.error('Error suscribiendo despachos:', err)
    );

    return () => {
      unsubPlanillas();
      unsubDespachos();
    };
  }, [currentUser]);

  // Sync margins on root style when state changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--margin-top', `${margenes.top}mm`);
    root.style.setProperty('--margin-bottom', `${margenes.bottom}mm`);
    root.style.setProperty('--margin-left', `${margenes.left}mm`);
    root.style.setProperty('--margin-right', `${margenes.right}mm`);
    root.style.setProperty('--print-scale', `${margenes.scale}%`);
  }, [margenes]);

  // Handle PIN Login
  const loginAsAdmin = async (pin: string) => {
    setAuthError(null);
    if (!pin) return;
    setVerificandoPin(true);
    try {
      const isValid = await verificarAdminPin(pin);
      if (isValid) {
        const adminUser = {
          uid: 'admin',
          email: 'admin@saboresexpress.com.ar',
          displayName: 'Administrador (Fábrica)',
          role: 'admin' as const
        };
        localStorage.setItem('la_empanaderia_user', JSON.stringify(adminUser));
        setCurrentUser(adminUser);
        setPinInput('');
      } else {
        setAuthError({
          code: 'wrong-pin',
          title: 'Código PIN de administrador incorrecto',
          message: 'El PIN que ingresaste no coincide con el guardado en el servidor. Prueba con el de fábrica (1234) o consúltalo.'
        });
      }
    } catch (err) {
      console.error(err);
      setAuthError({
        code: 'server-error',
        title: 'Error de conexión con el Servidor',
        message: 'No pudimos verificar el PIN. Asegúrate de que el backend de Render esté iniciado y operativo.'
      });
    } finally {
      setVerificandoPin(false);
    }
  };

  const loginAsArmador = (nombre: string) => {
    setAuthError(null);
    const armadorName = nombre.trim() || 'Operario de Armado';
    const armadorUser = {
      uid: `armador-${Date.now()}`,
      email: `armador.${armadorName.toLowerCase().replace(/\s+/g, '')}@saboresexpress.com.ar`,
      displayName: `Armador: ${armadorName}`,
      role: 'armador' as const
    };
    localStorage.setItem('la_empanaderia_user', JSON.stringify(armadorUser));
    setCurrentUser(armadorUser);
    setNombreArmadorInput('');
  };

  const logoutLocal = () => {
    localStorage.removeItem('la_empanaderia_user');
    setCurrentUser(null);
    setPlanillaActiva(null);
    setLocalesSeleccionados([]);
    setLoginMode('select');
    setAuthError(null);
    setMostrandoAjustesBase(false);
  };

  // Parse Excel file input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const target = event.target;
      if (!target || !target.result) return;
      const data = new Uint8Array(target.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
      
      processExcelMatrix(matrix, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  const processExcelMatrix = (matrix: any[][], fileName: string) => {
    let fechaExcel = "Sin Fecha";
    let locales: string[] = [];
    const productos: ProductCatalogMap = {};
    const saboresCategorizados: SaboresCategorizados = { empanadas: [], pastelitos: [], pizzas: [] };
    let headers: string[] = [];

    for (let i = 0; i < matrix.length; i++) {
      const row = matrix[i];
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0]).trim();
      const firstCellUpper = firstCell.toUpperCase();

      // Extract Sheet date identifier e.g., "FECHA: 28/05/2026"
      if (firstCellUpper.startsWith('FECHA:')) {
        fechaExcel = firstCell.replace(/FECHA:/i, '').trim();
        continue;
      }

      // Read columns headers
      if (firstCellUpper === 'PRODUCTO') {
        headers = row.map(h => String(h).trim());
        const startIndex = headers.findIndex(h => h.toUpperCase() === 'STOCK FÁBRICA') + 1;
        const endIndex = headers.findIndex(h => h.toUpperCase() === 'TOTAL PEDIDO');
        
        if (startIndex > 0 && (endIndex > startIndex || endIndex === -1)) {
          const cutIndex = endIndex > 0 ? endIndex : headers.length;
          locales = headers.slice(startIndex, cutIndex).filter(l => l !== "" && !l.toUpperCase().includes('TOTAL'));
        }
        continue;
      }

      // Check product categorizations
      let catAsignada: keyof SaboresCategorizados | null = null;
      if (filtrosCategorias.empanadas.includes(firstCellUpper)) catAsignada = 'empanadas';
      else if (filtrosCategorias.pastelitos.includes(firstCellUpper)) catAsignada = 'pastelitos';
      else if (filtrosCategorias.pizzas.includes(firstCellUpper)) catAsignada = 'pizzas';
      // Permissive fallback matching
      else if (firstCellUpper.startsWith('PASTELITO')) catAsignada = 'pastelitos';
      else if (firstCellUpper.startsWith('PIZZA')) catAsignada = 'pizzas';

      if (catAsignada && headers.length > 0) {
        productos[firstCell] = {};
        if (!saboresCategorizados[catAsignada].includes(firstCell)) {
          saboresCategorizados[catAsignada].push(firstCell);
        }

        headers.forEach((header, index) => {
          if (locales.includes(header)) {
            productos[firstCell][header] = parseFloat(row[index]) || 0;
          }
        });
      }
    }

    if (locales.length === 0) {
      alert("No se identificaron locales o columnas de tiendas válidas en el Excel. Verifique que la fila de encabezados tenga 'PRODUCTO' y 'STOCK FÁBRICA'.");
      return;
    }

    const nuevaPlanilla: Planilla = {
      id: `pl-${Date.now()}`,
      nombre: `Planilla Despacho LA EMPANADERÍA - ${fechaExcel}`,
      fechaExcel,
      fechaCreacion: new Date().toISOString(),
      creadoPor: currentUser?.uid || 'local-guest',
      creadoPorEmail: currentUser?.email || 'Invitado Local',
      archivoNombre: fileName,
      locales,
      productos,
      saboresCategorizados
    };

    setPlanillaActiva(nuevaPlanilla);
    setLocalesSeleccionados([]); // Limpiar selección previa
    setNombreDespacho(`Despacho del ${fechaExcel}`);
  };

  // Filter locales list by search text
  const localesFiltrados = useMemo(() => {
    if (!planillaActiva) return [];
    return planillaActiva.locales.filter(l => 
      l.toLowerCase().includes(busquedaLocal.toLowerCase())
    );
  }, [planillaActiva, busquedaLocal]);

  // Toggle selected shop
  const toggleLocal = (local: string) => {
    setLocalesSeleccionados(prev => 
      prev.includes(local) 
        ? prev.filter(l => l !== local) 
        : [...prev, local]
    );
  };

  const seleccionarTodosLosLocales = () => {
    if (!planillaActiva) return;
    setLocalesSeleccionados([...planillaActiva.locales]);
  };

  const descoseleccionarTodosLosLocales = () => {
    setLocalesSeleccionados([]);
  };

  // Compile calculations for selected shops
  const calculosConsolidados = useMemo(() => {
    if (!planillaActiva || localesSeleccionados.length === 0) {
      return {
        empanadas: {},
        pastelitos: {},
        pizzas: {},
        carrosExclusivos: [],
        carrosCompartidos: [],
        totales: {
          carrosExclusivos: 0,
          carrosCompartidos: 0,
          totalCarros: 0,
          totalCajonesPizza: 0
        }
      };
    }

    const { productos, saboresCategorizados } = planillaActiva;

    // 1. Sum up quantities
    const empanadasRes: { [sabor: string]: { unidades: number; bandejas: number } } = {};
    const pastelitosRes: { [sabor: string]: { unidades: number; bandejas: number } } = {};
    const pizzasRes: { [sabor: string]: { unidades: number } } = {};

    saboresCategorizados.empanadas.forEach(p => {
      let unidades = 0;
      localesSeleccionados.forEach(l => {
        unidades += (productos[p]?.[l] || 0);
      });
      if (unidades > 0) {
        empanadasRes[p] = { unidades, bandejas: Number((unidades / 50).toFixed(1)) };
      }
    });

    saboresCategorizados.pastelitos.forEach(p => {
      let unidades = 0;
      localesSeleccionados.forEach(l => {
        unidades += (productos[p]?.[l] || 0);
      });
      if (unidades > 0) {
        pastelitosRes[p] = { unidades, bandejas: Number((unidades / 35).toFixed(1)) };
      }
    });

    let totalCajonesPizza = 0;
    saboresCategorizados.pizzas.forEach(p => {
      let unidades = 0;
      localesSeleccionados.forEach(l => {
        unidades += (productos[p]?.[l] || 0);
      });
      if (unidades > 0) {
        pizzasRes[p] = { unidades };
        totalCajonesPizza += unidades;
      }
    });

    // 2. Compute wagon distribution (Wagon Capacity = 25 trays)
    // First, map how many total trays (empanadas/50 + pastelitos/35) each selected shop has.
    const bandejasPorLocal: { local: string; bandejas: number }[] = localesSeleccionados.map(local => {
      let bEmp = 0;
      saboresCategorizados.empanadas.forEach(p => {
        bEmp += (productos[p]?.[local] || 0) / 50;
      });

      let bPas = 0;
      saboresCategorizados.pastelitos.forEach(p => {
        bPas += (productos[p]?.[local] || 0) / 35;
      });

      // Ceiling on individual totals to calculate whole physical trays
      return { local, bandejas: Math.ceil(bEmp + bPas) };
    }).filter(item => item.bandejas > 0) as any;

    const carrosExclusivos: { local: string; carros: number; bandejas: number }[] = [];
    const sobrasParaConsolidar: { local: string; sueltas: number }[] = [];
    let totalCarrosExclusivos = 0;

    bandejasPorLocal.forEach((item: any) => {
      const carrosEnteros = Math.floor(item.bandejas / 25);
      const restoBandejas = item.bandejas % 25;

      if (carrosEnteros > 0) {
        carrosExclusivos.push({
          local: item.local,
          carros: carrosEnteros,
          bandejas: carrosEnteros * 25
        });
        totalCarrosExclusivos += carrosEnteros;
      }

      if (restoBandejas > 0) {
        sobrasParaConsolidar.push({
          local: item.local,
          sueltas: restoBandejas
        });
      }
    });

    // Sort remainders from largest to smallest for intelligent Bin-Packing (First-Fit Decreasing)
    sobrasParaConsolidar.sort((a, b) => b.sueltas - a.sueltas);
    const carrosCompartidos: CarroCompartido[] = [];

    sobrasParaConsolidar.forEach(sobra => {
      let asignado = false;
      for (const carro of carrosCompartidos) {
        if (carro.capacidadRestante >= sobra.sueltas) {
          carro.items.push({ local: sobra.local, cant: sobra.sueltas });
          carro.capacidadRestante -= sobra.sueltas;
          asignado = true;
          break;
        }
      }
      if (!asignado) {
        carrosCompartidos.push({
          capacidadRestante: 25 - sobra.sueltas,
          items: [{ local: sobra.local, cant: sobra.sueltas }]
        });
      }
    });

    return {
      empanadas: empanadasRes,
      pastelitos: pastelitosRes,
      pizzas: pizzasRes,
      carrosExclusivos,
      carrosCompartidos,
      totales: {
        carrosExclusivos: totalCarrosExclusivos,
        carrosCompartidos: carrosCompartidos.length,
        totalCarros: totalCarrosExclusivos + carrosCompartidos.length,
        totalCajonesPizza
      }
    };
  }, [planillaActiva, localesSeleccionados]);

  // Persist spreadsheet inside DB
  const savePlanillaToCloud = async () => {
    if (!planillaActiva) return;
    if (!currentUser) {
      alert("Debe iniciar sesión para guardar datos de logística en tiempo real.");
      return;
    }

    setGuardandoPlanillaState(true);
    try {
      // Sync creators credentials right before saving
      const planillaSubir: Planilla = {
        ...planillaActiva,
        creadoPor: currentUser.uid,
        creadoPorEmail: currentUser.email || 'Usuario Logueado'
      };
      await guardarPlanilla(planillaSubir);
      alert("✅ Planilla guardada exitosamente en la base de datos de la fábrica.");
    } catch (err: any) {
      alert("Error al intentar guardar la planilla: " + err.message);
    } finally {
      setGuardandoPlanillaState(false);
    }
  };

  // Persist dispatch breakdown in DB (auditable logs)
  const saveDespachoToCloud = async () => {
    if (!planillaActiva || localesSeleccionados.length === 0) {
       alert("Debe tener una planilla activa y por lo menos un local seleccionado para archivar un despacho.");
       return;
    }
    if (!currentUser) {
      alert("Debe iniciar sesión para archivar auditorías de despachos centralizadas.");
      return;
    }

    setGuardandoDespachoState(true);
    const despachoId = `desp-${Date.now()}`;
    const nuevoDespacho: Despacho = {
      id: despachoId,
      planillaId: planillaActiva.id,
      nombreDespacho: nombreDespacho || `Despacho del ${planillaActiva.fechaExcel}`,
      fechaExcel: planillaActiva.fechaExcel,
      fechaCreacion: new Date().toISOString(),
      creadoPor: currentUser.uid,
      creadoPorEmail: currentUser.email || 'Jefe de Logística',
      localesSeleccionados,
      empanadas: calculosConsolidados.empanadas,
      pastelitos: calculosConsolidados.pastelitos,
      pizzas: calculosConsolidados.pizzas,
      carrosExclusivos: calculosConsolidados.carrosExclusivos,
      carrosCompartidos: calculosConsolidados.carrosCompartidos,
      totales: calculosConsolidados.totales,
      margenesConfig: margenes
    };

    try {
      await guardarDespacho(nuevoDespacho);
      alert("✅ Reporte de Despacho guardado y consolidado para auditoría interna.");
    } catch (err: any) {
      alert("Error al archivar el despacho: " + err.message);
    } finally {
      setGuardandoDespachoState(false);
    }
  };

  // Safe deletions
  const handleDeletePlanilla = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Está seguro de que desea eliminar esta planilla histórica? Esto no afectará despachos consolidados.")) return;
    try {
      await eliminarPlanilla(id);
      if (planillaActiva?.id === id) {
        setPlanillaActiva(null);
        setLocalesSeleccionados([]);
      }
    } catch (err: any) {
      alert("Error al eliminar planilla: " + err.message);
    }
  };

  const handleDeleteDespacho = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Está seguro de que desea eliminar este histórico de despacho archivado?")) return;
    try {
      await eliminarDespacho(id);
    } catch (err: any) {
      alert("Error al eliminar despacho: " + err.message);
    }
  };

  // Re-hydrate state from database spreadsheet click
  const cargarPlanillaHistorica = (pl: Planilla) => {
    setPlanillaActiva(pl);
    setLocalesSeleccionados([]);
    setNombreDespacho(`Despacho del ${pl.fechaExcel}`);
    setActiveTab('operar');
  };

  // Re-hydrate state from historical despacho logs
  const cargarDespachoHistorico = (desp: Despacho) => {
    // 1. Locate backing planilla or simulate it
    const plCoincidente = planillasHistorial.find(p => p.id === desp.planillaId) || {
      id: desp.planillaId,
      nombre: `Planilla Relacionada (${desp.fechaExcel})`,
      fechaExcel: desp.fechaExcel,
      fechaCreacion: desp.fechaCreacion,
      creadoPor: desp.creadoPor,
      creadoPorEmail: desp.creadoPorEmail,
      archivoNombre: 'Restaurado desde Despacho Histórico',
      locales: desp.localesSeleccionados,
      // reconstruct mock products matrix to feed calculations correctly
      productos: {},
      saboresCategorizados: {
        empanadas: Object.keys(desp.empanadas),
        pastelitos: Object.keys(desp.pastelitos),
        pizzas: Object.keys(desp.pizzas)
      }
    } as Planilla;

    setPlanillaActiva(plCoincidente);
    setLocalesSeleccionados(desp.localesSeleccionados);
    setNombreDespacho(desp.nombreDespacho);
    setMargenes(desp.margenesConfig);
    setActiveTab('operar');
    alert(`📊 Se rehidrató el despacho "${desp.nombreDespacho}" y se configuró la vista correspondiente.`);
  };

  // Export to Excel file using client side XLSX builder
  const exportToExcelFile = () => {
    if (!planillaActiva || localesSeleccionados.length === 0) return;

    const exportRows: any[] = [];
    exportRows.push(["FÁBRICA LA EMPANADERÍA - REPORTE DE LOGÍSTICA"]);
    exportRows.push([`Planilla base: ${planillaActiva.nombre}`]);
    exportRows.push([`Fecha Despacho Excel: ${planillaActiva.fechaExcel}`]);
    exportRows.push([`Generado por: ${currentUser?.email || 'Sistema de Fábrica'}`]);
    exportRows.push([`Fecha y Hora: ${new Date().toLocaleString('es-AR')}`]);
    exportRows.push([]); // Espacio

    exportRows.push(["LOCALES INCLUIDOS EN ESTA RUTA:"]);
    exportRows.push([localesSeleccionados.join(", ")]);
    exportRows.push([]);

    // Resumen de wagon dispatch totals
    exportRows.push(["RESUMEN DE CARROS"]);
    exportRows.push(["Carros Exclusivos", calculosConsolidados.totales.carrosExclusivos]);
    exportRows.push(["Carros Compartidos", calculosConsolidados.totales.carrosCompartidos]);
    exportRows.push(["Total Carros en Camión", calculosConsolidados.totales.totalCarros]);
    exportRows.push(["Total Cajones Pizza", calculosConsolidados.totales.totalCajonesPizza]);
    exportRows.push([]);

    // Detail categorized products
    exportRows.push(["DETALLE GENERAL DE CONSOLIDADO DE PRODUCCIÓN"]);
    exportRows.push(["PRODUCTO / SABOR", "UNIDADES TOTALES", "EQUIVALENTE BANDEJAS"]);

    // Empanadas
    exportRows.push(["-- 🥟 EMPANADAS (50 u. = 1 Band.) --"]);
    Object.entries(calculosConsolidados.empanadas).forEach(([name, val]: any) => {
      exportRows.push([name, val.unidades, `${val.bandejas} B.`]);
    });

    // Pastelitos
    exportRows.push(["-- 🥐 PASTELITOS (35 u. = 1 Band.) --"]);
    Object.entries(calculosConsolidados.pastelitos).forEach(([name, val]: any) => {
      exportRows.push([name, val.unidades, `${val.bandejas} B.`]);
    });

    // Pizzas
    exportRows.push(["-- 🍕 PIZZAS (Cajones x 5u) --"]);
    Object.entries(calculosConsolidados.pizzas).forEach(([name, val]: any) => {
      exportRows.push([name, val.unidades, "-"]);
    });
    exportRows.push([]);

    // Detail wagons mapping
    exportRows.push(["DISTRIBUCIÓN DE ESTIBA EN CARROS"]);
    exportRows.push(["CARRO", "DETALLE DE ARMADO / CARGA", "OBSERVACIÓN"]);
    
    // Exclusive
    calculosConsolidados.carrosExclusivos.forEach(car => {
      exportRows.push([
        `Carro Exclusivo - ${car.local}`,
        `1 Carro Completo Directo`,
        `Contiene 25 Bandejas de Empanadas/Pastelitos`
      ]);
    });

    // Shared
    calculosConsolidados.carrosCompartidos.forEach((car, idx) => {
      const detailsStr = car.items.map(i => `${i.local} (${i.cant} B.)`).join(" + ");
      exportRows.push([
        `Carro Compartido ${idx + 1}`,
        detailsStr,
        car.capacidadRestante > 0 ? `${car.capacidadRestante} bandejas restantes disponibles` : "Completamente lleno"
      ]);
    });

    // Sheets Creation
    const worksheet = XLSX.utils.aoa_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Despacho");
    
    XLSX.writeFile(workbook, `Despacho_Empanaderia_${planillaActiva.fechaExcel.replace(/\//g, '-')}.xlsx`);
  };

  const empanadasList = Object.entries(calculosConsolidados.empanadas);
  const pastelitosList = Object.entries(calculosConsolidados.pastelitos);
  const pizzasList = Object.entries(calculosConsolidados.pizzas);

  if (!currentUser) {
    return (
      <div className="bg-slate-50 text-slate-900 font-sans min-h-screen antialiased flex flex-col justify-between">
        <header className="bg-white border-b border-slate-200 py-4 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-600 rounded-xl shadow-md text-white">
                <FileSpreadsheet className="h-6 w-6 stroke-[2]" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800">La Empanadería <span className="text-slate-400 font-normal font-mono">v2.5</span></h1>
                <p className="text-xs text-slate-400">Logística Central y Distribución de Pedidos</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full select-none">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Servidor Activo</span>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-md w-full mx-auto flex flex-col justify-center px-4 py-12">
          {/* Card Wrapper with Bento Theme styling */}
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 space-y-6">
            <div className="text-center space-y-2">
              <span className="text-[10px] font-extrabold uppercase bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100 tracking-wider">Portal de Acceso</span>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Selecciona tu Perfil</h2>
              <p className="text-xs text-slate-400 leading-relaxed">Bienvenido al panel logístico. Por favor, selecciona cómo deseas ingresar para continuar.</p>
            </div>

            {authError && (
              <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-1">
                <p className="font-bold flex items-center gap-1"><Info className="h-4 w-4 shrink-0 text-amber-600" /> {authError.title}</p>
                <p className="text-slate-600">{authError.message}</p>
              </div>
            )}

            {loginMode === 'select' && (
              <div className="space-y-4 pt-2">
                <button
                  onClick={() => setLoginMode('admin')}
                  className="w-full p-4 bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 rounded-2xl flex items-center justify-between group transition-all text-left cursor-pointer active:scale-[0.98]"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md">
                      <Settings className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Administrador / Muelle</p>
                      <p className="text-[10px] text-slate-400 font-medium">Carga planillas Excel, edita márgenes e históricos. (Acceso con PIN)</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </button>

                <button
                  onClick={() => setLoginMode('armador')}
                  className="w-full p-4 bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 rounded-2xl flex items-center justify-between group transition-all text-left cursor-pointer active:scale-[0.98]"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-md">
                      <Layout className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Armador de Pedidos</p>
                      <p className="text-[10px] text-slate-400 font-medium">Visualización de estiba, control de muelle e impresión. (Acceso Libre)</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </button>
              </div>
            )}

            {loginMode === 'admin' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loginAsAdmin(pinInput);
                }}
                className="space-y-4 pt-2"
              >
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">PIN de Seguridad (Consola Admin)</label>
                  <input
                    type="password"
                    maxLength={10}
                    placeholder="••••"
                    value={pinInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setPinInput(val);
                    }}
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-center text-lg font-bold font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 text-center">PIN por defecto: <strong>1234</strong> (se puede cambiar al ingresar)</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setLoginMode('select'); setPinInput(''); setAuthError(null); }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer"
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    disabled={verificandoPin || !pinInput}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-2xl shadow-lg shadow-blue-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {verificandoPin ? <Loader className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    Ingresar
                  </button>
                </div>
              </form>
            )}

            {loginMode === 'armador' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loginAsArmador(nombreArmadorInput);
                }}
                className="space-y-4 pt-2"
              >
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre del Armador / Operario</label>
                  <input
                    type="text"
                    maxLength={30}
                    required
                    placeholder="Ej: Juan Pérez"
                    value={nombreArmadorInput}
                    onChange={(e) => setNombreArmadorInput(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 italic">Este nombre registrará el reporte correspondiente en el muelle.</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setLoginMode('select'); setNombreArmadorInput(''); setAuthError(null); }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer"
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-850 text-white text-xs font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogIn className="h-4 w-4" />
                    Ingresar Libre
                  </button>
                </div>
              </form>
            )}
          </div>
        </main>

        <footer className="py-6 text-center text-[10px] text-slate-400 border-t border-slate-100 bg-white">
          <p>© {new Date().getFullYear()} La Empanadería Logística. Base de Datos auto-hosteada libre de nubes externas.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 text-slate-900 font-sans min-h-screen antialiased flex flex-col">
      {/* Upper Navigation Header (Never printed) */}
      <header className="no-imprimir bg-white border-b border-slate-200 py-4 shrink-0 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3 text-center sm:text-left">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-md text-white">
              <FileSpreadsheet className="h-6 w-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h1 className="text-xl font-bold tracking-tight text-slate-800">La Empanadería <span className="text-slate-400 font-normal">v2.5</span></h1>
                <span className="text-[10px] font-extrabold uppercase bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md border border-blue-100">Logística Central</span>
              </div>
              <p className="text-xs text-slate-400">Control de muelle, estiba de carros en tiempo real y reportes exportables para muelle.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Sync Status Badge from Bento Grid design */}
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full select-none shadow-sm">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider font-mono">Server Local Direct Link</span>
            </div>
 
            <div className="flex items-center space-x-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-right">
                <p className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest">
                  {currentUser.role === 'admin' ? '📌 ADMINISTRADOR' : '👷 OPERARIO'}
                </p>
                <p className="text-sm font-bold text-slate-800 truncate max-w-[160px]" title={currentUser.displayName}>
                  {currentUser.displayName}
                </p>
              </div>
              <button 
                onClick={logoutLocal}
                className="p-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              >
                <LogOut className="h-3.5 w-3.5" /> Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Primary Dashboard layout content grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
        {authError && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 px-5 py-4 rounded-2xl shadow-sm flex flex-col md:flex-row gap-4 items-start relative animate-fade-in no-imprimir">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
              <Info className="h-6 w-6" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="font-bold text-sm tracking-tight text-amber-805">{authError.title}</h3>
              <p className="text-xs text-amber-700">{authError.message}</p>
              {authError.steps && authError.steps.length > 0 && (
                <ol className="list-decimal list-inside text-xs text-amber-800 space-y-1.5 mt-2 bg-amber-100/40 p-3 rounded-xl border border-amber-200/50">
                  <p className="font-bold text-[10px] uppercase tracking-wider text-amber-600 mb-1">Pasos para solucionarlo:</p>
                  {authError.steps.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
              )}
            </div>
            <button 
              onClick={() => setAuthError(null)} 
              className="absolute top-3 right-3 p-1 rounded-lg hover:bg-amber-150 text-amber-500 hover:text-amber-700 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Controls Left Column (Never printed) */}
          <div className="no-imprimir lg:col-span-1 space-y-6">
            
            {/* Navigation Tabs */}
            <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-200 flex text-xs gap-1">
              <button
                onClick={() => { setActiveTab('operar'); setModoVistaPrevia(false); }}
                className={`flex-1 py-2.5 font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === 'operar' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                <Layout className="h-3.5 w-3.5" /> Procesador
              </button>
              <button
                disabled={!currentUser}
                onClick={() => { setActiveTab('planilla-historial'); setModoVistaPrevia(false); }}
                className={`flex-1 py-2.5 font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${activeTab === 'planilla-historial' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                <History className="h-3.5 w-3.5" /> Planillas ({planillasHistorial.length})
              </button>
              <button
                disabled={!currentUser}
                onClick={() => { setActiveTab('despacho-historial'); setModoVistaPrevia(false); }}
                className={`flex-1 py-2.5 font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${activeTab === 'despacho-historial' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                <FileText className="h-3.5 w-3.5" /> Despachos ({despachosHistorial.length})
              </button>
            </div>

            {/* Admin Dynamic Database & Backup Management Dashboard Card */}
            {currentUser?.role === 'admin' && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3 no-imprimir">
                <button
                  onClick={() => setMostrandoAjustesBase(!mostrandoAjustesBase)}
                  className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100/80 active:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-slate-700">
                    <Settings className="h-4 w-4 text-blue-600 animate-spin-slow" />
                    Base de Datos y Respaldos
                  </span>
                  <span className="text-[9px] uppercase tracking-wider bg-blue-100 text-blue-700 font-extrabold px-2 py-0.5 rounded-md border border-blue-200/50">Admin Panel</span>
                </button>

                {mostrandoAjustesBase && (
                  <div className="pt-3 border-t border-slate-150 space-y-4 text-xs animate-fade-in">
                    {/* Pin change option */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                      <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">1. Cambiar PIN de Acceso</p>
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          placeholder="Nuevo PIN de 4+ dígitos"
                          maxLength={10}
                          value={nuevoPinInput}
                          onChange={(e) => setNuevoPinInput(e.target.value.replace(/\D/g, ''))}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                        <button
                          onClick={async () => {
                            if (!nuevoPinInput || nuevoPinInput.length < 4) {
                              setErrorConfig('El PIN debe tener al menos 4 dígitos.');
                              return;
                            }
                            try {
                              setErrorConfig(null);
                              setSuccessConfig(null);
                              await cambiarAdminPin('1234', nuevoPinInput); // Fallback try
                              setSuccessConfig('PIN actualizado con éxito en el servidor.');
                              setNuevoPinInput('');
                            } catch (err: any) {
                              setErrorConfig(err?.message || 'Error al cambiar PIN de administrador.');
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-[10px]"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>

                    {/* Manual Backups Export/Import */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                      <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">2. Copia de Seguridad</p>
                      <p className="text-[10px] text-slate-400 italic">Descarga un respaldo completo (.json) o restaura una copia anterior.</p>
                      
                      <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
                        {/* Export Button */}
                        <button
                          onClick={async () => {
                            try {
                              setErrorConfig(null);
                              setSuccessConfig(null);
                              const fullDb = await exportarBaseDatos();
                              const blob = new Blob([JSON.stringify(fullDb, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `Copia_La_Empanaderia_${new Date().toISOString().split('T')[0]}.json`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              setSuccessConfig('Descargado correctamente.');
                            } catch (err) {
                              setErrorConfig('No se pudo exportar.');
                            }
                          }}
                          className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-lg flex items-center justify-center gap-1 cursor-pointer text-[10px]"
                        >
                          <Download className="h-3 w-3" /> Descargar (.json)
                        </button>

                        {/* Import Button */}
                        <label className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 font-extrabold rounded-lg flex items-center justify-center gap-1 cursor-pointer hover:bg-slate-50 text-[10px]">
                          <Plus className="h-3 w-3 text-blue-500" /> Restaurar (.json)
                          <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = async (evt) => {
                                try {
                                  setErrorConfig(null);
                                  setSuccessConfig(null);
                                  const json = JSON.parse(evt.target?.result as string);
                                  await importarBaseDatos(json);
                                  setSuccessConfig('Base de datos importada.');
                                  setTimeout(() => window.location.reload(), 1000);
                                } catch (err) {
                                  setErrorConfig('Error al leer el archivo de respaldo.');
                                }
                              };
                              reader.readAsText(file);
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Instruction Alert detailing Persistent disk on Render */}
                    <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-xl space-y-2">
                      <p className="font-extrabold flex items-center gap-1 uppercase tracking-wide text-[10px] text-blue-800"><Info className="h-3.5 w-3.5 shrink-0 text-blue-600" /> PERSISTENCIA EN RENDER</p>
                      <p className="text-[10.5px] text-blue-805 leading-relaxed">
                        Los servidores gratuitos de Render borran los archivos cada vez que reinician.
                        <br /><br />
                        <strong>Para no perder datos históricos:</strong>
                        <ol className="list-decimal list-inside space-y-1 mt-1.5 p-2 bg-white/40 rounded-lg border border-blue-250/30 font-medium">
                          <li>Ve al panel de Render.</li>
                          <li>Entra a la pestaña <strong>"Disks"</strong>.</li>
                          <li>Haz clic en <strong>"Add Disk"</strong>.</li>
                          <li>Ponle el nombre que quieras y en Mount Path pon exactamente: <code>/data</code></li>
                          <li>¡Listo! Render guarda todo en ese muelle persistente gratis.</li>
                        </ol>
                      </p>
                    </div>

                    {errorConfig && <p className="text-red-600 font-bold bg-red-50 p-2 rounded-lg text-[10px] border border-red-200 text-center">{errorConfig}</p>}
                    {successConfig && <p className="text-green-600 font-bold bg-green-50 p-2 rounded-lg text-[10px] border border-green-200 text-center">{successConfig}</p>}
                  </div>
                )}
              </div>
            )}

            {/* IFtab is OPERA (Standard controls flow) */}
            {activeTab === 'operar' && (
              <>
                {/* 1. Spreadsheets Excel Upload */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative group">
                  <div className="flex items-center space-x-3 mb-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/10">A</span>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Planilla de Carga</h2>
                  </div>
                  
                  <label className="flex flex-col items-center justify-center w-full h-24 border border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-blue-50/30 hover:border-blue-400 transition-all">
                    <div className="flex flex-col items-center justify-center text-center px-2">
                      <FileIcon className="h-7 w-7 text-blue-500 mb-1" />
                      <p className="text-xs text-slate-705 font-bold truncate max-w-[240px]" id="file-name">
                        {planillaActiva ? planillaActiva.archivoNombre : "Arrastrá tu planilla de hoy"}
                      </p>
                      <span className="text-[10px] text-slate-400">O haz clic para seleccionar</span>
                    </div>
                    <input id="excel-file" type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFileUpload} />
                  </label>

                  {planillaActiva && currentUser && (
                    <button
                      onClick={savePlanillaToCloud}
                      disabled={guardandoPlanillaState}
                      className="mt-3 w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" /> 
                      {guardandoPlanillaState ? "Guardando..." : "Subir planilla de hoy a la base de datos"}
                    </button>
                  )}
                </div>

                {/* 2. Seleccion de locales */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/10">B</span>
                      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Locales ({localesSeleccionados.length})</h2>
                    </div>
                    {localesSeleccionados.length > 0 && (
                      <button 
                        onClick={descoseleccionarTodosLosLocales} 
                        className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline border-none bg-none cursor-pointer"
                      >
                        Limpiar Selección
                      </button>
                    )}
                  </div>

                  <input 
                    type="text" 
                    placeholder="🔍 Buscar local..." 
                    value={busquedaLocal}
                    onChange={(e) => setBusquedaLocal(e.target.value)}
                    disabled={!planillaActiva}
                    className="w-full mb-3 px-3 py-2 text-xs border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50" 
                  />

                  {planillaActiva ? (
                    <div className="space-y-1 mb-3">
                      <div className="flex gap-2 mb-2">
                        <button 
                          onClick={seleccionarTodosLosLocales}
                          className="flex-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Seleccionar Todos ({planillaActiva.locales.length})
                        </button>
                      </div>
                      <div id="locales-container" className="space-y-1 max-h-48 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        {localesFiltrados.length === 0 ? (
                          <div className="text-center py-4 text-xs text-slate-400">No se encontraron locales.</div>
                        ) : (
                          localesFiltrados.map(local => {
                            const isChecked = localesSeleccionados.includes(local);
                            return (
                              <div key={local} className="flex items-center space-x-2 py-0.5 hover:bg-slate-100 px-1 rounded">
                                <input 
                                  type="checkbox" 
                                  id={`shop-${local}`} 
                                  checked={isChecked}
                                  onChange={() => toggleLocal(local)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                                />
                                <label 
                                  htmlFor={`shop-${local}`} 
                                  className="text-slate-700 text-xs cursor-pointer select-none truncate font-semibold flex-1"
                                >
                                  {local}
                                </label>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                      Cargue la planilla Excel (o elija una del Historial) para listar los locales disponibles.
                    </div>
                  )}
                </div>

                {/* 3. Margins adjustment & preview controllers */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                  <div className="flex items-center space-x-3 border-b border-slate-100 pb-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/10">C</span>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ajustes de Impresión</h2>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Margen Sup (mm)</label>
                      <input 
                        type="number" 
                        value={margenes.top} 
                        onChange={(e) => setMargenes(p => ({ ...p, top: Math.max(0, parseInt(e.target.value) || 0) }))}
                        min="0" max="50" 
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-2 text-sm font-semibold text-slate-750"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Margen Inf (mm)</label>
                      <input 
                        type="number" 
                        value={margenes.bottom} 
                        onChange={(e) => setMargenes(p => ({ ...p, bottom: Math.max(0, parseInt(e.target.value) || 0) }))}
                        min="0" max="50" 
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-2 text-sm font-semibold text-slate-755"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Margen Izq (mm)</label>
                      <input 
                        type="number" 
                        value={margenes.left} 
                        onChange={(e) => setMargenes(p => ({ ...p, left: Math.max(0, parseInt(e.target.value) || 0) }))}
                        min="0" max="50" 
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-2 text-sm font-semibold text-slate-750"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Margen Der (mm)</label>
                      <input 
                        type="number" 
                        value={margenes.right} 
                        onChange={(e) => setMargenes(p => ({ ...p, right: Math.max(0, parseInt(e.target.value) || 0) }))}
                        min="0" max="50" 
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-2 text-sm font-semibold text-slate-750"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                      <label className="flex items-center gap-1"><Scale className="h-3 w-3 text-slate-400" /> Escala de Bloques (%)</label>
                      <span className="font-bold text-blue-600 font-mono">{margenes.scale}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="70" max="110" 
                      value={margenes.scale} 
                      onChange={(e) => setMargenes(p => ({ ...p, scale: parseInt(e.target.value) }))}
                      className="w-full h-1 bg-slate-100 accent-blue-600 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 text-[10px] text-slate-400 flex gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <Info className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                    <span>Ajuste los márgenes y escala para evitar saltos de bloques abruptos y ver en tiempo real cómo encajará en la hoja física A4 impresa.</span>
                  </div>

                  <div className="pt-1 flex flex-col gap-2">
                    {modoVistaPrevia ? (
                      <button 
                        onClick={() => { setModoVistaPrevia(false); }}
                        className="w-full bg-slate-900 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer text-xs flex items-center justify-center gap-2"
                      >
                        <Settings className="h-4 w-4" /> Volver a Panel de Trabajo
                      </button>
                    ) : (
                      <button 
                        onClick={() => { setModoVistaPrevia(true); }}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-xs mt-1 active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Printer className="h-4 w-4 animate-pulse" /> Vista Previa Digital (A4)
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Action triggers */}
                {localesSeleccionados.length > 0 && (
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Despacho de Ruta</h2>
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold">Consolidador</span>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase">Nombre de la Ruta / Reporte</label>
                      <input 
                        type="text" 
                        value={nombreDespacho} 
                        onChange={(e) => setNombreDespacho(e.target.value)} 
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-2 text-xs font-semibold"
                        placeholder="Ej: Ruta Sur - Despacho Mañana"
                      />
                    </div>

                    <div className="pt-2 space-y-2">
                      {currentUser && (
                        <button 
                          onClick={saveDespachoToCloud}
                          disabled={guardandoDespachoState}
                          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-xs active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Save className="h-4 w-4" /> 
                          {guardandoDespachoState ? "Guardando..." : "Archivar Despacho en la Base"}
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={exportToExcelFile}
                          className="px-3 py-2.5 bg-slate-150 hover:bg-slate-200 text-slate-800 border-slate-200 border rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" /> XLSX
                        </button>

                        <button 
                          onClick={() => window.print()}
                          className="px-3 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" /> IMPRIMIR
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* IFtab is PLANILLA-HISTORIAL (Database index excel files) */}
            {activeTab === 'planilla-historial' && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Planillas Históricas</h2>
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[70vh] pr-1">
                  {planillasHistorial.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 italic">
                      No hay planillas subidas en la base de datos cloud. Sube una desde el procesador.
                    </div>
                  ) : (
                    planillasHistorial.map(pl => (
                      <div 
                        key={pl.id}
                        onClick={() => cargarPlanillaHistorica(pl)}
                        className={`p-3.5 rounded-xl border transition-all text-xs cursor-pointer flex justify-between items-start text-left ${planillaActiva?.id === pl.id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                      >
                        <div className="space-y-1 pr-2 flex-1 min-w-0">
                          <p className="font-bold text-slate-800 truncate">{pl.nombre}</p>
                          <p className="text-[10px] text-slate-400 font-mono">Excel Ref Date: {pl.fechaExcel}</p>
                          <p className="text-[9px] text-slate-400 truncate">Sincronizado por: {pl.creadoPorEmail}</p>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          {currentUser?.uid === pl.creadoPor && (
                            <button 
                              onClick={(e) => handleDeletePlanilla(pl.id, e)}
                              className="p-1.5 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                              title="Eliminar planilla histórica"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* IFtab is DESPACHO-HISTORIAL (Calculated audits tracker) */}
            {activeTab === 'despacho-historial' && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Despachos Archivados</h2>
                </div>

                <div className="pt-1 text-[10px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex gap-2">
                  <Info className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                  <span>Aquí figuran los despachos cerrados y guardados. Úselos para auditar cargas pasadas o reimprimir.</span>
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[60vh] pr-1">
                  {despachosHistorial.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 italic">
                      No hay auditorías de despachos registradas. Seleccione locales y procese para archivar uno.
                    </div>
                  ) : (
                    despachosHistorial.map(desp => (
                      <div 
                        key={desp.id}
                        onClick={() => cargarDespachoHistorico(desp)}
                        className="p-3.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl transition-all text-xs cursor-pointer flex justify-between items-start text-left"
                      >
                        <div className="space-y-1 pr-2 flex-1 min-w-0">
                          <p className="font-bold text-slate-800 truncate">{desp.nombreDespacho}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                            <span>Carros: {desp.totales.totalCarros}</span> | 
                            <span>Pizzas: {desp.totales.totalCajonesPizza} cjs</span>
                          </div>
                          <p className="text-[9px] text-slate-400 truncate">Registro: {new Date(desp.fechaCreacion).toLocaleString('es-AR')}</p>
                          <p className="text-[9px] text-blue-600 truncate font-semibold">Jefe: {desp.creadoPorEmail}</p>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          {currentUser?.uid === desp.creadoPor && (
                            <button 
                              onClick={(e) => handleDeleteDespacho(desp.id, e)}
                              className="p-1.5 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                              title="Eliminar registro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right Area: Printable sheets display area */}
          <div 
            id="contenedor-imprimible-principal" 
            className={`lg:col-span-2 space-y-6 ${modoVistaPrevia ? 'bg-slate-700 p-2 sm:p-6 rounded-2xl max-h-[90vh] overflow-y-auto shadow-inner ring-4 ring-slate-800' : ''}`}
          >
            {modoVistaPrevia && (
              <div className="no-imprimir bg-indigo-900 border border-indigo-800 rounded-xl p-3 flex justify-between items-center text-white mb-4">
                <span className="text-xs font-bold flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  VISTA PREVIA DIGITAL (Simulación de Hojas A4 Físicas)
                </span>
                <button 
                  onClick={() => setModoVistaPrevia(false)}
                  className="bg-slate-800 hover:bg-slate-900 px-3 py-1 rounded text-[10px] font-black tracking-wide border-none text-white cursor-pointer"
                >
                  SALIR VISTA IMPRESIÓN
                </button>
              </div>
            )}

            {planillaActiva ? (
              <div className={modoVistaPrevia ? 'modo-vista-previa-activo' : ''}>
                
                {/* ==================== HOJA 1 ==================== */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 pantalla-imprimible-hoja transition-all duration-150 relative">
                  <div className="pantalla-imprimible-contenedor escalable-text space-y-6">
                    
                    {/* Header Hoja 1 */}
                    <div className="border-b-2 border-dashed border-slate-300 pb-4 flex justify-between items-start">
                      <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">HOJA DE CARGA - PRODUCTOS (PAG. 1)</h2>
                        <p className="text-[11px] text-slate-500">Planificación de armado de pedidos a granel y consolidado de producción.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-extrabold text-slate-700 tracking-wider">FÁBRICA LA EMPANADERÍA</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">Reporte: {planillaActiva.fechaExcel}</p>
                      </div>
                    </div>

                    {/* Shop routes list block */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Ruta / Locales Incluidos en el Consolidado:</span>
                      {localesSeleccionados.length > 0 ? (
                        <div id="print-locales-list-1" className="flex flex-wrap gap-1">
                          {localesSeleccionados.map(l => (
                            <span key={l} className="bg-slate-200 text-slate-800 font-extrabold px-1.5 py-0.5 rounded border border-slate-300 text-[10px] tracking-tight">{l}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No hay locales seleccionados. Elige tiendas en el panel lateral.</p>
                      )}
                    </div>

                    {/* Empanadas Products Box */}
                    <div className="bg-amber-50/45 border border-amber-200/50 rounded-xl p-4 shadow-sm">
                      <h3 className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center justify-between gap-2 mb-2 border-b border-amber-200/60 pb-1.5">
                        <span className="flex items-center gap-1.5">🥟 Empanadas</span>
                        <span className="text-[10px] font-medium text-amber-600 font-mono">(50 u. = 1 Bandeja | 25 Band. = 1 Carro)</span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-amber-200/60 text-amber-800 font-extrabold text-[10px]">
                              <th className="py-1">Sabor</th>
                              <th className="py-1 text-right">Unidades</th>
                              <th className="py-1 text-right">Bandejas</th>
                            </tr>
                          </thead>
                          <tbody id="tabla-empanadas" className="divide-y divide-amber-100/50">
                            {empanadasList.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="py-4 text-center text-slate-400 italic">No hay pedidos de empanadas cargados.</td>
                              </tr>
                            ) : (
                              empanadasList.map(([name, val]: any) => (
                                <tr key={name} className="hover:bg-amber-100/20 text-slate-700">
                                  <td className="py-1.5 font-semibold text-slate-800">{name}</td>
                                  <td className="py-1.5 text-right font-mono text-slate-600">{val.unidades.toLocaleString('es-AR')}</td>
                                  <td className="py-1.5 text-right font-bold text-slate-900 font-mono">{val.bandejas} B.</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Pastelitos Products Box */}
                    <div className="bg-rose-50/45 border border-rose-200/50 rounded-xl p-4 shadow-sm">
                      <h3 className="text-xs font-black text-rose-800 uppercase tracking-wider flex items-center justify-between gap-2 mb-2 border-b border-rose-200/60 pb-1.5">
                        <span className="flex items-center gap-1.5">🥐 Pastelitos</span>
                        <span className="text-[10px] font-medium text-rose-600 font-mono">(35 u. = 1 Bandeja | 25 Band. = 1 Carro)</span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-rose-200/60 text-rose-800 font-extrabold text-[10px]">
                              <th className="py-1">Variedad</th>
                              <th className="py-1 text-right">Unidades</th>
                              <th className="py-1 text-right">Bandejas</th>
                            </tr>
                          </thead>
                          <tbody id="tabla-pastelitos" className="divide-y divide-rose-100/50">
                            {pastelitosList.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="py-4 text-center text-slate-400 italic">No hay pedidos de pastelitos cargados.</td>
                              </tr>
                            ) : (
                              pastelitosList.map(([name, val]: any) => (
                                <tr key={name} className="hover:bg-rose-100/20 text-slate-700">
                                  <td className="py-1.5 font-semibold text-slate-800">{name}</td>
                                  <td className="py-1.5 text-right font-mono text-slate-600">{val.unidades.toLocaleString('es-AR')}</td>
                                  <td className="py-1.5 text-right font-bold text-slate-900 font-mono">{val.bandejas} B.</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Pizzas Products Box */}
                    <div className="bg-emerald-50/45 border border-emerald-200/50 rounded-xl p-4 shadow-sm">
                      <h3 className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center justify-between gap-2 mb-2 border-b border-emerald-200/60 pb-1.5">
                        <span className="flex items-center gap-1.5">🍕 Pizzas</span>
                        <span className="text-[10px] font-medium text-emerald-600 font-mono">(Consolidado directo en cajoneras x5U)</span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-emerald-200/60 text-emerald-800 font-extrabold text-[10px]">
                              <th className="py-1">Gusto</th>
                              <th className="py-1 text-right">Cajones Pedidos (Cjs)</th>
                            </tr>
                          </thead>
                          <tbody id="tabla-pizzas" className="divide-y divide-emerald-100/50">
                            {pizzasList.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="py-4 text-center text-slate-400 italic">No hay pedidos de pizzas en esta ruta.</td>
                              </tr>
                            ) : (
                              pizzasList.map(([name, val]: any) => (
                                <tr key={name} className="hover:bg-emerald-100/20 text-slate-700">
                                  <td className="py-1.5 font-semibold text-slate-800">{name}</td>
                                  <td className="py-1.5 text-right font-bold text-slate-900 font-mono">{val.unidades} cjs.</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Timestamp signature */}
                    <div className="pt-2 text-[9px] text-slate-400 font-mono flex justify-between items-center border-t border-slate-200 border-dotted">
                      <span>Impreso via Módulo de Logística</span>
                      <span>{new Date().toLocaleString('es-AR')}</span>
                    </div>

                  </div>
                </div>

                {/* ==================== HOJA 2 ==================== */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 pantalla-imprimible-hoja salto-pagina transition-all duration-150 relative mt-6">
                  <div className="pantalla-imprimible-contenedor escalable-text space-y-6">
                    
                    {/* Header Hoja 2 */}
                    <div className="border-b-2 border-dashed border-slate-300 pb-4 flex justify-between items-start">
                      <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">HOJA DE DESPACHO - LOGÍSTICA DE CARROS (PAG. 2)</h2>
                        <p className="text-[11px] text-slate-500">Cálculo de estiba, cubicación y distribución optimizada para camiones.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-extrabold text-slate-700 tracking-wider">FÁBRICA LA EMPANADERÍA</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">Reporte: {planillaActiva.fechaExcel}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Ruta Asociada:</span>
                      <div id="print-locales-list-2" className="flex flex-wrap gap-1">
                        {localesSeleccionados.map(l => (
                          <span key={l} className="bg-slate-200 text-slate-800 font-extrabold px-1.5 py-0.5 rounded border border-slate-300 text-[10px] tracking-tight">{l}</span>
                        ))}
                      </div>
                    </div>

                    {/* Wagons Logistics Algorithms */}
                    <div className="bg-slate-900 text-slate-100 rounded-xl p-5 shadow-lg border border-slate-800">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center justify-between">
                        <span>🚚 Detalle de Armado de Carros Físicos</span>
                        <span className="text-[10px] font-medium text-amber-400 font-mono">Tránsitos optimizados</span>
                      </h3>
                      
                      <div className="space-y-4 text-xs font-mono" id="logistica-carros-resultado">
                        {localesSeleccionados.length === 0 ? (
                          <p className="text-slate-400 italic">Seleccione locales en el panel de procesamiento para analizar estiba de carros.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            {/* Exclusive wagons lists */}
                            <div className="space-y-2">
                              <h4 className="font-extrabold text-amber-400 border-b border-slate-800 pb-1 text-xs">📦 Carros Exclusivos (Un solo Local)</h4>
                              {calculosConsolidados.carrosExclusivos.length === 0 ? (
                                <p className="text-slate-500 italic text-[11px]">No hay carros exclusivos enteros para este despacho.</p>
                              ) : (
                                calculosConsolidados.carrosExclusivos.map((wagon, i) => (
                                  <div key={i} className="bg-slate-800/80 p-2.5 rounded border border-slate-700 shadow-sm">
                                    <div className="flex justify-between font-bold">
                                      <span className="text-white truncate">{wagon.local}</span>
                                      <span className="text-emerald-400 font-extrabold">x{wagon.carros} Carro{wagon.carros > 1 ? 's' : ''}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">Suma: {wagon.bandejas} bandejas completas de fábrica</p>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Shared packed wagons */}
                            <div className="space-y-2">
                              <h4 className="font-extrabold text-sky-400 border-b border-slate-800 pb-1 text-xs">🤝 Carros Compartidos (Bin-Packed)</h4>
                              {calculosConsolidados.carrosCompartidos.length === 0 ? (
                                <p className="text-slate-500 italic text-[11px]">No hay carros compartidos consolidados.</p>
                              ) : (
                                calculosConsolidados.carrosCompartidos.map((wagon, idx) => (
                                  <div key={idx} className="bg-slate-800/80 p-2.5 rounded border border-sky-950 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 left-0 h-0.5 bg-sky-500" />
                                    <div className="font-bold text-white flex justify-between items-center mb-1">
                                      <span>CARRO COMPARTIDO {idx + 1}</span>
                                      <span className="text-[10px] bg-sky-500/10 text-sky-400 px-1 rounded-sm">Estiba #{idx + 1}</span>
                                    </div>
                                    
                                    <ul className="space-y-1 my-1.5 text-[11px] text-slate-300">
                                      {wagon.items.map((it, k) => (
                                        <li key={k} className="flex justify-between border-b border-slate-800/45 pb-0.5">
                                          <span className="truncate pr-1">{it.local}:</span>
                                          <span className="font-bold text-white font-mono">{it.cant} B.</span>
                                        </li>
                                      ))}
                                    </ul>

                                    <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-slate-800/60 mt-1">
                                      <span className="text-slate-400 font-semibold">Total Cargado: {25 - wagon.capacidadRestante} B.</span>
                                      {wagon.capacidadRestante > 0 ? (
                                        <span className="text-amber-400 font-bold">({wagon.capacidadRestante} libres)</span>
                                      ) : (
                                        <span className="text-emerald-400 font-bold">¡LLENO!</span>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    </div>

                    {/* Numeric summaries boxes */}
                    <div className="pt-2">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">📋 Consolidado Final de Expedición</h4>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 shadow-sm">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Wagons Excl.</span>
                          <span id="tot-carros-exc" className="text-base font-extrabold text-slate-800 font-mono">
                            {calculosConsolidados.totales.carrosExclusivos}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 shadow-sm">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Wagons Comp.</span>
                          <span id="tot-carros-comp" className="text-base font-extrabold text-slate-800 font-mono">
                            {calculosConsolidados.totales.carrosCompartidos}
                          </span>
                        </div>
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-2.5 shadow-sm">
                          <span className="text-[9px] uppercase font-bold text-blue-600 block mb-0.5">Total Carros camión</span>
                          <span id="tot-carros-suma" className="text-lg font-black text-blue-950 font-mono">
                            {calculosConsolidados.totales.totalCarros}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 shadow-sm">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Total Cajones Pizza</span>
                          <span id="tot-cajones-pizza" className="text-base font-extrabold text-slate-800 font-mono">
                            {calculosConsolidados.totales.totalCajonesPizza}
                          </span>
                        </div>
                      </div>

                      {/* Pizza Breakdown Detail */}
                      <div className="bg-emerald-50/45 border border-emerald-200/60 rounded-xl p-3.5 mt-4">
                        <span className="text-[9px] uppercase font-black tracking-wider text-emerald-800 block mb-1.5">🍕 Desglose de Pizzas por Gusto:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-semibold text-slate-700" id="desglose-pizzas-gustos">
                          {pizzasList.length === 0 ? (
                            <div className="text-slate-400 italic">No hay pizzas detectadas para los locales activos.</div>
                          ) : (
                            pizzasList.map(([name, val]: any) => (
                              <div key={name} className="flex justify-between border-b border-emerald-100/50 pb-0.5 pr-2">
                                <span className="text-slate-600 truncate">{name.replace('PIZZA ', '').replace(' CAJON X 5U', '')}:</span>
                                <span className="font-extrabold text-slate-900 font-mono">{val.unidades} cjs.</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Official Signatures Row */}
                      <div className="grid grid-cols-2 gap-8 mt-16 pt-4 px-2 select-none">
                        <div className="text-center">
                          <div className="border-b border-slate-300 w-44 mx-auto h-12"></div>
                          <p className="text-xs font-bold text-slate-800 mt-2">Responsable de Carga</p>
                          <p className="text-[9px] text-slate-400">Control de muelle y stiba</p>
                        </div>
                        <div className="text-center">
                          <div className="border-b border-slate-300 w-44 mx-auto h-12"></div>
                          <p className="text-xs font-bold text-slate-800 mt-2">Chofer / Transportista</p>
                          <p className="text-[9px] text-slate-400">Armado y conformidad</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 text-[9px] text-slate-400 font-mono flex justify-between items-center border-t border-slate-200 border-dotted">
                      <span>Impreso de Auditoría de Muelle v4</span>
                      <span>{new Date().toLocaleString('es-AR')}</span>
                    </div>

                  </div>
                </div>

              </div>
            ) : (
              // Empty spreadsheet state layout
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-200 flex flex-col items-center justify-center space-y-4">
                <div className="p-4 bg-blue-50 rounded-2xl text-blue-600">
                  <FileSpreadsheet className="h-10 w-10 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Comience a Cargar la Planilla</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Puede arrastrar una planilla Excel .xlsx desde su computadora, o dirigirse a la solapa del **Historial** para elegir alguna planilla ya subida en tiempo real por otros jefes de logística.
                  </p>
                </div>
              </div>
            )}

          </div>

        </div>
      </main>
      
      {/* Small footer */}
      <footer className="no-imprimir bg-slate-900 text-slate-500 text-center py-4 text-[10px] border-t border-slate-800 shrink-0">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p>© 2026 Fábrica "La Empanadería". Todos los derechos reservados.</p>
          <p className="font-mono">Central de Expedición y Logística en Muelle</p>
        </div>
      </footer>
    </div>
  );
}
