import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TableCounts {
  pagamento: number;
  itemPedido: number;
  pedido: number;
  comanda: number;
  loginAttempt: number;
  produto: number;
  mesa: number;
  pushSubscription: number;
}

function extractSafeHost(databaseUrl: string | undefined): string {
  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error("DATABASE_URL não definido.");
  }
  try {
    const parsed = new URL(databaseUrl.trim());
    if (!parsed.hostname) {
      throw new Error("Host vazio.");
    }
    return parsed.hostname;
  } catch {
    throw new Error("DATABASE_URL inválido para extrair o host.");
  }
}

async function getCounts(): Promise<TableCounts> {
  const [
    pagamento,
    itemPedido,
    pedido,
    comanda,
    loginAttempt,
    produto,
    mesa,
    pushSubscription,
  ] = await Promise.all([
    prisma.pagamento.count(),
    prisma.itemPedido.count(),
    prisma.pedido.count(),
    prisma.comanda.count(),
    prisma.loginAttempt.count(),
    prisma.produto.count(),
    prisma.mesa.count(),
    prisma.pushSubscription.count(),
  ]);

  return {
    pagamento,
    itemPedido,
    pedido,
    comanda,
    loginAttempt,
    produto,
    mesa,
    pushSubscription,
  };
}

function printCounts(title: string, counts: TableCounts) {
  console.log(`\n${title}`);
  console.log("  [Tabelas operacionais — alvo do reset]");
  console.log(`    Pagamento:        ${counts.pagamento}`);
  console.log(`    ItemPedido:       ${counts.itemPedido}`);
  console.log(`    Pedido:           ${counts.pedido}`);
  console.log(`    Comanda:          ${counts.comanda}`);
  console.log(`    LoginAttempt:     ${counts.loginAttempt}`);
  console.log("  [Tabelas preservadas — NÃO tocadas]");
  console.log(`    Produto:          ${counts.produto}`);
  console.log(`    Mesa:             ${counts.mesa}`);
  console.log(`    PushSubscription: ${counts.pushSubscription}`);
}

async function main() {
  const confirmFlag = process.argv.includes("--confirm");
  const host = extractSafeHost(process.env.DATABASE_URL);

  console.log("=== Reset Operacional · Arena Home Beach ===");
  console.log(`Host do banco alvo: ${host}`);
  console.log(
    `Modo: ${confirmFlag ? "EXECUÇÃO (--confirm)" : "DRY-RUN (somente leitura)"}`
  );

  const before = await getCounts();
  printCounts(
    confirmFlag
      ? "Registros encontrados antes da limpeza:"
      : "Registros que SERIAM apagados:",
    before
  );

  if (!confirmFlag) {
    console.log(
      "\nNenhum registro foi alterado (dry-run). Para executar de verdade, rode com --confirm."
    );
    return;
  }

  const rl = readline.createInterface({ input, output });
  let typedHost = "";
  try {
    typedHost = await rl.question(
      `\nPara CONFIRMAR a limpeza definitiva, digite exatamente o host (${host}): `
    );
  } finally {
    rl.close();
  }

  if (typedHost.trim() !== host) {
    console.error(
      "\nConfirmação cancelada: o host digitado não confere. Nenhum dado foi apagado."
    );
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // Ordem segura respeitando chaves estrangeiras
      await tx.pagamento.deleteMany();
      await tx.itemPedido.deleteMany();
      await tx.pedido.deleteMany();
      await tx.comanda.deleteMany();
      await tx.loginAttempt.deleteMany();

      // Reinicia a sequência do número do pedido para que o próximo seja #1
      await tx.$queryRaw`
        SELECT setval(pg_get_serial_sequence('"Pedido"', 'numero'), 1, false)
      `;
    },
    { maxWait: 20000, timeout: 30000 }
  );

  const after = await getCounts();
  printCounts("Contagem final após a limpeza:", after);
  console.log(
    "\nReset concluído! Próximo pedido começará em #1. Estoque, Produto, Mesa e PushSubscription foram preservados."
  );
}

main()
  .catch((error) => {
    console.error(
      "Erro ao executar reset operacional:",
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
