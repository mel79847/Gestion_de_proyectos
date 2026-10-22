/**
 * Puerta de enlace HTTP: la misma interfaz contra la API Express real (servida en /).
 * Inicia sesión por cada usuario de demostración y conserva su token JWT.
 * El trabajador de integración corre en su propio proceso; procesar() solo refresca.
 */
const CLAVE_DEMO = 'Demo2026!';
const USUARIOS = [
  { usuario: 'tec.rojas', nombre: 'Luis Rojas', rol: 'tecnico' },
  { usuario: 'sup.vargas', nombre: 'Carla Vargas', rol: 'supervisor' },
  { usuario: 'alm.mamani', nombre: 'Jorge Mamani', rol: 'almacen' },
  { usuario: 'com.flores', nombre: 'Ana Flores', rol: 'comprador' },
  { usuario: 'ctl.quiroga', nombre: 'Rosa Quiroga', rol: 'control' },
  { usuario: 'adm.sistema', nombre: 'Administrador del sistema', rol: 'administrador' },
  { usuario: 'ger.salazar', nombre: 'Marco Salazar', rol: 'gerencia' },
];

class ErrorApi extends Error {
  constructor(error) {
    super(error.mensaje);
    this.codigo = error.codigo;
    this.detalle = error.detalle;
  }
}

export function crearGatewayHttp({ base = '', simuladorBase = 'http://localhost:4000', alCambiar = () => {} } = {}) {
  const tokens = new Map();

  async function token(usuario) {
    if (!tokens.has(usuario)) {
      const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, clave: CLAVE_DEMO }) });
      const datos = await r.json();
      if (!r.ok) throw new ErrorApi(datos.error);
      tokens.set(usuario, datos.token);
    }
    return tokens.get(usuario);
  }

  async function llamar(usuario, metodo, ruta, cuerpo) {
    const r = await fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await token(usuario)}` },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = await r.json();
    if (!r.ok) throw new ErrorApi(datos.error);
    if (metodo !== 'GET') alCambiar();
    return datos;
  }
  const sim = async (metodo, ruta, cuerpo) => {
    const r = await fetch(`${simuladorBase}${ruta}`, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const datos = await r.json();
    alCambiar();
    return datos;
  };
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();

  return {
    modo: 'http',
    usuarios: USUARIOS,
    resumen: (us) => llamar(us, 'GET', '/resumen'),
    materiales: (us) => llamar(us, 'GET', '/maestros/materiales'),
    material: (us, c) => llamar(us, 'GET', `/maestros/materiales/${c}`),
    verificarMaterial: (us, f) => llamar(us, 'POST', '/maestros/materiales/verificacion', f),
    crearMaterial: (us, f) => llamar(us, 'POST', '/maestros/materiales', f),
    equipos: (us) => llamar(us, 'GET', '/maestros/equipos'),
    compatibles: (us, eq) => llamar(us, 'GET', `/maestros/equipos/${eq}/materiales`),
    proveedores: (us) => llamar(us, 'GET', '/maestros/proveedores'),
    almacenes: (us) => llamar(us, 'GET', '/maestros/almacenes'),
    ordenes: (us) => llamar(us, 'GET', '/ordenes'),
    orden: (us, n) => llamar(us, 'GET', `/ordenes/${n}`),
    crearOrden: (us, d) => llamar(us, 'POST', '/ordenes', d),
    validar: (us, n) => llamar(us, 'POST', `/ordenes/${n}/validacion`, {}),
    reservar: (us, n) => llamar(us, 'POST', `/ordenes/${n}/reservas`, {}),
    entregar: (us, n, receptor) => llamar(us, 'POST', `/ordenes/${n}/entregas`, { receptor }),
    cambioPieza: (us, n, d) => llamar(us, 'POST', `/ordenes/${n}/cambios-pieza`, d),
    completar: (us, n) => llamar(us, 'POST', `/ordenes/${n}/completar`, {}),
    cerrar: (us, n) => llamar(us, 'POST', `/ordenes/${n}/cierre`, {}),
    trazabilidad: (us, n) => llamar(us, 'GET', `/ordenes/${n}/trazabilidad`),
    disponibilidad: (us, m, a) => llamar(us, 'GET', `/inventario/disponibilidad/${m}?${q({ almacen: a })}`),
    kardex: (us, m) => llamar(us, 'GET', `/inventario/kardex/${m}`),
    solicitudes: (us) => llamar(us, 'GET', '/compras/solicitudes'),
    solicitud: (us, n) => llamar(us, 'GET', `/compras/solicitudes/${n}`),
    cotizar: (us, n, c) => llamar(us, 'POST', `/compras/solicitudes/${n}/cotizaciones`, c),
    aprobar: (us, n) => llamar(us, 'POST', `/compras/solicitudes/${n}/aprobacion`, {}),
    evaluar: (us, m, a) => llamar(us, 'POST', `/compras/evaluaciones/${m}?${q({ almacen: a })}`, {}),
    operaciones: (us, f = {}) => llamar(us, 'GET', `/integracion/operaciones?${q(f)}`),
    reprocesar: (us, id) => llamar(us, 'POST', `/integracion/operaciones/${id}/reproceso`, {}),
    conciliar: (us) => llamar(us, 'POST', '/integracion/conciliaciones', {}),
    alertas: (us) => llamar(us, 'GET', '/alertas'),
    incidencias: (us) => llamar(us, 'GET', '/incidencias'),
    bitacora: (us) => llamar(us, 'GET', '/bitacora'),
    procesar: async () => {
      alCambiar();
      return [];
    },
    respaldo: async () => ({ revisadas: 0, recuperadas: [] }),
    simulador: {
      estado: async () => ({ wms: await (await fetch(`${simuladorBase}/simulador/wms/estado`)).json(), erp: await (await fetch(`${simuladorBase}/simulador/erp/estado`)).json() }),
      fallas: (sistema, patch) => sim('POST', `/simulador/${sistema}/fallas`, patch),
      recibir: (datos) => sim('POST', '/simulador/wms/recepciones', datos),
      ajuste: (datos) => sim('POST', '/simulador/wms/ajustes', datos),
      ordenesCompra: async () => (await fetch(`${simuladorBase}/simulador/erp/ordenes-compra`)).json(),
      reenviar: async () => {
        throw new Error('Disponible solo en la demostración local.');
      },
    },
  };
}
