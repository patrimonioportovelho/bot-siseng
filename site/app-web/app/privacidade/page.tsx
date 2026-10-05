import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACIDADE } from "@/lib/privacidade";

export const metadata: Metadata = {
  title: "Política de Privacidade | SisEng",
  description: "Como o SisEng trata dados pessoais, conforme a Lei Geral de Proteção de Dados (LGPD)."
};

// Página pública (liberada no middleware): precisa abrir sem login, porque é
// o link informado na tela de login, no rodapé do sistema e em lojas de
// aplicativos.
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-bold text-gray-900 mb-2">{titulo}</h2>
      <div className="text-[13px] text-gray-700 leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-1">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacidadePage() {
  const { nomeEmpresa, cidade, cnpj, emailContato, ultimaAtualizacao } = PRIVACIDADE;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-192.png" alt="SisEng" className="h-9 w-9" />
          <h1 className="text-xl font-bold text-gray-900">Política de Privacidade</h1>
        </div>
        <p className="text-xs text-gray-500 mb-6">Última atualização: {ultimaAtualizacao}</p>

        <div className="bg-white border border-gray-200 rounded-xl p-5 md:p-6">
          <Secao titulo="1. Quem somos">
            <p>
              O SisEng é o sistema de gestão usado pela {nomeEmpresa} ({cidade}) para organizar clientes, imóveis,
              contratos de locação e de compra e venda, financiamento, financeiro e o atendimento de corretores e
              parceiros. A {nomeEmpresa}
              {cnpj ? ` (CNPJ ${cnpj})` : ""} é a controladora dos dados pessoais tratados aqui, nos termos da Lei
              Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).
            </p>
            <p>
              Esta política explica quais dados pessoais tratamos, para que usamos, com quem compartilhamos, por
              quanto tempo guardamos e quais são os seus direitos.
            </p>
          </Secao>

          <Secao titulo="2. A quem esta política se aplica">
            <Lista
              itens={[
                "Equipe administrativa, corretores e corretores estagiários que usam o sistema ou o portal do corretor;",
                "Clientes, proprietários, locatários, compradores, vendedores, fiadores e demais pessoas cujos dados são cadastrados para um atendimento, contrato ou financiamento;",
                "Parceiros externos, prestadores de serviço e convidados de eventos;",
                "Visitantes da página pública, de notícias, editais e eventos."
              ]}
            />
          </Secao>

          <Secao titulo="3. Quais dados tratamos">
            <p>Conforme o uso, podemos tratar:</p>
            <Lista
              itens={[
                "Identificação e contato: nome, CPF ou CNPJ, RG, data de nascimento, estado civil, profissão, endereço, telefone e email;",
                "Dados do negócio: imóvel, valores, condições de pagamento, garantias, contratos, propostas, vistorias e documentos gerados ou anexados;",
                "Dados financeiros: cobranças, recebimentos, repasses, comprovantes, chaves Pix e dados necessários para pagamentos e honorários;",
                "Dados para financiamento imobiliário: renda e documentos enviados para análise de crédito junto a bancos e correspondentes;",
                "Dados de corretores e parceiros: nome, email, função, loja, foto, percentuais de comissionamento e histórico de produção;",
                "Dados de acesso: email, senha (guardada apenas de forma criptografada), registros de login, de ações realizadas no sistema e endereço de rede usado no acesso;",
                "Mensagens enviadas pelos formulários da página pública (por exemplo, o SAC)."
              ]}
            />
            <p>
              Não tratamos de forma intencional dados pessoais sensíveis (como saúde, religião ou opinião política).
              Se um documento enviado por você trouxer esse tipo de informação, ele será usado só para a finalidade
              para a qual foi enviado.
            </p>
          </Secao>

          <Secao titulo="4. Para que usamos os dados e em que base legal">
            <Lista
              itens={[
                "Executar contratos e procedimentos preliminares: elaborar e acompanhar locações, compras e vendas, administração de imóveis e financiamentos (art. 7º, V, da LGPD);",
                "Cumprir obrigações legais e regulatórias: registros fiscais, contábeis, cadastrais e exigências de cartórios e de órgãos públicos (art. 7º, II);",
                "Exercer direitos em processos judiciais, administrativos ou arbitrais (art. 7º, VI);",
                "Atender interesses legítimos da empresa, como segurança do sistema, prevenção a fraudes, controle de acessos, apuração de comissões e melhoria do serviço, sempre respeitando seus direitos (art. 7º, IX);",
                "Com o seu consentimento, quando for necessário, por exemplo para divulgar imagem em publicações ou eventos (art. 7º, I). Você pode retirar o consentimento quando quiser."
              ]}
            />
          </Secao>

          <Secao titulo="5. Com quem compartilhamos">
            <p>Não vendemos dados pessoais. O compartilhamento acontece apenas quando necessário:</p>
            <Lista
              itens={[
                "Prestadores de tecnologia que operam o sistema em nosso nome: hospedagem da aplicação, banco de dados e armazenamento de arquivos e serviço de envio de emails;",
                "Bancos, correspondentes e instituições financeiras, no caso de financiamento;",
                "Cartórios, administradoras, seguradoras, advogados e demais profissionais envolvidos no negócio;",
                "Corretores e parceiros que participam da mesma transação, limitado ao que é necessário para ela;",
                "Autoridades públicas, quando houver obrigação legal ou ordem judicial."
              ]}
            />
            <p>
              Alguns desses prestadores podem armazenar ou processar dados em servidores fora do Brasil. Nesses
              casos, adotamos as garantias previstas na LGPD para a transferência internacional.
            </p>
          </Secao>

          <Secao titulo="6. Cookies">
            <p>
              Usamos apenas cookies essenciais, necessários para manter você conectado com segurança ao sistema
              administrativo e ao portal do corretor. Eles não são usados para publicidade nem para acompanhar a
              sua navegação em outros sites. A sessão expira automaticamente e é encerrada todos os dias às 3h
              (horário de Porto Velho).
            </p>
          </Secao>

          <Secao titulo="7. Como protegemos os dados">
            <Lista
              itens={[
                "Acesso por email e senha, com senhas guardadas de forma criptografada e bloqueio temporário após várias tentativas erradas;",
                "Perfis de acesso: cada pessoa vê apenas o que a sua função permite;",
                "Conexão protegida por HTTPS;",
                "Registro das principais ações feitas no sistema, para auditoria;",
                "Cópias e armazenamento feitos por provedores com medidas técnicas de segurança."
              ]}
            />
            <p>
              Nenhum sistema é totalmente imune a falhas. Se houver um incidente de segurança que possa causar risco
              ou dano relevante, comunicaremos os titulares e a Autoridade Nacional de Proteção de Dados (ANPD),
              conforme a LGPD.
            </p>
          </Secao>

          <Secao titulo="8. Por quanto tempo guardamos">
            <p>
              Guardamos os dados pelo tempo necessário para cumprir as finalidades desta política e os prazos
              legais, fiscais, contratuais e de defesa em processos que se apliquem a cada tipo de documento. Depois
              disso, os dados são eliminados ou anonimizados, salvo quando a lei permitir ou exigir a guarda.
            </p>
          </Secao>

          <Secao titulo="9. Seus direitos">
            <p>Nos termos do art. 18 da LGPD, você pode solicitar, a qualquer momento:</p>
            <Lista
              itens={[
                "confirmação de que tratamos seus dados e acesso a eles;",
                "correção de dados incompletos, inexatos ou desatualizados;",
                "anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;",
                "portabilidade dos dados, nos termos da regulamentação;",
                "eliminação dos dados tratados com base em consentimento;",
                "informação sobre com quem compartilhamos os dados;",
                "informação sobre a possibilidade de não fornecer consentimento e suas consequências;",
                "revogação do consentimento;",
                "revisão de decisões tomadas apenas com tratamento automatizado, quando houver."
              ]}
            />
            <p>
              Alguns pedidos podem ser limitados quando a guarda do dado for obrigatória por lei ou necessária para
              defesa em processos. Nesses casos, explicaremos o motivo.
            </p>
          </Secao>

          <Secao titulo="10. Crianças e adolescentes">
            <p>
              O sistema não é destinado a menores de 18 anos. Dados de menores só são tratados quando indispensáveis
              a um negócio imobiliário (por exemplo, em inventários ou como beneficiários) e com a participação de
              um responsável legal.
            </p>
          </Secao>

          <Secao titulo="11. Como falar com a gente">
            <p>
              Para exercer seus direitos ou tirar dúvidas sobre esta política, fale com o administrativo da{" "}
              {nomeEmpresa} ({cidade})
              {emailContato ? (
                <>
                  {" "}
                  pelo email{" "}
                  <a href={`mailto:${emailContato}`} className="text-primary underline">
                    {emailContato}
                  </a>
                </>
              ) : (
                ", pessoalmente ou pelos canais de atendimento divulgados na página inicial"
              )}
              . Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
            </p>
          </Secao>

          <Secao titulo="12. Alterações desta política">
            <p>
              Podemos atualizar esta política para refletir mudanças no sistema ou na lei. A versão em vigor é sempre
              a desta página, com a data da última atualização no topo.
            </p>
          </Secao>
        </div>

        <div className="text-center text-[11px] text-gray-400 mt-6">
          {nomeEmpresa} · {cidade} — SisEng
          <div className="mt-1">
            <Link href="/login" className="underline hover:text-gray-600">
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
