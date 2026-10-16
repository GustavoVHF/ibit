/**
 * CLI da automação (roda dentro do container):
 *   docker compose exec automation node dist/cli.js groups [busca]
 *   docker compose exec automation node dist/cli.js projects
 *   docker compose exec automation node dist/cli.js select-group <projectId> <groupId@g.us>
 *   docker compose exec automation node dist/cli.js deadlines [--dry]
 *   docker compose exec automation node dist/cli.js weekly [--dry] [--force]
 *   docker compose exec automation node dist/cli.js status
 */
import { evolution, isGroupJid } from './evolution.js';
import { runDeadlineAlerts } from './jobs/deadlineAlerts.js';
import { runWeeklyReport } from './jobs/weeklyReport.js';
import { getProject, listProjects } from './projectData.js';
import { listTargets, saveTarget } from './targets.js';
import { parseCommand, resolveCommand, runCommand } from './commands/index.js';

const [cmd, ...args] = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const positional = args.filter((a) => !a.startsWith('--'));

function printResults(results: Array<{ message?: string } & Record<string, unknown>>) {
  for (const r of results) {
    const { message, ...rest } = r;
    console.log(JSON.stringify(rest));
    if (message) console.log(`\n----- mensagem -----\n${message}\n--------------------\n`);
  }
}

async function main() {
  switch (cmd) {
    case 'groups': {
      const search = positional[0]?.toLowerCase();
      const groups = (await evolution.fetchGroups()).filter((g) => !search || g.subject.toLowerCase().includes(search));
      console.table(groups.map((g) => ({ nome: g.subject, id: g.id, participantes: g.size ?? '' })));
      break;
    }
    case 'projects':
      console.table(await listProjects());
      break;
    case 'select-group': {
      const [projectId, groupId] = positional;
      if (!projectId || !groupId || !isGroupJid(groupId)) throw new Error('Uso: select-group <projectId> <groupId@g.us>');
      const project = await getProject(projectId);
      if (!project) throw new Error(`Projeto ${projectId} não encontrado`);
      const group = await evolution.findGroup(groupId);
      if (!group) throw new Error('Grupo não encontrado neste WhatsApp');
      await saveTarget({ projectId, groupId, groupName: group.subject });
      console.log(`OK: projeto "${project.name}" → grupo "${group.subject}"`);
      break;
    }
    case 'deadlines':
      printResults((await runDeadlineAlerts({ dryRun: has('--dry') })) as any);
      break;
    case 'weekly':
      printResults((await runWeeklyReport({ dryRun: has('--dry'), force: has('--force') })) as any);
      break;
    case 'status':
      console.log({ whatsapp: await evolution.connectionState(), targets: await listTargets() });
      break;
    case 'preview': {
      // node dist/cli.js preview "/gantt engenharia"
      const parsed = parseCommand(positional.join(' '));
      const projectId = (await listTargets())[0]?.projectId;
      if (!parsed || !projectId) throw new Error('Uso: preview "/kpis" (precisa de um grupo vinculado)');
      const command = resolveCommand(parsed.name);
      console.log(command ? await runCommand(command, parsed.args, projectId, new Date(), { dryRun: true }) : `Comando desconhecido: /${parsed.name}`);
      break;
    }
    default:
      console.log('Comandos: groups [busca] | projects | select-group <projectId> <groupId> | deadlines [--dry] | weekly [--dry] [--force] | preview "/kpis" | status');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
