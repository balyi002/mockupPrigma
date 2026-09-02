import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Briefcase, Users, Settings,
  ChevronDown, ChevronRight, Search, Bell, Plus, TrendingUp,
  ShoppingBag, DollarSign, BarChart2, LogOut, ArrowUpRight, Trash2, Minus,
  X, Check, Truck, Edit2, Lock, User, Clock, Package2, Star, ChevronLeft,
  BookOpen, Tag, FileText, AlertCircle, Eye, Printer, AlertTriangle,
  CheckCircle2, FileDown, ShoppingBag as SBag, Menu, Ban, EyeOff, CalendarDays
} from 'lucide-react';
import {
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn(error);
    }
  };

  return [storedValue, setValue] as const;
}

// ─── Types ──────────────────────────────────────────────────────────────────
type TxItem      = { name: string; qty: number; price: number };
type Sale        = { id: string; fecha: string; hora: string; cliente: string; documento?: string; items: TxItem[]; subtotal: number; iva: number; total: number; metodoPago: 'Efectivo'|'Transferencia'; estado: string; justificacion?: string };
type Order       = { id: string; fecha: string; hora: string; cliente: string; documento?: string; items: TxItem[]; subtotal: number; iva: number; total: number; metodoPago: 'Efectivo'|'Transferencia'; estado: string };
type Client      = { id: string; nombre: string; cantidadCompras: number; totalGastado: number; ultimaCompra: string; documento?: string };
type PurchaseRow = { name: string; qty: number; cost: number };
type Purchase    = { id: string; fecha: string; proveedor: string; proveedorNit?: string; items: PurchaseRow[]; total: number; notas: string; status: string };

// ─── Constants & Utils ───────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 5;
const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

function getClientStatus(c: Client, orders: Order[]): string {
  const hasApartado = orders.some(o => o.cliente.toLowerCase() === c.nombre.toLowerCase() && o.estado === 'Apartado');
  if (hasApartado) return 'Apartado';
  if (c.cantidadCompras <= 1) return 'Nuevo';
  if (c.cantidadCompras <= 5) return 'Ocasional';
  return 'Frecuente';
}

function printTicket(tx: Sale | Order) {
  const w = window.open('', '_blank', 'width=400,height=620');
  if (!w) { alert('Habilita ventanas emergentes para imprimir.'); return; }
  const rows = tx.items.map(i =>
    `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${formatCOP(i.price)}</td><td style="text-align:right">${formatCOP(i.price * i.qty)}</td></tr>`
  ).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Ticket ${tx.id}</title>
<style>body{font-family:monospace;font-size:12px;padding:16px;max-width:320px;margin:auto}h2{text-align:center;font-size:15px;margin:0 0 2px}p.sub{text-align:center;font-size:11px;color:#666;margin:1px 0}hr{border:none;border-top:1px dashed #999;margin:8px 0}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:3px 2px}th{border-bottom:1px solid #ccc;text-align:left}.tot{font-weight:bold}.thanks{text-align:center;margin-top:12px;font-size:11px;color:#555}@media print{body{padding:4px}}</style>
</head><body>
<h2>Variedades Carito</h2>
<p class="sub">CRA. 25 #75C-01 Int. 499 · Medellín</p>
<p class="sub">NIT: 901.234.567-8</p>
<hr>
<p style="font-size:11px"><strong>${tx.id}</strong> | ${tx.fecha} ${tx.hora}<br>Cliente: ${tx.cliente}<br>Pago: ${tx.metodoPago} | Estado: ${tx.estado}</p>
<hr>
<table><thead><tr><th>Artículo</th><th style="text-align:center">Qty</th><th style="text-align:right">Precio</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
<hr>
<table>
<tr><td>Subtotal (sin IVA):</td><td style="text-align:right">${formatCOP(tx.subtotal)}</td></tr>
<tr><td>IVA incluido (19%):</td><td style="text-align:right">${formatCOP(tx.iva)}</td></tr>
<tr class="tot"><td>TOTAL:</td><td style="text-align:right">${formatCOP(tx.total)}</td></tr>
</table>
<p class="thanks">¡Gracias por su compra!<br>Sistema PRIGMA v4.0</p>
</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}

// ─── Toast Singleton ─────────────────────────────────────────────────────────
type ToastItem = { id: number; msg: string; type: 'success' | 'error' };
let _addToast: (msg: string, type?: 'success' | 'error') => void = () => {};
const toast = {
  success: (m: string) => _addToast(m, 'success'),
  error:   (m: string) => _addToast(m, 'error'),
};

// ─── Mock Data ───────────────────────────────────────────────────────────────
const initRoles = [
  { id: 'ROL001', name: 'Administrador', desc: 'Control total del sistema', status: 'activo',
    perms: { Dashboard: true, Roles: true, 'Gestión de Usuarios': true, 'Categoría de Productos': true, 'Gestión de Productos': true, Proveedores: true, 'Gestión de Compras': true, 'Categoría de Servicios': true, 'Gestión de Servicios': true, Empleados: true, Agenda: true, Pedidos: true, Clientes: true, Ventas: true } },
  { id: 'ROL002', name: 'Empleado', desc: 'Operación diaria de tienda', status: 'activo',
    perms: { Dashboard: false, Roles: false, 'Gestión de Usuarios': false, 'Categoría de Productos': false, 'Gestión de Productos': false, Proveedores: false, 'Gestión de Compras': false, 'Categoría de Servicios': false, 'Gestión de Servicios': false, Empleados: false, Agenda: false, Pedidos: true, Clientes: true, Ventas: true } },
];

const initUsers = [
  { id: 'U001', name: 'Admin Principal', tipoDocumento: 'CC', numeroDocumento: '10234567', telefono: '300-000-0001', email: 'admin@variedades.co', role: 'Administrador', status: 'activo', created: '01/01/2024' },
  { id: 'U002', name: 'Luisa Ramírez',   tipoDocumento: 'CC', numeroDocumento: '1023456789', telefono: '310-111-2222', email: 'luisa@variedades.co',  role: 'Empleado', status: 'activo',   created: '15/03/2024' },
  { id: 'U003', name: 'Paula Torres',    tipoDocumento: 'CC', numeroDocumento: '1034567890', telefono: '311-333-4444', email: 'paula@variedades.co',  role: 'Empleado', status: 'activo',   created: '01/05/2024' },
  { id: 'U004', name: 'Jorge Méndez',    tipoDocumento: 'CE', numeroDocumento: '1045678901', telefono: '312-555-6666', email: 'jorge@variedades.co',  role: 'Empleado', status: 'inactivo', created: '10/06/2024' },
];

const initBuyCategories = [
  { id: 'BC001', name: 'Papelería',   desc: 'Cuadernos, bolígrafos, lápices',       status: 'activo'   },
  { id: 'BC002', name: 'Cosméticos',  desc: 'Maquillaje, cuidado facial y corporal', status: 'activo'   },
  { id: 'BC003', name: 'Accesorios',  desc: 'Bolsos, joyería y complementos',        status: 'activo'   },
  { id: 'BC004', name: 'Tecnología',  desc: 'Accesorios tech y cables',              status: 'activo'   },
  { id: 'BC005', name: 'Misceláneos', desc: 'Artículos varios del hogar',            status: 'inactivo' },
];

const initSuppliers = [
  { id: 'SP001', nit: '900.123.456-1', name: 'Belleza Total S.A.', contact: 'Carlos Mejía',  phone: '310-456-7890', status: 'activo',   category: 'Cosméticos' },
  { id: 'SP002', nit: '800.234.567-2', name: 'PapelExpress Ltda.', contact: 'Diana Vargas',  phone: '311-234-5678', status: 'activo',   category: 'Papelería'  },
  { id: 'SP003', nit: '900.345.678-3', name: 'AccesoriosModa',     contact: 'Marcela Ríos',  phone: '312-567-8901', status: 'activo',   category: 'Accesorios' },
  { id: 'SP004', nit: '800.456.789-4', name: 'TechStore Colombia', contact: 'Andrés Gómez',  phone: '313-890-1234', status: 'activo',   category: 'Tecnología' },
  { id: 'SP005', nit: '900.567.890-5', name: 'DistribuFácil',      contact: 'Rosa Arbeláez', phone: '314-123-4567', status: 'inactivo', category: 'Misceláneos'},
];

const initProducts = [
  { id: 'P001', name: 'Cuaderno Rayado A4',  category: 'Papelería',  price: 8500,  cost: 5000,  stock: 45, minStock: 10, status: 'activo'   },
  { id: 'P002', name: 'Set Bolígrafos x6',   category: 'Papelería',  price: 5000,  cost: 2800,  stock: 80, minStock: 20, status: 'activo'   },
  { id: 'P003', name: 'Labial Mate Coral',   category: 'Cosméticos', price: 22000, cost: 12000, stock: 3,  minStock: 5,  status: 'activo'   },
  { id: 'P004', name: 'Paleta Sombras Nude', category: 'Cosméticos', price: 45000, cost: 25000, stock: 12, minStock: 5,  status: 'activo'   },
  { id: 'P005', name: 'Bolso Mini Pana',     category: 'Accesorios', price: 55000, cost: 30000, stock: 8,  minStock: 4,  status: 'activo'   },
  { id: 'P006', name: 'Aretes Perla Gota',   category: 'Accesorios', price: 15000, cost: 7000,  stock: 0,  minStock: 6,  status: 'activo'   },
  { id: 'P007', name: 'Máscara Pestañas',    category: 'Cosméticos', price: 28000, cost: 15000, stock: 2,  minStock: 5,  status: 'activo'   },
  { id: 'P008', name: 'Collar Dorado Chain', category: 'Accesorios', price: 25000, cost: 12000, stock: 18, minStock: 5,  status: 'inactivo' },
];

const initServices = [
  { id: 'SV001', name: 'Fotocopia B&N',        category: 'Impresión', price: 200,   cost: 50,   execTime: '1 min',     status: 'activo'   },
  { id: 'SV002', name: 'Impresión Color A4',    category: 'Impresión', price: 800,   cost: 200,  execTime: '2 min',     status: 'activo'   },
  { id: 'SV003', name: 'Plastificado A4',       category: 'Impresión', price: 3500,  cost: 1000, execTime: '3 min',     status: 'activo'   },
  { id: 'SV004', name: 'Recarga Claro 5k',      category: 'Recargas',  price: 5000,  cost: 4800, execTime: 'Inmediato', status: 'activo'   },
  { id: 'SV005', name: 'Recarga Movistar 10k',  category: 'Recargas',  price: 10000, cost: 9700, execTime: 'Inmediato', status: 'activo'   },
  { id: 'SV006', name: 'Escaneo Documento',     category: 'Digital',   price: 1500,  cost: 200,  execTime: '2 min',     status: 'activo'   },
  { id: 'SV007', name: 'Envío Correo Colombia', category: 'Mensajería',price: 12000, cost: 8000, execTime: '1 día',     status: 'inactivo' },
];

const initEmployees = [
  { id: 'EM001', name: 'Luisa',  apellido: 'Ramírez', documento: '1023456789', role: 'Empleado',      phone: '310-111-2222', status: 'activo',   shifts: ['8-16','8-16','8-16','8-16','8-16','','']          },
  { id: 'EM002', name: 'Paula',  apellido: 'Torres',  documento: '1034567890', role: 'Empleado',      phone: '311-333-4444', status: 'activo',   shifts: ['12-20','12-20','12-20','12-20','12-20','12-20',''] },
  { id: 'EM003', name: 'Jorge',  apellido: 'Méndez',  documento: '1045678901', role: 'Administrador', phone: '312-555-6666', status: 'inactivo', shifts: ['','9-17','9-17','9-17','9-17','9-17','']           },
];

const initServiceCategories = [
  { id: 'SC001', name: 'Impresión',  desc: 'Fotocopias, impresiones y plastificado', status: 'activo'   },
  { id: 'SC002', name: 'Recargas',   desc: 'Recargas de minutos para celular',        status: 'activo'   },
  { id: 'SC003', name: 'Digital',    desc: 'Escaneo y servicios digitales',            status: 'activo'   },
  { id: 'SC004', name: 'Mensajería', desc: 'Envíos y mensajería',                     status: 'inactivo' },
];

const initClients: Client[] = [
  { id: 'CL001', nombre: 'María García',   cantidadCompras: 12, totalGastado: 285000, ultimaCompra: '10/08/2024', documento: '1023456789' },
  { id: 'CL002', nombre: 'Ana Rodríguez',  cantidadCompras: 4,  totalGastado: 125000, ultimaCompra: '08/08/2024', documento: '1034567890' },
  { id: 'CL003', nombre: 'Laura Martínez', cantidadCompras: 1,  totalGastado: 67000,  ultimaCompra: '05/08/2024' },
  { id: 'CL004', nombre: 'Sofía López',    cantidadCompras: 8,  totalGastado: 190000, ultimaCompra: '10/08/2024' },
  { id: 'CL005', nombre: 'Valentina Cruz', cantidadCompras: 20, totalGastado: 520000, ultimaCompra: '09/08/2024', documento: '1056789012' },
];

const initSales: Sale[] = [
  { id: 'VTA001', fecha: '10/08/2024', hora: '14:32', cliente: 'María García',
    items: [{name:'Cuaderno Rayado A4',qty:2,price:8500},{name:'Labial Mate Coral',qty:1,price:22000},{name:'Set Bolígrafos x6',qty:1,price:5000}],
    subtotal: 44000, iva: 8360,  total: 52360,  metodoPago: 'Efectivo',      estado: 'completado' },
  { id: 'VTA002', fecha: '10/08/2024', hora: '14:15', cliente: 'Ana Rodríguez',
    items: [{name:'Aretes Perla Gota',qty:2,price:15000},{name:'Set Bolígrafos x6',qty:1,price:5000}],
    subtotal: 35000, iva: 6650,  total: 41650,  metodoPago: 'Transferencia', estado: 'completado' },
  { id: 'VTA003', fecha: '10/08/2024', hora: '13:58', cliente: 'Laura Martínez',
    items: [{name:'Paleta Sombras Nude',qty:1,price:45000},{name:'Labial Mate Coral',qty:2,price:22000}],
    subtotal: 89000, iva: 16910, total: 105910, metodoPago: 'Transferencia', estado: 'completado' },
  { id: 'VTA004', fecha: '09/08/2024', hora: '11:20', cliente: 'Valentina Cruz',
    items: [{name:'Paleta Sombras Nude',qty:2,price:45000},{name:'Recarga Claro 5k',qty:1,price:5000}],
    subtotal: 95000, iva: 18050, total: 113050, metodoPago: 'Efectivo',      estado: 'completado' },
  { id: 'VTA005', fecha: '08/08/2024', hora: '16:45', cliente: 'María García',
    items: [{name:'Bolso Mini Pana',qty:1,price:55000},{name:'Collar Dorado Chain',qty:1,price:25000}],
    subtotal: 80000, iva: 15200, total: 95200,  metodoPago: 'Transferencia', estado: 'completado' },
  { id: 'VTA006', fecha: '07/08/2024', hora: '10:10', cliente: 'Valentina Cruz',
    items: [{name:'Máscara Pestañas',qty:1,price:28000},{name:'Aretes Perla Gota',qty:1,price:15000}],
    subtotal: 43000, iva: 8170,  total: 51170,  metodoPago: 'Efectivo',      estado: 'completado' },
];

const initOrders: Order[] = [
  { id: 'PED001', fecha: '10/08/2024', hora: '13:40', cliente: 'Sofía López',
    items: [{name:'Bolso Mini Pana',qty:1,price:55000},{name:'Collar Dorado Chain',qty:1,price:25000}],
    subtotal: 80000, iva: 15200, total: 95200,  metodoPago: 'Efectivo',      estado: 'Apartado'  },
  { id: 'PED002', fecha: '09/08/2024', hora: '15:30', cliente: 'Isabella Herrera',
    items: [{name:'Paleta Sombras Nude',qty:1,price:45000},{name:'Labial Mate Coral',qty:2,price:22000}],
    subtotal: 89000, iva: 16910, total: 105910, metodoPago: 'Transferencia', estado: 'Pendiente' },
  { id: 'PED003', fecha: '07/08/2024', hora: '10:15', cliente: 'Carolina Díaz',
    items: [{name:'Set Bolígrafos x6',qty:3,price:5000},{name:'Cuaderno Rayado A4',qty:2,price:8500}],
    subtotal: 32000, iva: 6080,  total: 38080,  metodoPago: 'Efectivo',      estado: 'Cancelado' },
  { id: 'PED004', fecha: '06/08/2024', hora: '09:00', cliente: 'Natalia Gómez',
    items: [{name:'Aretes Perla Gota',qty:2,price:15000},{name:'Collar Dorado Chain',qty:1,price:25000}],
    subtotal: 55000, iva: 10450, total: 65450,  metodoPago: 'Transferencia', estado: 'Apartado'  },
  { id: 'PED005', fecha: '05/08/2024', hora: '17:20', cliente: 'Diana Rojas',
    items: [{name:'Paleta Sombras Nude',qty:1,price:45000}],
    subtotal: 45000, iva: 8550,  total: 53550,  metodoPago: 'Efectivo',      estado: 'Pendiente' },
];

const initPurchases: Purchase[] = [
  { id: 'COM001', fecha: '05/08/2024', proveedor: 'Belleza Total S.A.', proveedorNit: '900.123.456-1',
    items: [{name:'Labial Mate Coral',qty:10,cost:12000},{name:'Paleta Sombras Nude',qty:5,cost:25000}],
    total: 245000, notas: 'Pedido mensual de cosméticos', status: 'Pagado' },
  { id: 'COM002', fecha: '03/08/2024', proveedor: 'PapelExpress Ltda.', proveedorNit: '800.234.567-2',
    items: [{name:'Cuaderno Rayado A4',qty:50,cost:5000},{name:'Set Bolígrafos x6',qty:30,cost:2800}],
    total: 334000, notas: '', status: 'Pagado' },
  { id: 'COM003', fecha: '01/08/2024', proveedor: 'AccesoriosModa', proveedorNit: '900.345.678-3',
    items: [{name:'Bolso Mini Pana',qty:10,cost:30000},{name:'Aretes Perla Gota',qty:20,cost:7000}],
    total: 440000, notas: 'Colección nueva', status: 'Pendiente' },
];

const posProducts = [
  { id: 1,  name: 'Cuaderno Rayado A4',    price: 8500,  category: 'Papelería',  bg: 'bg-blue-50',   emoji: '📓', stock: 45  },
  { id: 2,  name: 'Set Bolígrafos x6',     price: 5000,  category: 'Papelería',  bg: 'bg-blue-50',   emoji: '✏️', stock: 80  },
  { id: 3,  name: 'Labial Mate Coral',     price: 22000, category: 'Cosméticos', bg: 'bg-pink-50',   emoji: '💄', stock: 3   },
  { id: 4,  name: 'Paleta Sombras Nude',   price: 45000, category: 'Cosméticos', bg: 'bg-pink-50',   emoji: '🎨', stock: 12  },
  { id: 5,  name: 'Bolso Mini Pana',       price: 55000, category: 'Accesorios', bg: 'bg-purple-50', emoji: '👜', stock: 8   },
  { id: 6,  name: 'Aretes Perla Gota',     price: 15000, category: 'Accesorios', bg: 'bg-purple-50', emoji: '💎', stock: 0   },
  { id: 7,  name: 'Máscara Pestañas',      price: 28000, category: 'Cosméticos', bg: 'bg-pink-50',   emoji: '👁️', stock: 2   },
  { id: 8,  name: 'Collar Dorado Chain',   price: 25000, category: 'Accesorios', bg: 'bg-purple-50', emoji: '📿', stock: 18  },
  { id: 9,  name: 'Fotocopia B&N',         price: 200,   category: 'Servicios',  bg: 'bg-green-50',  emoji: '🖨️', stock: 999 },
  { id: 10, name: 'Impresión Color A4',    price: 800,   category: 'Servicios',  bg: 'bg-green-50',  emoji: '🖨️', stock: 999 },
  { id: 11, name: 'Plastificado A4',       price: 3500,  category: 'Servicios',  bg: 'bg-green-50',  emoji: '📋', stock: 999 },
  { id: 12, name: 'Recarga Claro 5k',      price: 5000,  category: 'Servicios',  bg: 'bg-green-50',  emoji: '📱', stock: 999 },
  { id: 13, name: 'Recarga Movistar 10k',  price: 10000, category: 'Servicios',  bg: 'bg-green-50',  emoji: '📱', stock: 999 },
  { id: 14, name: 'Escaneo Documento',     price: 1500,  category: 'Servicios',  bg: 'bg-green-50',  emoji: '📄', stock: 999 },
  { id: 15, name: 'Cargador USB-C',        price: 35000, category: 'Tecnología', bg: 'bg-yellow-50', emoji: '🔌', stock: 14  },
  { id: 16, name: 'Funda Silicona iPhone', price: 18000, category: 'Tecnología', bg: 'bg-yellow-50', emoji: '📱', stock: 22  },
  { id: 17, name: 'Audífonos In-Ear',      price: 42000, category: 'Tecnología', bg: 'bg-yellow-50', emoji: '🎧', stock: 7   },
  { id: 18, name: 'Porta Documentos A4',   price: 12000, category: 'Papelería',  bg: 'bg-blue-50',   emoji: '📁', stock: 30  },
  { id: 19, name: 'Bisturí + Repuesto',    price: 3500,  category: 'Papelería',  bg: 'bg-blue-50',   emoji: '✂️', stock: 60  },
];
const posCategories = ['Todos', 'Papelería', 'Cosméticos', 'Accesorios', 'Servicios', 'Tecnología'];

const scheduleWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const scheduleDayColors = [
  'bg-blue-50 text-blue-700','bg-purple-50 text-purple-700','bg-pink-50 text-pink-700',
  'bg-amber-50 text-amber-700','bg-green-50 text-green-700','bg-orange-50 text-orange-700','bg-gray-50 text-gray-500',
];

const weekSalesData = [
  { day: 'Lun', ventas: 85000,  meta: 100000 }, { day: 'Mar', ventas: 120000, meta: 100000 },
  { day: 'Mié', ventas: 95000,  meta: 100000 }, { day: 'Jue', ventas: 140000, meta: 100000 },
  { day: 'Vie', ventas: 175000, meta: 100000 }, { day: 'Sáb', ventas: 210000, meta: 100000 },
  { day: 'Dom', ventas: 60000,  meta: 100000 },
];
const monthlyData = [
  { mes: 'Mar', ventas: 1850000 }, { mes: 'Abr', ventas: 2100000 }, { mes: 'May', ventas: 1950000 },
  { mes: 'Jun', ventas: 2350000 }, { mes: 'Jul', ventas: 2800000 }, { mes: 'Ago', ventas: 3200000 },
];

// ─── Navigation ──────────────────────────────────────────────────────────────
type NavItem = { id: string; label: string; icon: any; children?: NavItem[] };
const navItems: NavItem[] = [
  { id: 'configuracion', label: 'CONFIGURACIÓN', icon: Settings, children: [
    { id: 'roles', label: 'Roles', icon: Lock },
  ]},
  { id: 'usuarios', label: 'USUARIOS', icon: User, children: [
    { id: 'users', label: 'Gestión de Usuarios', icon: Users },
  ]},
  { id: 'compras', label: 'COMPRAS', icon: Package, children: [
    { id: 'buy-categories', label: 'Categoría de Productos', icon: Tag },
    { id: 'products',       label: 'Gestión de Productos', icon: Package2 },
    { id: 'suppliers',      label: 'Proveedores', icon: Truck },
    { id: 'purchases',      label: 'Gestión de Compras', icon: DollarSign },
  ]},
  { id: 'servicios', label: 'SERVICIOS', icon: Briefcase, children: [
    { id: 'service-categories', label: 'Categoría de Servicios', icon: Tag },
    { id: 'services',           label: 'Gestión de Servicios', icon: Star },
    { id: 'employees',          label: 'Empleados', icon: Users },
    { id: 'agenda',             label: 'Agenda', icon: Clock },
  ]},
  { id: 'venta', label: 'VENTAS', icon: ShoppingCart, children: [
    { id: 'orders',         label: 'Pedidos', icon: FileText },
    { id: 'clients',        label: 'Clientes', icon: Users },
    { id: 'sales-register', label: 'Ventas', icon: BookOpen },
  ]},
  { id: 'dashboard', label: 'MEDICIÓN Y DESEMPEÑO', icon: BarChart2, children: [
    { id: 'dashboard-main', label: 'Dashboard', icon: LayoutDashboard },
  ]},
];

// ─── Shared Components ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    activo: 'bg-green-100 text-green-700', inactivo: 'bg-red-100 text-red-700',
    completado: 'bg-green-100 text-green-700', apartado: 'bg-purple-100 text-purple-700',
    pendiente: 'bg-yellow-100 text-yellow-700', cancelado: 'bg-red-100 text-red-700',
    anulado: 'bg-gray-200 text-gray-600', pagado: 'bg-green-100 text-green-700',
    nuevo: 'bg-blue-100 text-blue-700', ocasional: 'bg-cyan-100 text-cyan-700',
    frecuente: 'bg-emerald-100 text-emerald-700',
    optimo: 'bg-green-100 text-green-700', bajo: 'bg-orange-100 text-orange-700',
    critico: 'bg-red-100 text-red-700', 'sin stock': 'bg-gray-200 text-gray-600',
  };
  const cls = map[s] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      title={checked ? 'Activo — clic para desactivar' : 'Inactivo — clic para activar'}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 focus:outline-none ${checked ? 'bg-green-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
    </button>
  );
}

function InlineStatusSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const colorMap: Record<string, string> = {
    completado: 'text-green-700 bg-green-50 border-green-300',
    Apartado:   'text-purple-700 bg-purple-50 border-purple-300',
    Pendiente:  'text-yellow-700 bg-yellow-50 border-yellow-300',
    Cancelado:  'text-red-700 bg-red-50 border-red-300',
    activo:     'text-green-700 bg-green-50 border-green-300',
    inactivo:   'text-red-700 bg-red-50 border-red-300',
  };
  const cls = colorMap[value] || 'bg-gray-50 border-gray-300 text-gray-700';
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none cursor-pointer ${cls}`}
    >
      {options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
    </select>
  );
}

function Av({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const colors = ['bg-primary', 'bg-accent', 'bg-secondary-foreground', 'bg-green-500', 'bg-blue-500'];
  const idx = name.charCodeAt(0) % colors.length;
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${dim} ${colors[idx]} rounded-full flex items-center justify-center text-white font-black flex-shrink-0`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, color = 'text-primary' }: any) {
  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-border flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-muted">
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">{label}</p>
        <p className="font-black text-foreground text-lg leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 text-xs font-black uppercase tracking-wide text-muted-foreground bg-muted/40 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3 border-t border-border ${right ? 'text-right' : ''}`}>{children}</td>;
}

function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`bg-card w-full md:max-w-${wide ? '2xl' : 'md'} max-h-[95vh] md:max-h-[90vh] rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-black text-foreground">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function FF({ label, children, err }: { label: string; children: React.ReactNode; err?: string }) {
  return (
    <div>
      <label className="block text-xs font-black uppercase tracking-wide text-muted-foreground mb-1">{label}</label>
      {children}
      {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
    </div>
  );
}

const iCls = "w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
const sCls = iCls;

function ModalActions({ onCancel, onSave, saveLabel = 'Guardar', saveColor = 'bg-primary' }: any) {
  return (
    <div className="flex gap-3 mt-6">
      <button onClick={onCancel} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors">Cancelar</button>
      <button onClick={onSave} className={`flex-1 py-2.5 ${saveColor} text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity`}>{saveLabel}</button>
    </div>
  );
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      <button onClick={() => onPage(page - 1)} disabled={page === 1} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
      {Array.from({ length: total }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onPage(p)} className={`w-8 h-8 rounded-lg border text-xs font-bold ${p === page ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}>{p}</button>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page === total} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

// ─── Global Modals ───────────────────────────────────────────────────────────
function ConfirmModal({ open, msg, onConfirm, onClose }: { open: boolean; msg: string; onConfirm: () => void; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="font-black text-lg mb-2">¿Confirmar acción?</h3>
        <p className="text-sm text-muted-foreground mb-6">{msg}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted">Cancelar</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90">Confirmar</button>
        </div>
      </div>
    </div>
  );
}

function AlertModal({ open, msg, onClose }: { open: boolean; msg: string; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="font-black text-lg mb-2">Acción bloqueada</h3>
        <p className="text-sm text-muted-foreground mb-6">{msg}</p>
        <button onClick={onClose} className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90">Entendido</button>
      </div>
    </div>
  );
}

function ExportModal({ open, onClose, onExport }: { open: boolean; onClose: () => void; onExport: (from: string, to: string) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Exportar Reporte">
      <div className="space-y-4">
        <FF label="Fecha de inicio"><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={iCls} /></FF>
        <FF label="Fecha de fin"><input type="date" value={to} onChange={e => setTo(e.target.value)} className={iCls} /></FF>
        <ModalActions onCancel={onClose} onSave={() => { if (from && to) { onExport(from, to); onClose(); } else toast.error('Selecciona un rango de fechas.'); }} saveLabel="Exportar CSV" saveColor="bg-green-600" />
      </div>
    </Modal>
  );
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[70] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-white text-sm font-bold min-w-[220px] ${t.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {t.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function TransactionDetailModal({ tx, onClose, onPrint }: { tx: Sale | Order | null; onClose: () => void; onPrint: (tx: Sale | Order) => void }) {
  if (!tx) return null;
  return (
    <Modal open={!!tx} onClose={onClose} title={`Detalle — ${tx.id}`} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-xl p-4">
          <div><span className="text-muted-foreground">Cliente:</span> <span className="font-bold">{tx.cliente}</span></div>
          <div><span className="text-muted-foreground">Documento:</span> <span className="font-bold">{tx.documento || '—'}</span></div>
          <div><span className="text-muted-foreground">Fecha:</span> <span className="font-bold">{tx.fecha} {tx.hora}</span></div>
          <div><span className="text-muted-foreground">Método:</span> <span className="font-bold">{tx.metodoPago}</span></div>
          <div><span className="text-muted-foreground">Estado:</span> <StatusBadge status={tx.estado} /></div>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground mb-2">Artículos</p>
          <TableWrapper>
            <thead><tr><Th>Artículo</Th><Th>Cant.</Th><Th right>P. Unit.</Th><Th right>Subtotal</Th></tr></thead>
            <tbody>
              {tx.items.map((item, i) => (
                <tr key={i}>
                  <Td>{item.name}</Td><Td>{item.qty}</Td>
                  <Td right>{formatCOP(item.price)}</Td>
                  <Td right><span className="font-bold">{formatCOP(item.price * item.qty)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
        <div className="bg-foreground/5 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (sin IVA):</span><span className="font-bold">{formatCOP(tx.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">IVA incluido (19%):</span><span className="font-bold">{formatCOP(tx.iva)}</span></div>
          <div className="flex justify-between border-t border-border pt-2"><span className="font-black">TOTAL:</span><span className="font-black text-primary text-base">{formatCOP(tx.total)}</span></div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted">Cerrar</button>
          <button onClick={() => onPrint(tx)} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90">
            <Printer className="w-4 h-4" /> Imprimir Ticket
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

function useConfirm() {
  const [conf, setConf] = useState<{ open: boolean; msg: string; cb: () => void }>({ open: false, msg: '', cb: () => {} });
  const ask = (msg: string, cb: () => void) => setConf({ open: true, msg, cb });
  const el = <ConfirmModal open={conf.open} msg={conf.msg} onConfirm={conf.cb} onClose={() => setConf(c => ({ ...c, open: false }))} />;
  return { ask, el };
}
function useAlert() {
  const [state, setState] = useState({ open: false, msg: '' });
  const warn = (msg: string) => setState({ open: true, msg });
  const el = <AlertModal open={state.open} msg={state.msg} onClose={() => setState(s => ({ ...s, open: false }))} />;
  return { warn, el };
}

// ─── Dashboard View ──────────────────────────────────────────────────────────
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type FilterMode = 'year' | 'month' | 'week' | 'day';

function DashboardView({ sales, orders }: { sales: Sale[]; orders: Order[] }) {
  const now = new Date();

  const getWeekStart = (d: Date): Date => {
    const day  = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const m = new Date(d);
    m.setDate(d.getDate() + diff);
    m.setHours(0, 0, 0, 0);
    return m;
  };

  const [filterMode,       setFilterMode]       = useState<FilterMode>('month');
  const [filterYear,       setFilterYear]       = useState(now.getFullYear());
  const [filterMonth,      setFilterMonth]      = useState(now.getMonth());
  const [filterWeekStart,  setFilterWeekStart]  = useState<Date>(() => getWeekStart(now));
  const [filterDay,        setFilterDay]        = useState<Date>(now);
  const [calOpen,          setCalOpen]          = useState(false);
  const [calNavYear,       setCalNavYear]       = useState(now.getFullYear());
  const [calNavMonth,      setCalNavMonth]      = useState(now.getMonth());
  const [hoverWeekStart,   setHoverWeekStart]   = useState<Date | null>(null);

  const parseDate = (fecha: string) => {
    const parts = fecha.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  };

  const inPeriod = (fecha: string): boolean => {
    const d = parseDate(fecha);
    if (!d) return true;
    switch (filterMode) {
      case 'year':  return d.getFullYear() === filterYear;
      case 'month': return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
      case 'week': {
        const ds  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const end = new Date(filterWeekStart);
        end.setDate(filterWeekStart.getDate() + 7);
        return ds >= filterWeekStart && ds < end;
      }
      case 'day':
        return d.getDate() === filterDay.getDate() &&
               d.getMonth() === filterDay.getMonth() &&
               d.getFullYear() === filterDay.getFullYear();
    }
  };

  const filteredSales  = sales.filter(s => inPeriod(s.fecha));
  const filteredOrders = orders.filter(o => inPeriod(o.fecha));

  const totalPeriod    = filteredSales.reduce((a, s) => a + s.total, 0);
  const pedidosActivos = filteredOrders.filter(o => o.estado === 'Apartado' || o.estado === 'Pendiente').length;
  const ticketProm     = filteredSales.length ? Math.round(totalPeriod / filteredSales.length) : 0;

  const productCounts: Record<string, number> = {};
  sales.forEach(s => s.items.forEach(i => { productCounts[i.name] = (productCounts[i.name] || 0) + i.qty; }));
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, value], i) => ({ name, value, color: ['#ED498C','#BA9CDB','#9B6CC8','#F3C8F2','#F9A8D4'][i] }));

  const recentTx = [...sales, ...orders].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);

  const filterLabel = (): string => {
    switch (filterMode) {
      case 'year':  return `${filterYear}`;
      case 'month': return `${MONTHS_ES[filterMonth]} ${filterYear}`;
      case 'week': {
        const end = new Date(filterWeekStart);
        end.setDate(filterWeekStart.getDate() + 6);
        const sLabel = `${filterWeekStart.getDate()} ${MONTHS_ES[filterWeekStart.getMonth()].slice(0,3)}`;
        const eLabel = `${end.getDate()} ${MONTHS_ES[end.getMonth()].slice(0,3)} ${end.getFullYear()}`;
        return `${sLabel} – ${eLabel}`;
      }
      case 'day':
        return `${filterDay.getDate()} ${MONTHS_ES[filterDay.getMonth()]} ${filterDay.getFullYear()}`;
    }
  };

  const resetToNow = () => {
    setFilterYear(now.getFullYear()); setFilterMonth(now.getMonth());
    setFilterWeekStart(getWeekStart(now)); setFilterDay(now);
    setCalNavYear(now.getFullYear()); setCalNavMonth(now.getMonth());
    setCalOpen(false);
  };

  const navCal = (delta: number) => {
    let m = calNavMonth + delta, y = calNavYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setCalNavMonth(m); setCalNavYear(y);
  };

  const buildCalDays = (): (Date | null)[] => {
    const firstDay    = new Date(calNavYear, calNavMonth, 1).getDay();
    const daysInMonth = new Date(calNavYear, calNavMonth + 1, 0).getDate();
    const offset      = firstDay === 0 ? 6 : firstDay - 1;
    const days: (Date | null)[] = Array(offset).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(calNavYear, calNavMonth, i));
    return days;
  };

  const isInWeek = (day: Date, weekStart: Date): boolean => {
    const ds  = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(weekStart); end.setDate(weekStart.getDate() + 7);
    return ds >= weekStart && ds < end;
  };

  const DAY_NAMES  = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const MODE_TABS: { key: FilterMode; label: string }[] = [
    { key: 'year', label: 'Año' }, { key: 'month', label: 'Mes' },
    { key: 'week', label: 'Semana' }, { key: 'day', label: 'Día' },
  ];
  const calDays = buildCalDays();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-black text-xl text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Variedades Carito — Resumen del negocio</p>
        </div>

        {/* Date filter */}
        <div className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setCalOpen(false); }}>
          <button
            onClick={() => setCalOpen(v => !v)}
            className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2 text-sm font-bold hover:bg-muted transition-colors"
          >
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="max-w-44 truncate">{filterLabel()}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </button>

          {calOpen && (
            <div className="absolute right-0 top-11 z-30 bg-card border border-border rounded-2xl shadow-xl p-4 w-80" onClick={e => e.stopPropagation()}>

              {/* Mode tabs */}
              <div className="grid grid-cols-4 gap-1 mb-4 bg-muted rounded-xl p-1">
                {MODE_TABS.map(({ key, label }) => (
                  <button key={key} onClick={() => setFilterMode(key)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${filterMode === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Año ── */}
              {filterMode === 'year' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setFilterYear(y => y - 1)} className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="font-black text-2xl">{filterYear}</span>
                    <button onClick={() => setFilterYear(y => y + 1)} className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                  <button onClick={() => setCalOpen(false)} className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
                    Ver {filterYear}
                  </button>
                </div>
              )}

              {/* ── Mes ── */}
              {filterMode === 'month' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setFilterYear(y => y - 1)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="font-black text-sm">{filterYear}</span>
                    <button onClick={() => setFilterYear(y => y + 1)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTHS_ES.map((m, i) => (
                      <button key={m} onClick={() => { setFilterMonth(i); setCalOpen(false); }}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${filterMonth === i && filterMode === 'month' ? 'bg-primary text-white' : 'hover:bg-muted text-foreground'}`}>
                        {m.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Semana / Día — shared calendar grid ── */}
              {(filterMode === 'week' || filterMode === 'day') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button onClick={() => navCal(-1)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="font-black text-sm">{MONTHS_ES[calNavMonth]} {calNavYear}</span>
                    <button onClick={() => navCal(1)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {DAY_NAMES.map(d => (
                      <div key={d} className="text-center text-[10px] font-black text-muted-foreground py-1">{d}</div>
                    ))}
                    {calDays.map((day, idx) => {
                      if (!day) return <div key={`e${idx}`} />;
                      const isToday    = day.toDateString() === now.toDateString();
                      const isSelDay   = filterMode === 'day' && day.toDateString() === filterDay.toDateString();
                      const inSelWeek  = filterMode === 'week' && isInWeek(day, filterWeekStart);
                      const inHovWeek  = filterMode === 'week' && hoverWeekStart !== null && isInWeek(day, hoverWeekStart);
                      return (
                        <button key={idx}
                          onClick={() => {
                            if (filterMode === 'day') { setFilterDay(day); setCalOpen(false); }
                            else { setFilterWeekStart(getWeekStart(day)); setCalOpen(false); }
                          }}
                          onMouseEnter={() => filterMode === 'week' && setHoverWeekStart(getWeekStart(day))}
                          onMouseLeave={() => filterMode === 'week' && setHoverWeekStart(null)}
                          className={[
                            'flex items-center justify-center text-xs font-bold h-8 w-full transition-all',
                            filterMode === 'week' ? 'rounded-none first:rounded-l-lg last:rounded-r-lg' : 'rounded-lg',
                            isSelDay   ? 'bg-primary text-white' : '',
                            inSelWeek  ? 'bg-primary/25 text-primary' : '',
                            inHovWeek && !inSelWeek ? 'bg-muted' : '',
                            isToday && !isSelDay && !inSelWeek ? 'ring-1 ring-primary text-primary' : '',
                            !isSelDay && !inSelWeek && !inHovWeek ? 'hover:bg-muted text-foreground' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-center text-muted-foreground pt-1">
                    {filterMode === 'week' ? 'Clic en cualquier día para seleccionar esa semana' : 'Clic en un día para filtrar'}
                  </p>
                </div>
              )}

              <button onClick={resetToNow} className="w-full mt-3 py-2 border border-border rounded-xl text-xs font-bold hover:bg-muted text-muted-foreground">
                Período actual
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={DollarSign}  label="Ingresos del Período" value={formatCOP(totalPeriod)}           sub={`${filteredSales.length} trans. • ${filterLabel()}`}   color="text-primary" />
        <KPICard icon={TrendingUp}  label="Ventas Completadas"   value={filteredSales.filter(s => s.estado === 'completado').length.toString()} sub={`Total • ${filterLabel()}`} color="text-purple-600" />
        <KPICard icon={FileText}    label="Pedidos Activos"       value={pedidosActivos.toString()}         sub={`Pendientes • ${filterLabel()}`}                     color="text-amber-500" />
        <KPICard icon={ShoppingBag} label="Ticket Promedio"       value={formatCOP(ticketProm)}             sub={`Por trans. • ${filterLabel()}`}                            color="text-green-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-2xl p-5 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-sm">Ventas Semana Actual</h3>
            <span className="bg-muted text-muted-foreground text-xs font-bold px-2 py-1 rounded-lg">{MONTHS_ES[filterWeekStart.getMonth()]} {filterWeekStart.getFullYear()}</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ReBarChart data={weekSalesData.map((d, i) => {
              const date = new Date(filterWeekStart);
              date.setDate(date.getDate() + i);
              return { ...d, day: `${d.day} ${date.getDate()}` };
            })} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(186,156,219,0.15)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v/1000)}k`} />
              <Tooltip formatter={(v: number) => formatCOP(v)} />
              <Bar key="bar-ventas" dataKey="ventas" fill="#ED498C" radius={[6,6,0,0]} name="Ventas" />
              <Bar key="bar-meta"   dataKey="meta"   fill="#BA9CDB" radius={[6,6,0,0]} name="Meta" opacity={0.4} />
            </ReBarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <h3 className="font-black mb-4 text-sm">Top Productos</h3>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={topProducts} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                {topProducts.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-3">
            {topProducts.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <span className="flex-1 truncate text-foreground font-bold">{p.name}</span>
                <span className="text-muted-foreground">{p.value} uds</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-sm">Evolución Mensual</h3>
            <span className="bg-muted text-muted-foreground text-xs font-bold px-2 py-1 rounded-lg">{filterYear}</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(186,156,219,0.15)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v/1000000)}M`} />
              <Tooltip formatter={(v: number) => formatCOP(v)} />
              <Area key="area-ventas" type="monotone" dataKey="ventas" stroke="#ED498C" fill="#ED498C" fillOpacity={0.12} name="Ventas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <h3 className="font-black mb-4 text-sm">Últimas Transacciones</h3>
          <div className="space-y-3">
            {recentTx.map(tx => (
              <div key={tx.id} className="flex items-center gap-3">
                <Av name={tx.cliente} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{tx.cliente}</p>
                  <p className="text-xs text-muted-foreground">{tx.id} · {tx.fecha}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-primary">{formatCOP(tx.total)}</p>
                  <StatusBadge status={tx.estado} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── POS View ────────────────────────────────────────────────────────────────
type CartItem = { product: typeof posProducts[0]; qty: number };

function POSView({ sales, setSales, orders, setOrders, clients, setClients }: {
  sales: Sale[]; setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  orders: Order[]; setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  clients: Client[]; setClients: React.Dispatch<React.SetStateAction<Client[]>>;
}) {
  const [cart, setCart]                     = useState<CartItem[]>([]);
  const [posCat, setPosCat]                 = useState('Todos');
  const [posSearch, setPosSearch]           = useState('');
  const [checkoutOpen, setCheckoutOpen]     = useState(false);
  const [checkoutClient, setCheckoutClient] = useState('');
  const [checkoutDocumento, setCheckoutDocumento] = useState('');
  const [checkoutMethod, setCheckoutMethod] = useState<'Efectivo'|'Transferencia'>('Efectivo');
  const [checkoutStatus, setCheckoutStatus] = useState('completado');
  const { ask, el: confirmEl } = useConfirm();
  const { warn, el: alertEl }  = useAlert();

  const filtered = useMemo(() =>
    posProducts.filter(p =>
      (posCat === 'Todos' || p.category === posCat) &&
      p.name.toLowerCase().includes(posSearch.toLowerCase())
    ), [posCat, posSearch]
  );

  const addToCart = (p: typeof posProducts[0]) => {
    if (p.stock === 0) { warn(`"${p.name}" no tiene stock disponible.`); return; }
    setCart(prev => {
      const ex = prev.find(x => x.product.id === p.id);
      if (ex) {
        if (ex.qty >= p.stock && p.stock !== 999) { warn('Stock máximo alcanzado.'); return prev; }
        return prev.map(x => x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      }
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart(prev =>
      prev.map(x => x.product.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x)
          .filter(x => !(x.product.id === id && x.qty + delta < 1))
    );
  };

  const removeItem = (id: number) => setCart(prev => prev.filter(x => x.product.id !== id));

  const total    = cart.reduce((s, x) => s + x.product.price * x.qty, 0);
  const iva      = Math.round(total * 19 / 119);
  const subtotal = total - iva;

  const handleFinishCheckout = () => {
    if (!checkoutClient.trim()) { warn('Ingresa el nombre del cliente.'); return; }
    if (cart.length === 0)      { warn('El carrito está vacío.'); return; }

    const now   = new Date();
    const fecha = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
    const hora  = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const items: TxItem[] = cart.map(x => ({ name: x.product.name, qty: x.qty, price: x.product.price }));
    const nombre = checkoutClient.trim();

    let doc = checkoutDocumento.trim() || undefined;
    if (!doc) {
      const existingClient = clients.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
      if (existingClient?.documento) doc = existingClient.documento;
    }

    if (checkoutStatus === 'completado') {
      const id = `VTA${String(sales.length + 1).padStart(3, '0')}`;
      setSales(prev => [{ id, fecha, hora, cliente: nombre, documento: doc, items, subtotal, iva, total, metodoPago: checkoutMethod, estado: 'completado' }, ...prev]);
    } else {
      const id = `PED${String(orders.length + 1).padStart(3, '0')}`;
      setOrders(prev => [{ id, fecha, hora, cliente: nombre, documento: doc, items, subtotal, iva, total, metodoPago: checkoutMethod, estado: checkoutStatus }, ...prev]);
    }

    setClients(prev => {
      const idx = prev.findIndex(c => c.nombre.toLowerCase() === nombre.toLowerCase());
      if (idx >= 0) {
        return prev.map((c, i) => i === idx ? { ...c, cantidadCompras: c.cantidadCompras + 1, totalGastado: c.totalGastado + total, ultimaCompra: fecha } : c);
      }
      const doc = checkoutDocumento.trim() || undefined;
      return [...prev, { id: `CL${String(prev.length + 1).padStart(3, '0')}`, nombre, cantidadCompras: 1, totalGastado: total, ultimaCompra: fecha, ...(doc ? { documento: doc } : {}) }];
    });

    toast.success('¡Transacción guardada exitosamente!');
    setCart([]); setCheckoutOpen(false);
    setCheckoutClient(''); setCheckoutDocumento('');
    setCheckoutMethod('Efectivo'); setCheckoutStatus('completado');
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {confirmEl}{alertEl}

      {/* Product Grid */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={posSearch} onChange={e => setPosSearch(e.target.value)} placeholder="Buscar producto o servicio..." className={`${iCls} pl-9`} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {posCategories.map(c => (
            <button key={c} onClick={() => setPosCat(c)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${posCat === c ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{c}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
          {filtered.map(p => {
            const inCart     = cart.find(x => x.product.id === p.id);
            const outOfStock = p.stock === 0;
            return (
              <button key={p.id} onClick={() => addToCart(p)} disabled={outOfStock}
                className={`${p.bg} rounded-2xl p-3 flex flex-col items-center gap-2 text-center border-2 transition-all hover:scale-105 active:scale-95 ${inCart ? 'border-primary shadow-md' : 'border-transparent'} ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <span className="text-2xl">{p.emoji}</span>
                <span className="text-xs font-bold text-foreground leading-tight">{p.name}</span>
                <span className="text-primary font-black text-sm">{formatCOP(p.price)}</span>
                {p.stock !== 999 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${outOfStock ? 'bg-red-100 text-red-600' : p.stock < 5 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-700'}`}>
                    {outOfStock ? 'Sin Stock' : `Stock: ${p.stock}`}
                  </span>
                )}
                {inCart && <span className="bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">×{inCart.qty}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart */}
      <div className="w-80 bg-card rounded-2xl border border-border flex flex-col shadow-sm flex-shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-black text-sm flex items-center gap-2"><SBag className="w-4 h-4 text-primary" /> Carrito ({cart.length})</h3>
          {cart.length > 0 && <button onClick={() => ask('¿Vaciar todo el carrito?', () => setCart([]))} className="text-xs text-red-500 hover:text-red-700 font-bold">Vaciar</button>}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <SBag className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">Agrega productos al carrito</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product.id} className="bg-muted/40 rounded-xl p-2.5 flex items-center gap-2">
              <span className="text-lg">{item.product.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{item.product.name}</p>
                <p className="text-xs text-primary font-black">{formatCOP(item.product.price * item.qty)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(item.product.id, -1)} className="w-6 h-6 bg-muted rounded-lg flex items-center justify-center hover:bg-primary/10"><Minus className="w-3 h-3" /></button>
                <span className="text-xs font-black w-5 text-center">{item.qty}</span>
                <button onClick={() => updateQty(item.product.id, 1)}  className="w-6 h-6 bg-muted rounded-lg flex items-center justify-center hover:bg-primary/10"><Plus className="w-3 h-3" /></button>
                <button onClick={() => removeItem(item.product.id)} className="w-6 h-6 text-red-400 hover:text-red-600 flex items-center justify-center"><X className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Subtotal (sin IVA):</span><span className="font-bold">{formatCOP(subtotal)}</span></div>
          <div className="flex justify-between text-xs text-muted-foreground"><span>IVA incluido (19%):</span><span className="font-bold">{formatCOP(iva)}</span></div>
          <div className="flex justify-between font-black text-base border-t border-border pt-2"><span>Total:</span><span className="text-primary">{formatCOP(total)}</span></div>
          <button onClick={() => { if (cart.length === 0) { warn('El carrito está vacío.'); return; } setCheckoutOpen(true); }}
            className="w-full py-3 bg-primary text-white rounded-xl font-black text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 mt-2">
            <Check className="w-4 h-4" /> Cobrar {total > 0 ? formatCOP(total) : ''}
          </button>
        </div>
      </div>

      {/* Checkout Modal */}
      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Finalizar Venta">
        <div className="space-y-4">
          {/* Items a cobrar */}
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground mb-2">Productos a cobrar ({cart.length})</p>
            <div className="rounded-xl border border-border divide-y divide-border">
              <div className="flex items-center px-3 py-2 bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <div className="flex-1">Artículo</div>
                <div className="w-12 text-center">Cant.</div>
                <div className="w-20 text-right">P. Unit.</div>
                <div className="w-24 text-right">Subtotal</div>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-border block w-full">
                {cart.map(item => (
                  <div key={item.product.id} className="flex items-center px-3 py-2 text-sm">
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span>{item.product.emoji}</span>
                      <span className="font-bold truncate">{item.product.name}</span>
                    </div>
                    <div className="w-12 text-center text-muted-foreground text-xs">{item.qty}</div>
                    <div className="w-20 text-right text-muted-foreground text-xs">{formatCOP(item.product.price)}</div>
                    <div className="w-24 text-right font-black text-primary">{formatCOP(item.product.price * item.qty)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal (sin IVA):</span><span className="font-bold text-foreground">{formatCOP(subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>IVA incluido (19%):</span><span className="font-bold text-foreground">{formatCOP(iva)}</span></div>
            <div className="flex justify-between font-black border-t border-border pt-1.5"><span>TOTAL:</span><span className="text-primary text-base">{formatCOP(total)}</span></div>
          </div>

          <FF label="Cliente *">
            <input value={checkoutClient} onChange={e => setCheckoutClient(e.target.value)} maxLength={60} placeholder="Nombre del cliente (se crea si no existe)" className={iCls} list="client-list" />
            <datalist id="client-list">{clients.map(c => <option key={c.id} value={c.nombre} />)}</datalist>
          </FF>
          <FF label="Documento del Cliente (Opcional)">
            <input value={checkoutDocumento} onChange={e => setCheckoutDocumento(e.target.value)} maxLength={15} placeholder="Número de documento" className={iCls} />
          </FF>
          <FF label="Método de Pago *">
            <select value={checkoutMethod} onChange={e => setCheckoutMethod(e.target.value as any)} className={sCls}>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </FF>
          <FF label="Estado de la Transacción *">
            <select value={checkoutStatus} onChange={e => setCheckoutStatus(e.target.value)} className={sCls}>
              <option value="completado">Completado → Registro de Ventas</option>
              <option value="Apartado">Apartado → Pedidos y Apartados</option>
              <option value="Pendiente">Pendiente → Pedidos y Apartados</option>
              <option value="Cancelado">Cancelado → Pedidos y Apartados</option>
            </select>
          </FF>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            {checkoutStatus === 'completado' ? '✅ Se guardará en Registro de Ventas.' : '📋 Se guardará en Pedidos y Apartados.'}
          </div>
          <ModalActions onCancel={() => setCheckoutOpen(false)} onSave={handleFinishCheckout} saveLabel="Confirmar y Guardar" />
        </div>
      </Modal>
    </div>
  );
}

// ─── Products View ───────────────────────────────────────────────────────────
function ProductsView({ products, setProducts, categories, isMobile = false }: { products: any[]; setProducts: any; categories: any[]; isMobile?: boolean }) {
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [isOpen, setIsOpen]         = useState(false);
  const [editItem, setEditItem]     = useState<any>(null);
  const [filterCat, setFilterCat]   = useState('Todos');
  const [filterStock, setFilterStock] = useState('Todos');
  const [form, setForm]             = useState({ name: '', category: '', price: '', cost: '', stock: '', minStock: '10', status: 'activo' });
  const [nameErr, setNameErr]       = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const { ask, el: confirmEl }      = useConfirm();
  const { warn, el: alertEl }       = useAlert();

  const isEditing = !!editItem;
  const blankForm = { name: '', category: '', price: '', cost: '', stock: '', minStock: '10', status: 'activo' };

  const getStockStatus = (stock: number, minStock: number) => {
    if (stock === 0)        return 'sin stock';
    if (stock < 5)          return 'critico';
    if (stock < minStock)   return 'bajo';
    return 'optimo';
  };

  const activeCats = categories.filter((c: any) => c.status === 'activo').map((c: any) => c.name);

  const filtered = useMemo(() => products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (filterCat === 'Todos' || p.category === filterCat) &&
    (filterStock === 'Todos' || getStockStatus(p.stock, p.minStock) === filterStock)
  ), [products, search, filterCat, filterStock]);

  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openEdit  = (item: any) => { setEditItem(item); setForm({ name: item.name, category: item.category, price: String(item.price), cost: String(item.cost), stock: String(item.stock), minStock: String(item.minStock), status: item.status }); setNameErr(''); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setEditItem(null); setForm(blankForm); setNameErr(''); };

  const handleSave = () => {
    if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
    if (!form.category) { warn('Selecciona una categoría.'); return; }
    if (!isEditing && products.some((p: any) => p.name.toLowerCase() === form.name.toLowerCase())) { setNameErr(`Ya existe "${form.name}".`); return; }
    const stockNum = parseInt(form.stock) || 0;
    const updates = { name: form.name.trim(), category: form.category, price: parseInt(form.price) || 0, cost: parseInt(form.cost) || 0, stock: stockNum, minStock: parseInt(form.minStock) || 10, status: form.status };
    if (isEditing) {
      setProducts((prev: any[]) => prev.map((p: any) => p.id === editItem.id ? { ...p, ...updates } : p));
      toast.success('Producto actualizado.');
    } else {
      const id = `P${String(products.length + 1).padStart(3, '0')}`;
      setProducts((prev: any[]) => [{ id, ...updates }, ...prev]);
      toast.success('Producto creado.'); setPage(1);
    }
    closeModal();
  };

  const handleToggle = (item: any) => {
    if (item.status === 'activo') {
      ask(`¿Desactivar "${item.name}"?`, () => {
        setProducts((prev: any[]) => prev.map((p: any) => p.id === item.id ? { ...p, status: 'inactivo' } : p));
        toast.success('Producto desactivado.');
      });
    } else {
      setProducts((prev: any[]) => prev.map((p: any) => p.id === item.id ? { ...p, status: 'activo' } : p));
      toast.success('Producto activado.');
    }
  };

  const cats = ['Todos', ...Array.from(new Set(products.map((p: any) => p.category)))];

  return (
    <div className="space-y-4">
      {confirmEl}{alertEl}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={(f, t) => toast.success(`Reporte exportado (${f} → ${t})`)} />
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Gestión de Productos</h2>
        <div className="flex gap-2">
          <button onClick={() => setExportOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-muted"><FileDown className="w-4 h-4" /> Exportar</button>
          {!isMobile && <button onClick={() => { setEditItem(null); setForm(blankForm); setNameErr(''); setIsOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nuevo</button>}
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar producto..." className={`${iCls} pl-9`} /></div>
        <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }} className={`${sCls} ${isMobile ? 'w-full' : 'w-40'}`}>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>
        {!isMobile && <select value={filterStock} onChange={e => { setFilterStock(e.target.value); setPage(1); }} className={`${sCls} w-40`}>
          <option value="Todos">Todos los stocks</option>
          <option value="optimo">Óptimo</option><option value="bajo">Bajo</option>
          <option value="critico">Crítico</option><option value="sin stock">Sin Stock</option>
        </select>}
      </div>

      {isMobile ? (
        <div className="grid grid-cols-2 gap-3">
          {paged.map(p => {
            const ss = getStockStatus(p.stock, p.minStock);
            return (
              <div key={p.id} className="bg-card rounded-2xl border border-border p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm leading-tight truncate">{p.name}</p>
                    <span className="bg-accent/20 text-accent-foreground px-1.5 py-0.5 rounded-full text-[10px] font-bold">{p.category}</span>
                  </div>
                  <ToggleSwitch checked={p.status === 'activo'} onChange={() => handleToggle(p)} />
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div className="bg-muted/50 rounded-lg p-1.5">
                    <p className="text-[10px] text-muted-foreground">Precio</p>
                    <p className="text-xs font-black text-primary">{formatCOP(p.price)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-1.5">
                    <p className="text-[10px] text-muted-foreground">Costo</p>
                    <p className="text-xs font-bold">{formatCOP(p.cost)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-1.5">
                    <p className="text-[10px] text-muted-foreground">Stock</p>
                    <p className="text-xs font-black">{p.stock}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={ss === 'sin stock' ? 'Sin Stock' : ss.charAt(0).toUpperCase() + ss.slice(1)} />
                  <button onClick={() => openEdit(p)} className="p-3 rounded-xl bg-primary/10 text-primary"><Edit2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <TableWrapper>
          <thead><tr><Th>Producto</Th><Th>Categoría</Th><Th right>Precio</Th><Th right>Costo</Th><Th>Stock</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
          <tbody>
            {paged.map(p => {
              const ss = getStockStatus(p.stock, p.minStock);
              return (
                <tr key={p.id} className="hover:bg-muted/20">
                  <Td><div className="font-bold text-sm">{p.name}</div><div className="text-xs text-muted-foreground">{p.id}</div></Td>
                  <Td><span className="bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full text-xs font-bold">{p.category}</span></Td>
                  <Td right><span className="font-bold">{formatCOP(p.price)}</span></Td>
                  <Td right>{formatCOP(p.cost)}</Td>
                  <Td><div className="flex items-center gap-2"><span className="font-bold">{p.stock}</span><StatusBadge status={ss === 'sin stock' ? 'Sin Stock' : ss.charAt(0).toUpperCase() + ss.slice(1)} /></div></Td>
                  <Td><ToggleSwitch checked={p.status === 'activo'} onChange={() => handleToggle(p)} /></Td>
                  <Td><button onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button></Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrapper>
      )}
      <Pagination page={page} total={pages} onPage={setPage} />
      <Modal open={isOpen} onClose={closeModal} title={isEditing ? 'Editar Producto' : 'Nuevo Producto'}>
        <div className="space-y-4">
          <FF label="Nombre *" err={nameErr}><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={30} className={iCls} /></FF>
          <FF label="Categoría *">
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={sCls}>
              <option value="">Seleccionar...</option>
              {activeCats.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FF>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Precio (COP)"><input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className={iCls} /></FF>
            <FF label="Stock Actual"><input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} className={iCls} /></FF>
            <FF label="Stock Mínimo"><input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} className={iCls} /></FF>
          </div>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={isEditing ? 'Actualizar' : 'Crear Producto'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Buy Categories View ─────────────────────────────────────────────────────
function BuyCategoriesView({ categories, setCategories, products }: { categories: any[]; setCategories: any; products: any[] }) {
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [isOpen, setIsOpen]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm]         = useState({ name: '', desc: '', status: 'activo' });
  const [nameErr, setNameErr]   = useState('');
  const { ask, el: confirmEl }  = useConfirm();
  const { warn, el: alertEl }   = useAlert();

  const isEditing = !!editItem;
  const blankForm = { name: '', desc: '', status: 'activo' };
  const filtered  = useMemo(() => categories.filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase())), [categories, search]);
  const pages     = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged     = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openEdit  = (item: any) => { setEditItem(item); setForm({ name: item.name, desc: item.desc, status: item.status }); setNameErr(''); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setEditItem(null); setForm(blankForm); setNameErr(''); };

  const handleSave = () => {
    if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
    if (!isEditing && categories.some((c: any) => c.name.toLowerCase() === form.name.toLowerCase())) { setNameErr(`Ya existe "${form.name}".`); return; }
    if (isEditing) {
      setCategories((prev: any[]) => prev.map((c: any) => c.id === editItem.id ? { ...c, ...form, name: form.name.trim() } : c));
      toast.success('Categoría actualizada.');
    } else {
      const id = `BC${String(categories.length + 1).padStart(3, '0')}`;
      setCategories((prev: any[]) => [{ id, name: form.name.trim(), desc: form.desc, status: form.status }, ...prev]);
      toast.success('Categoría creada.'); setPage(1);
    }
    closeModal();
  };

  const handleToggle = (item: any) => {
    if (item.status === 'activo') {
      const hasProds = products.some((p: any) => p.category === item.name && p.status === 'activo');
      if (hasProds) { warn(`"${item.name}" tiene productos activos. Desactívalos primero.`); return; }
      ask(`¿Desactivar categoría "${item.name}"?`, () => {
        setCategories((prev: any[]) => prev.map((c: any) => c.id === item.id ? { ...c, status: 'inactivo' } : c));
        toast.success('Categoría desactivada.');
      });
    } else {
      setCategories((prev: any[]) => prev.map((c: any) => c.id === item.id ? { ...c, status: 'activo' } : c));
      toast.success('Categoría activada.');
    }
  };

  return (
    <div className="space-y-4">
      {confirmEl}{alertEl}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Categoría de Productos</h2>
        <button onClick={() => { setEditItem(null); setForm(blankForm); setNameErr(''); setIsOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nueva</button>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar categoría..." className={`${iCls} pl-9`} /></div>
      <TableWrapper>
        <thead><tr><Th>Categoría</Th><Th>Descripción</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
        <tbody>
          {paged.map(c => (
            <tr key={c.id} className="hover:bg-muted/20">
              <Td><div className="font-bold">{c.name}</div><div className="text-xs text-muted-foreground">{c.id}</div></Td>
              <Td><span className="text-sm text-muted-foreground">{c.desc}</span></Td>
              <Td><ToggleSwitch checked={c.status === 'activo'} onChange={() => handleToggle(c)} /></Td>
              <Td><button onClick={() => openEdit(c)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button></Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <Pagination page={page} total={pages} onPage={setPage} />
      <Modal open={isOpen} onClose={closeModal} title={isEditing ? 'Editar Categoría' : 'Nueva Categoría'}>
        <div className="space-y-4">
          <FF label="Nombre *" err={nameErr}><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={30} className={iCls} /></FF>
          <FF label="Descripción"><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} maxLength={60} className={iCls} /></FF>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={isEditing ? 'Actualizar' : 'Crear'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Suppliers View ──────────────────────────────────────────────────────────
function SuppliersView({ suppliers, setSuppliers }: { suppliers: any[]; setSuppliers: any }) {
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [isOpen, setIsOpen]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const blankForm = { name: '', tipoProveedor: 'Natural', tipoDocumento: 'CC', nit: '', contact: '', phone: '', email: '', category: '', status: 'activo' };
  const [form, setForm]         = useState(blankForm);
  const [nameErr, setNameErr]   = useState('');
  const { ask, el: confirmEl }  = useConfirm();

  const isEditing = !!editItem;

  const filtered = useMemo(() => suppliers.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.contact.toLowerCase().includes(search.toLowerCase())
  ), [suppliers, search]);
  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openEdit  = (item: any) => { setEditItem(item); setForm({ name: item.name, tipoProveedor: item.tipoProveedor || 'Juridico', tipoDocumento: item.tipoDocumento || 'NIT', nit: item.nit || '', contact: item.contact, phone: item.phone, email: item.email || '', category: item.category, status: item.status }); setNameErr(''); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setEditItem(null); setForm(blankForm); setNameErr(''); };

  const handleSave = () => {
    if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
    if (!isEditing && suppliers.some((s: any) => s.name.toLowerCase() === form.name.toLowerCase())) { setNameErr(`Ya existe "${form.name}".`); return; }
    if (isEditing) {
      setSuppliers((prev: any[]) => prev.map((s: any) => s.id === editItem.id ? { ...s, ...form, name: form.name.trim() } : s));
      toast.success('Proveedor actualizado.');
    } else {
      const id = `SP${String(suppliers.length + 1).padStart(3, '0')}`;
      setSuppliers((prev: any[]) => [{ id, ...form, name: form.name.trim() }, ...prev]);
      toast.success('Proveedor creado.'); setPage(1);
    }
    closeModal();
  };

  const handleToggle = (item: any) => {
    if (item.status === 'activo') {
      ask(`¿Desactivar "${item.name}"?`, () => {
        setSuppliers((prev: any[]) => prev.map((s: any) => s.id === item.id ? { ...s, status: 'inactivo' } : s));
        toast.success('Proveedor desactivado.');
      });
    } else {
      setSuppliers((prev: any[]) => prev.map((s: any) => s.id === item.id ? { ...s, status: 'activo' } : s));
      toast.success('Proveedor activado.');
    }
  };

  return (
    <div className="space-y-4">
      {confirmEl}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Proveedores</h2>
        <button onClick={() => { setEditItem(null); setForm(blankForm); setNameErr(''); setIsOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nuevo</button>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar proveedor..." className={`${iCls} pl-9`} /></div>
      <TableWrapper>
        <thead><tr><Th>Proveedor</Th><Th>Contacto</Th><Th>Teléfono</Th><Th>Categoría</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
        <tbody>
          {paged.map(s => (
            <tr key={s.id} className="hover:bg-muted/20">
              <Td>
                <div className="font-bold">{s.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{s.tipoDocumento || 'NIT'}: {s.nit || '—'}</div>
              </Td>
              <Td>{s.contact}</Td>
              <Td><span className="font-mono text-xs">{s.phone}</span></Td>
              <Td><span className="bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full text-xs font-bold">{s.category}</span></Td>
              <Td><ToggleSwitch checked={s.status === 'activo'} onChange={() => handleToggle(s)} /></Td>
              <Td><button onClick={() => openEdit(s)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button></Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <Pagination page={page} total={pages} onPage={setPage} />
      <Modal open={isOpen} onClose={closeModal} title={isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}>
        <div className="space-y-4">
          <FF label="Tipo de Proveedor">
            <select value={form.tipoProveedor} onChange={e => {
              const tp = e.target.value;
              setForm(f => ({ ...f, tipoProveedor: tp, tipoDocumento: tp === 'Juridico' ? 'NIT' : 'CC' }));
            }} className={iCls}>
              <option value="Natural">Natural</option>
              <option value="Juridico">Jurídico</option>
            </select>
          </FF>
          {form.tipoProveedor === 'Natural' ? (
            <div className="grid grid-cols-2 gap-3">
              <FF label="Tipo de Documento">
                <select value={form.tipoDocumento} onChange={e => setForm(f => ({ ...f, tipoDocumento: e.target.value }))} className={iCls}>
                  <option value="CC">Cédula de Ciudadanía (CC)</option>
                  <option value="CE">Cédula de Extranjería (CE)</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="RUT">RUT</option>
                </select>
              </FF>
              <FF label="Número de Documento">
                <input value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} maxLength={20} className={iCls} />
              </FF>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FF label="Tipo de Documento">
                <input value="NIT" disabled className={`${iCls} bg-muted text-muted-foreground`} />
              </FF>
              <FF label="Número de NIT">
                <input value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} maxLength={20} placeholder="ej: 900.123.456-1" className={iCls} />
              </FF>
            </div>
          )}
          <FF label={form.tipoProveedor === 'Juridico' ? "Razón Social *" : "Nombre del Proveedor *"} err={nameErr}><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={40} className={iCls} /></FF>
          <FF label="Contacto"><input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} maxLength={30} className={iCls} /></FF>
          <div className="grid grid-cols-3 gap-3">
            <FF label="Teléfono"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} maxLength={15} className={iCls} /></FF>
            <FF label="Correo"><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} maxLength={60} type="email" placeholder="correo@ejemplo.com" className={iCls} /></FF>
            <FF label="Categoría"><input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} maxLength={20} className={iCls} /></FF>
          </div>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={isEditing ? 'Actualizar' : 'Crear'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Purchases View ──────────────────────────────────────────────────────────
function PurchasesView({ purchases, setPurchases, suppliers, isMobile = false }: { purchases: Purchase[]; setPurchases: React.Dispatch<React.SetStateAction<Purchase[]>>; suppliers: any[]; isMobile?: boolean }) {
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [isOpen, setIsOpen]       = useState(false);
  const [detailOpen, setDetailOpen] = useState<Purchase | null>(null);
  const [editItem, setEditItem]   = useState<any>(null);
  const blankForm = { proveedor: '', proveedorNit: '', status: 'Pendiente', fecha: '', notas: '', items: [{ name: '', qty: '1', cost: '' }] as any[] };
  const [form, setForm]           = useState(blankForm);
  const { warn, el: alertEl }     = useAlert();
  const purchaseStatusOptions     = ['Pendiente', 'Pagado', 'Cancelado'];

  const isEditing = !!editItem;

  const openEdit = (p: any) => {
    setEditItem(p);
    const [d, m, y] = p.fecha.split('/');
    setForm({
      proveedor: p.proveedor,
      proveedorNit: p.proveedorNit || '',
      fecha: `${y}-${m}-${d}`,
      items: p.items.map((i: any) => ({ ...i, qty: String(i.qty), cost: String(i.cost) })),
      notas: p.notas || '',
      status: p.status || 'Pendiente'
    });
    setIsOpen(true);
  };

  const handlePurchaseStatus = (id: string, newStatus: string) => {
    setPurchases(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
    toast.success('Estado actualizado.');
  };

  const activeSuppliers = suppliers.filter((s: any) => s.status === 'activo');

  const filtered = useMemo(() => purchases.filter(p =>
    p.proveedor.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase())
  ), [purchases, search]);
  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const addRow    = () => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: '1', cost: '' }] }));
  const removeRow = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_: any, idx: number) => idx !== i) }));
  const updateRow = (i: number, field: string, val: string) => setForm(f => ({
    ...f, items: f.items.map((item: any, idx: number) => idx === i ? { ...item, [field]: val } : item)
  }));

  const computedTotal = form.items.reduce((s: number, i: any) => s + (parseInt(i.qty) || 0) * (parseInt(i.cost) || 0), 0);

  const handleSave = () => {
    if (!form.proveedor) { warn('Selecciona un proveedor.'); return; }
    if (!form.fecha)     { warn('Ingresa la fecha de compra.'); return; }
    const validItems = form.items.filter((i: any) => i.name.trim() && (parseInt(i.qty) || 0) > 0);
    if (validItems.length === 0) { warn('Agrega al menos un producto.'); return; }
    const items: PurchaseRow[] = validItems.map((i: any) => ({ name: i.name.trim(), qty: parseInt(i.qty) || 1, cost: parseInt(i.cost) || 0 }));
    const total  = items.reduce((s, i) => s + i.qty * i.cost, 0);
    const [y, m, d] = form.fecha.split('-');
    const fecha  = `${d}/${m}/${y}`;
    if (isEditing) {
      setPurchases(prev => prev.map(p => p.id === editItem.id ? { ...p, fecha, proveedor: form.proveedor, proveedorNit: form.proveedorNit, items, total, notas: form.notas, status: form.status } : p));
      toast.success('Compra actualizada.');
    } else {
      const id     = `COM${String(purchases.length + 1).padStart(3, '0')}`;
      setPurchases(prev => [{ id, fecha, proveedor: form.proveedor, proveedorNit: form.proveedorNit, items, total, notas: form.notas, status: form.status }, ...prev]);
      toast.success('Compra registrada.');
    }
    setIsOpen(false); setForm(blankForm); setPage(1); setEditItem(null);
  };

  const totalGasto = purchases.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      {alertEl}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Gestión de Compras</h2>
          <p className="text-xs text-muted-foreground">Registro de compras realizadas a proveedores</p>
        </div>
        {!isMobile && <button onClick={() => { setForm(blankForm); setEditItem(null); setIsOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nueva Compra</button>}
      </div>

      <div className={`grid gap-4 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Total Gastado</p>
          <p className="font-black text-primary text-lg">{formatCOP(totalGasto)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Nº de Compras</p>
          <p className="font-black text-foreground text-lg">{purchases.length}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Última Compra</p>
          <p className="font-black text-foreground text-base">{purchases[0]?.fecha || '—'}</p>
        </div>
      </div>

      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por proveedor o ID..." className={`${iCls} pl-9`} /></div>

      {isMobile ? (
        <div className="space-y-3">
          {paged.map(p => (
            <div key={p.id} className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-xs text-primary">{p.id}</span>
                <span className="text-xs text-muted-foreground">{p.fecha}</span>
              </div>
              <p className="font-black text-sm">{p.proveedor}</p>
              {p.proveedorNit && <p className="text-xs text-muted-foreground font-mono">NIT: {p.proveedorNit}</p>}
              <p className="text-xs text-muted-foreground mb-3">{p.items.length} producto(s){p.notas ? ` · ${p.notas}` : ''}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-primary">{formatCOP(p.total)}</span>
                <div className="flex items-center gap-2">
                  {p.status && <InlineStatusSelect value={p.status} options={purchaseStatusOptions} onChange={s => handlePurchaseStatus(p.id, s)} />}
                  <button onClick={() => openEdit(p)} className="p-3 rounded-xl bg-primary/10 text-primary"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => setDetailOpen(p)} className="p-3 rounded-xl bg-blue-50 text-blue-500"><Eye className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {paged.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No se encontraron compras.</p>}
        </div>
      ) : (
        <TableWrapper>
          <thead><tr><Th>ID</Th><Th>Proveedor</Th><Th>Fecha</Th><Th>Productos</Th><Th right>Total</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.id} className="hover:bg-muted/20">
                <Td><span className="font-mono font-bold text-xs text-primary">{p.id}</span></Td>
                <Td>
                  <div className="font-bold text-sm">{p.proveedor}</div>
                  {p.proveedorNit && <div className="text-xs text-muted-foreground font-mono">NIT: {p.proveedorNit}</div>}
                </Td>
                <Td><span className="text-sm">{p.fecha}</span></Td>
                <Td><span className="bg-muted px-2 py-0.5 rounded-full text-xs font-bold">{p.items.length} ítem(s)</span></Td>
                <Td right><span className="font-black text-primary">{formatCOP(p.total)}</span></Td>
                <Td>
                  {p.status ? (
                    <InlineStatusSelect value={p.status} options={purchaseStatusOptions} onChange={s => handlePurchaseStatus(p.id, s)} />
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </Td>
                <Td>
                  <div className="flex items-center gap-2 justify-center">
                    <button onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDetailOpen(p)} className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-500"><Eye className="w-3.5 h-3.5" /></button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
      <Pagination page={page} total={pages} onPage={setPage} />

      {/* Detail Modal */}
      {detailOpen && (
        <Modal open={!!detailOpen} onClose={() => setDetailOpen(null)} title={`Detalle Compra — ${detailOpen.id}`} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-xl p-4">
              <div><span className="text-muted-foreground">Proveedor:</span> <span className="font-bold">{detailOpen.proveedor}</span></div>
              <div><span className="text-muted-foreground">Fecha:</span> <span className="font-bold">{detailOpen.fecha}</span></div>
              {detailOpen.proveedorNit && <div><span className="text-muted-foreground">NIT:</span> <span className="font-bold font-mono">{detailOpen.proveedorNit}</span></div>}
              {detailOpen.status && <div><span className="text-muted-foreground">Estado:</span> <StatusBadge status={detailOpen.status} /></div>}
              {detailOpen.notas && <div className="col-span-2"><span className="text-muted-foreground">Notas:</span> <span className="font-bold">{detailOpen.notas}</span></div>}
            </div>
            <TableWrapper>
              <thead><tr><Th>Producto</Th><Th>Cant.</Th><Th right>Costo Unit.</Th><Th right>Total</Th></tr></thead>
              <tbody>
                {detailOpen.items.map((item, i) => (
                  <tr key={i}><Td>{item.name}</Td><Td>{item.qty}</Td><Td right>{formatCOP(item.cost)}</Td><Td right><span className="font-bold">{formatCOP(item.qty * item.cost)}</span></Td></tr>
                ))}
              </tbody>
            </TableWrapper>
            <div className="flex justify-between font-black text-base border-t border-border pt-3 px-1">
              <span>TOTAL COMPRA:</span><span className="text-primary">{formatCOP(detailOpen.total)}</span>
            </div>
            <button onClick={() => setDetailOpen(null)} className="w-full py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted">Cerrar</button>
          </div>
        </Modal>
      )}

      {/* New Purchase Modal */}
      <Modal open={isOpen} onClose={() => { setIsOpen(false); setForm(blankForm); setEditItem(null); }} title={isEditing ? 'Editar Compra' : 'Nueva Compra'} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FF label="Proveedor *">
              <select value={form.proveedor} onChange={e => {
                const selected = activeSuppliers.find((s: any) => s.name === e.target.value);
                setForm(f => ({ ...f, proveedor: e.target.value, proveedorNit: selected?.nit || '' }));
              }} className={sCls}>
                <option value="">Seleccionar...</option>
                {activeSuppliers.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </FF>
            <FF label="Fecha *"><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={iCls} /></FF>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FF label="NIT / Documento Proveedor"><input value={form.proveedorNit} onChange={e => setForm(f => ({ ...f, proveedorNit: e.target.value }))} maxLength={20} placeholder="Auto-llenado desde proveedor" className={iCls} /></FF>
            <FF label="Estado">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={sCls}>
                <option value="Pendiente">Pendiente</option>
                <option value="Pagado">Pagado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </FF>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Productos</p>
              <button onClick={addRow} className="text-xs text-primary font-bold flex items-center gap-1 hover:opacity-80"><Plus className="w-3 h-3" /> Agregar línea</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_72px_88px_32px] gap-2 text-xs font-black uppercase tracking-wide text-muted-foreground px-1">
                <span></span><span>Cant.</span><span>Costo</span><span />
              </div>
              {form.items.map((item: any, i: number) => (
                <div key={i} className="grid grid-cols-[1fr_72px_88px_32px] gap-2 items-center">
                  <input value={item.name} onChange={e => updateRow(i, 'name', e.target.value)} placeholder="Nombre del producto" className={iCls} />
                  <input type="number" value={item.qty} onChange={e => updateRow(i, 'qty', e.target.value)} placeholder="1" className={iCls} min="1" />
                  <input type="number" value={item.cost} onChange={e => updateRow(i, 'cost', e.target.value)} placeholder="0" className={iCls} />
                  {form.items.length > 1 && (
                    <button onClick={() => removeRow(i)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400"><X className="w-3 h-3" /></button>
                  )}
                </div>
              ))}
            </div>
            {computedTotal > 0 && (
              <div className="flex justify-end mt-2 text-sm font-black text-primary">Total: {formatCOP(computedTotal)}</div>
            )}
          </div>
          <FF label="Notas"><input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} maxLength={80} placeholder="Observaciones (opcional)" className={iCls} /></FF>
          <ModalActions onCancel={() => { setIsOpen(false); setForm(blankForm); setEditItem(null); }} onSave={handleSave} saveLabel={isEditing ? 'Actualizar Compra' : 'Registrar Compra'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Service Categories View ──────────────────────────────────────────────────
function ServiceCategoriesView({ categories, setCategories, services }: { categories: any[]; setCategories: any; services: any[] }) {
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [isOpen, setIsOpen]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm]         = useState({ name: '', desc: '', status: 'activo' });
  const [nameErr, setNameErr]   = useState('');
  const { ask, el: confirmEl }  = useConfirm();
  const { warn, el: alertEl }   = useAlert();

  const isEditing = !!editItem;
  const blankForm = { name: '', desc: '', status: 'activo' };
  const filtered  = useMemo(() => categories.filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase())), [categories, search]);
  const pages     = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged     = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openEdit  = (item: any) => { setEditItem(item); setForm({ name: item.name, desc: item.desc, status: item.status }); setNameErr(''); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setEditItem(null); setForm(blankForm); setNameErr(''); };

  const handleSave = () => {
    if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
    if (!isEditing && categories.some((c: any) => c.name.toLowerCase() === form.name.toLowerCase())) { setNameErr(`Ya existe "${form.name}".`); return; }
    if (isEditing) {
      setCategories((prev: any[]) => prev.map((c: any) => c.id === editItem.id ? { ...c, ...form, name: form.name.trim() } : c));
      toast.success('Categoría actualizada.');
    } else {
      const id = `SC${String(categories.length + 1).padStart(3, '0')}`;
      setCategories((prev: any[]) => [{ id, name: form.name.trim(), desc: form.desc, status: form.status }, ...prev]);
      toast.success('Categoría creada.'); setPage(1);
    }
    closeModal();
  };

  const handleToggle = (item: any) => {
    if (item.status === 'activo') {
      const hasSvcs = services.some((s: any) => s.category === item.name && s.status === 'activo');
      if (hasSvcs) { warn(`"${item.name}" tiene servicios activos. Desactívalos primero.`); return; }
      ask(`¿Desactivar categoría "${item.name}"?`, () => {
        setCategories((prev: any[]) => prev.map((c: any) => c.id === item.id ? { ...c, status: 'inactivo' } : c));
        toast.success('Categoría desactivada.');
      });
    } else {
      setCategories((prev: any[]) => prev.map((c: any) => c.id === item.id ? { ...c, status: 'activo' } : c));
      toast.success('Categoría activada.');
    }
  };

  return (
    <div className="space-y-4">
      {confirmEl}{alertEl}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Categoría de Servicios</h2>
        <button onClick={() => { setEditItem(null); setForm(blankForm); setNameErr(''); setIsOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nueva</button>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar categoría..." className={`${iCls} pl-9`} /></div>
      <TableWrapper>
        <thead><tr><Th>Categoría</Th><Th>Descripción</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
        <tbody>
          {paged.map(c => (
            <tr key={c.id} className="hover:bg-muted/20">
              <Td><div className="font-bold">{c.name}</div><div className="text-xs text-muted-foreground">{c.id}</div></Td>
              <Td><span className="text-sm text-muted-foreground">{c.desc}</span></Td>
              <Td><ToggleSwitch checked={c.status === 'activo'} onChange={() => handleToggle(c)} /></Td>
              <Td><button onClick={() => openEdit(c)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button></Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <Pagination page={page} total={pages} onPage={setPage} />
      <Modal open={isOpen} onClose={closeModal} title={isEditing ? 'Editar Categoría' : 'Nueva Categoría de Servicio'}>
        <div className="space-y-4">
          <FF label="Nombre *" err={nameErr}><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={30} className={iCls} /></FF>
          <FF label="Descripción"><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} maxLength={60} className={iCls} /></FF>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={isEditing ? 'Actualizar' : 'Crear'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Services View ───────────────────────────────────────────────────────────
function ServicesView({ services, setServices, serviceCategories }: { services: any[]; setServices: any; serviceCategories: any[] }) {
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [isOpen, setIsOpen]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm]         = useState({ name: '', category: '', price: '', cost: '', execTime: '', status: 'activo' });
  const [nameErr, setNameErr]   = useState('');
  const { ask, el: confirmEl }  = useConfirm();
  const activeSvcCats = serviceCategories.filter((c: any) => c.status === 'activo').map((c: any) => c.name);

  const isEditing = !!editItem;
  const blankForm = { name: '', category: '', price: '', cost: '', execTime: '', status: 'activo' };
  const filtered  = useMemo(() => services.filter((s: any) => s.name.toLowerCase().includes(search.toLowerCase())), [services, search]);
  const pages     = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged     = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openEdit  = (item: any) => { setEditItem(item); setForm({ name: item.name, category: item.category, price: String(item.price), cost: String(item.cost), execTime: item.execTime, status: item.status }); setNameErr(''); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setEditItem(null); setForm(blankForm); setNameErr(''); };

  const handleSave = () => {
    if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
    if (!isEditing && services.some((s: any) => s.name.toLowerCase() === form.name.toLowerCase())) { setNameErr(`Ya existe "${form.name}".`); return; }
    const updates = { name: form.name.trim(), category: form.category, price: parseInt(form.price) || 0, cost: parseInt(form.cost) || 0, execTime: form.execTime, status: form.status };
    if (isEditing) {
      setServices((prev: any[]) => prev.map((s: any) => s.id === editItem.id ? { ...s, ...updates } : s));
      toast.success('Servicio actualizado.');
    } else {
      const id = `SV${String(services.length + 1).padStart(3, '0')}`;
      setServices((prev: any[]) => [{ id, ...updates }, ...prev]);
      toast.success('Servicio creado.'); setPage(1);
    }
    closeModal();
  };

  const handleToggle = (item: any) => {
    if (item.status === 'activo') {
      ask(`¿Desactivar "${item.name}"?`, () => {
        setServices((prev: any[]) => prev.map((s: any) => s.id === item.id ? { ...s, status: 'inactivo' } : s));
        toast.success('Servicio desactivado.');
      });
    } else {
      setServices((prev: any[]) => prev.map((s: any) => s.id === item.id ? { ...s, status: 'activo' } : s));
      toast.success('Servicio activado.');
    }
  };

  return (
    <div className="space-y-4">
      {confirmEl}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Gestión de Servicios</h2>
        <button onClick={() => { setEditItem(null); setForm(blankForm); setNameErr(''); setIsOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nuevo</button>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar servicio..." className={`${iCls} pl-9`} /></div>
      <TableWrapper>
        <thead><tr><Th>Servicio</Th><Th>Categoría</Th><Th right>Precio</Th><Th right>Costo</Th><Th>Tiempo</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
        <tbody>
          {paged.map(s => (
            <tr key={s.id} className="hover:bg-muted/20">
              <Td><div className="font-bold">{s.name}</div><div className="text-xs text-muted-foreground">{s.id}</div></Td>
              <Td><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">{s.category}</span></Td>
              <Td right><span className="font-bold">{formatCOP(s.price)}</span></Td>
              <Td right>{formatCOP(s.cost)}</Td>
              <Td><div className="flex items-center gap-1.5 text-xs"><Clock className="w-3.5 h-3.5 text-muted-foreground" />{s.execTime}</div></Td>
              <Td><ToggleSwitch checked={s.status === 'activo'} onChange={() => handleToggle(s)} /></Td>
              <Td><button onClick={() => openEdit(s)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button></Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <Pagination page={page} total={pages} onPage={setPage} />
      <Modal open={isOpen} onClose={closeModal} title={isEditing ? 'Editar Servicio' : 'Nuevo Servicio'}>
        <div className="space-y-4">
          <FF label="Nombre *" err={nameErr}><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={30} className={iCls} /></FF>
          <FF label="Categoría *">
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={sCls}>
              <option value="">Seleccionar...</option>
              {activeSvcCats.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FF>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Precio (COP)"><input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className={iCls} /></FF>
            <FF label="Costo (COP)"><input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className={iCls} /></FF>
          </div>
          <FF label="Tiempo de Ejecución"><input value={form.execTime} onChange={e => setForm(f => ({ ...f, execTime: e.target.value }))} maxLength={20} placeholder="ej: 2 min, Inmediato" className={iCls} /></FF>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={isEditing ? 'Actualizar' : 'Crear'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Employees List View ─────────────────────────────────────────────────────
function EmployeesView({ employees, setEmployees, roles, sales = [], isMobile = false }: { employees: any[]; setEmployees: any; roles: any[]; sales?: Sale[]; isMobile?: boolean }) {
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [isOpen, setIsOpen]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm]         = useState({ name: '', apellido: '', documento: '', role: '', phone: '', status: 'activo' });
  const [nameErr, setNameErr]   = useState('');
  const { ask, el: confirmEl }  = useConfirm();
  const { warn, el: alertEl }   = useAlert();
  const [exportOpen, setExportOpen] = useState(false);

  const filtered  = useMemo(() => employees.filter((e: any) =>
    `${e.name} ${e.apellido || ''}`.toLowerCase().includes(search.toLowerCase()) ||
    (e.documento || '').includes(search)
  ), [employees, search]);
  const pages     = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged     = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const blankEmpForm = { name: '', apellido: '', documento: '', role: '', phone: '', status: 'activo' };
  const openEdit  = (item: any) => { setEditItem(item); setForm({ name: item.name, apellido: item.apellido || '', documento: item.documento || '', role: item.role, phone: item.phone, status: item.status }); setNameErr(''); setIsOpen(true); };
  const openCreate = () => { setEditItem(null); setForm(blankEmpForm); setNameErr(''); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setEditItem(null); setForm(blankEmpForm); setNameErr(''); };

  const handleSave = () => {
    if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
    if (!editItem) {
      const id = `EM${String(employees.length + 1).padStart(3, '0')}`;
      setEmployees((prev: any[]) => [...prev, { id, name: form.name.trim(), apellido: form.apellido.trim(), documento: form.documento.trim(), role: form.role, phone: form.phone, status: form.status, shifts: ['','','','','','',''] }]);
      toast.success('Empleado creado.');
    } else {
      setEmployees((prev: any[]) => prev.map((e: any) => e.id === editItem.id ? { ...e, ...form, name: form.name.trim(), apellido: form.apellido.trim(), documento: form.documento.trim() } : e));
      toast.success('Empleado actualizado.');
    }
    closeModal();
  };

  const handleToggle = (item: any) => {
    if (item.status === 'activo') {
      const fullName = `${item.name}${item.apellido ? ' ' + item.apellido : ''}`;
      const hasActiveShifts = (item.shifts || []).some((s: string) => s && s.trim() !== '');
      if (hasActiveShifts) { warn(`No se puede desactivar a "${fullName}" porque tiene turnos activos en la agenda.`); return; }
      const hasSales = sales.some((s: Sale) => s.cliente.toLowerCase() === item.name.toLowerCase() && s.estado === 'completado');
      if (hasSales) { warn(`No se puede desactivar a "${fullName}" porque tiene ventas registradas activas.`); return; }
      ask(`¿Desactivar a "${fullName}"?`, () => {
        setEmployees((prev: any[]) => prev.map((e: any) => e.id === item.id ? { ...e, status: 'inactivo' } : e));
        toast.success('Empleado desactivado.');
      });
    } else {
      setEmployees((prev: any[]) => prev.map((e: any) => e.id === item.id ? { ...e, status: 'activo' } : e));
      toast.success('Empleado activado.');
    }
  };

  return (
    <div className="space-y-4">
      {confirmEl}{alertEl}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={(f, t) => toast.success(`Empleados exportados (${f} → ${t})`)} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Empleados</h2>
          {!isMobile && <p className="text-xs text-muted-foreground">Para crear empleados en escritorio, hazlo desde Gestión de Usuarios</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setExportOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-muted"><FileDown className="w-4 h-4" />{!isMobile && ' Exportar'}</button>
          {isMobile && <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nuevo</button>}
        </div>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar empleado..." className={`${iCls} pl-9`} /></div>

      {isMobile ? (
        <div className="space-y-3">
          {paged.map(e => (
            <div key={e.id} className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center gap-3 mb-3">
                <Av name={e.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm">{e.name}{e.apellido ? ` ${e.apellido}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{e.role} · {e.phone || '—'}</p>
                  {e.documento && <p className="text-xs text-muted-foreground font-mono">Doc: {e.documento}</p>}
                </div>
                <ToggleSwitch checked={e.status === 'activo'} onChange={() => handleToggle(e)} />
              </div>
              <div className="flex items-center justify-between">
                <StatusBadge status={e.status} />
                <button onClick={() => openEdit(e)} className="p-3 rounded-xl bg-primary/10 text-primary"><Edit2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          {paged.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No se encontraron empleados.</p>}
        </div>
      ) : (
        <TableWrapper>
          <thead><tr><Th>Empleado</Th><Th>Documento</Th><Th>Rol</Th><Th>Teléfono</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
          <tbody>
            {paged.map(e => (
              <tr key={e.id} className="hover:bg-muted/20">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Av name={e.name} size="sm" />
                    <div>
                      <div className="font-bold text-sm">{e.name}{e.apellido ? ` ${e.apellido}` : ''}</div>
                      <div className="text-xs text-muted-foreground">{e.id}</div>
                    </div>
                  </div>
                </Td>
                <Td><span className="font-mono text-xs">{e.documento || '—'}</span></Td>
                <Td><span className="bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full text-xs font-bold">{e.role}</span></Td>
                <Td><span className="font-mono text-xs">{e.phone}</span></Td>
                <Td><ToggleSwitch checked={e.status === 'activo'} onChange={() => handleToggle(e)} /></Td>
                <Td><button onClick={() => openEdit(e)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button></Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
      <Pagination page={page} total={pages} onPage={setPage} />

      <Modal open={isOpen} onClose={closeModal} title={editItem ? 'Editar Empleado' : 'Nuevo Empleado'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FF label="Nombre *" err={nameErr}><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={20} className={iCls} /></FF>
            <FF label="Apellido"><input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} maxLength={20} className={iCls} /></FF>
          </div>
          <FF label="Documento (CC / NIT)"><input value={form.documento} onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} maxLength={15} placeholder="Número de documento" className={iCls} /></FF>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Rol">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={sCls}>
                <option value="">Seleccionar...</option>
                {roles.filter((r: any) => r.status === 'activo').map((r: any) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </FF>
            <FF label="Teléfono"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} maxLength={15} className={iCls} /></FF>
          </div>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={editItem ? 'Actualizar' : 'Crear Empleado'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Agenda View ─────────────────────────────────────────────────────────────
const SHIFT_COLORS = [
  { bg: 'bg-pink-500',   light: 'bg-pink-100   text-pink-800   border-pink-300'   },
  { bg: 'bg-violet-500', light: 'bg-violet-100 text-violet-800 border-violet-300' },
  { bg: 'bg-sky-500',    light: 'bg-sky-100    text-sky-800    border-sky-300'    },
  { bg: 'bg-amber-500',  light: 'bg-amber-100  text-amber-800  border-amber-300'  },
  { bg: 'bg-emerald-500',light: 'bg-emerald-100 text-emerald-800 border-emerald-300'},
];

function parseShiftHours(shift: string): { start: number; end: number } | null {
  if (!shift) return null;
  const parts = shift.split('-');
  if (parts.length !== 2) return null;
  const start = parseInt(parts[0]);
  const end   = parseInt(parts[1]);
  if (isNaN(start) || isNaN(end)) return null;
  return { start, end };
}

function ShiftBar({ shift, colorIdx }: { shift: string; colorIdx: number }) {
  const parsed = parseShiftHours(shift);
  const c = SHIFT_COLORS[colorIdx % SHIFT_COLORS.length];
  if (!parsed) {
    return (
      <div className={`px-2 py-1 rounded-lg text-[11px] font-black border ${c.light} text-center`}>{shift}</div>
    );
  }
  const hours = parsed.end - parsed.start;
  const isAM  = parsed.start < 12;
  const period = isAM ? '🌅' : '🌆';
  return (
    <div className={`rounded-xl border ${c.light} px-2 py-2 flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px]">{period}</span>
        <span className="text-[10px] font-black">{hours}h</span>
      </div>
      <div className="text-[11px] font-black text-center">{shift}</div>
      {/* Visual hour bar */}
      <div className="relative h-1.5 rounded-full bg-current/10 overflow-hidden">
        <div
          className={`absolute top-0 h-full rounded-full ${c.bg} opacity-70`}
          style={{
            left: `${((parsed.start - 6) / 16) * 100}%`,
            width: `${(hours / 16) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

function AgendaView({ employees, setEmployees, isMobile = false }: { employees: any[]; setEmployees: any; isMobile?: boolean }) {
  const [shiftEdit, setShiftEdit] = useState<{ empId: string; dayIdx: number; value: string } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);

  const activeEmployees = employees.filter((e: any) => e.status === 'activo');

  const saveShift = () => {
    if (!shiftEdit) return;
    setEmployees((prev: any[]) => prev.map((e: any) => {
      if (e.id !== shiftEdit.empId) return e;
      const shifts = [...(e.shifts || ['','','','','','',''])];
      shifts[shiftEdit.dayIdx] = shiftEdit.value.trim();
      return { ...e, shifts };
    }));
    toast.success('Turno actualizado.');
    setShiftEdit(null);
  };

  // Compute per-day stats
  const dayStats = scheduleWeek.map((_d, dayIdx) => {
    const working = activeEmployees.filter((e: any) => !!(e.shifts || [])[dayIdx]);
    const totalHours = working.reduce((sum: number, e: any) => {
      const parsed = parseShiftHours((e.shifts || [])[dayIdx] || '');
      return sum + (parsed ? parsed.end - parsed.start : 0);
    }, 0);
    return { working: working.length, totalHours };
  });

  const todayDayIdx = (new Date().getDay() + 6) % 7; // Mon=0

  const dayHeaderColors = [
    'from-pink-400 to-pink-600',
    'from-violet-400 to-violet-600',
    'from-sky-400 to-sky-600',
    'from-amber-400 to-amber-600',
    'from-emerald-400 to-emerald-600',
    'from-orange-400 to-orange-600',
    'from-gray-400 to-gray-500',
  ];

  const shiftModal = shiftEdit && (
    <Modal open={!!shiftEdit} onClose={() => setShiftEdit(null)} title={`Turno — ${scheduleWeek[shiftEdit.dayIdx]}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ingresa el horario (ej: <strong>8-16</strong>, <strong>12-20</strong>). Déjalo vacío para día libre.
        </p>
        <FF label="Horario">
          <input
            value={shiftEdit.value}
            onChange={e => setShiftEdit(s => s ? { ...s, value: e.target.value } : null)}
            placeholder="ej: 8-16"
            maxLength={10}
            className={iCls}
            autoFocus
          />
        </FF>
        {shiftEdit.value && parseShiftHours(shiftEdit.value) && (
          <div className="bg-muted/40 rounded-xl p-3 text-xs text-center text-muted-foreground">
            Duración: <strong className="text-foreground">{(parseShiftHours(shiftEdit.value)!.end - parseShiftHours(shiftEdit.value)!.start)}h</strong>
            {' · '}
            {parseShiftHours(shiftEdit.value)!.start < 12 ? '🌅 Mañana' : '🌆 Tarde'}
          </div>
        )}
        <ModalActions onCancel={() => setShiftEdit(null)} onSave={saveShift} saveLabel="Guardar Turno" />
      </div>
    </Modal>
  );

  if (isMobile) {
    return (
      <div className="space-y-4">
        {shiftModal}
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">Agenda Semanal</h2>
        </div>

        {/* Day pill selector */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {scheduleWeek.map((day, i) => {
            const isToday = i === todayDayIdx;
            const stat = dayStats[i];
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(i)}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-2xl border text-xs font-bold transition-all ${selectedDay === i ? 'border-primary text-primary' : isToday ? 'border-primary/30 text-primary/60' : 'border-border text-muted-foreground'}`}
                style={{ background: selectedDay === i ? 'rgba(237,73,140,0.08)' : undefined }}
              >
                <span className="font-black text-sm">{day.slice(0, 3)}</span>
                <span>{stat.working} emp</span>
                {isToday && <span className="text-[9px] font-black" style={{ color: '#ED498C' }}>HOY</span>}
              </button>
            );
          })}
        </div>

        {/* Day stats */}
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between">
          <div>
            <p className="font-black text-base">{scheduleWeek[selectedDay]}</p>
            <p className="text-xs text-muted-foreground">{dayStats[selectedDay].working} empleado(s) · {dayStats[selectedDay].totalHours}h total</p>
          </div>
          {selectedDay === todayDayIdx && <span className="text-xs font-black px-2 py-1 rounded-full" style={{ background: 'rgba(237,73,140,0.1)', color: '#ED498C' }}>HOY</span>}
        </div>

        {/* Employees for selected day */}
        <div className="space-y-3">
          {activeEmployees.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay empleados activos.</p>}
          {activeEmployees.map((emp: any, empIdx: number) => {
            const shift = (emp.shifts || [])[selectedDay] || '';
            return (
              <div key={emp.id} className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SHIFT_COLORS[empIdx % SHIFT_COLORS.length].bg}`} />
                  <Av name={emp.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm">{emp.name}{emp.apellido ? ` ${emp.apellido}` : ''}</p>
                    {emp.documento && <p className="text-xs text-muted-foreground font-mono">{emp.documento}</p>}
                    <p className="text-xs text-muted-foreground">{emp.role}</p>
                  </div>
                  <button
                    onClick={() => setShiftEdit({ empId: emp.id, dayIdx: selectedDay, value: shift })}
                    className="p-3 rounded-xl bg-primary/10 text-primary"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
                {shift ? (
                  <ShiftBar shift={shift} colorIdx={empIdx} />
                ) : (
                  <button
                    onClick={() => setShiftEdit({ empId: emp.id, dayIdx: selectedDay, value: '' })}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground font-bold flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3 h-3" /> Agregar turno
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {shiftModal}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Agenda Semanal</h2>
          <p className="text-xs text-muted-foreground">Turnos de empleados activos — haz clic en cualquier celda para editar</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-xl px-3 py-2">
          <Clock className="w-3.5 h-3.5" />
          <span>La barra indica el rango horario (6:00–22:00)</span>
        </div>
      </div>

      {/* Day summary cards */}
      <div className="grid grid-cols-7 gap-2">
        {scheduleWeek.map((day, i) => {
          const isToday = i === todayDayIdx;
          return (
            <div key={day} className={`rounded-2xl overflow-hidden shadow-sm border ${isToday ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
              <div className={`bg-gradient-to-b ${dayHeaderColors[i]} px-2 py-2.5 text-center`}>
                <p className="text-white font-black text-xs uppercase tracking-wide">{day.slice(0, 3)}</p>
                {isToday && <span className="text-[9px] bg-white/30 text-white rounded-full px-1.5 py-0.5 font-bold">HOY</span>}
              </div>
              <div className="bg-card px-2 py-2 text-center">
                <p className="font-black text-lg text-foreground leading-none">{dayStats[i].working}</p>
                <p className="text-[10px] text-muted-foreground">{dayStats[i].working === 1 ? 'empleado' : 'empleados'}</p>
                <p className="text-[10px] font-bold text-primary mt-0.5">{dayStats[i].totalHours}h total</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main grid */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        {/* Header row */}
        <div className="grid border-b border-border" style={{ gridTemplateColumns: '176px repeat(7, 1fr)' }}>
          <div className="px-4 py-3 bg-muted/50 flex items-center">
            <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">Empleado</span>
          </div>
          {scheduleWeek.map((day, i) => {
            const isToday = i === todayDayIdx;
            return (
              <div key={day} className={`px-2 py-3 text-center border-l border-border ${isToday ? 'bg-primary/5' : 'bg-muted/30'}`}>
                <p className={`text-xs font-black uppercase tracking-wide ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.slice(0, 3)}</p>
                {isToday && <div className="w-1.5 h-1.5 bg-primary rounded-full mx-auto mt-1" />}
              </div>
            );
          })}
        </div>

        {/* Employee rows */}
        {activeEmployees.map((emp: any, empIdx: number) => (
          <div key={emp.id} className={`grid border-t border-border ${empIdx % 2 === 0 ? 'bg-card' : 'bg-muted/10'}`} style={{ gridTemplateColumns: '176px repeat(7, 1fr)' }}>
            {/* Employee name column */}
            <div className="px-4 py-4 flex items-center gap-2.5 border-r border-border">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SHIFT_COLORS[empIdx % SHIFT_COLORS.length].bg}`} />
              <Av name={emp.name} size="sm" />
              <div className="min-w-0">
                <p className="font-black text-xs truncate">{emp.name}{emp.apellido ? ` ${emp.apellido}` : ''}</p>
                {emp.documento && <p className="text-[10px] text-muted-foreground font-mono truncate">{emp.documento}</p>}
                <p className="text-[10px] text-muted-foreground truncate">{emp.role}</p>
              </div>
            </div>
            {/* Day cells */}
            {scheduleWeek.map((_d, dayIdx) => {
              const shift = (emp.shifts || [])[dayIdx] || '';
              const cellKey = `${emp.id}-${dayIdx}`;
              const isToday = dayIdx === todayDayIdx;
              return (
                <div
                  key={dayIdx}
                  className={`border-l border-border p-2 cursor-pointer transition-all ${isToday ? 'bg-primary/5' : ''} ${hoveredCell === cellKey ? 'bg-primary/10' : ''}`}
                  onClick={() => setShiftEdit({ empId: emp.id, dayIdx, value: shift })}
                  onMouseEnter={() => setHoveredCell(cellKey)}
                  onMouseLeave={() => setHoveredCell(null)}
                  title={shift ? `${emp.name}${emp.apellido ? ' ' + emp.apellido : ''}: ${shift}` : 'Clic para agregar turno'}
                >
                  {shift ? (
                    <ShiftBar shift={shift} colorIdx={empIdx} />
                  ) : (
                    <div className="h-full min-h-[52px] flex items-center justify-center text-muted-foreground/30 hover:text-primary/50 transition-colors">
                      <div className="w-6 h-6 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {activeEmployees.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-bold">No hay empleados activos</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {activeEmployees.map((emp: any, i: number) => (
          <div key={emp.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`w-3 h-3 rounded-full ${SHIFT_COLORS[i % SHIFT_COLORS.length].bg}`} />
            <span className="font-bold">{emp.name}{emp.apellido ? ` ${emp.apellido}` : ''}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1"><span>🌅</span><span>Turno mañana (&lt;12h)</span></div>
          <div className="flex items-center gap-1"><span>🌆</span><span>Turno tarde (≥12h)</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── Orders View ─────────────────────────────────────────────────────────────
function OrdersView({ orders, setOrders, setSales, setClients, onNuevoPedido }: {
  orders: Order[]; setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  onNuevoPedido: () => void;
}) {
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [exportOpen, setExportOpen]     = useState(false);
  const [detailOrder, setDetailOrder]   = useState<Order | null>(null);
  const { ask, el: confirmEl }          = useConfirm();

  const orderStatusOptions = ['Apartado', 'Pendiente', 'Cancelado', 'completado'];

  const filtered = useMemo(() => orders.filter(o =>
    (filterStatus === 'Todos' || o.estado === filterStatus) &&
    (o.cliente.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()))
  ), [orders, search, filterStatus]);

  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleStatusChange = (order: Order, newStatus: string) => {
    if (newStatus === 'completado') {
      ask(`¿Convertir pedido ${order.id} en una venta completada?`, () => {
        const now    = new Date();
        const fecha  = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
        const hora   = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const saleId = `VTA${Date.now().toString().slice(-5)}`;
        const newSale: Sale = {
          id: saleId, fecha, hora, cliente: order.cliente,
          items: order.items, subtotal: order.subtotal, iva: order.iva,
          total: order.total, metodoPago: order.metodoPago, estado: 'completado',
        };
        setSales(prev => [newSale, ...prev]);
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, estado: 'completado' } : o));
        setClients(prev => {
          const idx = prev.findIndex(c => c.nombre.toLowerCase() === order.cliente.toLowerCase());
          if (idx >= 0) {
            return prev.map((c, i) => i === idx ? { ...c, cantidadCompras: c.cantidadCompras + 1, totalGastado: c.totalGastado + order.total, ultimaCompra: fecha } : c);
          }
          return [...prev, { id: `CL${String(prev.length + 1).padStart(3,'0')}`, nombre: order.cliente, cantidadCompras: 1, totalGastado: order.total, ultimaCompra: fecha }];
        });
        toast.success(`Pedido ${order.id} convertido a venta ${saleId}.`);
      });
    } else {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, estado: newStatus } : o));
      toast.success('Estado actualizado.');
    }
  };

  return (
    <div className="space-y-4">
      {confirmEl}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={(f, t) => toast.success(`Reporte exportado (${f} → ${t})`)} />

      {/* Detail Modal */}
      {detailOrder && (
        <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)} title={`Pedido ${detailOrder.id}`} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-xl p-4">
              <div><span className="text-muted-foreground">Cliente:</span> <span className="font-bold">{detailOrder.cliente}</span></div>
              <div><span className="text-muted-foreground">Documento:</span> <span className="font-bold">{detailOrder.documento || '—'}</span></div>
              <div><span className="text-muted-foreground">Fecha:</span> <span className="font-bold">{detailOrder.fecha} {detailOrder.hora}</span></div>
              <div><span className="text-muted-foreground">Método:</span> <span className="font-bold">{detailOrder.metodoPago}</span></div>
              <div><span className="text-muted-foreground">Estado:</span> <StatusBadge status={detailOrder.estado} /></div>
            </div>
            <TableWrapper>
              <thead><tr><Th>Producto</Th><Th>Cant.</Th><Th right>P. Unit.</Th><Th right>Subtotal</Th></tr></thead>
              <tbody>
                {detailOrder.items.map((item, i) => (
                  <tr key={i}><Td>{item.name}</Td><Td>{item.qty}</Td><Td right>{formatCOP(item.price)}</Td><Td right><span className="font-bold">{formatCOP(item.qty * item.price)}</span></Td></tr>
                ))}
              </tbody>
            </TableWrapper>
            <div className="flex justify-between font-black text-base border-t border-border pt-3 px-1">
              <span>TOTAL:</span><span className="text-primary">{formatCOP(detailOrder.total)}</span>
            </div>
            <button onClick={() => setDetailOrder(null)} className="w-full py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted">Cerrar</button>
          </div>
        </Modal>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Pedidos</h2>
          <p className="text-xs text-muted-foreground">Cambia el estado a "completado" para convertir un pedido en venta</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setExportOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-muted"><FileDown className="w-4 h-4" /> Exportar</button>
          <button onClick={onNuevoPedido} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nuevo Pedido</button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por cliente o ID..." className={`${iCls} pl-9`} /></div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className={`${sCls} w-44`}>
          <option value="Todos">Todos los estados</option>
          {orderStatusOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <TableWrapper>
        <thead><tr><Th>ID</Th><Th>Cliente</Th><Th>Fecha</Th><Th>Artículos</Th><Th right>Total</Th><Th>Método</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
        <tbody>
          {paged.map(o => (
            <tr key={o.id} className={`hover:bg-muted/20 ${o.estado === 'completado' ? 'opacity-60' : ''}`}>
              <Td><span className="font-mono font-bold text-xs text-primary">{o.id}</span></Td>
              <Td><div className="flex items-center gap-2"><Av name={o.cliente} size="sm" /><span className="font-bold text-sm">{o.cliente}</span></div></Td>
              <Td><div className="text-xs"><div>{o.fecha}</div><div className="text-muted-foreground">{o.hora}</div></div></Td>
              <Td><span className="bg-muted px-2 py-0.5 rounded-full text-xs font-bold">{o.items.length} ítem(s)</span></Td>
              <Td right><span className="font-black text-primary">{formatCOP(o.total)}</span></Td>
              <Td>{o.metodoPago}</Td>
              <Td>
                {o.estado !== 'completado' ? (
                  <InlineStatusSelect
                    value={o.estado}
                    options={orderStatusOptions}
                    onChange={newStatus => handleStatusChange(o, newStatus)}
                  />
                ) : <StatusBadge status={o.estado} />}
              </Td>
              <Td>
                <div className="flex items-center gap-1">
                  <button onClick={() => setDetailOrder(o)} title="Ver detalle" className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-500"><Eye className="w-3.5 h-3.5" /></button>
                  <button onClick={() => printTicket(o)} title="Imprimir ticket" className="w-8 h-8 rounded-lg hover:bg-green-50 flex items-center justify-center text-green-600"><Printer className="w-3.5 h-3.5" /></button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <Pagination page={page} total={pages} onPage={setPage} />
    </div>
  );
}

// ─── Clients View ─────────────────────────────────────────────────────────────
function ClientsView({ clients, orders }: { clients: Client[]; orders: Order[] }) {
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [exportOpen, setExportOpen] = useState(false);

  const enriched = useMemo(() => clients.map(c => ({ ...c, computedStatus: getClientStatus(c, orders) })), [clients, orders]);
  const filtered = useMemo(() => enriched.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase())), [enriched, search]);
  const pages    = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged    = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const statColors: Record<string, string> = {
    Nuevo: 'bg-blue-100 text-blue-700', Ocasional: 'bg-cyan-100 text-cyan-700',
    Frecuente: 'bg-emerald-100 text-emerald-700', Apartado: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-4">
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={(f, t) => toast.success(`Clientes exportados (${f} → ${t})`)} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Clientes</h2>
          <p className="text-xs text-muted-foreground">Clientes se crean automáticamente desde el POS</p>
        </div>
        <button onClick={() => setExportOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-muted"><FileDown className="w-4 h-4" /> Exportar</button>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar cliente..." className={`${iCls} pl-9`} /></div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['Nuevo', 'Ocasional', 'Frecuente', 'Apartado'] as const).map(s => {
          const count = enriched.filter(c => c.computedStatus === s).length;
          return (
            <div key={s} className="bg-card rounded-xl p-4 border border-border text-center">
              <p className="font-black text-2xl text-foreground">{count}</p>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold mt-1 ${statColors[s]}`}>{s}</span>
            </div>
          );
        })}
      </div>

      <TableWrapper>
        <thead><tr><Th>Cliente</Th><Th right>Compras</Th><Th right>Total Gastado</Th><Th>Última Compra</Th><Th>Estado</Th></tr></thead>
        <tbody>
          {paged.map(c => (
            <tr key={c.id} className="hover:bg-muted/20">
              <Td>
                <div className="flex items-center gap-2.5">
                  <Av name={c.nombre} />
                  <div>
                    <div className="font-bold text-sm">{c.nombre}</div>
                    <div className="text-xs text-muted-foreground">{c.documento ? `Doc: ${c.documento}` : c.id}</div>
                  </div>
                </div>
              </Td>
              <Td right><span className="font-black text-lg text-foreground">{c.cantidadCompras}</span></Td>
              <Td right><span className="font-bold text-primary">{formatCOP(c.totalGastado)}</span></Td>
              <Td><span className="text-sm">{c.ultimaCompra}</span></Td>
              <Td><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${statColors[c.computedStatus] || 'bg-gray-100 text-gray-600'}`}>{c.computedStatus}</span></Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <Pagination page={page} total={pages} onPage={setPage} />
    </div>
  );
}

// ─── Sales Register View ─────────────────────────────────────────────────────
function SalesRegisterView({ sales, setSales, products, setProducts, isMobile = false }: {
  sales: Sale[]; setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  products: any[]; setProducts: React.Dispatch<React.SetStateAction<any[]>>; isMobile?: boolean;
}) {
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [filterMethod, setFilterMethod] = useState('Todos');
  const [detailTx, setDetailTx]         = useState<Sale | null>(null);
  const [exportOpen, setExportOpen]     = useState(false);
  const [voidTarget, setVoidTarget]     = useState<Sale | null>(null);
  const [voidJustification, setVoidJustification] = useState('');
  const [voidErr, setVoidErr]           = useState('');
  const { warn, el: alertEl }           = useAlert();

  const filtered = useMemo(() => sales.filter(s =>
    (filterMethod === 'Todos' || s.metodoPago === filterMethod) &&
    (s.cliente.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
  ), [sales, search, filterMethod]);

  const pages         = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged         = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const totalFiltrado = filtered.reduce((a, s) => a + s.total, 0);

  const openVoid = (sale: Sale) => {
    if (sale.estado === 'Cancelado' && sale.justificacion) { warn('Esta venta ya fue anulada.'); return; }
    setVoidTarget(sale); setVoidJustification(''); setVoidErr('');
  };

  const confirmVoid = () => {
    if (!voidJustification.trim()) { setVoidErr('La justificación es obligatoria.'); return; }
    if (!voidTarget) return;
    setSales(prev => prev.map(s => s.id === voidTarget.id ? { ...s, estado: 'Cancelado', justificacion: voidJustification.trim() } : s));
    setProducts((prev: any[]) => prev.map((p: any) => {
      const soldItem = voidTarget.items.find((i: TxItem) => i.name.toLowerCase() === p.name.toLowerCase());
      if (!soldItem) return p;
      return { ...p, stock: p.stock + soldItem.qty };
    }));
    toast.success(`Venta ${voidTarget.id} anulada. Stock restaurado automáticamente.`);
    setVoidTarget(null);
  };

  return (
    <div className="space-y-4">
      {alertEl}
      <TransactionDetailModal tx={detailTx} onClose={() => setDetailTx(null)} onPrint={printTicket} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={(f, t) => toast.success(`Ventas exportadas (${f} → ${t})`)} />

      {/* Void Modal */}
      <Modal open={!!voidTarget} onClose={() => setVoidTarget(null)} title="Anular Venta">
        {voidTarget && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm">
              <p className="font-black text-red-700">⚠️ Esta acción es irreversible</p>
              <p className="text-red-600 text-xs mt-1">Venta <strong>{voidTarget.id}</strong> · {voidTarget.cliente} · {formatCOP(voidTarget.total)}</p>
            </div>
            <p className="text-xs text-muted-foreground">Al anular, el stock de los productos vendidos se restaurará automáticamente.</p>
            <FF label="Justificación *" err={voidErr}>
              <textarea
                value={voidJustification}
                onChange={e => { setVoidJustification(e.target.value); setVoidErr(''); }}
                placeholder="Describe el motivo de la anulación..."
                rows={3}
                className={`${iCls} resize-none`}
              />
            </FF>
            <div className="flex gap-3">
              <button onClick={() => setVoidTarget(null)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted">Cancelar</button>
              <button onClick={confirmVoid} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:opacity-90">Confirmar Anulación</button>
            </div>
          </div>
        )}
      </Modal>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Ventas</h2>
          {!isMobile && <p className="text-xs text-muted-foreground">Transacciones completadas desde el Punto de Venta</p>}
        </div>
        <button onClick={() => setExportOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-muted"><FileDown className="w-4 h-4" />{!isMobile && ' Exportar'}</button>
      </div>

      <div className={`grid gap-4 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Total</p>
          <p className="font-black text-primary text-lg">{formatCOP(totalFiltrado)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Nº Ventas</p>
          <p className="font-black text-foreground text-lg">{filtered.length}</p>
        </div>
        {!isMobile && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Ticket Promedio</p>
            <p className="font-black text-foreground text-lg">{formatCOP(filtered.length ? Math.round(totalFiltrado / filtered.length) : 0)}</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por cliente o ID..." className={`${iCls} pl-9`} /></div>
        <select value={filterMethod} onChange={e => { setFilterMethod(e.target.value); setPage(1); }} className={`${sCls} ${isMobile ? 'w-full' : 'w-48'}`}>
          <option value="Todos">Todos los métodos</option>
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia">Transferencia</option>
        </select>
      </div>

      {isMobile ? (
        <div className="space-y-3">
          {paged.map(s => {
            const isVoided = s.estado === 'Cancelado' && !!s.justificacion;
            return (
              <div key={s.id} className={`bg-card rounded-2xl border border-border p-4 ${isVoided ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-xs text-primary">{s.id}</span>
                  <span className="text-xs text-muted-foreground">{s.fecha} {s.hora}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Av name={s.cliente} size="sm" />
                  <p className="font-black text-sm">{s.cliente}</p>
                </div>
                {s.justificacion && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 mb-2">
                    <p className="text-xs text-red-600 font-bold">Anulado: {s.justificacion}</p>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.estado} />
                    <span className="font-black text-primary text-sm">{formatCOP(s.total)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDetailTx(s)} className="p-3 rounded-xl bg-blue-50 text-blue-500"><Eye className="w-4 h-4" /></button>
                    {!isVoided && (
                      <button onClick={() => openVoid(s)} className="p-3 rounded-xl bg-red-50 text-red-500"><Ban className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {paged.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No se encontraron ventas.</p>}
        </div>
      ) : (
        <TableWrapper>
          <thead><tr><Th>ID</Th><Th>Cliente</Th><Th>Fecha</Th><Th>Artículos</Th><Th right>Total</Th><Th>Método</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
          <tbody>
            {paged.map(s => {
              const isVoided = s.estado === 'Cancelado' && !!s.justificacion;
              return (
                <tr key={s.id} className={`hover:bg-muted/20 ${isVoided ? 'opacity-60' : ''}`}>
                  <Td><span className="font-mono font-bold text-xs text-primary">{s.id}</span></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Av name={s.cliente} size="sm" />
                      <div>
                        <span className="font-bold text-sm">{s.cliente}</span>
                        {s.justificacion && <div className="text-xs text-red-500 font-bold">Anulado: {s.justificacion}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td><div className="text-xs"><div>{s.fecha}</div><div className="text-muted-foreground">{s.hora}</div></div></Td>
                  <Td><span className="bg-muted px-2 py-0.5 rounded-full text-xs font-bold">{s.items.length} ítem(s)</span></Td>
                  <Td right><span className="font-black text-primary">{formatCOP(s.total)}</span></Td>
                  <Td><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.metodoPago === 'Efectivo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{s.metodoPago}</span></Td>
                  <Td><StatusBadge status={s.estado} /></Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDetailTx(s)} title="Ver detalle" className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-500"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => printTicket(s)} title="Imprimir ticket" className="w-8 h-8 rounded-lg hover:bg-green-50 flex items-center justify-center text-green-600"><Printer className="w-3.5 h-3.5" /></button>
                      {!isVoided && <button onClick={() => openVoid(s)} title="Anular venta" className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500"><Ban className="w-3.5 h-3.5" /></button>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrapper>
      )}
      <Pagination page={page} total={pages} onPage={setPage} />
    </div>
  );
}

// ─── Users View ──────────────────────────────────────────────────────────────
function UsersView({ users, setUsers }: { users: any[]; setUsers: any }) {
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [isOpen, setIsOpen]     = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm]         = useState({ name: '', tipoDocumento: 'CC', numeroDocumento: '', telefono: '', role: 'Empleado', status: 'activo' });
  const [nameErr, setNameErr]   = useState('');
  const { ask, el: confirmEl }  = useConfirm();
  const { warn, el: alertEl }   = useAlert();

  const isEditing = !!editItem;
  const blankForm = { name: '', tipoDocumento: 'CC', numeroDocumento: '', telefono: '', role: 'Empleado', status: 'activo' };

  const filtered = useMemo(() => users.filter((u: any) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.telefono || '').includes(search) ||
    (u.numeroDocumento || '').includes(search)
  ), [users, search]);
  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openEdit  = (item: any) => { setEditItem(item); setForm({ name: item.name, tipoDocumento: item.tipoDocumento || 'CC', numeroDocumento: item.numeroDocumento || '', telefono: item.telefono || '', role: item.role, status: item.status }); setNameErr(''); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setEditItem(null); setForm(blankForm); setNameErr(''); };

  const handleSave = () => {
    if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
    if (isEditing) {
      setUsers((prev: any[]) => prev.map((u: any) => u.id === editItem.id ? { ...u, ...form, name: form.name.trim() } : u));
      toast.success('Usuario actualizado.');
    } else {
      const id = `U${String(users.length + 1).padStart(3, '0')}`;
      setUsers((prev: any[]) => [{ id, ...form, name: form.name.trim(), created: new Date().toLocaleDateString('es-CO') }, ...prev]);
      toast.success('Usuario creado.'); setPage(1);
    }
    closeModal();
  };

  const handleToggle = (item: any) => {
    if (item.id === 'U001') { warn('El administrador principal no puede ser desactivado.'); return; }
    if (item.status === 'activo') {
      ask(`¿Desactivar a "${item.name}"?`, () => {
        setUsers((prev: any[]) => prev.map((u: any) => u.id === item.id ? { ...u, status: 'inactivo' } : u));
        toast.success('Usuario desactivado.');
      });
    } else {
      setUsers((prev: any[]) => prev.map((u: any) => u.id === item.id ? { ...u, status: 'activo' } : u));
      toast.success('Usuario activado.');
    }
  };

  const tipoDocOpts = ['CC', 'CE', 'PA', 'TI', 'NIT'];

  return (
    <div className="space-y-4">
      {confirmEl}{alertEl}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg">Gestión de Usuarios</h2>
        <button onClick={() => { setEditItem(null); setForm(blankForm); setNameErr(''); setIsOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90"><Plus className="w-4 h-4" /> Nuevo</button>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar usuario..." className={`${iCls} pl-9`} /></div>
      <TableWrapper>
        <thead><tr><Th>Usuario</Th><Th>Teléfono</Th><Th>Rol</Th><Th>Estado</Th><Th>Creado</Th><Th>Acciones</Th></tr></thead>
        <tbody>
          {paged.map(u => (
            <tr key={u.id} className="hover:bg-muted/20">
              <Td>
                <div className="flex items-center gap-2.5">
                  <Av name={u.name} size="sm" />
                  <div>
                    <div className="font-bold text-sm">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.tipoDocumento}: {u.numeroDocumento || '—'}</div>
                  </div>
                </div>
              </Td>
              <Td><span className="font-mono text-xs">{u.telefono || '—'}</span></Td>
              <Td><span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${u.role === 'Administrador' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span></Td>
              <Td><ToggleSwitch checked={u.status === 'activo'} onChange={() => handleToggle(u)} /></Td>
              <Td><span className="text-xs text-muted-foreground">{u.created}</span></Td>
              <Td><button onClick={() => openEdit(u)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button></Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <Pagination page={page} total={pages} onPage={setPage} />

      <Modal open={isOpen} onClose={closeModal} title={isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}>
        <div className="space-y-4">
          <FF label="Nombre Completo *" err={nameErr}><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={30} className={iCls} /></FF>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Tipo de Documento">
              <select value={form.tipoDocumento} onChange={e => setForm(f => ({ ...f, tipoDocumento: e.target.value }))} className={sCls}>
                {tipoDocOpts.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FF>
            <FF label="Número de Documento"><input value={form.numeroDocumento} onChange={e => setForm(f => ({ ...f, numeroDocumento: e.target.value }))} maxLength={15} className={iCls} /></FF>
          </div>
          <FF label="Teléfono"><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} maxLength={15} placeholder="ej: 310-000-0000" className={iCls} /></FF>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Rol">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={sCls}>
                <option value="Administrador">Administrador</option>
                <option value="Empleado">Empleado</option>
              </select>
            </FF>
            <FF label="Estado">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={sCls}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </FF>
          </div>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={isEditing ? 'Actualizar' : 'Crear Usuario'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Roles View ───────────────────────────────────────────────────────────────
function RolesView({ roles, setRoles }: { roles: any[]; setRoles: any }) {
  const [editItem, setEditItem]   = useState<any>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [form, setForm]           = useState({ name: '', desc: '', status: 'activo', perms: {} as Record<string, boolean>, privs: {} as Record<string, string[]> });
  const [nameErr, setNameErr]     = useState('');
  const { ask, el: confirmEl }    = useConfirm();

  const allPerms = ['Dashboard', 'Roles', 'Gestión de Usuarios', 'Categoría de Productos', 'Gestión de Productos', 'Proveedores', 'Gestión de Compras', 'Categoría de Servicios', 'Gestión de Servicios', 'Empleados', 'Agenda', 'Pedidos', 'Clientes', 'Ventas'];

  const permPrivileges: Record<string, string[]> = {
    'Roles': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Gestión de Usuarios': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Categoría de Productos': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Gestión de Productos': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Proveedores': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Gestión de Compras': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Categoría de Servicios': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Gestión de Servicios': ['Crear', 'Editar', 'Cambiar de Estado'],
    'Empleados': ['Editar', 'Cambiar de Estado'],
    'Agenda': ['Crear', 'Editar'],
    'Pedidos': ['Crear', 'Cambiar de Estado'],
    'Ventas': ['Cambiar de Estado']
  };

  const toggleRoleStatus = (role: any) => {
    setRoles((prev: any[]) => prev.map((r: any) => r.id === role.id ? { ...r, status: r.status === 'activo' ? 'inactivo' : 'activo' } : r));
    toast.success(`Rol "${role.name}" ${role.status === 'activo' ? 'desactivado' : 'activado'}.`);
  };
  const blankForm = { name: '', desc: '', status: 'activo', perms: {} as Record<string, boolean>, privs: {} as Record<string, string[]> };

  const openEdit = (role: any) => { setEditItem(role); setForm({ name: role.name, desc: role.desc, status: role.status, perms: { ...role.perms }, privs: { ...(role.privs || {}) } }); setNameErr(''); setIsNewOpen(true); };
  const closeModal = () => { setEditItem(null); setIsNewOpen(false); setForm(blankForm); setNameErr(''); };

  const handleSave = () => {
    if (!editItem) {
      if (!form.name.trim()) { setNameErr('El nombre es obligatorio.'); return; }
      if (roles.some((r: any) => r.name.toLowerCase() === form.name.toLowerCase())) { setNameErr('Ya existe un rol con ese nombre.'); return; }
      const id = `ROL${String(roles.length + 1).padStart(3, '0')}`;
      setRoles((prev: any[]) => [...prev, { id, ...form, name: form.name.trim() }]);
      toast.success('Rol creado.');
      closeModal();
    } else {
      ask(`¿Guardar cambios al rol "${editItem.name}"?`, () => {
        setRoles((prev: any[]) => prev.map((r: any) => r.id === editItem.id ? { ...r, desc: form.desc, status: form.status, perms: form.perms, privs: form.privs } : r));
        toast.success('Rol actualizado.');
        closeModal();
      });
    }
  };

  const togglePerm = (p: string) => setForm(f => ({ ...f, perms: { ...f.perms, [p]: !f.perms[p] } }));

  const roleColors: Record<string, string> = {
    Administrador: 'bg-purple-100 text-purple-600',
    Empleado:      'bg-blue-100 text-blue-600',
  };

  return (
    <div className="space-y-4">
      {confirmEl}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Roles</h2>
          <p className="text-xs text-muted-foreground">Gestión de roles y asignación de permisos del sistema</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm(blankForm); setNameErr(''); setIsNewOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
          <Plus className="w-4 h-4" /> Nuevo Rol
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {roles.map(role => {
          const colorCls = roleColors[role.name] || 'bg-gray-100 text-gray-600';
          return (
            <div key={role.id} className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorCls.split(' ')[0]}`}>
                      <Lock className={`w-4 h-4 ${colorCls.split(' ')[1]}`} />
                    </div>
                    <h3 className="font-black text-base">{role.name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">{role.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ToggleSwitch checked={role.status === 'activo'} onChange={() => toggleRoleStatus(role)} />
                  <button onClick={() => openEdit(role)} className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center text-primary"><Edit2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Permisos asignados</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {allPerms.map(p => (
                    <div key={p} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${role.perms[p] ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                      {role.perms[p] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {p}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / New Modal */}
      <Modal open={!!editItem || isNewOpen} onClose={closeModal} title={editItem ? `Editar Rol — ${editItem.name}` : 'Nuevo Rol'}>
        <div className="space-y-4">
          {!editItem && (
            <FF label="Nombre del Rol *" err={nameErr}>
              <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameErr(''); }} maxLength={30} placeholder="ej: Supervisor" className={iCls} />
            </FF>
          )}
          <FF label="Descripción"><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} maxLength={60} className={iCls} /></FF>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground mb-3">Permisos de Acceso</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {allPerms.map(p => (
                <div key={p} className={`flex flex-col gap-2 px-3 py-2 rounded-xl border transition-all ${form.perms[p] ? 'bg-primary/5 border-primary/30' : 'bg-muted border-transparent'}`}>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={!!form.perms[p]} onChange={() => togglePerm(p)} className="sr-only" />
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${form.perms[p] ? 'bg-primary' : 'bg-border'}`}>
                      {form.perms[p] && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className={`text-sm font-bold ${form.perms[p] ? 'text-primary' : 'text-muted-foreground'}`}>{p}</span>
                  </label>
                  {form.perms[p] && permPrivileges[p] && (
                    <div className="ml-6 flex flex-wrap gap-2 mt-1 mb-1">
                      {permPrivileges[p].map(priv => {
                        const isChecked = form.privs[p]?.includes(priv);
                        return (
                          <label key={priv} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer border text-xs font-bold transition-all ${isChecked ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-muted-foreground hover:bg-muted'}`}>
                            <input type="checkbox" checked={isChecked} onChange={() => {
                              const curr = form.privs[p] || [];
                              const next = isChecked ? curr.filter(x => x !== priv) : [...curr, priv];
                              setForm(f => ({ ...f, privs: { ...f.privs, [p]: next } }));
                            }} className="sr-only" />
                            <div className={`w-3 h-3 rounded-sm flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-primary' : 'bg-border'}`}>
                              {isChecked && <Check className="w-2 h-2 text-white" />}
                            </div>
                            {priv}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <ModalActions onCancel={closeModal} onSave={handleSave} saveLabel={editItem ? 'Guardar Cambios' : 'Crear Rol'} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Mobile Components ───────────────────────────────────────────────────────
const mobileNavTabs = [
  { id: 'sales-register', label: 'Ventas',    icon: BookOpen     },
  { id: 'products',       label: 'Productos', icon: Package2     },
  { id: 'purchases',      label: 'Compras',   icon: ShoppingCart },
  { id: 'employees',      label: 'Empleados', icon: Users        },
  { id: 'agenda',         label: 'Agenda',    icon: CalendarDays },
];

const mobileViewLabels: Record<string, string> = {
  'sales-register': 'Registro de Ventas',
  products:         'Gestión de Productos',
  purchases:        'Gestión de Compras',
  employees:        'Empleados',
  agenda:           'Agenda',
};

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [err, setErr]           = useState('');
  const [recovery, setRecovery] = useState(false);
  const [recEmail, setRecEmail] = useState('');
  const [recSent, setRecSent]   = useState(false);

  const handleLogin = () => {
    if (!email.trim() || !password) { setErr('Ingresa tu correo y contraseña.'); return; }
    if (password !== '1234') { setErr('Contraseña incorrecta. (Demo: 1234)'); return; }
    onLogin();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: '#FAF8FD' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#ED498C' }}>
            <SBag className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-black text-2xl" style={{ color: '#2D1B69' }}>PRIGMA</h1>
          <p className="text-sm text-muted-foreground">Variedades Carito</p>
        </div>

        {!recovery ? (
          <div className="space-y-4">
            <h2 className="font-black text-xl text-center" style={{ color: '#2D1B69' }}>Iniciar Sesión</h2>
            {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}
            <FF label="Correo electrónico">
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="usuario@variedades.co" className={iCls} />
            </FF>
            <FF label="Contraseña">
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••" className={`${iCls} pr-10`} />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FF>
            <button onClick={handleLogin} className="w-full py-3 rounded-xl font-black text-white text-sm" style={{ background: '#ED498C' }}>
              Ingresar
            </button>
            <button onClick={() => { setRecovery(true); setErr(''); }} className="w-full text-center text-sm font-bold" style={{ color: '#2D1B69' }}>
              ¿Olvidaste tu contraseña?
            </button>
            <p className="text-center text-xs text-muted-foreground">Demo: cualquier correo + contraseña <strong>1234</strong></p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-black text-xl text-center" style={{ color: '#2D1B69' }}>Recuperar Contraseña</h2>
            {recSent ? (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-4 text-center">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2" />
                Revisa tu correo <strong>{recEmail}</strong> con las instrucciones.
              </div>
            ) : (
              <FF label="Correo electrónico">
                <input type="email" value={recEmail} onChange={e => setRecEmail(e.target.value)} placeholder="usuario@variedades.co" className={iCls} />
              </FF>
            )}
            {!recSent && (
              <button onClick={() => { if (recEmail.trim()) { setRecSent(true); } }} className="w-full py-3 rounded-xl font-black text-white text-sm" style={{ background: '#ED498C' }}>
                Enviar instrucciones
              </button>
            )}
            <button onClick={() => { setRecovery(false); setRecSent(false); setRecEmail(''); }} className="w-full text-center text-sm font-bold" style={{ color: '#2D1B69' }}>
              ← Volver al inicio de sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileHeader({ viewId, onLogout }: { viewId: string; onLogout: () => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 border-b border-border" style={{ background: '#FAF8FD' }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ED498C' }}>
          <SBag className="w-4 h-4 text-white" />
        </div>
        <span className="font-black text-sm" style={{ color: '#2D1B69' }}>PRIGMA</span>
      </div>
      <span className="font-bold text-sm text-muted-foreground">{mobileViewLabels[viewId] || 'PRIGMA'}</span>
      <button onClick={onLogout} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
        <LogOut className="w-4 h-4" />
      </button>
    </header>
  );
}

function MobileBottomNav({ currentView, setCurrentView }: { currentView: string; setCurrentView: (v: string) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border flex" style={{ background: '#FAF8FD' }}>
      {mobileNavTabs.map(tab => {
        const active = currentView === tab.id;
        return (
          <button key={tab.id} onClick={() => setCurrentView(tab.id)} className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5">
            <tab.icon className="w-5 h-5" style={{ color: active ? '#ED498C' : '#94a3b8' }} />
            <span className="text-[10px] font-bold" style={{ color: active ? '#ED498C' : '#94a3b8' }}>{tab.label}</span>
            {active && <div className="w-4 h-0.5 rounded-full mt-0.5" style={{ background: '#ED498C' }} />}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ currentView, setCurrentView, onLogout }: { currentView: string; setCurrentView: (v: string) => void; onLogout: () => void }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="w-64 bg-sidebar border-r border-border flex flex-col h-screen sticky top-0 flex-shrink-0">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <SBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-black text-sm text-foreground leading-none">PRIGMA</p>
            <p className="text-xs text-muted-foreground">Variedades Carito</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map(section => (
          <div key={section.id}>
            <button onClick={() => toggle(section.id)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-muted transition-colors text-left group">
              <section.icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
              <span className="flex-1 text-xs font-black text-muted-foreground group-hover:text-foreground uppercase tracking-wide">{section.label}</span>
              {openSections[section.id] ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </button>
            {openSections[section.id] && section.children && (
              <div className="ml-3 mt-1 space-y-0.5 pl-3 border-l-2 border-border">
                {section.children.map(child => (
                  <button key={child.id} onClick={() => setCurrentView(child.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left ${currentView === child.id ? 'bg-sidebar-accent text-sidebar-accent-foreground font-black' : 'text-muted-foreground hover:bg-muted hover:text-foreground font-bold'}`}>
                    <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs">{child.label}</span>
                    {currentView === child.id && <ArrowUpRight className="w-3 h-3 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Av name="Admin Principal" size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate">Admin Principal</p>
            <p className="text-[10px] text-muted-foreground">Administrador</p>
          </div>
          <button onClick={onLogout} title="Cerrar sesión" className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"><LogOut className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </aside>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
const mobileAllowedViews = ['sales-register', 'products', 'purchases', 'employees', 'agenda'];

export default function App() {
  const isMobile                              = useMediaQuery('(max-width: 768px)');
  const [isLoggedIn, setIsLoggedIn]           = useState(false);
  const [currentView, setCurrentView]         = useState('dashboard-main');
  const [toasts, setToasts]                   = useState<ToastItem[]>([]);
  const toastCounter                          = useRef(0);

  _addToast = (msg, type = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, msg, type: type as 'success' | 'error' }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  const [products,          setProducts]          = useLocalStorage<any[]>('prigma_products', initProducts);
  const [buyCategories,     setBuyCategories]     = useLocalStorage('prigma_buyCategories', initBuyCategories);
  const [suppliers,         setSuppliers]         = useLocalStorage('prigma_suppliers', initSuppliers);
  const [purchases,         setPurchases]         = useLocalStorage<Purchase[]>('prigma_purchases', initPurchases);
  const [serviceCategories, setServiceCategories] = useLocalStorage('prigma_serviceCategories', initServiceCategories);
  const [services,          setServices]          = useLocalStorage('prigma_services', initServices);
  const [employees,         setEmployees]         = useLocalStorage('prigma_employees', initEmployees);
  const [roles,             setRoles]             = useLocalStorage('prigma_roles', initRoles);
  const [users,             setUsers]             = useLocalStorage('prigma_users', initUsers);
  const [clients,           setClients]           = useLocalStorage<Client[]>('prigma_clients', initClients);
  const [sales,             setSales]             = useLocalStorage<Sale[]>('prigma_sales', initSales);
  const [orders,            setOrders]            = useLocalStorage<Order[]>('prigma_orders', initOrders);

  useEffect(() => {
    if (isMobile && !mobileAllowedViews.includes(currentView)) {
      setCurrentView('sales-register');
    }
  }, [isMobile]);

  const viewMeta: Record<string, string> = {
    'dashboard-main': 'MEDICIÓN Y DESEMPEÑO',
    roles: 'CONFIGURACIÓN',
    users: 'USUARIOS',
    'buy-categories': 'COMPRAS', products: 'COMPRAS', suppliers: 'COMPRAS', purchases: 'COMPRAS',
    'service-categories': 'SERVICIOS', services: 'SERVICIOS', employees: 'SERVICIOS', agenda: 'SERVICIOS',
    pos: 'VENTAS', orders: 'VENTAS', clients: 'VENTAS', 'sales-register': 'VENTAS',
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard-main':      return <DashboardView sales={sales} orders={orders} />;
      case 'pos':                 return <POSView sales={sales} setSales={setSales} orders={orders} setOrders={setOrders} clients={clients} setClients={setClients} />;
      case 'products':            return <ProductsView products={products} setProducts={setProducts} categories={buyCategories} isMobile={isMobile} />;
      case 'buy-categories':      return <BuyCategoriesView categories={buyCategories} setCategories={setBuyCategories} products={products} />;
      case 'suppliers':           return <SuppliersView suppliers={suppliers} setSuppliers={setSuppliers} />;
      case 'purchases':           return <PurchasesView purchases={purchases} setPurchases={setPurchases} suppliers={suppliers} isMobile={isMobile} />;
      case 'service-categories':  return <ServiceCategoriesView categories={serviceCategories} setCategories={setServiceCategories} services={services} />;
      case 'services':            return <ServicesView services={services} setServices={setServices} serviceCategories={serviceCategories} />;
      case 'employees':           return <EmployeesView employees={employees} setEmployees={setEmployees} roles={roles} sales={sales} isMobile={isMobile} />;
      case 'agenda':              return <AgendaView employees={employees} setEmployees={setEmployees} isMobile={isMobile} />;
      case 'orders':              return <OrdersView orders={orders} setOrders={setOrders} setSales={setSales} setClients={setClients} onNuevoPedido={() => setCurrentView('pos')} />;
      case 'clients':             return <ClientsView clients={clients} orders={orders} />;
      case 'sales-register':      return <SalesRegisterView sales={sales} setSales={setSales} products={products} setProducts={setProducts} isMobile={isMobile} />;
      case 'users':               return <UsersView users={users} setUsers={setUsers} />;
      case 'roles':               return <RolesView roles={roles} setRoles={setRoles} />;
      default:                    return <DashboardView sales={sales} orders={orders} />;
    }
  };

  // ── Login gate (both mobile and desktop) ───────────────────────────────────
  if (!isLoggedIn) {
    return (
      <>
        <LoginScreen onLogin={() => setIsLoggedIn(true)} />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <MobileHeader viewId={currentView} onLogout={() => setIsLoggedIn(false)} />
        <main className="pt-14 pb-20 px-4 overflow-auto min-h-screen">
          {renderView()}
        </main>
        <MobileBottomNav currentView={currentView} setCurrentView={setCurrentView} />
        <ToastContainer toasts={toasts} />
      </div>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background font-sans">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} onLogout={() => setIsLoggedIn(false)} />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between flex-shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{viewMeta[currentView] || 'PRIGMA'}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-black text-foreground capitalize">
              {navItems.flatMap(n => n.children || []).find(c => c.id === currentView)?.label || currentView}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </button>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto">
          {renderView()}
        </div>
      </main>
      <ToastContainer toasts={toasts} />
    </div>
  );
}
