/* Monta a planilha Excel da escala com ExcelJS (recebe a biblioteca para rodar no navegador e no Node).
   Dois formatos: "dia" (uma linha por dia, bom para equipe pequena) e "pessoa" (uma linha por pessoa). */
(function () {
  'use strict';

  const FONTE = 'Arial';
  const COR = {
    tinta: 'FF1D2A26', cinza: 'FF8A9590', folga: 'FFCDEBD3', folgaTinta: 'FF1F6B35', fechado: 'FFE4E7E5',
    domingo: 'FFF3EBD9', cabeca: 'FF16443B', branco: 'FFFFFFFF', erro: 'FFF6C9C4', erroTinta: 'FF9C1C10',
    aviso: 'FFF8CBAD', avisoTinta: 'FF843C0C', linha: 'FFD5DBD8', semana: 'FF7F8C86', feriado: 'FFB3261E',
    feriadoFundo: 'FFF9E1DE', trabalhaFraco: 'FFB5BFBA',
  };
  const DIA_NOME = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const PALAVRA = { T: 'Trabalha', F: 'Folga', X: 'Fechado' };
  const preenche = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb }, bgColor: { argb } });
  const fino = { style: 'thin', color: { argb: COR.linha } };
  const bordas = { top: fino, left: fino, bottom: fino, right: fino };
  const bordasFimSemana = { top: fino, left: fino, right: fino, bottom: { style: 'medium', color: { argb: COR.semana } } };
  const estiloErro = { fill: preenche(COR.erro), font: { bold: true, color: { argb: COR.erroTinta } } };
  const estiloAviso = { fill: preenche(COR.aviso), font: { bold: true, color: { argb: COR.avisoTinta } } };

  function letra(n) { // 1 -> A
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function contexto(M, dados) {
    const { cfg, seg0, grade, feriados } = dados;
    const nomeFeriado = {};
    feriados.forEach(f => { nomeFeriado[f.dia] = f.nome; });
    return {
      cfg, seg0, grade, feriados, nomeFeriado,
      N: grade.length, total: grade[0].length, semanas: grade[0].length / 7,
      K: cfg.maxSeguidos, S: cfg.domingoCada,
      ini: M.diaDe(cfg.inicio), fim: M.diaDe(cfg.fim),
      dataLonga: n => { const s = M.isoDe(n); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; },
      // quantos dias de `a` a `b` a pessoa `e` tem com ok(valor, dia da semana); fora da grade não conta
      conta: (e, a, b, ok) => {
        let n = 0;
        for (let dia = a; dia <= b; dia++) {
          const v = grade[e][dia - seg0];
          if (v !== undefined && v !== null && ok(v, M.diaSemana(dia))) n++;
        }
        return n;
      },
    };
  }

  // Toda fórmula vai com o resultado já calculado: a Exibição Protegida do Excel, a prévia do WhatsApp,
  // o Excel do celular e o Google Drive mostram o valor gravado e não calculam (sem isso, abrem em branco).
  const f = (formula, result) => ({ formula, result });
  const ehFolga = v => v === 'F' || v === 'X';

  function titulo(ws, txt, sub) {
    ws.getCell(1, 1).value = txt;
    ws.getCell(1, 1).font = { name: FONTE, size: 14, bold: true, color: { argb: COR.tinta } };
    if (sub) {
      ws.getCell(2, 1).value = sub;
      ws.getCell(2, 1).font = { name: FONTE, size: 9, italic: true, color: { argb: COR.cinza } };
    }
  }

  function cabecalho(ws, r, c, v, largura) {
    const cel = ws.getCell(r, c);
    cel.value = v;
    cel.font = { name: FONTE, size: 9, bold: true, color: { argb: COR.branco } };
    cel.fill = preenche(COR.cabeca);
    cel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cel.border = bordas;
    if (largura) ws.getColumn(c).width = largura;
    return cel;
  }

  // ---------------- formato "uma linha por dia" ----------------
  function abaPorDia(wb, M, x) {
    const { cfg, N, K, ini, fim, nomeFeriado } = x;
    const L0 = 4, P1 = 5;                                 // linha do cabeçalho e 1ª linha de dados
    const C1 = 3, CN = C1 + N - 1, C_TRAB = CN + 1, C_MIN = CN + 2, C_OBS = CN + 3;
    const ws = wb.addWorksheet('Calendário', {
      views: [{ state: 'frozen', xSplit: 2, ySplit: L0, showGridLines: false }],
      pageSetup: { orientation: N > 6 ? 'landscape' : 'portrait', paperSize: 9, printTitlesRow: `${L0}:${L0}`,
        fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    });
    titulo(ws, `Escala de trabalho 5x2 · ${x.dataLonga(ini)} a ${x.dataLonga(fim)}`,
      `Para trocar uma folga, troque "Trabalha" por "Folga": tudo recalcula. Vermelho = passou de ${K} dias seguidos ou faltou gente; ` +
      'laranja no domingo = semana com menos de 2 folgas.');
    cabecalho(ws, L0, 1, 'Data', 12);
    cabecalho(ws, L0, 2, 'Dia da Semana', 15);
    cfg.nomes.forEach((nome, e) => cabecalho(ws, L0, C1 + e, nome, Math.max(12, Math.min(22, nome.length + 3))));
    cabecalho(ws, L0, C_TRAB, 'Trabalhando', 12);
    cabecalho(ws, L0, C_MIN, 'Mínimo', 9);
    cabecalho(ws, L0, C_OBS, 'Observação', 34);
    ws.getRow(L0).height = 22;

    const linhaDoDia = {};
    let r = P1;
    for (let dia = ini; dia <= fim; dia++, r++) {
      linhaDoDia[dia] = r;
      const k = dia - x.seg0, d = M.diaSemana(dia), dom = d === 6;
      const b = dom ? bordasFimSemana : bordas;
      const cData = ws.getCell(r, 1);
      cData.value = 25569 + dia;
      cData.numFmt = 'dd/mm/yyyy';
      ws.getCell(r, 2).value = DIA_NOME[d];
      x.grade.forEach((linha, e) => {
        const cel = ws.getCell(r, C1 + e);
        cel.value = PALAVRA[linha[k]];
        if (linha[k] !== 'X') {
          cel.dataValidation = { type: 'list', allowBlank: false, formulae: ['"Trabalha,Folga"'], showErrorMessage: true,
            errorTitle: 'Valor inválido', error: 'Use Trabalha ou Folga.' };
        }
      });
      const col = `${letra(C1)}${r}:${letra(CN)}${r}`;
      ws.getCell(r, C_TRAB).value = cfg.aberto[d] ? f(`COUNTIF(${col},"Trabalha")`, x.grade.filter(l => l[k] === 'T').length) : '—';
      ws.getCell(r, C_MIN).value = cfg.aberto[d] ? cfg.minimo[d] : '—';
      if (nomeFeriado[dia]) {
        ws.getCell(r, C_OBS).value = `Feriado: ${nomeFeriado[dia]} (se abrir, pagar em dobro ou dar folga)`;
      }
      // domingo e feriado com a linha inteira pintada; a folga (formatação condicional) pinta por cima
      const fundo = nomeFeriado[dia] ? COR.feriadoFundo : dom ? COR.domingo : null;
      for (let c = 1; c <= C_OBS; c++) {
        const cel = ws.getCell(r, c);
        cel.border = b;
        cel.font = { name: FONTE, size: 10, bold: c <= 2 && dom, color: { argb: c === C_OBS ? COR.feriado : COR.tinta } };
        cel.alignment = { horizontal: c === 2 || c === C_OBS ? 'left' : 'center', vertical: 'middle' };
        if (fundo) cel.fill = preenche(fundo);
      }
    }
    const ult = r - 1;
    const area = `${letra(C1)}${P1}:${letra(CN)}${ult}`;
    const regras = [];
    if (ult - P1 >= K) {
      const r1 = P1 + K;
      regras.push({ ref: `${letra(C1)}${r1}:${letra(CN)}${ult}`, rules: [{ type: 'expression', priority: 1, stopIfTrue: true,
        formulae: [`COUNTIF(${letra(C1)}${P1}:${letra(C1)}${r1},"Trabalha")=${K + 1}`], style: estiloErro }] });
    }
    // domingo de semana inteira com menos de 2 folgas
    const primeiraSeg = ini + ((7 - M.diaSemana(ini)) % 7);
    if (primeiraSeg + 6 <= fim) {
      const rd = linhaDoDia[primeiraSeg + 6], c1 = letra(C1);
      regras.push({ ref: `${c1}${rd}:${letra(CN)}${ult}`, rules: [{ type: 'expression', priority: 2, stopIfTrue: true,
        formulae: [`AND($B${rd}="Domingo",COUNTIF(${c1}${rd - 6}:${c1}${rd},"Folga")+COUNTIF(${c1}${rd - 6}:${c1}${rd},"Fechado")<2)`],
        style: estiloAviso }] });
    }
    regras.push({ ref: area, rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"Folga"'], priority: 3,
        style: { fill: preenche(COR.folga), font: { bold: true, color: { argb: COR.folgaTinta } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"Fechado"'], priority: 4,
        style: { fill: preenche(COR.fechado), font: { color: { argb: COR.cinza } } } },
      // "Trabalha" em cinza claro: o olho acha a folga sem ler a planilha inteira
      { type: 'cellIs', operator: 'equal', formulae: ['"Trabalha"'], priority: 6,
        style: { font: { color: { argb: COR.trabalhaFraco } } } },
    ] });
    const ct = letra(C_TRAB), cm = letra(C_MIN);
    regras.push({ ref: `${ct}${P1}:${ct}${ult}`, rules: [{ type: 'expression', priority: 5,
      formulae: [`AND(ISNUMBER(${cm}${P1}),${ct}${P1}<${cm}${P1})`], style: estiloErro }] });
    regras.forEach(rg => ws.addConditionalFormatting(rg));

    // folgas por semana e resumo, lendo a própria aba
    const ref = (e, a, b) => `'Calendário'!${letra(C1 + e)}${a}:${letra(C1 + e)}${b}`;
    const semanasLista = [];
    for (let seg = x.seg0; seg <= fim; seg += 7) {
      const a = Math.max(seg, ini), b = Math.min(seg + 6, fim);
      semanasLista.push({ seg, a: linhaDoDia[a], b: linhaDoDia[b], da: a, db: b, inteira: seg >= ini && seg + 6 <= fim });
    }
    const dias = `'Calendário'!$B$${P1}:$B$${ult}`;
    // as abas que leem o calendário vêm depois da escala fixa: quem chama decide a ordem.
    // `fonte` diz em que célula do Calendário está o dia de cada pessoa (o quadro do mês lê dali).
    return { fonte: (e, dia) => `'Calendário'!$${letra(C1 + e)}$${linhaDoDia[dia]}`, depois: () => {
      abaFolgasSemana(wb, M, x, semanasLista, (e, s) =>
        `COUNTIF(${ref(e, s.a, s.b)},"Folga")+COUNTIF(${ref(e, s.a, s.b)},"Fechado")`, e => `'Calendário'!${letra(C1 + e)}${L0}`);
      abaResumo(wb, x, e => {
        const faixa = ref(e, P1, ult);
        return [
          f(`'Calendário'!${letra(C1 + e)}${L0}`, cfg.nomes[e]),
          f(`COUNTIF(${faixa},"Folga")`, x.conta(e, ini, fim, v => v === 'F')),
          f(`COUNTIFS(${dias},"Domingo",${faixa},"Folga")+COUNTIFS(${dias},"Domingo",${faixa},"Fechado")`, x.conta(e, ini, fim, (v, d) => d === 6 && ehFolga(v))),
          f(`COUNTIFS(${dias},"Domingo",${faixa},"Trabalha")`, x.conta(e, ini, fim, (v, d) => d === 6 && v === 'T')),
          f(`COUNTIFS(${dias},"Sábado",${faixa},"Trabalha")`, x.conta(e, ini, fim, (v, d) => d === 5 && v === 'T')),
        ];
      });
    } };
  }

  // ---------------- formato "uma linha por pessoa" ----------------
  function abaPorPessoa(wb, M, x) {
    const { cfg, seg0, grade, N, total, semanas, K, ini, fim, nomeFeriado } = x;
    const C0 = 2, L_SEM = 3, L_DIA = 4, L_DATA = 5, L1 = 6, LN = L1 + N - 1;
    const L_TRAB = LN + 1, L_MIN = LN + 2;
    const ultCol = C0 + total - 1;
    const ws = wb.addWorksheet('Calendário', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: L_DATA, showGridLines: false }],
      pageSetup: { orientation: 'landscape', paperSize: 9, printTitlesRow: `${L_SEM}:${L_DATA}`, printTitlesColumn: 'A:A',
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    });
    ws.getColumn(1).width = 24;
    for (let c = C0; c <= ultCol; c++) ws.getColumn(c).width = 5.2;
    titulo(ws, `Escala de trabalho 5x2 · ${x.dataLonga(ini)} a ${x.dataLonga(fim)}`,
      `F = folga · T = trabalha · X = fechado · vermelho = passou de ${K} dias seguidos ou faltou gente no dia. ` +
      'Para trocar uma folga, troque as letras: tudo recalcula.');

    for (let w = 0; w < semanas; w++) {
      const c = C0 + w * 7;
      ws.mergeCells(L_SEM, c, L_SEM, c + 6);
      const cel = ws.getCell(L_SEM, c);
      cel.value = `Semana ${w + 1} · ${M.ddmm(seg0 + w * 7)} a ${M.ddmm(seg0 + w * 7 + 6)}`;
      cel.font = { name: FONTE, size: 9, bold: true, color: { argb: COR.branco } };
      cel.fill = preenche(COR.cabeca);
      cel.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    const cab = (r, c, v, fill, cinza) => {
      const cel = ws.getCell(r, c);
      cel.value = v;
      cel.font = { name: FONTE, size: 9, bold: true, color: { argb: cinza ? COR.cinza : COR.tinta } };
      cel.alignment = { horizontal: 'center', vertical: 'middle' };
      cel.border = bordas;
      if (fill) cel.fill = preenche(fill);
      return cel;
    };
    cab(L_DIA, 1, 'Dia');
    cab(L_DATA, 1, 'Funcionário');
    for (let k = 0; k < total; k++) {
      const c = C0 + k, dia = seg0 + k, d = k % 7, fora = dia < ini || dia > fim;
      const fill = d === 6 ? COR.domingo : null;
      cab(L_DIA, c, M.DIAS[d], fill, fora);
      const cel = cab(L_DATA, c, 25569 + dia, fill, fora);
      cel.numFmt = 'dd/mm';
      if (nomeFeriado[dia]) {
        cel.font = { name: FONTE, size: 9, bold: true, color: { argb: COR.feriado } };
        cel.note = `Feriado nacional: ${nomeFeriado[dia]}. Se abrir, pague em dobro ou dê outra folga.`;
      }
    }

    grade.forEach((linha, e) => {
      const r = L1 + e;
      const nome = ws.getCell(r, 1);
      nome.value = cfg.nomes[e];
      nome.font = { name: FONTE, size: 10, color: { argb: COR.tinta } };
      nome.border = bordas;
      linha.forEach((v, k) => {
        const cel = ws.getCell(r, C0 + k), dia = seg0 + k;
        cel.value = v === null ? '—' : v;
        cel.alignment = { horizontal: 'center', vertical: 'middle' };
        cel.border = bordas;
        cel.font = { name: FONTE, size: 10, color: { argb: v === null ? COR.cinza : COR.tinta } };
        // coluna inteira de domingo e de feriado pintada; a folga (formatação condicional) pinta por cima
        const fundo = nomeFeriado[dia] ? COR.feriadoFundo : k % 7 === 6 ? COR.domingo : null;
        if (fundo && v !== null) cel.fill = preenche(fundo);
        if (v === 'T' || v === 'F') {
          cel.dataValidation = { type: 'list', allowBlank: false, formulae: ['"T,F"'], showErrorMessage: true,
            errorTitle: 'Valor inválido', error: 'Use T (trabalha) ou F (folga).' };
        }
      });
    });

    const rotulo = (r, txt) => {
      const cel = ws.getCell(r, 1);
      cel.value = txt;
      cel.font = { name: FONTE, size: 9, italic: true, bold: true, color: { argb: COR.tinta } };
      cel.border = bordas;
    };
    rotulo(L_TRAB, 'Trabalhando');
    rotulo(L_MIN, 'Mínimo pedido');
    for (let k = 0; k < total; k++) {
      const c = C0 + k, col = letra(c), dia = seg0 + k, d = k % 7;
      const dentro = dia >= ini && dia <= fim && cfg.aberto[d];
      const t = ws.getCell(L_TRAB, c), m = ws.getCell(L_MIN, c);
      t.value = dentro ? f(`COUNTIF(${col}${L1}:${col}${LN},"T")`, grade.filter(l => l[k] === 'T').length) : '—';
      m.value = dentro ? cfg.minimo[d] : '—';
      [t, m].forEach(cel => {
        cel.alignment = { horizontal: 'center' };
        cel.border = bordas;
        cel.font = { name: FONTE, size: 9, italic: true, color: { argb: dentro ? COR.tinta : COR.cinza } };
      });
    }

    ws.addConditionalFormatting({ ref: `${letra(C0)}${L1}:${letra(ultCol)}${LN}`, rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"F"'], priority: 3,
        style: { fill: preenche(COR.folga), font: { bold: true, color: { argb: COR.folgaTinta } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"X"'], priority: 4,
        style: { fill: preenche(COR.fechado), font: { color: { argb: COR.cinza } } } },
      // T em cinza claro: o olho acha a folga sem ler 365 letras
      { type: 'cellIs', operator: 'equal', formulae: ['"T"'], priority: 6,
        style: { font: { color: { argb: COR.trabalhaFraco } } } },
    ] });
    if (total > K) {
      const c1 = C0 + K;    // vermelho quando a célula fecha uma sequência de K+1 dias "T"
      ws.addConditionalFormatting({ ref: `${letra(c1)}${L1}:${letra(ultCol)}${LN}`, rules: [
        { type: 'expression', priority: 1, formulae: [`COUNTIF(${letra(C0)}${L1}:${letra(c1)}${L1},"T")=${K + 1}`], style: estiloErro },
      ] });
    }
    ws.addConditionalFormatting({ ref: `${letra(C0)}${L_TRAB}:${letra(ultCol)}${L_TRAB}`, rules: [
      { type: 'expression', priority: 2, formulae: [`AND(ISNUMBER(${letra(C0)}${L_MIN}),${letra(C0)}${L_TRAB}<${letra(C0)}${L_MIN})`],
        style: estiloErro },
    ] });

    const semanasLista = [];
    for (let w = 0; w < semanas; w++) {
      const seg = seg0 + w * 7;
      semanasLista.push({ seg, a: C0 + w * 7, b: C0 + w * 7 + 6, da: seg, db: seg + 6, inteira: seg >= ini && seg + 6 <= fim });
    }
    const dias = `'Calendário'!${letra(C0)}${L_DIA}:${letra(ultCol)}${L_DIA}`;
    return { fonte: (e, dia) => `'Calendário'!$${letra(C0 + dia - seg0)}$${L1 + e}`, depois: () => {
      abaFolgasSemana(wb, M, x, semanasLista, (e, s) => {
        const f = `'Calendário'!${letra(s.a)}${L1 + e}:${letra(s.b)}${L1 + e}`;
        return `COUNTIF(${f},"F")+COUNTIF(${f},"X")`;
      }, e => `'Calendário'!A${L1 + e}`);
      abaResumo(wb, x, e => {
        const faixa = `'Calendário'!${letra(C0)}${L1 + e}:${letra(ultCol)}${L1 + e}`;
        return [
          f(`'Calendário'!A${L1 + e}`, cfg.nomes[e]),
          f(`COUNTIF(${faixa},"F")`, x.conta(e, seg0, seg0 + total - 1, v => v === 'F')),
          f(`SUMPRODUCT((${dias}="dom")*((${faixa}="F")+(${faixa}="X")))`, x.conta(e, seg0, seg0 + total - 1, (v, d) => d === 6 && ehFolga(v))),
          f(`SUMPRODUCT((${dias}="dom")*(${faixa}="T"))`, x.conta(e, seg0, seg0 + total - 1, (v, d) => d === 6 && v === 'T')),
          f(`SUMPRODUCT((${dias}="sáb")*(${faixa}="T"))`, x.conta(e, seg0, seg0 + total - 1, (v, d) => d === 5 && v === 'T')),
        ];
      });
    } };
  }

  // ---------------- quadro do mês: o que vai para a parede ----------------
  // A CLT (art. 67) pede a escala de revezamento "mensalmente organizada e constando de quadro
  // sujeito à fiscalização". Uma aba por mês, numa folha A4 deitada, lendo do Calendário: quem troca
  // uma folga lá vê o quadro acompanhar. Só a folga aparece (o trabalho fica em branco).
  function mesesDoPeriodo(M, ini, fim) {
    const out = [];
    let [a, m] = M.isoDe(ini).split('-').map(Number);
    for (;;) {
      const primeiro = M.diaDe(`${a}-${String(m).padStart(2, '0')}-01`);
      if (primeiro > fim) break;
      const [a2, m2] = m === 12 ? [a + 1, 1] : [a, m + 1];
      const prox = M.diaDe(`${a2}-${String(m2).padStart(2, '0')}-01`);
      out.push({ nome: `${MESES[m - 1]} de ${a}`, aba: `${MES_CURTO[m - 1]} ${String(a).slice(2)}`,
        a: Math.max(primeiro, ini), b: Math.min(prox - 1, fim) });
      [a, m] = [a2, m2];
    }
    return out;
  }

  function abaQuadroMes(wb, M, x, mes, fonte) {
    const { cfg, N, nomeFeriado } = x;
    const L_DIA = 4, L_DATA = 5, L1 = 6, LN = L1 + N - 1, L_TRAB = LN + 1, L_MIN = LN + 2;
    const C0 = 2, nd = mes.b - mes.a + 1, CN = C0 + nd - 1, C_FOL = CN + 1, C_DOM = CN + 2;
    const ws = wb.addWorksheet(mes.aba, {
      views: [{ state: 'frozen', xSplit: 1, ySplit: L_DATA, showGridLines: false }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        printTitlesRow: `${L_DIA}:${L_DATA}`, printTitlesColumn: 'A:A', horizontalCentered: true,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: '&L&8Escala Certa&R&8Página &P de &N' },
    });
    titulo(ws, `Escala de revezamento · ${mes.nome}`,
      'Empresa: ______________________________   ·   F = folga · X = fechado · em branco = trabalha. ' +
      'Para trocar uma folga, use a aba Calendário: este quadro acompanha.');
    ws.getColumn(1).width = 24;
    for (let c = C0; c <= CN; c++) ws.getColumn(c).width = 4.3;
    ws.getColumn(C_FOL).width = 8;
    ws.getColumn(C_DOM).width = 10;

    const cab = (r, c, v, fundo, cor) => {
      const cel = ws.getCell(r, c);
      cel.value = v;
      cel.font = { name: FONTE, size: 9, bold: true, color: { argb: cor || COR.tinta } };
      cel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cel.border = bordas;
      if (fundo) cel.fill = preenche(fundo);
      return cel;
    };
    cab(L_DIA, 1, 'Dia');
    cab(L_DATA, 1, 'Funcionário');
    const colunas = [];
    for (let dia = mes.a, c = C0; dia <= mes.b; dia++, c++) {
      const d = M.diaSemana(dia), fer = nomeFeriado[dia];
      const fundo = fer ? COR.feriadoFundo : d === 6 ? COR.domingo : null;
      colunas.push({ dia, c, d, fundo });
      cab(L_DIA, c, M.DIAS[d], fundo);
      const num = cab(L_DATA, c, Number(M.isoDe(dia).slice(8, 10)), fundo, fer ? COR.feriado : null);
      if (fer) num.note = `Feriado nacional: ${fer}. Se abrir, pague em dobro ou dê outra folga.`;
    }
    ws.mergeCells(L_DIA, C_FOL, L_DATA, C_FOL);
    ws.mergeCells(L_DIA, C_DOM, L_DATA, C_DOM);
    cabecalho(ws, L_DIA, C_FOL, 'Folgas');
    cabecalho(ws, L_DIA, C_DOM, 'Domingos de folga');
    ws.getRow(L_DATA).height = 16;

    // fim de semana separado por uma borda mais forte depois do domingo
    const borda = d => (d === 6 ? Object.assign({}, bordas, { right: { style: 'medium', color: { argb: COR.semana } } }) : bordas);
    const dias = `$${letra(C0)}$${L_DIA}:$${letra(CN)}$${L_DIA}`;
    for (let e = 0; e < N; e++) {
      const r = L1 + e;
      const nome = ws.getCell(r, 1);
      nome.value = cfg.nomes[e];
      nome.font = { name: FONTE, size: 10, color: { argb: COR.tinta } };
      nome.border = bordas;
      colunas.forEach(({ dia, c, d, fundo }) => {
        const src = fonte(e, dia), cel = ws.getCell(r, c);
        const v = x.grade[e][dia - x.seg0];
        cel.value = f(`IF(OR(${src}="Folga",${src}="F"),"F",IF(OR(${src}="Fechado",${src}="X"),"X",""))`, ehFolga(v) ? v : '');
        cel.alignment = { horizontal: 'center', vertical: 'middle' };
        cel.border = borda(d);
        cel.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.tinta } };
        if (fundo) cel.fill = preenche(fundo);
      });
      const faixa = `${letra(C0)}${r}:${letra(CN)}${r}`;
      const fol = ws.getCell(r, C_FOL), dom = ws.getCell(r, C_DOM);
      fol.value = f(`COUNTIF(${faixa},"F")`, x.conta(e, mes.a, mes.b, v => v === 'F'));
      dom.value = f(`SUMPRODUCT((${dias}="dom")*((${faixa}="F")+(${faixa}="X")))`, x.conta(e, mes.a, mes.b, (v, d) => d === 6 && ehFolga(v)));
      [fol, dom].forEach(cel => {
        cel.alignment = { horizontal: 'center', vertical: 'middle' };
        cel.border = bordas;
        cel.font = { name: FONTE, size: 10, color: { argb: COR.tinta } };
      });
    }

    const rotulo = (r, txt) => {
      const cel = ws.getCell(r, 1);
      cel.value = txt;
      cel.font = { name: FONTE, size: 9, italic: true, bold: true, color: { argb: COR.tinta } };
      cel.border = bordas;
    };
    rotulo(L_TRAB, 'Trabalhando');
    rotulo(L_MIN, 'Mínimo pedido');
    colunas.forEach(({ dia, c, d, fundo }) => {
      const col = letra(c), aberto = cfg.aberto[d];
      const t = ws.getCell(L_TRAB, c), m = ws.getCell(L_MIN, c);
      const folgam = x.grade.filter(l => ehFolga(l[dia - x.seg0])).length;
      t.value = aberto ? f(`${N}-COUNTIF(${col}${L1}:${col}${LN},"F")-COUNTIF(${col}${L1}:${col}${LN},"X")`, N - folgam) : '—';
      m.value = aberto ? cfg.minimo[d] : '—';
      [t, m].forEach(cel => {
        cel.alignment = { horizontal: 'center' };
        cel.border = borda(d);
        cel.font = { name: FONTE, size: 9, italic: true, color: { argb: aberto ? COR.tinta : COR.cinza } };
        if (fundo) cel.fill = preenche(fundo);
      });
    });

    ws.addConditionalFormatting({ ref: `${letra(C0)}${L1}:${letra(CN)}${LN}`, rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"F"'], priority: 1,
        style: { fill: preenche(COR.folga), font: { bold: true, color: { argb: COR.folgaTinta } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"X"'], priority: 2,
        style: { fill: preenche(COR.fechado), font: { color: { argb: COR.cinza } } } },
    ] });
    ws.addConditionalFormatting({ ref: `${letra(C0)}${L_TRAB}:${letra(CN)}${L_TRAB}`, rules: [
      { type: 'expression', priority: 3, formulae: [`AND(ISNUMBER(${letra(C0)}${L_MIN}),${letra(C0)}${L_TRAB}<${letra(C0)}${L_MIN})`],
        style: estiloErro },
    ] });

    const ferMes = x.feriados.filter(f => f.dia >= mes.a && f.dia <= mes.b);
    const nota = ws.getCell(L_MIN + 2, 1);
    nota.value = (ferMes.length
      ? 'Feriados: ' + ferMes.map(f => `${M.ddmm(f.dia)} ${f.nome}`).join(' · ') + '. Se abrir, pague em dobro ou dê outra folga.   '
      : '') + 'Vermelho em "Trabalhando" = gente de menos no dia.';
    nota.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.cinza } };
  }

  function abaFolgasSemana(wb, M, x, semanasLista, formula, nomeRef) {
    const fs = wb.addWorksheet('Folgas por semana', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false }] });
    titulo(fs, 'Folgas por semana (precisa de 2: vermelho se faltar, amarelo se passar; folga a mais pode ser férias ou afastamento)');
    fs.getCell(1, 1).font = { name: FONTE, size: 12, bold: true, color: { argb: COR.tinta } };
    cabecalho(fs, 3, 1, 'Funcionário', 24);
    fs.getRow(3).height = 28;
    semanasLista.forEach((s, w) => cabecalho(fs, 3, 2 + w, `${M.ddmm(s.seg)}${s.inteira ? '' : '\n(parcial)'}`, 11));
    for (let e = 0; e < x.N; e++) {
      const r = 4 + e;
      const nome = fs.getCell(r, 1);
      nome.value = f(nomeRef(e), x.cfg.nomes[e]);
      nome.font = { name: FONTE, size: 10 };
      nome.border = bordas;
      semanasLista.forEach((s, w) => {
        const cel = fs.getCell(r, 2 + w);
        cel.value = f(formula(e, s), x.conta(e, s.da, s.db, ehFolga));
        cel.alignment = { horizontal: 'center' };
        cel.border = bordas;
        cel.font = { name: FONTE, size: 10, color: { argb: s.inteira ? COR.tinta : COR.cinza } };
      });
    }
    // mesma conta do motor: com 2 dias fechados e domingo aberto, a folga extra de domingo é a regra
    const fechados = x.cfg.aberto.filter(a => !a).length;
    const normais = Math.max(2, fechados) + (fechados >= 2 && x.cfg.aberto[6] ? 1 : 0);
    semanasLista.forEach((s, w) => {
      if (!s.inteira) return;
      const col = letra(2 + w);
      fs.addConditionalFormatting({ ref: `${col}4:${col}${3 + x.N}`, rules: [
        { type: 'cellIs', operator: 'lessThan', formulae: ['2'], priority: 1, style: estiloErro },
        { type: 'cellIs', operator: 'greaterThan', formulae: [String(normais)], priority: 2, style: estiloAviso },
      ] });
    });
  }

  function abaResumo(wb, x, formulas) {
    const rs = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
    titulo(rs, 'Resumo do período por pessoa');
    rs.getCell(1, 1).font = { name: FONTE, size: 12, bold: true, color: { argb: COR.tinta } };
    ['Funcionário', 'Folgas no período', 'Domingos de folga', 'Domingos trabalhados', 'Sábados trabalhados']
      .forEach((t, i) => cabecalho(rs, 3, 1 + i, t, i ? 13 : 24));
    rs.getRow(3).height = 30;
    for (let e = 0; e < x.N; e++) {
      formulas(e).forEach((v, i) => {
        const cel = rs.getCell(4 + e, 1 + i);
        cel.value = v;
        cel.font = { name: FONTE, size: 10 };
        cel.border = bordas;
        if (i) cel.alignment = { horizontal: 'center' };
      });
    }
  }

  function abaRegras(wb, M, x) {
    const { cfg, N, K, S, ini, fim, feriados } = x;
    const rg = wb.addWorksheet('Regras', { views: [{ showGridLines: false }] });
    rg.getColumn(1).width = 30;
    rg.getColumn(2).width = 90;
    let r = 1;
    const secao = txt => {
      rg.getCell(r, 1).value = txt;
      rg.getCell(r, 1).font = { name: FONTE, size: 12, bold: true, color: { argb: COR.tinta } };
      r += 2;
    };
    const linha = (a, b, estilo) => {
      const ca = rg.getCell(r, 1), cb = rg.getCell(r, 2);
      ca.value = a; cb.value = b;
      ca.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.tinta } };
      cb.font = Object.assign({ name: FONTE, size: 10, color: { argb: COR.tinta } }, estilo);
      cb.alignment = { wrapText: true, vertical: 'top' };
      ca.alignment = { vertical: 'top' };
      r++;
    };
    secao('Configuração usada');
    linha('Período', `${x.dataLonga(ini)} a ${x.dataLonga(fim)}`);
    linha('Equipe', `${N} pessoa${N > 1 ? 's' : ''}`);
    linha('Dias de funcionamento', M.DIAS_LONGOS.filter((_, d) => cfg.aberto[d]).join(', '));
    linha('Mínimo de pessoas por dia', M.DIAS.map((d, i) => (cfg.aberto[i] ? `${d} ${cfg.minimo[i]}` : null)).filter(Boolean).join(' · '));
    linha('Dias em que pode haver folga', M.DIAS_LONGOS.filter((_, d) => cfg.aberto[d] && cfg.podeFolgar[d]).join(', '));
    linha('Máximo de dias seguidos', String(K));
    if (cfg.aberto[6]) {
      linha('Domingo de folga', `${S === 3 ? 'Comércio' : 'Indústria, transporte ou serviços'}: pelo menos 1 a cada ${S} semanas.` +
        (cfg.art386 ? ' Art. 386 da CLT: mulheres folgam em domingos alternados.' : ''));
    }
    linha('Feriados nacionais no período', feriados.length
      ? feriados.map(f => `${M.ddmm(f.dia)} (${M.DIAS[M.diaSemana(f.dia)]}) ${f.nome}`).join(' · ') : 'nenhum');
    r++;
    secao('O que a lei diz');
    linha('Escala 5x2', 'A Emenda Constitucional 141/2026 garante 2 dias de descanso remunerado por semana, um deles de preferência no domingo, a partir de 16/12/2026.');
    linha('Horas', 'Até 42 h por semana a partir de 16/12/2026 e até 40 h a partir de 16/12/2027, sem redução de salário. Com 8 h por dia, 5 dias dão 40 h; passar disso exige convenção coletiva.');
    linha('Domingos', 'No comércio, o descanso precisa cair no domingo pelo menos 1 vez a cada 3 semanas (Lei 10.101/2000); nas demais atividades, ' +
      '1 vez a cada 7 semanas (Portaria MTP 671/2021). Para mulheres, a CLT (art. 386) prevê revezamento quinzenal. ' +
      'Motorista em viagem segue a Lei 13.103/2015 e não entra nesta escala.');
    linha('Feriados', 'Trabalho em feriado sem folga compensatória é pago em dobro. No comércio, abrir em feriado depende da convenção coletiva.');
    linha('Aviso', 'Esta escala é uma ferramenta de apoio. Confira a convenção coletiva da sua categoria e fale com o seu contador antes de aplicar.',
      { italic: true, color: { argb: COR.cinza } });
  }

  function planilha(ExcelJS, M, dados, formato) {
    const x = contexto(M, dados);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Escala Certa';
    wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;      // com edição habilitada, o Excel refaz as contas ao abrir
    // o arquivo abre no calendário, que é a escala que as pessoas reconhecem e onde se troca folga;
    // logo depois, um quadro por mês (para imprimir e afixar), e então a escala fixa
    const cal = (formato || (x.N <= 12 ? 'dia' : 'pessoa')) === 'dia' ? abaPorDia(wb, M, x) : abaPorPessoa(wb, M, x);
    mesesDoPeriodo(M, x.ini, x.fim).forEach(mes => abaQuadroMes(wb, M, x, mes, cal.fonte));
    if (dados.rodizio) abaEscalaFixa(wb, M, x, dados.rodizio, dados.repete);
    cal.depois();
    abaRegras(wb, M, x);
    wb.views = [{ activeTab: 0, firstSheet: 0 }];
    return wb;
  }

  // ---------------- escala fixa: o rodízio que se repete ----------------
  function abaEscalaFixa(wb, M, x, rodizio, repete) {
    const P = repete;
    const ws = wb.addWorksheet('Escala fixa', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }],
      pageSetup: { orientation: P > 6 ? 'landscape' : 'portrait', paperSize: 9, printTitlesRow: '4:4', printTitlesColumn: 'A:A',
        fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const uniforme = rodizio.every(r => r.periodo === P);
    titulo(ws, uniforme ? `Escala fixa · se repete a cada ${P} semana${P > 1 ? 's' : ''}` : 'Escala fixa · cada pessoa repete o próprio ciclo',
      `Dias de folga de cada pessoa. A semana 1 começa na segunda ${x.dataLonga(x.seg0)}; quando a linha da pessoa acaba, ela volta para a semana 1. ` +
      'Trocas de um dia só ficam na aba Calendário.');
    cabecalho(ws, 4, 1, 'Funcionário', 24);
    for (let s = 0; s < P; s++) cabecalho(ws, 4, 2 + s, `Semana ${s + 1}\n${M.ddmm(x.seg0 + 7 * s)}`, 13);
    cabecalho(ws, 4, 2 + P, 'Depois', 16);
    ws.getRow(4).height = 30;
    rodizio.forEach((r, e) => {
      const nome = ws.getCell(5 + e, 1);
      nome.value = x.cfg.nomes[e];
      nome.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.tinta } };
      nome.border = bordas;
      for (let s = 0; s <= P; s++) {
        const cel = ws.getCell(5 + e, 2 + s);
        cel.alignment = { horizontal: 'center', vertical: 'middle' };
        cel.border = bordas;
        if (s < r.periodo) {
          cel.value = r.semanas[s].map(d => M.DIAS[d]).join(' + ');
          cel.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.folgaTinta } };
          cel.fill = preenche(COR.folga);
        } else if (s === r.periodo) {
          cel.value = '↺ volta à semana 1';
          cel.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.cinza } };
        }
      }
    });
    let r = 6 + rodizio.length;
    const nota = txt => {
      const cel = ws.getCell(r++, 1);
      cel.value = txt;
      cel.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.cinza } };
    };
    const fechados = M.DIAS_LONGOS.filter((_, d) => !x.cfg.aberto[d]);
    if (fechados.length) nota(`Dias fechados entram como folga de todos: ${fechados.join(', ')}.`);
    nota('A escala vale até alguém entrar ou sair da equipe. Aí é só montar de novo.');
  }

  const api = { planilha };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ExportarEscala = api;
})();
