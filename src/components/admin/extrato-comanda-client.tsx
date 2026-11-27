"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComandaDetailDTO } from "@/lib/comandas";
import {
  FORMA_PAGAMENTO_LABELS,
  formatCurrency,
  formatDateTimeBR,
  formatTimeBR,
} from "@/lib/format";
import { formatPessoaContato } from "@/lib/phone";

export function ExtratoComandaClient({
  comanda,
  pessoaTelefone,
  emittedAtIso,
}: {
  comanda: ComandaDetailDTO;
  pessoaTelefone?: string;
  emittedAtIso: string;
}) {
  const pessoa = React.useMemo(() => {
    if (!pessoaTelefone) return null;
    return comanda.pessoas.find((p) => p.telefone === pessoaTelefone) ?? null;
  }, [comanda.pessoas, pessoaTelefone]);

  const isIndividual = Boolean(pessoaTelefone);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin?tab=comandas"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao painel
        </Link>

        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir extrato
        </Button>
      </div>

      <article className="print-card glass-card flex flex-col gap-4 p-6">
        <header className="border-b border-dashed border-[var(--border)] pb-4 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
            Arena Home Beach
          </p>
          <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">
            {isIndividual
              ? `Extrato Individual · ${
                  comanda.mesaNumero !== null
                    ? `Mesa ${comanda.mesaNumero}`
                    : "Balcão"
                }`
              : `Extrato da Comanda · ${
                  comanda.mesaNumero !== null
                    ? `Mesa ${comanda.mesaNumero}`
                    : "Balcão"
                }`}
          </h1>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Aberta em {formatDateTimeBR(comanda.abertaEm)} · Emitido em{" "}
            {formatDateTimeBR(emittedAtIso)}
          </p>
          {comanda.status === "FECHADA" && comanda.fechadaEm && (
            <p className="mt-0.5 text-xs font-semibold text-[var(--muted-foreground)]">
              Encerrada em {formatDateTimeBR(comanda.fechadaEm)}
            </p>
          )}
        </header>

        {isIndividual ? (
          !pessoa ? (
            <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
              Nenhum consumo válido encontrado para esta pessoa nesta comanda.
            </p>
          ) : (
            <>
              <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-sm">
                <p className="font-extrabold text-[var(--foreground)]">
                  Cliente: {pessoa.nome}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Contato: {formatPessoaContato(pessoa.telefone)}
                </p>
              </div>

              <div>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Itens consumidos
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                      <th className="py-1.5">Qtd / Item</th>
                      <th className="py-1.5 text-center">Status</th>
                      <th className="py-1.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pessoa.itens.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-dashed border-[var(--border)]/70"
                      >
                        <td className="py-2 font-semibold text-[var(--foreground)]">
                          {item.quantidade}x {item.nomeSnapshot}
                          <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
                            (#{item.pedidoNumero})
                          </span>
                        </td>
                        <td className="py-2 text-center text-xs font-semibold">
                          {item.pago ? "Pago" : "Pendente"}
                        </td>
                        <td className="py-2 text-right font-bold">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-dashed border-[var(--border)] pt-3 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal da pessoa</span>
                  <strong>{formatCurrency(pessoa.subtotal)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Já pago (em itens)</span>
                  <strong>{formatCurrency(pessoa.valorPago)}</strong>
                </div>
                <div className="flex justify-between text-lg font-black">
                  <span>Pendente da pessoa</span>
                  <span>{formatCurrency(pessoa.valorPendente)}</span>
                </div>
              </div>
            </>
          )
        ) : (
          <>
            {comanda.pessoas.map((p) => (
              <div key={p.telefone} className="border-b border-dashed border-[var(--border)] pb-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-extrabold text-[var(--foreground)]">
                    {p.nome}{" "}
                    <span className="text-xs font-normal text-[var(--muted-foreground)]">
                      ({formatPessoaContato(p.telefone)})
                    </span>
                  </h2>
                  <span className="text-xs font-bold text-[var(--muted-foreground)]">
                    Subtotal: {formatCurrency(p.subtotal)}
                  </span>
                </div>

                <ul className="flex flex-col gap-1 text-sm">
                  {p.itens.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {item.quantidade}x {item.nomeSnapshot}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--muted-foreground)]">
                          {item.pago ? "Pago" : "Pendente"}
                        </span>
                        <strong className="font-bold">
                          {formatCurrency(item.subtotal)}
                        </strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {comanda.pagamentos.length > 0 && (
              <div>
                <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Pagamentos registrados
                </h2>
                <ul className="flex flex-col gap-1 text-xs">
                  {comanda.pagamentos.map((pag) => (
                    <li
                      key={pag.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {formatTimeBR(pag.createdAt)} ·{" "}
                        {FORMA_PAGAMENTO_LABELS[pag.forma]}
                        {pag.pagador ? ` · ${pag.pagador}` : ""}
                        {pag.status === "ESTORNADO" ? " (ESTORNADO)" : ""}
                      </span>
                      <strong
                        className={
                          pag.status === "ESTORNADO" ? "line-through" : ""
                        }
                      >
                        {formatCurrency(pag.valor)}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-1.5 border-t border-dashed border-[var(--border)] pt-3 text-sm">
              <div className="flex justify-between">
                <span>Total consumido</span>
                <strong>{formatCurrency(comanda.total)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Total pago</span>
                <strong>{formatCurrency(comanda.pago)}</strong>
              </div>
              <div className="flex justify-between text-lg font-black">
                <span>Saldo restante</span>
                <span>{formatCurrency(comanda.saldo)}</span>
              </div>
            </div>
          </>
        )}

        <footer className="border-t border-dashed border-[var(--border)] pt-4 text-center">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--foreground)]">
            Comprovante não fiscal
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
            Arena Home Beach · Conferência interna de consumo
          </p>
        </footer>
      </article>
    </div>
  );
}
