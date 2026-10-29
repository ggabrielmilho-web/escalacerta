/* Motor da escala 5x2: monta o rodízio de folgas e confere as regras.
   Sem dependências; roda no navegador (window.MotorEscala) e no Node (require). */
(function () {
  'use strict';

  const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const DOM = 6;
  const DIA_MS = 86400000;
  const NAO_ACHEI = 'Não achei uma escala que respeite tudo';

  // datas viram número de dias desde 1970-01-01 (UTC), para não depender de fuso
  function diaDe(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(a, m - 1, d) / DIA_MS);
  }
  function isoDe(n) { return new Date(n * DIA_MS).toISOString().slice(0, 10); }
  function diaSemana(n) { return (new Date(n * DIA_MS).getUTCDay() + 6) % 7; } // 0 = segunda
  function ddmm(n) { const s = isoDe(n); return s.slice(8, 10) + '/' + s.slice(5, 7); }

  // Páscoa (algoritmo de Meeus); a Sexta-feira Santa é 2 dias antes
  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const x = h + l - 7 * m + 114;
    return Math.round(Date.UTC(ano, Math.floor(x / 31) - 1, (x % 31) + 1) / DIA_MS);
  }

  function feriadosDoAno(ano) {
    const fixos = [
      ['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
      ['09-07', 'Independência'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'],
      ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal'],
    ];
    const lista = fixos.map(([md, nome]) => ({ dia: diaDe(`${ano}-${md}`), nome }));
    lista.push({ dia: pascoa(ano) - 2, nome: 'Sexta-feira Santa' });
    return lista;
  }

  function feriados(ini, fim) {
    const anos = [];
    for (let a = +isoDe(ini).slice(0, 4); a <= +isoDe(fim).slice(0, 4); a++) anos.push(a);
    return anos.flatMap(feriadosDoAno).filter(f => f.dia >= ini && f.dia <= fim).sort((x, y) => x.dia - y.dia);
  }

  // gerador pseudoaleatório com semente (mulberry32), para "Gerar outra opção" ser reproduzível
  function aleatorio(semente) {
    let s = (semente >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function combinacoes(lista, k) {
    if (k === 0) return [[]];
    const out = [];
    lista.forEach((x, i) => combinacoes(lista.slice(i + 1), k - 1).forEach(resto => out.push([x, ...resto])));
    return out;
  }

  // dias de trabalho antes da 1ª folga, depois da última e maior sequência dentro da semana
  function infoPadrao(mascara) {
    let cabeca = 0; while (cabeca < 7 && !((mascara >> cabeca) & 1)) cabeca++;
    let cauda = 0; while (cauda < 7 && !((mascara >> (6 - cauda)) & 1)) cauda++;
    let maior = 0, run = 0;
    for (let d = 0; d < 7; d++) {
      if ((mascara >> d) & 1) run = 0; else { run++; maior = Math.max(maior, run); }
    }
    return { cabeca, cauda, maior, dom: !!((mascara >> DOM) & 1) };
  }

  const na = d => (d >= 5 ? 'no ' : 'na ') + DIAS_LONGOS[d];    // "na segunda", "no sábado"
  const da = d => (d >= 5 ? 'do ' : 'da ') + DIAS_LONGOS[d];

  function lista(itens) {
    return itens.length <= 1 ? itens.join('') : itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
  }

  function normalizar(cfg) {
    const nomes = (cfg.nomes || []).map((s, i) => String(s).trim() || `Funcionário ${i + 1}`);
    return {
      nomes,
      // 'F' mulher, 'M' homem, '?' a definir (com o art. 386, '?' segue a regra das mulheres para valer para qualquer um)
      sexos: nomes.map((_, i) => { const s = (cfg.sexos || [])[i]; return s === 'F' || s === 'M' ? s : '?'; }),
      art386: !!cfg.art386,
      aberto: cfg.aberto.slice(0, 7).map(Boolean),
      minimo: cfg.minimo.slice(0, 7).map(v => Math.max(0, Math.floor(+v || 0))),
      podeFolgar: cfg.podeFolgar.slice(0, 7).map(Boolean),
      maxSeguidos: Math.min(6, Math.max(5, +cfg.maxSeguidos || 6)),
      domingoCada: Math.min(7, Math.max(2, Math.floor(+cfg.domingoCada || 3))),   // regra do ramo: 3 comércio, 7 demais
      inicio: cfg.inicio,
      fim: cfg.fim,
    };
  }

  // semanas máximas sem domingo de folga para a pessoa e (2 = domingos alternados)
  function regraDomingo(cfg, e) { return cfg.art386 && cfg.sexos[e] !== 'M' ? 2 : cfg.domingoCada; }

  function descreveRegra(cfg) {
    const Ss = new Set(cfg.nomes.map((_, e) => regraDomingo(cfg, e)));
    const txt = S => (S === 2 ? 'folgar em domingos alternados' : `folgar 1 domingo a cada ${S} semanas`);
    if (Ss.size > 1) return `as mulheres folgarem em domingos alternados e os demais 1 domingo a cada ${cfg.domingoCada} semanas`;
    return `cada um ${txt([...Ss][0])}`;
  }

  // Equipes grandes viram grupos de ~12, cada um com o próprio rodízio (a busca fica rápida e
  // 12 é múltiplo de 2 e de 3, então a conta dos domingos fecha certinho em cada grupo).
  function tamanhosGrupos(N) {
    if (N <= 24) return [N];
    const t = Array(Math.floor(N / 12)).fill(12), resto = N % 12;
    if (resto >= 6) t.push(resto); else if (resto) t[t.length - 1] += resto;
    return t;
  }

  // Confere se as regras fecham e calcula quantas folgas cada dia recebe por semana.
  function planejar(cfgBruta) {
    const cfg = normalizar(cfgBruta);
    const N = cfg.nomes.length, K = cfg.maxSeguidos;
    const erros = [];
    if (!N) return { cfg, erros: [{ titulo: 'Equipe vazia', texto: 'Coloque pelo menos uma pessoa na equipe.', sugestoes: [] }] };
    if (!cfg.inicio || !cfg.fim || diaDe(cfg.fim) < diaDe(cfg.inicio)) {
      return { cfg, erros: [{ titulo: 'Data inválida', texto: 'Escolha a data em que a escala começa.', sugestoes: [] }] };
    }
    if (diaDe(cfg.fim) - diaDe(cfg.inicio) > 366) {
      return { cfg, erros: [{ titulo: 'Período longo demais', texto: 'Monte no máximo 1 ano de escala por vez.', sugestoes: [] }] };
    }
    const aberto = cfg.aberto;
    if (!aberto.some(Boolean)) return { cfg, erros: [{ titulo: 'Nenhum dia aberto', texto: 'Marque pelo menos um dia de funcionamento.', sugestoes: [] }] };

    const fechados = [0, 1, 2, 3, 4, 5, 6].filter(d => !aberto[d]);
    const mascaraFechada = fechados.reduce((m, d) => m | (1 << d), 0);
    const pode = aberto.map((a, d) => a && cfg.podeFolgar[d]);
    const cap = aberto.map((a, d) => (pode[d] ? Math.max(0, N - cfg.minimo[d]) : 0));
    const f = Math.max(0, 2 - fechados.length);       // folgas a distribuir além dos dias fechados
    const domAberto = aberto[DOM];

    // grupos de rodízio: quem segue domingos alternados (art. 386) e os demais, cada um partido em ~12
    const classes = {};
    cfg.nomes.forEach((_, e) => { const S = regraDomingo(cfg, e); (classes[S] = classes[S] || []).push(e); });
    const grupos = [];
    Object.keys(classes).map(Number).sort((a, b) => a - b).forEach(S => {
      let i = 0;
      tamanhosGrupos(classes[S].length).forEach(T => { grupos.push({ S, T, membros: classes[S].slice(i, i + T) }); i += T; });
    });
    const precisaDom = domAberto ? grupos.reduce((a, g) => a + Math.ceil(g.T / g.S), 0) : 0;

    for (let d = 0; d < 7; d++) {
      if (aberto[d] && cfg.minimo[d] > N) {
        erros.push({
          titulo: `Gente de menos ${na(d)}`,
          texto: `Você pediu ${cfg.minimo[d]} pessoas ${na(d)}, mas a equipe tem ${N}.`,
          sugestoes: [`Baixe o mínimo ${da(d)} para ${N} ou aumente a equipe.`],
        });
      }
    }
    if (erros.length) return { cfg, erros };

    if (domAberto && !pode[DOM]) {
      erros.push({
        titulo: 'Ninguém folga no domingo',
        texto: `Com a empresa aberta no domingo, a lei pede ${descreveRegra(cfg).replace(/^cada um /, 'que cada um ')}.`,
        sugestoes: ['Marque o domingo como dia em que pode haver folga.'],
      });
    } else if (domAberto && cap[DOM] < precisaDom) {
      const sug = [];
      if (N - precisaDom >= 0) sug.push(`Baixe o mínimo do domingo para ${N - precisaDom}.`);
      sug.push('Ou aumente a equipe.');
      const cabem = cap[DOM] === 0 ? 'ninguém pode folgar' : `só ${cap[DOM]} ${cap[DOM] === 1 ? 'pode' : 'podem'} folgar`;
      erros.push({
        titulo: 'Domingos de folga não fecham',
        texto: `Para ${descreveRegra(cfg)}, pelo menos ${precisaDom} precisam folgar em todo domingo. ` +
          `Com mínimo de ${cfg.minimo[DOM]} no domingo, ${cabem}.`,
        sugestoes: sug,
      });
    }

    const capTotal = cap.reduce((a, b) => a + b, 0);
    if (f > 0 && capTotal < f * N) {
      const falta = f * N - capTotal;
      const liberar = [0, 1, 2, 3, 4, 5, 6].filter(d => aberto[d] && !pode[d] && cfg.minimo[d] < N);
      const sug = [];
      if (liberar.length) sug.push(`Libere folga em: ${lista(liberar.map(d => DIAS_LONGOS[d]))}.`);
      sug.push(`Baixe o mínimo de pessoas em um ou mais dias (faltam ${falta} folga${falta > 1 ? 's' : ''} por semana).`);
      sug.push('Ou aumente a equipe.');
      erros.push({
        titulo: 'As folgas não cabem',
        texto: `Cada pessoa precisa de ${f} folga${f > 1 ? 's' : ''} por semana${fechados.length ? ' além dos dias fechados' : ''}, ` +
          `ou seja, ${f * N} no total. Com os mínimos que você pediu, os dias liberados comportam só ${capTotal}.`,
        sugestoes: sug,
      });
    }
    if (erros.length) return { cfg, erros };

    // padrões semanais possíveis (folgas escolhidas; os dias fechados entram em todos)
    let escolhas;
    if (f > 0) escolhas = combinacoes([0, 1, 2, 3, 4, 5, 6].filter(d => cap[d] > 0), f);
    else if (domAberto) escolhas = [[], [DOM]];        // 2 dias fechados: folga extra no domingo quando a regra pede
    else escolhas = [[]];
    const cands = escolhas.map(dias => {
      const escolha = dias.reduce((m, d) => m | (1 << d), 0);
      return Object.assign({ dias, escolha, cheio: escolha | mascaraFechada }, infoPadrao(escolha | mascaraFechada));
    }).filter(c => c.maior <= K);

    return { cfg, erros, N, K, f, cap, fechados, mascaraFechada, domAberto, precisaDom, grupos, cands };
  }

  // Quantas folgas cada dia recebe por semana: o domingo leva o necessário e o resto
  // vai para os dias com mais gente sobrando acima do mínimo.
  function distribuir(plano, rnd) {
    const { N, f, cap, domAberto, precisaDom } = plano;
    const n = Array(7).fill(0);
    if (domAberto) n[DOM] = precisaDom;
    if (f === 0) return n;
    let resta = f * N - n[DOM];
    let pref = [6, 0, 1, 2, 3, 5, 4];
    if (rnd) pref = pref.map(d => [d, rnd()]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    while (resta > 0) {
      let melhor = -1, sobra = 0;
      for (const d of pref) if (cap[d] - n[d] > sobra) { sobra = cap[d] - n[d]; melhor = d; }
      if (melhor < 0) return null;
      n[melhor]++; resta--;
    }
    return n;
  }

  // Reparte as folgas de cada dia entre os grupos, proporcional ao tamanho; cada grupo
  // recebe pelo menos os domingos que a regra dele pede.
  function dividir(plano, n, rnd) {
    const { N, f, domAberto, grupos } = plano;
    const minDom = grupos.map(g => (domAberto ? Math.ceil(g.T / g.S) : 0));
    const rest = n.slice();
    let R = N;
    const partes = [];
    for (let g = 0; g < grupos.length; g++) {
      const T = grupos[g].T, depois = R - T;
      if (g === grupos.length - 1) {
        if (rest.some(x => x > T || x < 0)) return null;
        if (rest[DOM] < minDom[g]) return null;
        partes.push(rest.slice());
        break;
      }
      const domDepois = minDom.slice(g + 1).reduce((a, b) => a + b, 0);
      const lo = [], hi = [], alvo = [];
      for (let d = 0; d < 7; d++) {
        lo[d] = Math.max(0, rest[d] - depois);
        hi[d] = Math.min(T, rest[d]);
        alvo[d] = rest[d] * T / R;
      }
      if (domAberto) {
        lo[DOM] = Math.max(lo[DOM], minDom[g]);
        hi[DOM] = Math.min(hi[DOM], rest[DOM] - domDepois);
      }
      const x = alvo.map((a, d) => Math.min(hi[d], Math.max(lo[d], Math.floor(a))));
      if (x.some((v, d) => v < lo[d] || v > hi[d])) return null;
      let soma = x.reduce((a, b) => a + b, 0);
      const meta = f * T + (f === 0 ? x[DOM] : 0);
      const frac = d => alvo[d] - Math.floor(alvo[d]) + (rnd ? rnd() * 0.3 : 0);
      const ordemDias = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => frac(b) - frac(a));
      while (soma < meta) {
        const d = ordemDias.find(d => x[d] < hi[d]);
        if (d === undefined) return null;
        x[d]++; soma++;
      }
      while (soma > meta) {
        const d = ordemDias.slice().reverse().find(d => x[d] > lo[d]);
        if (d === undefined) return null;
        x[d]--; soma--;
      }
      partes.push(x);
      for (let d = 0; d < 7; d++) rest[d] -= x[d];
      R = depois;
    }
    return partes;
  }

  // Ordena N padrões num ciclo: cada pessoa anda uma posição por semana, então a cobertura
  // de toda semana é igual e só as viradas entre padrões vizinhos precisam ser conferidas.
  function ordenar(plano, n, rnd, limite) {
    const { N, K, S, domAberto, cands } = plano;
    const r = n.slice(), seq = [];
    let nos = 0;

    function minimoDomingos(L, g) {
      if (!domAberto) return 0;
      const ate = S - g;
      return L >= ate ? 1 + Math.floor((L - ate) / S) : 0;
    }
    function prioridade(c, ant, L) {
      let p = 0;
      for (const d of c.dias) p += r[d] / L;
      if (c.dias.length === 2 && c.dias[1] - c.dias[0] === 1) p += 0.35;
      if (ant && (ant.cheio >> DOM) & 1 && c.cheio & 1) p += 0.35;
      p -= 0.08 * ((ant ? ant.cauda : 0) + c.cabeca);
      return p + (rnd() - 0.5) * 0.4;
    }
    function busca(g, lead) {
      const L = N - seq.length;
      if (L === 0) {
        const ult = cands[seq[N - 1]], pri = cands[seq[0]];
        if (ult.cauda + pri.cabeca > K) return false;
        if (domAberto && g + lead > S - 1) return false;
        return true;
      }
      if (++nos > limite) return false;
      const ant = seq.length ? cands[seq[seq.length - 1]] : null;
      const opcoes = [];
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        if (!c.dias.every(d => r[d] > 0)) continue;
        if (ant && ant.cauda + c.cabeca > K) continue;
        const g2 = domAberto ? (c.dom ? 0 : g + 1) : 0;
        if (g2 > S - 1) continue;
        opcoes.push({ i, g2, p: prioridade(c, ant, L) });
      }
      opcoes.sort((a, b) => b.p - a.p);
      for (const o of opcoes) {
        const c = cands[o.i];
        c.dias.forEach(d => r[d]--);
        seq.push(o.i);
        const L2 = L - 1;
        let ok = true;
        for (let d = 0; d < 7 && ok; d++) if (r[d] > L2) ok = false;
        if (ok && domAberto && r[DOM] < minimoDomingos(L2, o.g2)) ok = false;
        const lead2 = lead < 0 && c.dom ? seq.length - 1 : lead;
        if (ok && busca(o.g2, lead2)) return true;
        seq.pop();
        c.dias.forEach(d => r[d]++);
        if (nos > limite) return false;
      }
      return false;
    }
    return busca(0, -1) ? seq.slice() : null;
  }

  function pontuar(plano, seq) {
    const bits = [];
    for (const i of seq) for (let d = 0; d < 7; d++) bits.push((plano.cands[i].cheio >> d) & 1);
    const T = bits.length;
    let coladas = 0, pen = 0, run = 0;
    for (let i = 0; i < T; i++) if (bits[i] && (bits[(i + T - 1) % T] || bits[(i + 1) % T])) coladas++;
    const ini = bits.indexOf(1);
    for (let k = 1; k <= T; k++) {
      if (bits[(ini + k) % T]) { pen += Math.max(0, run - 4) ** 2; run = 0; } else run++;
    }
    return coladas / T - 0.6 * pen / T;
  }

  // Ciclo curto: monta a escala de uma mini-equipe de T pessoas (T divide a equipe), com o mínimo de
  // cada dia dividido entre as cópias, e repete essa mini-escala para todo mundo. Cada pessoa passa
  // por todas as semanas do mini-rodízio, então domingos e sábados continuam bem divididos.
  function montarCurto(cfgBruta, cfg, T, semente) {
    const N = cfg.nomes.length, copias = N / T;
    const sub = Object.assign({}, cfgBruta, {
      nomes: Array.from({ length: T }, (_, i) => 'P' + (i + 1)),
      sexos: Array(T).fill(cfg.sexos[0]),
      minimo: cfg.minimo.map(m => Math.ceil(m / copias)),
    });
    const r = montarUma(sub, semente, true, 200);
    if (!r.ok) return null;
    const pos = cfg.nomes.map((_, e) => e % T);              // cada posição do mini-rodízio aparece `copias` vezes
    if (semente) {
      const r2 = aleatorio(semente * 104729 + 17);
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [pos[i], pos[j]] = [pos[j], pos[i]]; }
    }
    return Object.assign({}, r, {
      cfg,
      grade: pos.map(j => r.grade[j].slice()),
      rodizio: pos.map(j => r.rodizio[j]),
      folgasPorDia: r.folgasPorDia.map(n => n * copias),
    });
  }

  // Monta a escala. Prefere, nesta ordem: ciclo curto (3, 4, 2, 5 ou 6 semanas, fácil de decorar);
  // com o art. 386 e regras diferentes na equipe, todo mundo em domingos alternados num rodízio só
  // (domingos mais bem divididos); por fim cada regra no seu rodízio, com o ciclo do tamanho da equipe.
  // `rapido` pula as variantes quando só interessa saber se a escala fecha (conta de quantas pessoas faltam).
  function montar(cfgBruta, semente, semAlternativas, rapido) {
    if (temTurnos(cfgBruta)) return montarTurnos(cfgBruta, semente);
    const cfg = normalizar(cfgBruta);
    const misto = cfg.art386 && cfg.domingoCada > 2 && cfg.sexos.includes('M') && cfg.sexos.some(s => s !== 'M');
    const junto = misto ? Object.assign({}, cfgBruta, { sexos: cfg.nomes.map(() => 'F') }) : null;
    const N = cfg.nomes.length;
    if (!rapido && N > 4 && !planejar(cfgBruta).erros.length) {
      const uniforme = new Set(cfg.nomes.map((_, e) => regraDomingo(cfg, e))).size === 1;
      for (const T of [3, 4, 2, 5, 6].filter(T => T < N && N % T === 0)) {
        const r = junto ? montarCurto(junto, normalizar(junto), T, semente) : uniforme ? montarCurto(cfgBruta, cfg, T, semente) : null;
        if (r) return Object.assign(r, { cfg });
      }
    }
    if (junto) {
      const r = montarUma(junto, semente, true, 200);
      if (r.ok) return Object.assign(r, { cfg });
    }
    return montarUma(cfgBruta, semente, semAlternativas);
  }

  // A semente muda quem fica em qual posição e a solução escolhida ("Gerar outra opção").
  function montarUma(cfgBruta, semente, semAlternativas, prazoMs) {
    const plano = planejar(cfgBruta);
    const cfg = plano.cfg;
    if (plano.erros.length) return { ok: false, cfg, erros: plano.erros };

    const grupos = plano.grupos;
    const rnd = aleatorio(1 + (semente || 0) * 7919);
    const t0 = Date.now(), prazo = prazoMs || (semAlternativas ? 500 : 1500);
    let melhor = null;
    for (let t = 0; t < 120 && Date.now() - t0 < prazo; t++) {
      const n = distribuir(plano, t === 0 ? null : rnd);
      if (!n) continue;
      const partes = grupos.length === 1 ? [n] : dividir(plano, n, t === 0 ? null : rnd);
      if (!partes) continue;
      // a busca insiste mais a cada rodada sem resposta
      const fator = melhor || t < 10 ? 1 : t < 25 ? 5 : 25;
      const seqs = [];
      for (let g = 0; g < grupos.length; g++) {
        const sub = Object.assign({}, plano, { N: grupos[g].T, S: grupos[g].S });
        let seq = null;
        for (let tenta = 0; tenta < 3 && !seq; tenta++) {
          seq = ordenar(sub, partes[g], rnd, (4000 + grupos[g].T * 60) * fator * (1 + 4 * tenta));
        }
        if (!seq) break;
        seqs.push(seq);
      }
      if (seqs.length < grupos.length) continue;
      const s = seqs.reduce((a, seq) => a + pontuar(plano, seq), 0) / seqs.length;
      if (!melhor || s > melhor.s + 1e-9) melhor = { seqs, s, n };
      if (melhor && (t >= 12 || Date.now() - t0 > prazo / 3)) break;
    }
    if (!melhor) {
      // a regra do domingo vem da lei; só o limite de dias seguidos dá para afrouxar
      const sug = [];
      if (!semAlternativas && plano.K === 5 && montar(Object.assign({}, cfgBruta, { maxSeguidos: 6 }), semente, true, true).ok) {
        sug.push({ texto: 'Com até 6 dias seguidos, a escala fecha.', ajuste: { maxSeguidos: 6 }, botao: 'Usar 6 dias seguidos' });
      }
      if (!sug.length) sug.push('Libere folga em mais dias da semana ou baixe o mínimo de pessoas em algum dia.');
      return {
        ok: false, cfg,
        erros: [{
          titulo: NAO_ACHEI,
          texto: `As folgas cabem nos dias, mas não consegui encaixar o rodízio sem passar de ${plano.K} dias seguidos` +
            (plano.domAberto ? ' ou sem quebrar a regra do domingo.' : '.'),
          sugestoes: sug,
        }],
      };
    }

    // cada pessoa ocupa uma posição (grupo, posição) do rodízio da sua regra; a semente embaralha
    const N = plano.N;
    const vagas = Array(N);
    const r2 = semente ? aleatorio(semente * 104729 + 17) : null;
    const porRegra = {};
    grupos.forEach((g, gi) => g.membros.forEach((e, j) => { (porRegra[g.S] = porRegra[g.S] || { pessoas: [], slots: [] }); porRegra[g.S].pessoas.push(e); porRegra[g.S].slots.push([gi, j]); }));
    Object.values(porRegra).forEach(({ pessoas, slots }) => {
      if (r2) for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
      pessoas.forEach((e, i) => { vagas[e] = slots[i]; });
    });

    const ini = diaDe(cfg.inicio), fim = diaDe(cfg.fim);
    const seg0 = ini - diaSemana(ini);
    const semanas = Math.floor((fim - seg0) / 7) + 1;
    const grade = cfg.nomes.map((_, e) => {
      const [g, j] = vagas[e], seq = melhor.seqs[g];
      const linha = [];
      for (let k = 0; k < semanas * 7; k++) {
        const dia = seg0 + k, w = Math.floor(k / 7), d = k % 7;
        if (dia < ini || dia > fim) linha.push(null);
        else if (!cfg.aberto[d]) linha.push('X');
        else linha.push((plano.cands[seq[(j + w) % seq.length]].escolha >> d) & 1 ? 'F' : 'T');
      }
      return linha;
    });

    // escala fixa: as folgas de cada pessoa em cada semana do próprio rodízio, a partir da semana do início
    const periodo = seq => {
      for (let p = 1; p <= seq.length; p++) {
        if (seq.length % p === 0 && seq.every((c, i) => c === seq[(i + p) % seq.length])) return p;
      }
      return seq.length;
    };
    const rodizio = cfg.nomes.map((_, e) => {
      const [g, j] = vagas[e], seq = melhor.seqs[g], p = periodo(seq);
      return { periodo: p, semanas: Array.from({ length: p }, (_, s) => {
        const m = plano.cands[seq[(j + s) % seq.length]].cheio;
        return [0, 1, 2, 3, 4, 5, 6].filter(d => (m >> d) & 1);
      }) };
    });
    const periodos = rodizio.map(r => r.periodo);
    return {
      ok: true, cfg, grade, seg0, semanas, ini, fim,
      feriados: feriados(ini, fim),
      folgasPorDia: melhor.n,
      rodizio,
      repete: Math.max(...periodos),
      repeteMin: Math.min(...periodos),
    };
  }

  // Menor número mínimo de pessoas pela conta (gente por dia, folgas que cabem, domingos).
  function minimoTeorico(cfg) {
    const abertos = [0, 1, 2, 3, 4, 5, 6].filter(d => cfg.aberto[d]);
    if (!abertos.length) return 1;
    const f = Math.max(0, 2 - (7 - abertos.length));
    const perm = abertos.filter(d => cfg.podeFolgar[d]);
    let lo = Math.max(1, ...abertos.map(d => cfg.minimo[d]));
    if (f > 0 && perm.length > f) lo = Math.max(lo, Math.ceil(perm.reduce((a, d) => a + cfg.minimo[d], 0) / (perm.length - f)));
    if (cfg.aberto[DOM] && cfg.podeFolgar[DOM]) {
      while (lo - cfg.minimo[DOM] < Math.ceil(lo / cfg.domingoCada)) lo++;   // regra mais branda: limite por baixo
    }
    return lo;
  }

  // Fecha ou não com essa equipe? Tenta rápido; se o rápido não achar o encaixe, confere no modo
  // completo antes de concluir, para a conta não mandar contratar alguém sem precisar.
  function fecha(cfgBruta) {
    const r = montar(cfgBruta, 0, true, true);
    if (r.ok || r.erros[0].titulo !== NAO_ACHEI) return r;
    return montar(cfgBruta, 0);          // mesmo prazo de busca da página
  }

  // Quantas contratações a regra pede além da equipe de hoje. `sexo` é o das contratações
  // ('M', 'F' ou '?'); só importa com o art. 386. Devolve null se contratar não resolve.
  function faltam(cfgBruta, sexo) {
    const cfg = normalizar(cfgBruta);
    if (!cfg.inicio || !cfg.fim || !cfg.aberto.some(Boolean)) return null;
    const N = cfg.nomes.length;
    const k0 = Math.max(0, minimoTeorico(cfg) - N);
    const t0 = Date.now();
    let semSaida = 0;
    for (let k = k0; k <= k0 + 60 && Date.now() - t0 < 4000; k++) {
      const nomes = cfg.nomes.concat(Array.from({ length: k }, (_, i) => `Contratação ${i + 1}`));
      const sexos = cfg.sexos.concat(Array(k).fill(sexo || '?'));
      const r = fecha(Object.assign({}, cfgBruta, { nomes, sexos }));
      if (r.ok) return k;
      // quando o problema é de encaixe (não de gente), mais gente raramente resolve
      if (r.erros[0].titulo === NAO_ACHEI && ++semSaida >= 4) break;
    }
    return null;
  }

  // Menor equipe com que a escala fecha (sem art. 386, quando o sexo não importa): mostra se sobra gente.
  function menorEquipe(cfgBruta) {
    const cfg = normalizar(Object.assign({}, cfgBruta, { nomes: ['x'] }));
    if (!cfg.inicio || !cfg.fim || !cfg.aberto.some(Boolean)) return null;
    const lo = minimoTeorico(cfg);
    const t0 = Date.now();
    let semSaida = 0;
    for (let N = lo; N <= lo + 60 && Date.now() - t0 < 4000; N++) {
      const nomes = Array.from({ length: N }, (_, i) => 'P' + (i + 1));
      const r = fecha(Object.assign({}, cfgBruta, { nomes, sexos: Array(N).fill('M') }));
      if (r.ok) return N;
      if (r.erros[0].titulo === NAO_ACHEI && ++semSaida >= 4) break;
    }
    return null;
  }

  // Confere uma escala (gerada ou editada à mão). Marca as células com problema.
  function validar(cfgBruta, seg0, grade) {
    if (temTurnos(cfgBruta)) return validarTurnos(cfgBruta, seg0, grade);
    const cfg = normalizar(cfgBruta);
    const K = cfg.maxSeguidos;
    const ini = diaDe(cfg.inicio), fim = diaDe(cfg.fim);
    const total = grade.length ? grade[0].length : 0;
    const semanas = total / 7;
    // 1 = dias seguidos, 2 = domingo, 4 = semana com folga faltando, 8 = folga a mais na semana (aviso)
    const marcas = grade.map(l => l.map(() => 0));
    const problemas = [], avisos = [];
    // com 2 dias fechados e o domingo aberto, a folga extra no domingo é a regra do domingo, não excesso
    const fechados = cfg.aberto.filter(a => !a).length;
    const folgasNormais = Math.max(2, fechados) + (fechados >= 2 && cfg.aberto[DOM] ? 1 : 0);
    const porPessoa = [];
    const nome = e => cfg.nomes[e] || `Pessoa ${e + 1}`;

    grade.forEach((linha, e) => {
      const S = regraDomingo(cfg, e);
      let folgas = 0, domTrab = 0, maior = 0, run = 0, inicioRun = -1;
      let domSeguidos = 0;
      for (let k = 0; k < total; k++) {
        const v = linha[k], dia = seg0 + k, d = k % 7;
        if (v === 'F') folgas++;
        if (v === 'T') {
          if (run === 0) inicioRun = k;
          run++;
          maior = Math.max(maior, run);
          if (run > K) {
            marcas[e][k] |= 1;
            if (run === K + 1) {
              let fimRun = k; while (fimRun + 1 < total && linha[fimRun + 1] === 'T') fimRun++;
              problemas.push({ tipo: 'seguidos', pessoa: e, k,
                texto: `${nome(e)} trabalha ${fimRun - inicioRun + 1} dias seguidos (${ddmm(seg0 + inicioRun)} a ${ddmm(seg0 + fimRun)}). O limite é ${K}.` });
            }
          }
        } else run = 0;
        if (d === DOM && v !== null && cfg.aberto[DOM]) {
          if (v === 'T') {
            domTrab++; domSeguidos++;
            if (domSeguidos >= S) {
              marcas[e][k] |= 2;
              if (domSeguidos === S) problemas.push({ tipo: 'domingo', pessoa: e, k,
                texto: `${nome(e)} trabalha ${S} domingos seguidos (até ${ddmm(dia)}). ` +
                  (S === 2 ? 'Precisa folgar em domingos alternados.' : `Precisa folgar 1 a cada ${S}.`) });
            }
          } else domSeguidos = 0;
        }
      }
      for (let w = 0; w < semanas; w++) {
        const seg = seg0 + w * 7;
        if (seg < ini || seg + 6 > fim) continue;              // semana parcial: não dá para julgar
        let n = 0;
        for (let d = 0; d < 7; d++) { const v = linha[w * 7 + d]; if (v === 'F' || v === 'X') n++; }
        if (n < 2) {
          for (let d = 0; d < 7; d++) marcas[e][w * 7 + d] |= 4;
          problemas.push({ tipo: 'semana', pessoa: e, k: w * 7,
            texto: `${nome(e)} tem ${n} folga${n === 1 ? '' : 's'} na semana de ${ddmm(seg)}. Precisa de 2.` });
        } else if (n > folgasNormais) {
          // folga a mais não é ilegal (férias, atestado, compensação), mas costuma ser engano: avisa sem bloquear
          for (let d = 0; d < 7; d++) if (linha[w * 7 + d] === 'F') marcas[e][w * 7 + d] |= 8;
          avisos.push({ tipo: 'folga_extra', pessoa: e, k: w * 7,
            texto: `${nome(e)} tem ${n} folgas na semana de ${ddmm(seg)}. O normal são ${folgasNormais}: se for férias ou afastamento, tudo bem.` });
        }
      }
      porPessoa.push({ folgas, domTrab, maior, regraDomingo: S });
    });

    const cobertura = [], faltaGente = [];
    for (let k = 0; k < total; k++) {
      const d = k % 7, dia = seg0 + k;
      if (dia < ini || dia > fim || !cfg.aberto[d]) { cobertura.push(null); faltaGente.push(false); continue; }
      const n = grade.reduce((a, l) => a + (l[k] === 'T' ? 1 : 0), 0);
      cobertura.push(n);
      const falta = n < cfg.minimo[d];
      faltaGente.push(falta);
      if (falta) problemas.push({ tipo: 'cobertura', pessoa: -1, k,
        texto: `${DIAS[d]} ${ddmm(dia)}: ${n} trabalhando, o mínimo é ${cfg.minimo[d]}.` });
    }
    problemas.sort((a, b) => a.k - b.k);
    avisos.sort((a, b) => a.k - b.k);
    return { problemas, avisos, marcas, porPessoa, cobertura, faltaGente };
  }

  // ---------------- turnos fixos ----------------
  // Cada pessoa fica sempre no mesmo turno (manhã, intermediário, noite…). Então cada turno é uma equipe à
  // parte, com o próprio mínimo por dia: o motor monta um de cada vez, e a escala da empresa é a junção.
  // cfg.turnos = [{ nome, minimo: [7] }] e cfg.turnoDe[e] = turno da pessoa e. Dias abertos, "pode folgar",
  // ramo, art. 386, dias seguidos e período valem para todos os turnos.
  function temTurnos(cfg) { return !!(cfg && Array.isArray(cfg.turnos) && cfg.turnos.length && Array.isArray(cfg.turnoDe)); }
  function membrosDosTurnos(cfg) {
    return cfg.turnos.map((_, t) => cfg.turnoDe.map((x, e) => (x === t ? e : -1)).filter(e => e >= 0));
  }
  // a equipe de um turno, no formato de sempre (sem turnos): é o que montar, faltam e menorEquipe recebem
  function doTurno(cfg, t) {
    const membros = membrosDosTurnos(cfg)[t];
    const sub = Object.assign({}, cfg, {
      nomes: membros.map(e => cfg.nomes[e]), sexos: membros.map(e => (cfg.sexos || [])[e]), minimo: cfg.turnos[t].minimo,
    });
    delete sub.turnos; delete sub.turnoDe;
    return sub;
  }
  // a configuração da empresa toda: o mínimo é a soma dos turnos (só para mostrar; cada turno é conferido no seu)
  function cfgJunto(cfgBruta) {
    const cfg = normalizar(Object.assign({}, cfgBruta, { minimo: [0, 1, 2, 3, 4, 5, 6].map(d =>
      cfgBruta.turnos.reduce((s, t) => s + Math.max(0, Math.floor(+t.minimo[d] || 0)), 0)) }));
    cfg.turnos = cfgBruta.turnos.map((t, i) => ({ nome: String(t.nome || '').trim() || `Turno ${i + 1}`,
      minimo: t.minimo.slice(0, 7).map(v => Math.max(0, Math.floor(+v || 0))) }));
    cfg.turnoDe = cfg.nomes.map((_, e) => cfgBruta.turnoDe[e]);
    return cfg;
  }
  // junta as escalas já montadas de cada turno (na ordem de cfg.turnos) numa escala só, na ordem das pessoas
  function juntarTurnos(cfgBruta, resultados) {
    const cfg = cfgJunto(cfgBruta), membros = membrosDosTurnos(cfg);
    const ruim = resultados.findIndex(r => !r.ok);
    if (ruim >= 0) {
      const nome = cfg.turnos[ruim].nome;
      return { ok: false, cfg, turno: ruim,
        erros: resultados[ruim].erros.map(e => Object.assign({}, e, { titulo: `${nome}: ${e.titulo}` })) };
    }
    const base = resultados[0];
    const grade = Array(cfg.nomes.length), rodizio = Array(cfg.nomes.length);
    resultados.forEach((r, t) => membros[t].forEach((e, j) => { grade[e] = r.grade[j]; rodizio[e] = r.rodizio[j]; }));
    const periodos = rodizio.map(r => r.periodo);
    return {
      ok: true, cfg, grade, rodizio, seg0: base.seg0, semanas: base.semanas, ini: base.ini, fim: base.fim, feriados: base.feriados,
      repete: Math.max(...periodos), repeteMin: Math.min(...periodos),
      porTurno: resultados.map(r => ({ repete: r.repete, repeteMin: r.repeteMin })),
    };
  }
  function montarTurnos(cfgBruta, semente) {
    const cfg = cfgJunto(cfgBruta);
    const vazio = cfg.turnos.findIndex((_, t) => !membrosDosTurnos(cfg)[t].length);
    if (vazio >= 0) return { ok: false, cfg, turno: vazio,
      erros: [{ titulo: `${cfg.turnos[vazio].nome}: turno sem ninguém`, texto: 'Coloque pelo menos uma pessoa no turno ou tire o turno.', sugestoes: [] }] };
    return juntarTurnos(cfgBruta, cfg.turnos.map((_, t) => montar(doTurno(cfg, t), semente)));
  }
  // confere cada turno contra o próprio mínimo; marcas e totais voltam na ordem das pessoas da empresa
  function validarTurnos(cfgBruta, seg0, grade) {
    const cfg = cfgJunto(cfgBruta), membros = membrosDosTurnos(cfg);
    const total = grade.length ? grade[0].length : 0;
    const marcas = grade.map(() => null), porPessoa = grade.map(() => null);
    const problemas = [], avisos = [], cobertura = Array(total).fill(null), faltaGente = Array(total).fill(false);
    const coberturaTurno = [], faltaTurno = [];
    membros.forEach((m, t) => {
      const v = validar(doTurno(cfg, t), seg0, m.map(e => grade[e]));
      const nome = cfg.turnos[t].nome;
      m.forEach((e, j) => { marcas[e] = v.marcas[j]; porPessoa[e] = v.porPessoa[j]; });
      const deVolta = p => Object.assign({}, p, { turno: t, pessoa: p.pessoa >= 0 ? m[p.pessoa] : -1,
        texto: p.pessoa >= 0 ? p.texto : `${nome} · ${p.texto}` });
      v.problemas.forEach(p => problemas.push(deVolta(p)));
      v.avisos.forEach(a => avisos.push(deVolta(a)));
      coberturaTurno.push(v.cobertura);
      faltaTurno.push(v.faltaGente);
      v.cobertura.forEach((n, k) => { if (n !== null) cobertura[k] = (cobertura[k] || 0) + n; });
      v.faltaGente.forEach((f, k) => { if (f) faltaGente[k] = true; });
    });
    problemas.sort((a, b) => a.k - b.k);
    avisos.sort((a, b) => a.k - b.k);
    return { problemas, avisos, marcas, porPessoa, cobertura, faltaGente, coberturaTurno, faltaTurno };
  }

  const api = { DIAS, DIAS_LONGOS, diaDe, isoDe, diaSemana, ddmm, feriados, planejar, montar, validar,
    faltam, menorEquipe, descreveRegra: c => descreveRegra(normalizar(c)),
    temTurnos, membrosDosTurnos, doTurno, juntarTurnos,
    _interno: { distribuir, ordenar, aleatorio, normalizar, regraDomingo } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.MotorEscala = api;
})();
