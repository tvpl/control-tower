"use client";
import { useState } from "react";
import { BookOpen, Download, GitBranch } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { api, download } from "../client";
import type { Row } from "../cockpit/model";
export const GITLAB_COMPOSE = `services:
  web:
    env_file:
      - ./secrets/gitlab.env
  worker:
    env_file:
      - ./secrets/gitlab.env
`;
export function GitLabGuide({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      open
      wide
      title="Como conectar o GitLab"
      description="Uma configuração por projeto ou grupo; sincronização de leitura do GitLab para a torre."
      onClose={onClose}
    >
      <div className="gitlab-guide">
        <div className="policy-note">
          <GitBranch size={22} />
          <p>
            Projeto → frentes → features → entregáveis continuam na torre. Use
            um grupo GitLab para reunir épicos, issues e tarefas de vários
            repositórios; ou escolha um único repositório.
          </p>
        </div>
        <ol>
          <li>
            <strong>Prepare os itens no GitLab.</strong> Crie uma label como{" "}
            <code>tower::acqmod</code> e aplique aos épicos, issues e tarefas
            que quer acompanhar. A label é opcional; sem ela todos os itens
            acessíveis do escopo serão consultados. Múltiplas labels exigem
            todas elas. Uma tag Git de release não substitui a label de um item.
          </li>
          <li>
            <strong>Defina como ler o andamento.</strong> Por padrão, aberto →
            não iniciado e fechado → concluído operacionalmente. Para acompanhar
            trabalho em andamento, use labels exclusivas como{" "}
            <code>status::doing</code>, <code>status::blocked</code> e{" "}
            <code>status::hold</code>. Configure esses nomes no formulário.
            Labels de estado conflitantes produzem estado desconhecido.
          </li>
          <li>
            <strong>Crie uma credencial de serviço no GitLab.</strong> Use um
            access token com validade e acesso de leitura à API (
            <code>read_api</code>) e ao projeto/grupo escolhido. Um project
            token só alcança os recursos permitidos daquele projeto; para épicos
            do grupo use uma conta/token com acesso ao grupo. Épicos exigem
            Premium/Ultimate e Work Items compatível (referência: GitLab 18.1+).
            A torre não pede sua senha do GitLab.
          </li>
          <li>
            <strong>Disponibilize a credencial nos containers.</strong> O
            operador cria <code>secrets/gitlab.env</code> com a variável{" "}
            <code>MCT_CONNECTOR_GITLAB</code> recebendo o token real, com
            permissão 600 e pasta 700. Baixe o complemento Compose abaixo, salve
            como <code>compose.gitlab.yaml</code> na raiz. O comando npm run
            docker:local inclui esse complemento automaticamente. Para operação
            manual, inclua <code>-f compose.gitlab.yaml</code> no comando
            Compose, após os arquivos base e local. Recrie web e worker com{" "}
            <code>up -d --no-build web worker</code>. No formulário, informe
            apenas o nome da variável. GitLab próprio exige também host exato em{" "}
            <code>MCT_CONNECTOR_ALLOWED_HOSTS</code>; rede privada exige
            liberação explícita do operador.
          </li>
          <li>
            <strong>Cadastre a conexão.</strong> Escolha o projeto da torre no
            topo e clique “Configurar GitLab”. Informe host HTTPS, caminho
            completo (ex.: <code>empresa/pagamentos</code>), escopo, labels e
            origem da execução. O modo “Somente referência” permite inspecionar
            a fonte sem atualizar entregáveis. Habilite a atualização
            operacional apenas quando desejar delegá-la.
          </li>
          <li>
            <strong>Teste, sincronize e vincule.</strong> “Testar acesso”
            consulta a primeira página sem alterar o inventário. “Sincronizar”
            recebe os itens na caixa de entrada. Clique “Vincular” no item,
            escolha a feature ou entregável correto e salve. Para atualizar
            execução, selecione um entregável e o uso “Atualização operacional”.
            Sincronize novamente para aplicar o vínculo; polling pode ser
            habilitado para repetir a consulta.
          </li>
          <li>
            <strong>Vincule vários itens de uma vez.</strong> Use “Vincular em
            lote” na conexão. Selecione os itens recebidos e seus destinos, ou
            cole um CSV com as colunas <code>external_id;codigo;modo</code>.
            Códigos ausentes ou ambíguos pedem escolha manual. Para sugestões
            explícitas, adicione uma label <code>mct:CODIGO</code> ou o marcador{" "}
            <code>[mct:CODIGO]</code> no título do item e use “Sugerir por
            marcador”. Confira referência ou andamento operacional, justifique,
            valide a prévia e aplique. Sugestões não são salvas automaticamente;
            um erro impede o lote inteiro.
          </li>
          <li>
            <strong>Acompanhe na torre.</strong> Épicos podem ser referência de
            capacidades; issues e tarefas atualizam a execução dos entregáveis
            vinculados. O painel mostra hierarquia da fonte, labels e proporção
            fechada do recorte recebido. Conflitos ficam para revisão. Aceite,
            estágio, gates, baseline e escopo permanecem nos fluxos da torre.
          </li>
        </ol>
        <button
          className="button"
          onClick={() =>
            download("compose.gitlab.yaml", GITLAB_COMPOSE, "application/yaml")
          }
        >
          <Download size={15} /> Baixar complemento Docker
        </button>
        <details>
          <summary>Resolução de problemas</summary>
          <p>
            Credencial ausente: confirme a variável em web e worker e recrie os
            containers. HTTP 401/403: token expirado, escopo ou papel
            insuficiente. Projeto não encontrado: confira caminho completo e
            acesso. Erro GraphQL: verifique versão e licença; em instâncias
            antigas use o modo de issues REST no cadastro genérico. Zero itens:
            confira labels, escopo e permissões. Sem vínculo: use o botão
            Vincular; nome/código parecido não cria correspondência automática.
            Nenhum token é incluído nas exportações para IA.
          </p>
        </details>
        <p className="muted">
          Referências oficiais:{" "}
          <a
            href="https://docs.gitlab.com/api/graphql/epic_work_items_api_migration_guide/"
            target="_blank"
            rel="noreferrer"
          >
            Épicos e Work Items
          </a>{" "}
          ·{" "}
          <a
            href="https://docs.gitlab.com/user/profile/personal_access_tokens/"
            target="_blank"
            rel="noreferrer"
          >
            Access tokens
          </a>{" "}
          ·{" "}
          <a
            href="https://docs.gitlab.com/api/graphql/"
            target="_blank"
            rel="noreferrer"
          >
            GraphQL
          </a>
        </p>
      </div>
    </Modal>
  );
}
export function GitLabSetup({
  record,
  pid,
  onClose,
  onSaved,
}: {
  record?: Row;
  pid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name || "GitLab do projeto"),
    [host, setHost] = useState(record?.base_url || "https://gitlab.com"),
    [path, setPath] = useState(record?.project || ""),
    [scope, setScope] = useState(record?.gitlab_options?.scope || "PROJECT"),
    [labels, setLabels] = useState(
      (record?.gitlab_options?.labels || []).join(", "),
    ),
    [secret, setSecret] = useState(
      record?.secret_env || "MCT_CONNECTOR_GITLAB",
    ),
    [execution, setExecution] = useState(
      record?.execution_owner || "CONTROL_TOWER",
    ),
    [enabled, setEnabled] = useState(record?.enabled || false),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const initialLabel = (state: string) =>
    Object.entries(record?.state_mapping || {})
      .find(([k, v]) => k.startsWith("label:") && v === state)?.[0]
      .slice(6) || "";
  const [doing, setDoing] = useState(initialLabel("IN_PROGRESS")),
    [blocked, setBlocked] = useState(initialLabel("BLOCKED")),
    [hold, setHold] = useState(initialLabel("ON_HOLD"));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const mapping: Row = { opened: "NOT_STARTED", closed: "DONE" };
      for (const [key, state] of [
        [doing, "IN_PROGRESS"],
        [blocked, "BLOCKED"],
        [hold, "ON_HOLD"],
      ])
        if (key.trim()) {
          if (`label:${key.trim()}` in mapping)
            throw new Error("Use labels diferentes para cada estado.");
          mapping[`label:${key.trim()}`] = state;
        }
      await api(
        `connections${record ? `/${record.id}` : ""}`,
        pid,
        record ? "PATCH" : "POST",
        {
          name,
          connector_type: "GITLAB",
          base_url: host,
          project: path,
          deployment: host === "https://gitlab.com" ? "CLOUD" : "SERVER",
          secret_env: secret,
          gitlab_options: {
            api: "WORK_ITEMS",
            scope,
            labels: labels
              .split(",")
              .map((v: string) => v.trim())
              .filter(Boolean),
          },
          state_mapping: mapping,
          field_mapping: { execution_status: "operationalState" },
          execution_owner: execution,
          enabled,
          poll_interval_seconds: 900,
          changeReason: reason || "Cadastro guiado GitLab",
        },
        Number(record?.version),
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      wide
      title={record ? "Configurar conexão GitLab" : "Configurar GitLab"}
      description="Conecte um grupo com épicos ou um projeto com issues e tarefas. Nenhum segredo é salvo neste formulário."
      onClose={onClose}
    >
      <form className="entity-form" onSubmit={submit}>
        <div className="gitlab-form-grid">
          <label>
            Nome da conexão
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Host GitLab HTTPS
            <input
              required
              type="url"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </label>
          <label>
            Escopo GitLab
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="PROJECT">Projeto · issues e tarefas</option>
              <option value="GROUP">Grupo · épicos, issues e tarefas</option>
            </select>
          </label>
          <label>
            Caminho completo
            <input
              required
              placeholder={
                scope === "GROUP"
                  ? "empresa/pagamentos"
                  : "empresa/pagamentos/api"
              }
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </label>
          <label>
            Labels para selecionar itens
            <input
              placeholder="tower::acqmod (opcional)"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
            />
            <small>Separe com vírgulas; todas devem estar no item.</small>
          </label>
          <label>
            Nome da variável de credencial
            <input
              required
              pattern="MCT_CONNECTOR_[A-Z0-9_]+"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <small>Informe o nome, nunca o token.</small>
          </label>
          <label>
            Label para em andamento
            <input
              placeholder="status::doing"
              value={doing}
              onChange={(e) => setDoing(e.target.value)}
            />
          </label>
          <label>
            Label para bloqueado
            <input
              placeholder="status::blocked"
              value={blocked}
              onChange={(e) => setBlocked(e.target.value)}
            />
          </label>
          <label>
            Label para em pausa
            <input
              placeholder="status::hold"
              value={hold}
              onChange={(e) => setHold(e.target.value)}
            />
          </label>
          <label>
            Uso da conexão
            <select
              value={execution}
              onChange={(e) => setExecution(e.target.value)}
            >
              <option value="CONTROL_TOWER">Somente referência</option>
              <option value="EXTERNAL">Permitir atualização operacional</option>
            </select>
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          Consultar automaticamente a cada 15 minutos
        </label>
        {record && (
          <label>
            Justificativa da configuração
            <textarea
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        <p className="muted">
          Aberto → não iniciado; fechado → concluído operacional. Labels de
          estado são opcionais. Cada item exige vínculo explícito com um
          registro da torre.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          Salvar configuração GitLab
        </button>
      </form>
    </Modal>
  );
}
export function GitLabGuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button" onClick={onClick}>
      <BookOpen size={15} /> Como conectar o GitLab
    </button>
  );
}
