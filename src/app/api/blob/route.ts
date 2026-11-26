import { NextResponse } from "next/server";
import { BlobNotFoundError, get } from "@vercel/blob";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("path")?.trim() ?? "";

  if (
    !pathname ||
    pathname.length > 300 ||
    !pathname.startsWith("produtos/") ||
    pathname.includes("..") ||
    pathname.includes("\\")
  ) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  try {
    const ifNoneMatch = request.headers.get("if-none-match") ?? undefined;
    const result = await get(pathname, {
      access: "private",
      ifNoneMatch,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Imagem não encontrada." },
        { status: 404 }
      );
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
        },
      });
    }

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        ETag: result.blob.etag,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json(
        { error: "Imagem não encontrada." },
        { status: 404 }
      );
    }
    console.error("Erro ao servir imagem do Blob:", error);
    return NextResponse.json(
      { error: "Erro ao carregar imagem." },
      { status: 500 }
    );
  }
}
