import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireRole } from "@/lib/auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export async function POST(request: Request) {
  const auth = await requireRole("DONO");
  if (auth.response) return auth.response;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN não configurado. Configure o Vercel Blob ou informe a URL da imagem.",
      },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Formato inválido. Use JPG, PNG, WebP, AVIF ou GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "A imagem deve ter no máximo 5 MB." },
        { status: 400 }
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const pathname = `produtos/${safeName}`;

    try {
      const blob = await put(pathname, file, {
        access: "public",
        addRandomSuffix: true,
      });
      return NextResponse.json({ url: blob.url });
    } catch (publicErr: unknown) {
      const msg =
        publicErr instanceof Error ? publicErr.message.toLowerCase() : "";
      if (!msg.includes("private")) {
        throw publicErr;
      }

      const privateBlob = await put(pathname, file, {
        access: "private",
        addRandomSuffix: true,
      });
      return NextResponse.json({
        url: `/api/blob?path=${encodeURIComponent(privateBlob.pathname)}`,
      });
    }
  } catch (error) {
    console.error("Erro no upload de imagem:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar a imagem." },
      { status: 500 }
    );
  }
}
