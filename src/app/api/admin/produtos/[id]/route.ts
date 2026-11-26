import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";

const fotoSchema = z
  .string()
  .trim()
  .max(1024)
  .refine(
    (val) =>
      val === "" ||
      val.startsWith("/api/blob?path=") ||
      /^https?:\/\/.+/i.test(val),
    "URL da foto inválida."
  );

const updateProdutoSchema = z.object({
  nome: z.string().trim().min(1).max(80).optional(),
  descricao: z.string().trim().max(240).optional(),
  preco: z.number().int().min(0).max(1000000).optional(),
  foto: fotoSchema.optional().nullable(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().min(0).max(9999).optional(),
  controlaEstoque: z.boolean().optional(),
  estoque: z.number().int().min(0).max(99999).optional(),
  estoqueMinimo: z.number().int().min(0).max(99999).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = updateProdutoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;
    const produto = await db.produto.update({
      where: { id },
      data: {
        ...(data.nome !== undefined ? { nome: data.nome } : {}),
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.preco !== undefined ? { preco: data.preco } : {}),
        ...(data.foto !== undefined
          ? { foto: data.foto ? data.foto : null }
          : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
        ...(data.ordem !== undefined ? { ordem: data.ordem } : {}),
        ...(data.controlaEstoque !== undefined
          ? { controlaEstoque: data.controlaEstoque }
          : {}),
        ...(data.estoque !== undefined ? { estoque: data.estoque } : {}),
        ...(data.estoqueMinimo !== undefined
          ? { estoqueMinimo: data.estoqueMinimo }
          : {}),
      },
    });
    return NextResponse.json({ produto });
  } catch (error) {
    console.error("Erro ao atualizar produto:", error);
    return NextResponse.json(
      { error: "Produto não encontrado ou erro ao salvar." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;

  try {
    await db.produto.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover produto:", error);
    return NextResponse.json(
      { error: "Não foi possível excluir o produto." },
      { status: 400 }
    );
  }
}
