import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const fotoSchema = z
  .string()
  .trim()
  .max(1024)
  .refine(
    (val) =>
      val === "" ||
      val.startsWith("/api/blob?path=") ||
      val.startsWith("/produtos/") ||
      /^https?:\/\/.+/i.test(val),
    "URL da foto inválida."
  );

const produtoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do produto.").max(80),
  categoria: z.string().trim().min(1).max(40).optional().default("Geral"),
  descricao: z.string().trim().max(240).optional().default(""),
  preco: z.number().int().min(0, "Preço inválido.").max(1000000),
  foto: fotoSchema.optional().nullable(),
  ativo: z.boolean().optional().default(true),
  ordem: z.number().int().min(0).max(9999).optional().default(0),
  controlaEstoque: z.boolean().optional().default(false),
  estoque: z.number().int().min(0).max(99999).optional().default(0),
  estoqueMinimo: z.number().int().min(0).max(99999).optional().default(5),
});

export async function GET() {
  const auth = await requireRole("DONO");
  if (auth.response) return auth.response;

  try {
    const produtos = await db.produto.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });
    return NextResponse.json(
      { produtos },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao listar produtos:", error);
    return NextResponse.json(
      { error: "Erro ao listar produtos." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("DONO");
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = produtoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  try {
    const produto = await db.produto.create({
      data: {
        nome: parsed.data.nome,
        categoria: parsed.data.categoria,
        descricao: parsed.data.descricao,
        preco: parsed.data.preco,
        foto: parsed.data.foto ? parsed.data.foto : null,
        ativo: parsed.data.ativo,
        ordem: parsed.data.ordem,
        controlaEstoque: parsed.data.controlaEstoque,
        estoque: parsed.data.estoque,
        estoqueMinimo: parsed.data.estoqueMinimo,
      },
    });
    return NextResponse.json({ produto }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar produto:", error);
    return NextResponse.json(
      { error: "Erro ao criar produto." },
      { status: 500 }
    );
  }
}
