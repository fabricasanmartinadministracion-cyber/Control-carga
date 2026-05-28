import { Planilla, Despacho, OperationType } from './types';

// Simple API-based helpers replacing Firebase completely
export async function guardarPlanilla(planilla: Planilla): Promise<void> {
  const response = await fetch('/api/planillas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(planilla),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al guardar la planilla en el servidor.');
  }
}

export async function eliminarPlanilla(id: string): Promise<void> {
  const response = await fetch(`/api/planillas/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al eliminar la planilla del servidor.');
  }
}

export async function guardarDespacho(despacho: Despacho): Promise<void> {
  const response = await fetch('/api/despachos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(despacho),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al guardar el despacho en el servidor.');
  }
}

export async function eliminarDespacho(id: string): Promise<void> {
  const response = await fetch(`/api/despachos/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al eliminar el despacho del muelle.');
  }
}

// Emulate Firebase real-time subscription using highly optimized interval polling (every 4 seconds)
export function suscribirPlanillas(onUpdate: (planillas: Planilla[]) => void, onError: (error: Error) => void) {
  let isMounted = true;

  const fetchPlanillas = async () => {
    try {
      const response = await fetch('/api/planillas');
      if (!response.ok) {
        throw new Error('Error de servidor al cargar las planillas históricas.');
      }
      const data = await response.json();
      if (isMounted) {
        onUpdate(data);
      }
    } catch (err: any) {
      if (isMounted) {
        onError(err || new Error('Error al conectar con el servidor.'));
      }
    }
  };

  // Immediate fetch on subscription
  fetchPlanillas();

  const interval = setInterval(fetchPlanillas, 4000);

  // Return unsubscribe cleanup function
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
}

export function suscribirDespachos(onUpdate: (despachos: Despacho[]) => void, onError: (error: Error) => void) {
  let isMounted = true;

  const fetchDespachos = async () => {
    try {
      const response = await fetch('/api/despachos');
      if (!response.ok) {
        throw new Error('Error de servidor al cargar despachos archivados.');
      }
      const data = await response.json();
      if (isMounted) {
        onUpdate(data);
      }
    } catch (err: any) {
      if (isMounted) {
        onError(err || new Error('Error al conectar con el servidor.'));
      }
    }
  };

  // Immediate fetch on subscription
  fetchDespachos();

  const interval = setInterval(fetchDespachos, 4000);

  // Return unsubscribe cleanup function
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
}

// Password verification helpers
export async function verificarAdminPin(pin: string): Promise<boolean> {
  const response = await fetch('/api/auth/verify-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return response.ok;
}

export async function cambiarAdminPin(currentPin: string, newPin: string): Promise<void> {
  const response = await fetch('/api/auth/change-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPin, newPin }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al cambiar el PIN de administrador.');
  }
}

// Backup & Restore
export async function exportarBaseDatos(): Promise<any> {
  const response = await fetch('/api/backup/export');
  if (!response.ok) {
    throw new Error('No se pudo exportar la copia de seguridad.');
  }
  return response.json();
}

export async function importarBaseDatos(backupData: any): Promise<void> {
  const response = await fetch('/api/backup/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupData),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'No se pudo importar la copia de seguridad.');
  }
}
