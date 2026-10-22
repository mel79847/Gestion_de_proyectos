/** Arranque de la API de negocio. */
import { leerConfig } from './config.js';
import { crearContenedor } from './contenedor.js';
import { crearApp } from './app.js';

const config = leerConfig();
const contenedor = crearContenedor(config);
await contenedor.cola.conectar().catch((e) => console.warn(`RabbitMQ no disponible (${e.message}); el trabajador usará el barrido de la bandeja.`));
const app = crearApp({ ...contenedor, config });

const servidor = app.listen(config.puerto, () => console.log(`API de negocio escuchando en http://localhost:${config.puerto}`));

const apagar = () => servidor.close(() => Promise.all([contenedor.db.cerrar(), contenedor.cola.impl?.cerrar()]).then(() => process.exit(0)));
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
