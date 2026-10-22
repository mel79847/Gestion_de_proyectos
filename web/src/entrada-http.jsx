import { App } from './ui/app.jsx';
import { crearGatewayHttp } from './gateway-http.js';

const simuladorBase = document.querySelector('meta[name="simulador"]')?.content ?? 'http://localhost:4000';
ReactDOM.createRoot(document.getElementById('raiz')).render(<App crearGateway={(o) => crearGatewayHttp({ ...o, simuladorBase })} />);
