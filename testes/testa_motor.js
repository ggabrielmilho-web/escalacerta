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
    inicio: '2026-12-14', fim: '2027-12-13',
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

// 3) Datas: Sexta-feira Santa (Páscoa pelo algoritmo de Meeus) e feriados do período
console.log('3) feriados');
const santa = M.feriados(M.diaDe('2026-01-01'), M.diaDe('2028-12-31')).filter(f => /Santa/.test(f.nome)).map(f => M.isoDe(f.dia));
confere(santa.join(' ') === '2026-04-03 2027-03-26 2028-04-14', 'Sexta-feira Santa 2026/2027/2028');

console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
