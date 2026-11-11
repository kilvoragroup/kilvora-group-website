import { describe, expect, it } from "vitest";

import { rawContent } from "@/content";

import { contacts, isPublic, mailtoHref, publicWhatsapp, whatsappHref } from "./contacts";

describe("contactos", () => {
  it("o email institucional aprovado é público", () => {
    expect(contacts.email.value).toBe("admin.kilvoragroup@gmail.com");
    expect(isPublic(contacts.email)).toBe(true);
    expect(mailtoHref()).toBe("mailto:admin.kilvoragroup@gmail.com");
    expect(mailtoHref("Pedido de proposta")).toBe(
      "mailto:admin.kilvoragroup@gmail.com?subject=Pedido%20de%20proposta",
    );
  });

  it("o WhatsApp não é publicado enquanto a titularidade não estiver confirmada", () => {
    expect(contacts.whatsapp.status).toBe("provisorio");
    expect(publicWhatsapp()).toBeNull();
  });

  it("gera ligação directa wa.me apenas com dígitos (sem API)", () => {
    expect(whatsappHref("+55 47 98457-5883")).toBe("https://wa.me/5547984575883");
  });

  it("não define morada nem contactos não documentados", () => {
    expect(Object.keys(contacts).sort()).toEqual(["email", "whatsapp"]);
  });

  it("o conteúdo não contém emails, telefones ou URLs fora da configuração de contactos", () => {
    const text = JSON.stringify(rawContent);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/\+?\d[\d\s-]{7,}\d/);
    expect(text).not.toMatch(/https?:\/\//);
  });
});
