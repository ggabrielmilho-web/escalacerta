/* Teste do motor da Escala Certa. Rodar da pasta Escala:  node testes/testa_motor.js
   Sem dependências. Sai com código 1 se alguma conferência falhar. */
const path = require('path');
const M = require(path.join(__dirname, '..', 'gerador', 'motor.js'));

let falhas = 0;
const confere = (ok, msg) => { if (!ok) { falhas++; console.log('  FALHOU:', msg); } };

// 1) Escalas aleatórias: tudo o que o motor monta tem de passar na própria conferência, sem aviso,
//    e o calendário de 12 meses tem de seguir exatamente a escala fixa de cada pessoa.
console.log('1) escalas aleatórias');
let s = 7;
const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
let geradas = 0, recusadas = 0;
for (let caso = 0; caso < 600; caso++) {
  const N = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50, 100][caso % 13];
  const cfg = {
    nomes: Array.from({ length: N }, (_, i) => 'P' + i),
    sexos: Array.from({ length: N }, () => (rnd() < 0.45 ? 'F' : 'M')),
    art386: rnd() < 0.5,
    aberto: Array.from({ length: 7 }, (_, d) => d < 5 || rnd() < 0.85),
    podeFolgar: Array.from({ length: 7 }, () => rnd() < 0.8),
    minimo: Array.from({ length: 7 }, () => Math.floor(N * (0.3 + rnd() * 0.45))),
    maxSeguidos: rnd() < 0.5 ? 5 : 6, domingoCada: rnd() < 0.5 ? 3 : 7,
    inicio: '2026-12-14', fim: '2027-12-13', folgas: caso % 3 ? 'juntas' : 'separadas',
  };
  const r = M.montar(cfg, caso % 2);
  if (!r.ok) { recusadas++; continue; }
  geradas++;
  const v = M.validar(r.cfg, r.seg0, r.grade);
  confere(!v.problemas.length, `caso ${caso}: ${v.problemas.length} problemas (${(v.problemas[0] || {}).texto})`);
  confere(!v.avisos.length, `caso ${caso}: ${v.avisos.length} avisos de folga a mais`);
  let divergencias = 0;
  r.grade.forEach((linha, e) => linha.forEach((x, k) => {
    if (x === null) return;
    const rod = r.rodizio[e];
    if ((x !== 'T') !== rod.semanas[Math.floor(k / 7) % rod.periodo].includes(k % 7)) divergencias++;
  }));
  confere(!divergencias, `caso ${caso}: calendário diverge da escala fixa em ${divergencias} dias`);
}
console.log(`   ${geradas} montadas, ${recusadas} recusadas (regra impossível), falhas até aqui: ${falhas}`);

// 2) Respostas conhecidas da conversa de produto (se mudarem, alguma regra mudou)
console.log('2) respostas conhecidas');
const base = { aberto: Array(7).fill(true), podeFolgar: Array(7).fill(true), maxSeguidos: 6, domingoCada: 3, inicio: '2026-12-14', fim: '2027-12-13' };
const loja = { ...base, nomes: ['A', 'B', 'C', 'D'], sexos: ['F', 'F', 'M', 'M'], minimo: [3, 3, 3, 3, 4, 5, 3] };
confere(M.faltam({ ...loja, art386: true }, 'M') === 1, 'loja com art. 386: falta 1 se contratar homem');
confere(M.faltam({ ...loja, art386: true }, 'F') === 2, 'loja com art. 386: faltam 2 se contratar mulheres');
const hoje = N => { const dom = N - Math.ceil(N / 3), resto = Math.floor((6 * N - dom) / 6); return [resto, resto, resto, resto, resto, resto, dom]; };
for (const [N, esperado] of [[10, 2], [50, 10], [100, 20]]) {
  const k = M.faltam({ ...base, maxSeguidos: 5, nomes: Array.from({ length: N }, (_, i) => 'P' + i), minimo: hoje(N) }, 'M');
  confere(k === esperado, `operação de hoje no 6x1 com ${N} pessoas: faltam ${esperado} (deu ${k})`);
}
const impossivel = M.montar({ ...base, nomes: ['A', 'B', 'C'], minimo: [2, 3, 3, 3, 3, 2, 1], podeFolgar: [1, 0, 0, 0, 0, 1, 1].map(Boolean) }, 0);
confere(!impossivel.ok && impossivel.erros[0].titulo === 'As folgas não cabem', 'folga só sáb/dom/seg com segunda 2: não cabe');

// 2b) Desenho das folgas: o exemplo da página sai sem 3 folgas seguidas e sem "folga, trabalha 1 dia, folga"
//     (nem na volta do rodízio); "separadas" emenda menos que "juntas"; e o gosto não muda quantos faltam.
console.log('2b) folgas juntas ou separadas');
const desenhoFolgas = r => {
  let tres = 0, um = 0, emendadas = 0;
  for (const l of r.grade) {
    const t = l.filter(x => x !== null).join('');
    for (const m of t.matchAll(/[FX]{2,}/g)) (m[0].length >= 3 ? tres++ : emendadas++);
    um += (t.match(/(?<=[FX])T(?=[FX])/g) || []).length;
  }
  return { tres, um, emendadas };
};
const exemplo = { ...base, maxSeguidos: 5, nomes: ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa'], minimo: [3, 3, 3, 3, 3, 3, 2] };
const dJ = desenhoFolgas(M.montar({ ...exemplo, folgas: 'juntas' }, 0));
const dS = desenhoFolgas(M.montar({ ...exemplo, folgas: 'separadas' }, 0));
confere(!dJ.tres && !dJ.um, `exemplo, folgas juntas: ${dJ.tres} vezes 3 folgas seguidas, ${dJ.um} folga-1 dia-folga`);
confere(!dS.tres && !dS.um, `exemplo, folgas separadas: ${dS.tres} vezes 3 folgas seguidas, ${dS.um} folga-1 dia-folga`);
confere(dS.emendadas < dJ.emendadas / 2, `separadas emenda menos (${dS.emendadas}) que juntas (${dJ.emendadas})`);
confere(M._interno.normalizar({ ...exemplo }).folgas === 'juntas', 'sem escolha, as folgas vêm juntas');
for (const folgas of ['juntas', 'separadas']) {
  confere(M.faltam({ ...loja, art386: true, folgas }, 'M') === 1, `folgas ${folgas}: a loja com art. 386 continua faltando 1`);
}

// 3) Datas: Sexta-feira Santa (Páscoa pelo algoritmo de Meeus) e feriados do período
console.log('3) feriados');
const santa = M.feriados(M.diaDe('2026-01-01'), M.diaDe('2028-12-31')).filter(f => /Santa/.test(f.nome)).map(f => M.isoDe(f.dia));
confere(santa.join(' ') === '2026-04-03 2027-03-26 2028-04-14', 'Sexta-feira Santa 2026/2027/2028');

// 4) Turnos fixos: cada turno montado à parte, conferido contra o próprio mínimo; a junção não pode
//    misturar as pessoas de turno nem esconder a falta de gente de um turno atrás da sobra de outro
console.log('4) turnos');
const nomesT = ['M1', 'M2', 'M3', 'M4', 'M5', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'N1', 'N2', 'N3', 'N4'];
const turnoDe = nomesT.map(n => ({ M: 0, I: 1, N: 2 }[n[0]]));
const turnos = [{ nome: 'Manhã', minimo: [3, 3, 3, 3, 3, 4, 3] }, { nome: 'Intermediário', minimo: [5, 5, 5, 5, 5, 5, 4] },
  { nome: 'Noite', minimo: [3, 3, 3, 3, 3, 3, 2] }];
const emp = { ...base, maxSeguidos: 5, nomes: nomesT, sexos: [], turnos, turnoDe };
const rt = M.montar(emp, 0);
confere(rt.ok && rt.grade.length === 16 && rt.cfg.turnos.length === 3, 'três turnos: escala de 16 pessoas montada');
if (rt.ok) {
  const vt = M.validar(rt.cfg, rt.seg0, rt.grade);
  confere(!vt.problemas.length && !vt.avisos.length, `três turnos: sem problema (${(vt.problemas[0] || {}).texto})`);
  confere(vt.coberturaTurno.length === 3 && vt.cobertura.every((n, k) => n === null || n === vt.coberturaTurno.reduce((s, c) => s + c[k], 0)),
    'cobertura da empresa = soma dos turnos');
  // cada turno, sozinho, bate com o motor rodando só aquele turno
  M.membrosDosTurnos(rt.cfg).forEach((m, t) => {
    const so = M.montar(M.doTurno(rt.cfg, t), 0);
    confere(so.ok && m.every((e, j) => so.grade[j].join() === rt.grade[e].join()), `turno ${t}: igual ao motor sozinho`);
  });
  // tirar a gente do intermediário num dia acusa o intermediário, mesmo com a noite sobrando
  const g = rt.grade.map(l => l.slice());
  const k = g[0].findIndex((v, i) => v !== null && i % 7 === 2);
  M.membrosDosTurnos(rt.cfg)[1].forEach(e => { g[e][k] = 'F'; });
  const vf = M.validar(rt.cfg, rt.seg0, g);
  confere(vf.faltaTurno[1][k] && !vf.faltaTurno[2][k] && vf.faltaGente[k], 'falta no intermediário aparece no turno certo');
  confere(vf.problemas.some(p => p.tipo === 'cobertura' && p.turno === 1 && p.texto.startsWith('Intermediário · ')),
    'o problema de cobertura diz o turno');
  confere(vf.problemas.filter(p => p.pessoa >= 0).every(p => rt.cfg.turnoDe[p.pessoa] === 1), 'problemas de pessoa voltam com o índice certo');
}
// pessoas fora de ordem (o formulário pode intercalar): a grade volta na ordem das pessoas
const ordemMista = [2, 0, 1, 0, 2, 1, 1, 0, 1, 2, 1, 0, 1, 2, 0, 1];
const rm = M.montar({ ...emp, turnoDe: ordemMista }, 0);
confere(rm.ok && rm.cfg.turnoDe.join() === ordemMista.join(), 'turnos intercalados: monta e guarda o turno de cada um');
const vazio = M.montar({ ...emp, turnoDe: nomesT.map(() => 0) }, 0);
confere(!vazio.ok && vazio.turno === 1 && /Intermediário/.test(vazio.erros[0].titulo), 'turno sem ninguém: erro com o nome do turno');
const naoFecha = M.montar({ ...emp, turnos: turnos.map((t, i) => (i === 2 ? { ...t, minimo: [4, 4, 4, 4, 4, 4, 4] } : t)) }, 0);
confere(!naoFecha.ok && naoFecha.turno === 2 && /^Noite: /.test(naoFecha.erros[0].titulo), 'turno que não fecha: erro diz qual');
const faltaNoite = M.faltam(M.doTurno(rt.cfg || emp, 2), 'M');
confere(faltaNoite === 0, `noite com 4 e mínimo 3: dá conta (deu ${faltaNoite})`);
confere(M.faltam(M.doTurno({ ...emp, turnos: turnos.map((t, i) => (i === 2 ? { ...t, minimo: [4, 4, 4, 4, 4, 4, 4] } : t)) }, 2), 'M') >= 2,
  'noite com 4 e mínimo 4 todo dia: precisa contratar');
// o exemplo do líder da Havan: 1 pessoa por turno, todos os dias → 2 por turno no 5x2
const uma = { ...base, maxSeguidos: 5, nomes: ['Ana', 'Bia', 'Caio'], turnoDe: [0, 1, 2],
  turnos: [{ nome: 'Manhã', minimo: [1, 1, 1, 1, 1, 1, 1] }, { nome: 'Intermediário', minimo: [1, 1, 1, 1, 1, 1, 1] }, { nome: 'Noite', minimo: [1, 1, 1, 1, 1, 1, 1] }] };
confere([0, 1, 2].every(t => M.faltam(M.doTurno(uma, t), 'M') === 1), '1 por turno nos 7 dias: falta 1 em cada turno');

console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
