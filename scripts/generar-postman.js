/** Genera postman/YPFB-MRO.postman_collection.json (colección con pruebas automáticas). */
import { writeFileSync } from 'node:fs';

const json = (o) => ({ mode: 'raw', raw: JSON.stringify(o, null, 2), options: { raw: { language: 'json' } } });
const req = (name, method, path, { body, token = 'tecnico', tests = [], base = '{{api}}', headers = [], pre } = {}) => ({
  name,
  event: [
    ...(pre ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } }] : []),
    { listen: 'test', script: { type: 'text/javascript', exec: tests } },
  ],
  request: {
    method,
    header: [{ key: 'Content-Type', value: 'application/json' }, ...(token ? [{ key: 'Authorization', value: `Bearer {{token_${token}}}` }] : []), ...headers],
    url: `${base}${path}`,
    ...(body ? { body: json(body) } : {}),
  },
});
const estado = (c) => `pm.test('HTTP ${c}', () => pm.response.to.have.status(${c}));`;
const login = (rol, usuario) =>
  req(`Login ${rol}`, 'POST', '/api/auth/login', { token: null, body: { usuario, clave: 'Demo2026!' }, tests: [estado(200), `pm.collectionVariables.set('token_${rol}', pm.response.json().token);`] });
const esperar = "setTimeout(() => {}, 2500); // el trabajador de integración procesa la bandeja";

const coleccion = {
  info: { name: 'YPFB MRO: trazabilidad de inventario', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Ejecutar en orden con el Collection Runner. Requiere API (3000), worker y simuladores (4000).' },
  variable: [{ key: 'api', value: 'http://localhost:3000' }, { key: 'sim', value: 'http://localhost:4000' }, { key: 'orden', value: '' }],
  item: [
    { name: '0. Sesión', item: [login('tecnico', 'tec.rojas'), login('supervisor', 'sup.vargas'), login('almacen', 'alm.mamani'), login('comprador', 'com.flores'), login('administrador', 'adm.sistema')] },
    {
      name: '1. Datos maestros',
      item: [
        req('Catálogo con SS, ROP y EOQ', 'GET', '/api/maestros/materiales', { tests: [estado(200), "pm.test('FIL-ACE-0021: SS 5, ROP 25, EOQ 105', () => { const m = pm.response.json().find(x => x.codigo === 'FIL-ACE-0021'); pm.expect(m.parametros).to.include({ ss: 5, rop: 25, eoq: 105 }); });"] }),
        req('Duplicado escrito de otra forma: 409', 'POST', '/api/maestros/materiales', { token: 'administrador', body: { familia: 'FIL', subfamilia: 'ACE', descripcion: 'FILTRO ACEITE P/ MOTOR VOLVO D-13', unidad: 'und', criticidad: 'alta', metodo_reposicion: 'EOQ', demanda_diaria: 2, sigma_diaria: 1, plazo_dias: 10, stock_maximo: 140 }, tests: [estado(409), "pm.test('MATERIAL_DUPLICADO', () => pm.expect(pm.response.json().error.codigo).to.eql('MATERIAL_DUPLICADO'));"] }),
        req('Técnico no puede crear materiales: 403', 'POST', '/api/maestros/materiales', { token: 'tecnico', body: {}, tests: [estado(403)] }),
      ],
    },
    {
      name: '2. Orden con stock suficiente',
      item: [
        req('Material incompatible: 422', 'POST', '/api/ordenes', { body: { equipo: 'CAM-MER-022', tipo: 'correctivo', prioridad: 'alta', diagnostico: 'Prueba', fecha_requerida: '2026-11-30', materiales: [{ material: 'FIL-ACE-0021', cantidad: 1 }] }, tests: [estado(422), "pm.test('MATERIAL_INCOMPATIBLE', () => pm.expect(pm.response.json().error.codigo).to.eql('MATERIAL_INCOMPATIBLE'));"] }),
        req('Registrar orden', 'POST', '/api/ordenes', { body: { equipo: 'CAM-VOL-014', tipo: 'correctivo', prioridad: 'alta', diagnostico: 'Pérdida de presión de aceite', fecha_requerida: '2026-11-30', materiales: [{ material: 'FIL-ACE-0021', cantidad: 4 }] }, tests: [estado(201), "pm.collectionVariables.set('orden', pm.response.json().numero);"] }),
        req('Técnico no puede validar: 403', 'POST', '/api/ordenes/{{orden}}/validacion', { tests: [estado(403)] }),
        req('Validar', 'POST', '/api/ordenes/{{orden}}/validacion', { token: 'supervisor', tests: [estado(200), "pm.test('Validada', () => pm.expect(pm.response.json().estado).to.eql('Validada'));"] }),
        req('Solicitar reserva (202)', 'POST', '/api/ordenes/{{orden}}/reservas', { token: 'almacen', tests: [estado(202)] }),
        req('Orden con reserva confirmada', 'GET', '/api/ordenes/{{orden}}', { token: 'almacen', pre: [esperar], tests: [estado(200), "pm.test('Materiales reservados', () => pm.expect(pm.response.json().estado).to.eql('Materiales reservados'));"] }),
        req('Disponibilidad con fuentes', 'GET', '/api/inventario/disponibilidad/FIL-ACE-0021?almacen=ALM-SCZ', { token: 'almacen', tests: [estado(200), "pm.test('Fuente del físico: WMS', () => pm.expect(pm.response.json().fuente.fisico).to.eql('WMS'));"] }),
        req('Registrar entrega', 'POST', '/api/ordenes/{{orden}}/entregas', { token: 'almacen', body: { receptor: 'tec.rojas' }, tests: [estado(202)] }),
        req('Cambio de pieza', 'POST', '/api/ordenes/{{orden}}/cambios-pieza', { pre: [esperar], body: { material: 'FIL-ACE-0021', pieza_retirada: 'Filtro saturado', condicion: 'desgastada', destino: 'baja' }, tests: [estado(201)] }),
        req('Completar', 'POST', '/api/ordenes/{{orden}}/completar', { tests: [estado(200)] }),
        req('Cerrar', 'POST', '/api/ordenes/{{orden}}/cierre', { token: 'supervisor', tests: [estado(200), "pm.test('Cerrada', () => pm.expect(pm.response.json().estado).to.eql('Cerrada'));"] }),
        req('Trazabilidad de la orden', 'GET', '/api/ordenes/{{orden}}/trazabilidad', { token: 'supervisor', tests: [estado(200)] }),
      ],
    },
    {
      name: '3. Compra sin duplicar',
      item: [
        req('Evaluar válvula con compra en curso', 'POST', '/api/compras/evaluaciones/VAL-COM-0042', { token: 'comprador', tests: [estado(200), "pm.test('No duplica: COMPRA_EN_CURSO', () => pm.expect(pm.response.json().motivo).to.eql('COMPRA_EN_CURSO'));"] }),
        req('Solicitudes', 'GET', '/api/compras/solicitudes', { token: 'comprador', tests: [estado(200)] }),
      ],
    },
    {
      name: '4. Falla del WMS',
      item: [
        req('WMS sin respuesta', 'POST', '/simulador/wms/fallas', { base: '{{sim}}', token: null, body: { caido: true }, tests: [estado(200)] }),
        req('Orden para la prueba', 'POST', '/api/ordenes', { body: { equipo: 'CAM-VOL-014', tipo: 'correctivo', prioridad: 'alta', diagnostico: 'Prueba de caída', fecha_requerida: '2026-11-30', materiales: [{ material: 'FIL-AIR-0008', cantidad: 1 }] }, tests: [estado(201), "pm.collectionVariables.set('orden', pm.response.json().numero);"] }),
        req('Validar', 'POST', '/api/ordenes/{{orden}}/validacion', { token: 'supervisor', tests: [estado(200)] }),
        req('La API acepta la reserva aunque el WMS esté caído', 'POST', '/api/ordenes/{{orden}}/reservas', { token: 'almacen', tests: [estado(202)] }),
        req('Cierre bloqueado', 'POST', '/api/ordenes/{{orden}}/cierre', { token: 'supervisor', pre: [esperar], tests: [estado(422), "pm.test('CIERRE_BLOQUEADO', () => pm.expect(pm.response.json().error.codigo).to.eql('CIERRE_BLOQUEADO'));"] }),
        req('Restablecer WMS', 'POST', '/simulador/wms/fallas', { base: '{{sim}}', token: null, body: { caido: false }, tests: [estado(200)] }),
        req('Operaciones de la orden', 'GET', '/api/integracion/operaciones?orden={{orden}}', { token: 'administrador', tests: [estado(200)] }),
      ],
    },
    {
      name: '5. Webhooks y bitácora',
      item: [
        req('Webhook sin firma: 401', 'POST', '/api/integracion/webhooks/wms', { token: null, headers: [{ key: 'X-Firma', value: '00' }], body: { id_evento: '00000000-0000-4000-8000-000000000000', evento: 'recepcion.aceptada' }, tests: [estado(401)] }),
        req('Recepción física en el WMS (dispara webhook firmado)', 'POST', '/simulador/wms/recepciones', { base: '{{sim}}', token: null, body: { orden_compra: '4500012871', material: 'VAL-COM-0042', almacen: 'ALM-CBB', cantidad_recibida: 1, cantidad_aceptada: 1, lote: 'L-VD-2610' }, tests: [estado(201)] }),
        req('Bitácora (Control interno)', 'GET', '/api/bitacora', { token: 'administrador', tests: [estado(200)] }),
        req('Incidencias', 'GET', '/api/incidencias', { token: 'administrador', tests: [estado(200)] }),
      ],
    },
  ],
};
writeFileSync(new URL('../postman/YPFB-MRO.postman_collection.json', import.meta.url), JSON.stringify(coleccion, null, 2));
console.log('postman/YPFB-MRO.postman_collection.json');
