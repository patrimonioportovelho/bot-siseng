"use client";

import { useState } from "react";
import { BotaoSubmit } from "@/components/botao-submit";
import { PAPEIS_CONTROLADOS } from "@/lib/ponto/regras";

type AcessoOpcao = { id: string; rotulo: string };
type ConfigPonto = { ativo: boolean; cargaHoras: number; entrada: string; saida: string; almocoInicio: string; almocoFim: string };

const CAMPO = "text-xs border border-gray-300 rounded-lg px-2.5 py-1 outline-none focus:border-primary bg-white";

// Uma linha da tela "Acessos" (Configurações). Ao marcar Administrativo, Financeiro ou
// Recrutador (sem Diretor), abre a caixa "Controle de ponto" da pessoa: jornada e teto
// semanal. Salva junto com os acessos.
export function AcessoPessoaForm({
  acao,
  parceiroId,
  nome,
  funcao,
  nota,
  acessos,
  marcadosIniciais,
  fixoDiretor,
  config
}: {
  acao: (formData: FormData) => void | Promise<void>;
  parceiroId: string;
  nome: string;
  funcao: string;
  nota: string;
  acessos: AcessoOpcao[];
  marcadosIniciais: string[];
  fixoDiretor: boolean;
  config: ConfigPonto;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set(marcadosIniciais));
  const controlado = !marcados.has("diretor") && PAPEIS_CONTROLADOS.some((p) => marcados.has(p));

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <form action={acao} className="px-3 py-2">
      <input type="hidden" name="parceiroId" value={parceiroId} />
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        <div className="w-52 min-w-0">
          <div className="text-xs font-medium text-gray-800 truncate">{nome}</div>
          <div className="text-[10px] text-gray-400">
            {funcao}
            {nota}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {acessos.map((a) => (
            <label key={a.id} className="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                name="acessos"
                value={a.id}
                checked={marcados.has(a.id)}
                onChange={() => alternar(a.id)}
                disabled={fixoDiretor && a.id === "diretor"}
              />
              {a.rotulo}
            </label>
          ))}
          {fixoDiretor && <input type="hidden" name="acessos" value="diretor" />}
        </div>
        <BotaoSubmit carregandoTexto="Salvando..." className="text-xs bg-primary text-white rounded-lg px-3 py-1">
          Salvar
        </BotaoSubmit>
      </div>

      {controlado && (
        <div className="mt-2 ml-0 md:ml-52 border border-blue-200 bg-blue-50/50 rounded-lg p-3">
          <input type="hidden" name="ponto_presente" value="1" />
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div className="text-xs font-bold text-blue-900">Controle de ponto</div>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
              <input type="checkbox" name="ponto_ativo" defaultChecked={config.ativo} />
              Controlar o uso do sistema desta pessoa
            </label>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-[11px] text-gray-600">
              Teto semanal (horas)
              <input type="number" name="ponto_carga_h" min={1} max={60} step={0.5} defaultValue={config.cargaHoras} className={`${CAMPO} block w-24 mt-0.5`} />
            </label>
            <label className="text-[11px] text-gray-600">
              Entrada
              <input type="time" name="ponto_entrada" defaultValue={config.entrada} className={`${CAMPO} block mt-0.5`} />
            </label>
            <label className="text-[11px] text-gray-600">
              Saída
              <input type="time" name="ponto_saida" defaultValue={config.saida} className={`${CAMPO} block mt-0.5`} />
            </label>
            <label className="text-[11px] text-gray-600">
              Almoço (início)
              <input type="time" name="ponto_almoco_inicio" defaultValue={config.almocoInicio} className={`${CAMPO} block mt-0.5`} />
            </label>
            <label className="text-[11px] text-gray-600">
              Almoço (fim)
              <input type="time" name="ponto_almoco_fim" defaultValue={config.almocoFim} className={`${CAMPO} block mt-0.5`} />
            </label>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            Segunda a sexta. O uso do sistema é registrado como ponto: entra ao fazer login, sai ao encerrar a sessão, fechar o navegador ou ficar{" "}
            10 min sem usar. Passou do teto semanal ou fora do expediente, o acesso só continua com liberação da diretoria. Vale no próximo login da pessoa.
          </p>
        </div>
      )}
    </form>
  );
}
