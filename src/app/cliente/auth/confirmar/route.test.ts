import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const services = vi.hoisted(() => ({ completeEmailLink: vi.fn() }));
vi.mock("@/services/portal/auth", () => services);

import { GET } from "./route";

const ORIGIN = "http://localhost:3100";
const CODE = "0f9c2b3a-1d2e-4f5a-8b6c-7d8e9f0a1b2c";

function request(query: string) {
  return new NextRequest(`${ORIGIN}/cliente/auth/confirmar${query}`);
}

function enablePortal() {
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
}

const location = (response: Response) => response.headers.get("location");
const linkInvalid = `${ORIGIN}/cliente/entrar?aviso=link-invalido`;

beforeEach(() => {
  services.completeEmailLink.mockReset();
  enablePortal();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("portal desligado", () => {
  it("404 sem chamar o serviço", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    const response = await GET(request(`?code=${CODE}`));
    expect(response.status).toBe(404);
    expect(services.completeEmailLink).not.toHaveBeenCalled();
  });
});

describe("callback válido", () => {
  it("confirmação → destino seguro pedido", async () => {
    services.completeEmailLink.mockResolvedValue({ ok: true, value: { flow: "confirmation" } });
    const response = await GET(request(`?code=${CODE}&next=%2Fcliente%2Fpedidos`));
    expect(response.status).toBe(303);
    expect(location(response)).toBe(`${ORIGIN}/cliente/pedidos`);
    expect(services.completeEmailLink).toHaveBeenCalledWith({
      code: CODE,
      tokenHash: null,
      type: null,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("recuperação provada pelos claims → nova palavra-passe, ignorando `next`", async () => {
    services.completeEmailLink.mockResolvedValue({ ok: true, value: { flow: "recovery" } });
    const response = await GET(request(`?code=${CODE}&next=%2Fcliente%2Fpedidos`));
    expect(location(response)).toBe(`${ORIGIN}/cliente/nova-palavra-passe`);
  });

  it("token_hash + type são passados ao serviço", async () => {
    services.completeEmailLink.mockResolvedValue({ ok: true, value: { flow: "confirmation" } });
    await GET(request("?token_hash=pkce_abcdef0123456789&type=signup"));
    expect(services.completeEmailLink).toHaveBeenCalledWith({
      code: null,
      tokenHash: "pkce_abcdef0123456789",
      type: "signup",
    });
  });

  it("confirmação NUNCA leva à nova palavra-passe sem recuperação provada", async () => {
    services.completeEmailLink.mockResolvedValue({ ok: true, value: { flow: "confirmation" } });
    const response = await GET(request(`?code=${CODE}&next=%2Fcliente%2Fnova-palavra-passe`));
    expect(location(response)).toBe(`${ORIGIN}/cliente`);
  });
});

describe("redireccionamentos externos recusados", () => {
  it.each([
    "https%3A%2F%2Fevil.example",
    "%2F%2Fevil.example",
    "%2F%5Cevil.example",
    "%2Fcliente%2F..%2Fcontactos",
    "javascript%3Aalert(1)",
    "%2Fcontactos",
  ])("next=%s → /cliente (mesma origem)", async (next) => {
    services.completeEmailLink.mockResolvedValue({ ok: true, value: { flow: "confirmation" } });
    const response = await GET(request(`?code=${CODE}&next=${next}`));
    expect(location(response)).toBe(`${ORIGIN}/cliente`);
    expect(new URL(location(response)!).origin).toBe(ORIGIN);
  });
});

describe("callback inválido ou expirado", () => {
  it.each(["link_invalid", "session_missing", "unexpected"])(
    "serviço devolve %s → entrada com aviso neutro",
    async (kind) => {
      services.completeEmailLink.mockResolvedValue({ ok: false, error: { kind } });
      expect(location(await GET(request(`?code=${CODE}`)))).toBe(linkInvalid);
    },
  );

  it("indisponibilidade → aviso de indisponibilidade", async () => {
    services.completeEmailLink.mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
    expect(location(await GET(request(`?code=${CODE}`)))).toBe(
      `${ORIGIN}/cliente/entrar?aviso=indisponivel`,
    );
  });

  it("erro devolvido pelo GoTrue no URL (link expirado) → aviso neutro, sem ecoar a descrição", async () => {
    const response = await GET(
      request(
        "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ),
    );
    expect(location(response)).toBe(linkInvalid);
    expect(location(response)).not.toContain("expired");
    expect(services.completeEmailLink).not.toHaveBeenCalled();
  });

  it("sem parâmetros → o serviço decide (link_invalid)", async () => {
    services.completeEmailLink.mockResolvedValue({ ok: false, error: { kind: "link_invalid" } });
    expect(location(await GET(request("")))).toBe(linkInvalid);
  });
});
