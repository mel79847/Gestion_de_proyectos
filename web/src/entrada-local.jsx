import { App } from './ui/app.jsx';
import { crearGatewayLocal } from './gateway-local.js';

ReactDOM.createRoot(document.getElementById('raiz')).render(<App crearGateway={crearGatewayLocal} />);
