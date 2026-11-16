/** Caminhos da área do cliente (A3). */
export const portalPaths = {
  home: "/cliente",
  newTicket: "/cliente/pedidos/novo",
  account: "/cliente/conta",
} as const;

export function ticketPath(id: string): string {
  return `/cliente/pedidos/${encodeURIComponent(id)}`;
}
