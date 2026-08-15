// Reexporta o motor genérico de Pix (Fase 8, 14/08/2026: movido pra
// lib/pix.ts pra ser reaproveitado pelo Financeiro do corretor também, ver
// comentário lá) — mantido aqui só pra não quebrar nenhum import existente
// de app/eventos, app/evento/[id] e components/inscricao-evento-form.tsx.
// PIX_CONVIDADOS_EVENTO é o mesmo nome de sempre, apontando pra
// PIX_CONTA_PADRAO (a mesma conta BS2, sem mudança nenhuma de comportamento
// pro módulo Eventos).
export { PIX_CONTA_PADRAO as PIX_CONVIDADOS_EVENTO, gerarPixCopiaECola } from "@/lib/pix";
