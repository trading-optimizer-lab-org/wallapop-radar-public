# wallapop-radar-public

Workflows de GitHub Actions para buscar proveedores y precios de productos que se venden en Wallapop.

- `caza-ae`: precios en AliExpress con envío desde España para la cola `caza/ae.json`.
- `proveedores`: dónde comprar más barato un producto (`precio/productos/<producto>.json`): nuevo, reacondicionado y segunda mano.
- `precio`: precio más barato de un producto en AliExpress, MediaMarkt y Wallapop.

Reglas: se respeta robots.txt (incluidas las reglas para agentes de Claude), no se insiste si una web muestra un bloqueo y no se visitan webs que no admiten agentes de Anthropic.
