// El catálogo compartido vive en productos.json; localStorage solo guarda el carrito.
const NUMERO_WHATSAPP = "595985496660";
const CLAVE_CARRITO = "cases4you-carrito-v2";
const CLAVE_ANTERIOR = "cases4you-carrito-v1";
const IDS_ANTERIORES = { "case-1": 1, "case-2": 2, "case-3": 3,
  "accesorio-1": 4, "accesorio-2": 5, "accesorio-3": 6 };
let PRODUCTOS = [];
let catalogoListo = false;
let avisoRevision = "";

function comprable(producto) {
  return producto && producto.estado === "publicado" && producto.disponibilidad === "activo";
}

// Solo permitimos imágenes HTTPS o rutas relativas del propio sitio.
function imagenPermitida(ruta) {
  if (typeof ruta !== "string" || !ruta.trim()) return false;
  try {
    const url = new URL(ruta, window.location.href);
    return !url.username && !url.password && (url.protocol === "https:" ||
      (!/^[a-z][a-z0-9+.-]*:|^[/\\]/i.test(ruta) && url.origin === window.location.origin));
  } catch (error) { return false; }
}

// Rechazamos el archivo completo si está mal formado: un error no equivale a borrar productos.
function validarCatalogo(datos) {
  if (!Array.isArray(datos)) throw new Error("El catálogo debe ser una lista.");
  const ids = new Set();
  datos.forEach(function (producto) {
    if (!producto || !Number.isSafeInteger(producto.id) || producto.id < 1 || ids.has(producto.id) ||
        typeof producto.nombre !== "string" || !producto.nombre.trim() ||
        !(producto.precio === null && producto.estado !== "publicado") && (!Number.isSafeInteger(producto.precio) || producto.precio <= 0) ||
        !["cases", "accesorios"].includes(producto.categoria) ||
        typeof producto.descripcion !== "string" ||
        !(producto.imagenUrl === "" && producto.estado !== "publicado") && !imagenPermitida(producto.imagenUrl) ||
        (producto.estado === "publicado" && !producto.descripcion.trim()) ||
        !["borrador", "publicado", "pausado", "archivado"].includes(producto.estado) ||
        !["activo", "agotado"].includes(producto.disponibilidad) ||
        !Array.isArray(producto.modelos) ||
        producto.modelos.some(function (modelo) { return typeof modelo !== "string" || !modelo.trim(); }) ||
        new Set(producto.modelos).size !== producto.modelos.length) {
      throw new Error("Hay un producto con campos inválidos o un ID repetido.");
    }
    ids.add(producto.id);
  });
  return datos;
}
const ARCHIVO_LOCAL = window.location.protocol === "file:";

function buscarProducto(id) {
  return PRODUCTOS.find(function (producto) { return producto.id === id; });
}

function dinero(valor) {
  return valor.toLocaleString("es-PY", { maximumFractionDigits: 0 }) + " Gs.";
}

// Validamos lo que llega desde el navegador antes de usarlo.
function normalizarCarrito(datos) {
  const limpio = [];
  if (!Array.isArray(datos)) return limpio;
  let retirados = false;
  datos.slice(0, 100).forEach(function (fila) {
    if (!fila || typeof fila !== "object") return;
    const producto = buscarProducto(fila.id);
    if (!comprable(producto)) { retirados = true; return; }
    if (!Number.isInteger(fila.cantidad) || fila.cantidad < 1) return;
    const modeloValido = producto.modelos.length
      ? producto.modelos.includes(fila.modelo) : fila.modelo === "";
    if (!modeloValido) { retirados = true; return; }
    const existente = limpio.find(function (item) {
      return item.id === fila.id && item.modelo === fila.modelo;
    });
    const cantidad = Math.min(fila.cantidad, 99);
    if (existente) existente.cantidad = Math.min(existente.cantidad + cantidad, 99);
    else limpio.push({ id: fila.id, modelo: fila.modelo, cantidad: cantidad });
  });
  if (retirados) avisoRevision = "Se quitaron del carrito productos o modelos que ya no están disponibles en el catálogo actual.";
  return limpio;
}

function leerCarrito() {
  try {
    const actual = localStorage.getItem(CLAVE_CARRITO);
    const texto = actual === null ? localStorage.getItem(CLAVE_ANTERIOR) : actual;
    if (!texto || texto.length > 12000) return [];
    let datos = JSON.parse(texto);
    if (actual === null && Array.isArray(datos)) {
      datos = datos.map(function (fila) {
        return fila && { id: IDS_ANTERIORES[fila.id], modelo: fila.modelo, cantidad: fila.cantidad };
      });
    }
    return normalizarCarrito(datos);
  } catch (error) {
    return normalizarCarrito(carrito);
  }
}

function totalPedido(items) {
  return items.reduce(function (total, fila) {
    return total + buscarProducto(fila.id).precio * fila.cantidad;
  }, 0);
}

function crearMensaje(items) {
  if (!items.length) return "";
  const lineas = [
    "Hola Cases4You 👋", "",
    "Me interesan estos productos:", ""
  ];
  items.forEach(function (fila, indice) {
    const producto = buscarProducto(fila.id);
    lineas.push((indice + 1) + ". " + producto.nombre);
    if (fila.modelo) lineas.push("Modelo: " + fila.modelo);
    lineas.push(
      "Cantidad: " + fila.cantidad,
      "Precio unitario: " + dinero(producto.precio),
      "Subtotal: " + dinero(producto.precio * fila.cantidad), ""
    );
  });
  lineas.push("Total de referencia: " + dinero(totalPedido(items)), "", "¿Están disponibles?");
  return lineas.join("\n");
}

function enlaceWhatsApp(items) {
  if (!catalogoListo || !items.length || !/^[1-9]\d{6,14}$/.test(NUMERO_WHATSAPP)) return "";
  return "https://wa.me/" + NUMERO_WHATSAPP + "?text=" + encodeURIComponent(crearMensaje(items));
}

let carrito = [];

// 2. Guardar es opcional: el carrito sigue funcionando si el navegador lo bloquea.
function guardarCarrito() {
  const texto = JSON.stringify(carrito);
  try {
    localStorage.setItem(CLAVE_CARRITO, texto);
  } catch (error) {
    // Se conserva en memoria durante esta visita.
  }
}

// 3. La misma plantilla sirve para la portada y para cada categoría.
function mostrarProductos() {
  const lista = document.getElementById("lista-productos");
  const plantilla = document.getElementById("plantilla-producto");
  const categoria = lista.dataset.categoria;
  lista.replaceChildren();
  PRODUCTOS.filter(function (producto) {
    return producto.estado === "publicado" && (categoria === "todos" || producto.categoria === categoria);
  }).forEach(function (producto) {
    const ficha = plantilla.content.firstElementChild.cloneNode(true);
    ficha.dataset.busqueda = normalizarBusqueda([producto.nombre, producto.descripcion, ...producto.modelos].join(" "));
    const imagen = ficha.querySelector(".producto-imagen");
    imagen.alt = producto.nombre;
    imagen.onerror = function () {
      imagen.onerror = null; // Evita un bucle si también falta la imagen de respaldo.
      imagen.src = "images/logo-cases4you.jpg";
      imagen.alt = "Foto no disponible: " + producto.nombre;
      ficha.querySelector(".producto-foto span").hidden = false;
    };
    imagen.src = producto.imagenUrl;
    ficha.querySelector(".producto-foto span").hidden = true;
    if (!comprable(producto)) {
      ficha.querySelector(".disponibilidad").textContent = "Agotado";
      ficha.querySelector('button[type="submit"]').remove();
      ficha.querySelector("select").disabled = true;
    }
    ficha.querySelector(".producto-categoria").textContent = producto.categoria === "cases" ? "Cases" : "Accesorios";
    ficha.querySelector(".producto-nombre").textContent = producto.nombre;
    ficha.querySelector(".producto-descripcion").textContent = producto.descripcion;
    ficha.querySelector(".precio").textContent = dinero(producto.precio);
    const selector = ficha.querySelector("select");
    selector.id = "modelo-" + producto.id;
    ficha.querySelector("label").setAttribute("for", selector.id);
    if (producto.modelos.length) {
      producto.modelos.forEach(function (modelo) {
        const opcion = document.createElement("option");
        opcion.value = modelo;
        opcion.textContent = modelo;
        selector.append(opcion);
      });
    } else {
      ficha.querySelector(".campo-modelo").remove();
    }
    const formulario = ficha.querySelector("form");
    formulario.setAttribute("aria-label", "Agregar " + producto.nombre);
    formulario.addEventListener("submit", function (evento) {
      evento.preventDefault();
      if (producto.modelos.length && !selector.reportValidity()) return;
      agregarProducto(producto.id, producto.modelos.length ? selector.value : "");
    });
    lista.append(ficha);
  });
  filtrarProductos();
}

let temporizadorAviso;
function avisar(texto) {
  const aviso = document.getElementById("aviso-carrito");
  aviso.textContent = texto;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(function () { aviso.textContent = ""; }, 4500);
}

// 4. Agrupamos solo cuando coinciden tanto el producto como el modelo.
function agregarProducto(id, modelo) {
  const producto = buscarProducto(id);
  if (!catalogoListo || !comprable(producto) ||
      (producto.modelos.length ? !producto.modelos.includes(modelo) : modelo !== "")) return;
  const fila = carrito.find(function (item) { return item.id === id && item.modelo === modelo; });
  if (fila && fila.cantidad === 99) {
    avisar("El límite por pedido es de 99 unidades por modelo.");
    return;
  }
  if (fila) fila.cantidad += 1;
  else carrito.push({ id: id, modelo: modelo, cantidad: 1 });
  actualizarCarrito();
  avisar(buscarProducto(id).nombre + " agregado al carrito.");
}

function cambiarCantidad(id, modelo, cambio) {
  if (!catalogoListo) return;
  const fila = carrito.find(function (item) { return item.id === id && item.modelo === modelo; });
  if (!fila) return;
  fila.cantidad = Math.max(1, Math.min(99, fila.cantidad + cambio));
  actualizarCarrito();
}

function quitarProducto(id, modelo) {
  if (!catalogoListo) return;
  carrito = carrito.filter(function (fila) { return fila.id !== id || fila.modelo !== modelo; });
  actualizarCarrito();
}

// 5. Redibujar el carrito actualiza también el total, contador y mensaje.
const panelCarrito = document.getElementById("carrito");
const listaCarrito = document.getElementById("lista-carrito");
const mensajePedido = document.getElementById("mensaje-pedido");
const botonWhatsApp = document.getElementById("continuar-whatsapp");
const botonCopiar = document.getElementById("copiar-mensaje");
const estadoCarrito = document.getElementById("estado-carrito");

function actualizarCarrito(guardar = true) {
  const enfocado = document.activeElement;
  const restaurarFoco = listaCarrito.contains(enfocado);
  const posicionAnterior = panelCarrito.scrollTop;
  const filaAnterior = enfocado.closest ? enfocado.closest(".linea-carrito") : null;
  const indiceAnterior = Array.from(listaCarrito.children).indexOf(filaAnterior);
  const claveAnterior = enfocado.dataset ? enfocado.dataset.clave : "";
  const accionAnterior = enfocado.dataset ? enfocado.dataset.accion : "";
  listaCarrito.replaceChildren();
  carrito.forEach(function (fila) {
    const producto = buscarProducto(fila.id);
    const elemento = document.getElementById("plantilla-linea-carrito").content.firstElementChild.cloneNode(true);
    const clave = fila.id + "|" + fila.modelo;
    elemento.querySelector(".linea-nombre").textContent = producto.nombre;
    elemento.querySelector(".linea-modelo").textContent = fila.modelo ? "Modelo: " + fila.modelo : "Opción única";
    elemento.querySelector(".linea-precio").textContent = dinero(producto.precio) + " por unidad";
    elemento.querySelector(".unidades").textContent = fila.cantidad;
    elemento.querySelector(".linea-subtotal").textContent = "Subtotal: " + dinero(producto.precio * fila.cantidad);
    const nombreAccesible = producto.nombre + (fila.modelo ? ", " + fila.modelo : "");
    ["restar", "sumar", "quitar"].forEach(function (accion) {
      const boton = elemento.querySelector("." + accion);
      boton.dataset.clave = clave;
      boton.dataset.accion = accion;
      const etiqueta = { restar: "Restar una unidad de ", sumar: "Sumar una unidad de ", quitar: "Quitar " };
      boton.setAttribute("aria-label", etiqueta[accion] + nombreAccesible);
      boton.disabled = (accion === "restar" && fila.cantidad === 1) || (accion === "sumar" && fila.cantidad === 99);
      boton.addEventListener("click", function () {
        if (accion === "quitar") quitarProducto(fila.id, fila.modelo);
        else cambiarCantidad(fila.id, fila.modelo, accion === "sumar" ? 1 : -1);
      });
    });
    listaCarrito.append(elemento);
  });
  const unidades = carrito.reduce(function (total, fila) { return total + fila.cantidad; }, 0);
  document.querySelectorAll("[data-contador]").forEach(function (contador) { contador.textContent = unidades; });
  document.querySelector(".boton-carrito").setAttribute("aria-label",
    "Abrir carrito, " + unidades + (unidades === 1 ? " producto" : " productos"));
  document.getElementById("carrito-vacio").hidden = carrito.length > 0;
  document.getElementById("total-carrito").textContent = dinero(totalPedido(carrito));
  mensajePedido.value = crearMensaje(carrito);
  botonCopiar.disabled = carrito.length === 0;
  botonWhatsApp.disabled = !enlaceWhatsApp(carrito);
  document.getElementById("configuracion-whatsapp").textContent = /^[1-9]\d{6,14}$/.test(NUMERO_WHATSAPP)
    ? "WhatsApp abrirá el mensaje preparado. Vos decidís cuándo enviarlo."
    : "Falta configurar el número de Cases4You. Mientras tanto, podés revisar y copiar el mensaje de prueba.";
  document.getElementById("revision-carrito").textContent = avisoRevision;
  estadoCarrito.textContent = "";
  if (guardar) guardarCarrito();
  // Al quitar una fila, seguimos en la vecina sin saltar al principio de la lista.
  if (restaurarFoco) {
    const destino = Array.from(listaCarrito.querySelectorAll("button")).find(function (boton) {
      return boton.dataset.clave === claveAnterior && boton.dataset.accion === accionAnterior && !boton.disabled;
    });
    const filaVecina = listaCarrito.children[Math.min(indiceAnterior, listaCarrito.children.length - 1)];
    const controlVecino = filaVecina ? filaVecina.querySelector(".quitar") : null;
    (destino || controlVecino || document.getElementById("cerrar-carrito")).focus({ preventScroll: true });
    panelCarrito.scrollTop = posicionAnterior;
  }
}

// 6. HTML abre el menú; JavaScript lo cierra al salir o presionar Escape.
const menuNavegacion = document.getElementById("menu-navegacion");
const botonMenu = menuNavegacion.querySelector("summary");
// Al ampliar la ventana, cerramos el desplegable que CSS pasa a ocultar.
const vistaEscritorio = window.matchMedia("(min-width: 800px)");
vistaEscritorio.addEventListener("change", function (evento) {
  if (evento.matches) menuNavegacion.open = false;
});
document.addEventListener("click", function (evento) {
  if (!menuNavegacion.contains(evento.target) || evento.target.closest(".opciones-menu a")) {
    menuNavegacion.open = false;
  }
});
document.addEventListener("keydown", function (evento) {
  if (evento.key === "Escape" && menuNavegacion.open) {
    menuNavegacion.open = false;
    botonMenu.focus();
    evento.preventDefault();
  }
});
menuNavegacion.addEventListener("focusout", function (evento) {
  if (evento.relatedTarget && !menuNavegacion.contains(evento.relatedTarget)) {
    menuNavegacion.open = false;
  }
});

// 7. El panel nativo puede cerrarse con su botón o con Escape.
let botonQueAbrio;
document.querySelectorAll("[data-abrir-carrito]").forEach(function (boton) {
  boton.addEventListener("click", function () {
    menuNavegacion.open = false;
    botonQueAbrio = boton;
    panelCarrito.showModal();
    document.body.classList.add("carrito-abierto");
  });
});
document.getElementById("cerrar-carrito").addEventListener("click", function () { panelCarrito.close(); });
panelCarrito.addEventListener("close", function () {
  document.body.classList.remove("carrito-abierto");
  if (botonQueAbrio) botonQueAbrio.focus();
});

botonCopiar.addEventListener("click", async function () {
  if (!catalogoListo || !carrito.length) return;
  try {
    await navigator.clipboard.writeText(mensajePedido.value);
    estadoCarrito.textContent = "Mensaje copiado.";
  } catch (error) {
    mensajePedido.focus();
    mensajePedido.select();
    estadoCarrito.textContent = "El texto quedó seleccionado. Usá Copiar en tu dispositivo para copiarlo manualmente.";
  }
});
botonWhatsApp.addEventListener("click", function () {
  const enlace = enlaceWhatsApp(carrito);
  if (enlace) window.open(enlace, "_blank", "noopener,noreferrer");
});

// Otra pestaña puede cambiar el carrito; se valida contra el catálogo ya cargado.
window.addEventListener("storage", function (evento) {
  if (catalogoListo && (evento.key === CLAVE_CARRITO || evento.key === null)) {
    carrito = leerCarrito();
    actualizarCarrito(false);
  }
});
window.addEventListener("pageshow", function (evento) {
  if (evento.persisted) cargarCatalogo();
});

async function cargarCatalogo() {
  if (cargarCatalogo.enCurso) return;
  cargarCatalogo.enCurso = true;
  catalogoListo = false;
  const estado = document.getElementById("estado-catalogo");
  const reintentar = document.getElementById("reintentar-catalogo");
  const lista = document.getElementById("lista-productos");
  estado.textContent = "Cargando productos…";
  lista.setAttribute("aria-busy", "true");
  reintentar.hidden = true;
  document.querySelectorAll("[data-abrir-carrito]").forEach(function (boton) { boton.disabled = true; });
  botonWhatsApp.disabled = true;
  botonCopiar.disabled = true;
  listaCarrito.querySelectorAll("button").forEach(function (boton) { boton.disabled = true; });
  const controlador = new AbortController();
  const limite = setTimeout(function () { controlador.abort(); }, 15000);
  try {
    if (ARCHIVO_LOCAL) throw new Error("Abrí el sitio desde un servidor local (http://localhost), no con doble clic.");
    const respuesta = await fetch("./productos.json", { cache: "no-store", signal: controlador.signal });
    if (!respuesta.ok) throw new Error("No se pudo leer productos.json (HTTP " + respuesta.status + ").");
    PRODUCTOS = validarCatalogo(await respuesta.json());
    carrito = leerCarrito();
    catalogoListo = true;
    mostrarProductos();
    actualizarCarrito();
    estado.textContent = (lista.children.length ? "" : "No hay productos publicados en esta categoría por ahora. ") + avisoRevision;
    document.querySelectorAll("[data-abrir-carrito]").forEach(function (boton) { boton.disabled = false; });
  } catch (error) {
    lista.replaceChildren();
    estado.textContent = "No se pudo cargar el catálogo. " +
      (ARCHIVO_LOCAL ? error.message : "Revisá la conexión y el archivo productos.json e intentá nuevamente.") +
      " Tu carrito guardado no se modificó.";
    reintentar.hidden = false;
  } finally {
    clearTimeout(limite);
    lista.setAttribute("aria-busy", "false");
    cargarCatalogo.enCurso = false;
  }
}

document.getElementById("reintentar-catalogo").addEventListener("click", cargarCatalogo);
cargarCatalogo();

// Filtrar fichas conserva las selecciones de modelo y no altera el carrito.
function normalizarBusqueda(texto) { return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function filtrarProductos() {
  const consulta = normalizarBusqueda(document.getElementById('buscar-productos').value);
  let visibles = 0;
  document.querySelectorAll('#lista-productos .producto').forEach(ficha => {
    ficha.hidden = !consulta.split(/\s+/).every(palabra => ficha.dataset.busqueda.includes(palabra));
    if (!ficha.hidden) visibles++;
  });
  document.getElementById('resultado-busqueda').textContent = consulta && catalogoListo ?
    (visibles ? visibles + ' producto(s) encontrados en esta página.' : 'No se encontraron productos. Probá otro nombre o modelo.') : '';
}
const botonBusqueda = document.getElementById('abrir-busqueda');
const formularioBusqueda = document.getElementById('busqueda-sitio');
const campoBusqueda = document.getElementById('buscar-productos');
function cerrarBusqueda() { formularioBusqueda.hidden = true; botonBusqueda.setAttribute('aria-expanded','false'); campoBusqueda.value = ''; filtrarProductos(); botonBusqueda.focus(); }
botonBusqueda.addEventListener('click', () => {
  if (!formularioBusqueda.hidden) { cerrarBusqueda(); return; }
  menuNavegacion.open = false; formularioBusqueda.hidden = false; botonBusqueda.setAttribute('aria-expanded','true'); campoBusqueda.focus();
});
formularioBusqueda.addEventListener('submit', e => { e.preventDefault(); document.getElementById('titulo-productos').scrollIntoView({block:'start'}); });
formularioBusqueda.addEventListener('reset', e => { e.preventDefault(); campoBusqueda.value = ''; filtrarProductos(); campoBusqueda.focus(); });
campoBusqueda.addEventListener('input', filtrarProductos);
formularioBusqueda.addEventListener('keydown', e => { if(e.key === 'Escape') { e.preventDefault(); cerrarBusqueda(); } });
