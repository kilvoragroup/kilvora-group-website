/** Caminho do detalhe de um pedido na consola interna (A4). */
export function staffTicketPath(id: string): string {
  return `/interno/pedidos/${encodeURIComponent(id)}`;
}
