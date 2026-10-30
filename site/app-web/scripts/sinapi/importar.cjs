const fs = require("fs");
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const itens = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const TAM = 400;
  let feitos = 0;
  for (let i = 0; i < itens.length; i += TAM) {
    const lote = itens.slice(i, i + TAM);
    const params = [];
    const valores = lote.map((it, n) => {
      const b = n * 10;
      params.push(it.fonte, it.grupo, it.codigo, it.categoria, it.classe_origem, it.descricao, it.unidade, it.preco_ref, it.uf, it.referencia);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}::numeric, $${b + 9}, $${b + 10})`;
    });
    await p.$executeRawUnsafe(
      `INSERT INTO catalogo_obra (fonte, grupo, codigo, categoria, classe_origem, descricao, unidade, preco_ref, uf, referencia)
       VALUES ${valores.join(",")}
       ON CONFLICT (fonte, grupo, codigo, uf) DO UPDATE SET
         categoria = EXCLUDED.categoria, classe_origem = EXCLUDED.classe_origem, descricao = EXCLUDED.descricao,
         unidade = EXCLUDED.unidade, preco_ref = EXCLUDED.preco_ref, referencia = EXCLUDED.referencia`,
      ...params
    );
    feitos += lote.length;
  }
  const r = await p.$queryRawUnsafe(`select grupo, count(*)::int n from catalogo_obra where fonte='SINAPI' and uf='RO' group by 1 order by 1`);
  console.log("importados:", feitos, r);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
