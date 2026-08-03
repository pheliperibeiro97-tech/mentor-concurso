# Baseline do estado — ferramenta de verificação da migração multi-perfil.
#
# O PLANO_MULTI_PERFIL.md exige comparar as contagens ANTES e DEPOIS de migrar
# ("qualquer divergência = abortar e corrigir"). Este script tira o retrato e,
# depois, confere se ele continua o mesmo.
#
# Ele entende os dois formatos: o plano (coleções no topo) e o multi-perfil
# (coleções dentro de perfis[]). Achata o segundo no primeiro antes de contar,
# então o retrato de antes e o de depois são comparáveis diretamente.
#
# Nunca grava VALORES: strings viram (tamanho, hash). O estado carrega a chave
# da API da IA em config.iaKey — o arquivo de baseline é commitável por isso.
#
# Uso:
#   python dev/baseline-estado.py                          # retrato do SQLite do desktop
#   python dev/baseline-estado.py --salvar dev/baseline-multi-perfil.json
#   python dev/baseline-estado.py --comparar dev/baseline-multi-perfil.json
#   python dev/baseline-estado.py --json <arquivo.json>    # lê de um export em vez do banco

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime

DB_PADRAO = os.path.join(
    os.environ.get("APPDATA", ""), "com.felipe.mentorconcurso", "mentor_concurso.db"
)

# Whitelist do plano: o que fica no TOPO. Todo o resto pertence ao perfil.
# Serve aqui só para achatar de volta — a migração de verdade vive no store.js.
GLOBAL_TOP = {
    "meta", "config", "bancas", "lembretes", "indicacoes",
    "modificadoEm", "perfis", "perfilAtivo",
}


def ler_estado_sqlite(caminho):
    con = sqlite3.connect(f"file:{caminho}?mode=ro", uri=True)
    try:
        linha = con.execute("select value from kv where key='state'").fetchone()
    finally:
        con.close()
    if not linha:
        sys.exit(f"não há chave 'state' em {caminho}")
    return json.loads(linha[0])


def achatar(estado):
    """Formato multi-perfil -> formato plano, para comparar com o baseline antigo."""
    perfis = estado.get("perfis")
    if not isinstance(perfis, list) or not perfis:
        return estado, "plano", None, 0

    ativo_id = estado.get("perfilAtivo")
    ativo = next((p for p in perfis if p.get("id") == ativo_id), perfis[0])

    plano = {k: v for k, v in estado.items() if k not in ("perfis", "perfilAtivo")}
    config = dict(plano.get("config") or {})
    for k, v in ativo.items():
        if k in ("id", "nome"):
            continue
        if k == "config" and isinstance(v, dict):
            config.update(v)  # config-de-perfil (fase 0b) por cima do global
        else:
            plano[k] = v
    if config:
        plano["config"] = config
    return plano, "multi-perfil", ativo.get("id"), len(perfis)


def resumir(valor, profundidade=1):
    """Retrato de um valor: forma e tamanho, nunca o conteúdo."""
    if isinstance(valor, list):
        return {"t": "lista", "n": len(valor)}
    if isinstance(valor, dict):
        r = {"t": "obj", "n": len(valor)}
        if profundidade > 0 and valor:
            r["k"] = {k: resumir(v, profundidade - 1) for k, v in sorted(valor.items())}
        return r
    if isinstance(valor, str):
        h = hashlib.sha256(valor.encode("utf-8")).hexdigest()[:8]
        return {"t": "str", "n": len(valor), "h": h}
    if valor is None:
        return {"t": "null"}
    return {"t": type(valor).__name__, "v": valor}


def retratar(estado, origem):
    plano, formato, perfil_ativo, n_perfis = achatar(estado)
    topo = {k: resumir(plano[k], 1) for k in sorted(plano)}
    itens = sum(v["n"] for v in topo.values() if v["t"] == "lista")
    return {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "origem": origem,
        "formato": formato,
        "perfil_ativo": perfil_ativo,
        "perfis": n_perfis,
        "totais": {
            "chaves_topo": len(plano),
            "chaves_config": len(plano.get("config") or {}),
            "itens_em_listas_do_topo": itens,
        },
        "topo": topo,
    }


def achatar_para_diff(no, prefixo=""):
    """{'topo.config.k.tema': {...}} — para o diff apontar o caminho exato."""
    saida = {}
    for chave, valor in no.items():
        caminho = f"{prefixo}{chave}"
        filhos = valor.pop("k", None) if isinstance(valor, dict) else None
        saida[caminho] = valor
        if filhos:
            saida.update(achatar_para_diff(filhos, caminho + "."))
    return saida


def comparar(antes, agora):
    a = achatar_para_diff(json.loads(json.dumps(antes["topo"])))
    b = achatar_para_diff(json.loads(json.dumps(agora["topo"])))
    sumiram = sorted(set(a) - set(b))
    surgiram = sorted(set(b) - set(a))
    mudaram = sorted(k for k in set(a) & set(b) if a[k] != b[k])
    return sumiram, surgiram, mudaram


def main():
    ap = argparse.ArgumentParser(description="Retrato/verificação do estado do Mentor.")
    ap.add_argument("--db", default=DB_PADRAO, help="SQLite do app (desktop)")
    ap.add_argument("--json", help="lê o estado de um export JSON em vez do banco")
    ap.add_argument("--salvar", help="grava o retrato neste arquivo")
    ap.add_argument("--comparar", help="compara o estado atual com um retrato salvo")
    args = ap.parse_args()

    if args.json:
        with open(args.json, encoding="utf-8") as f:
            estado = json.load(f)
        origem = f"json:{os.path.basename(args.json)}"
    else:
        if not os.path.exists(args.db):
            sys.exit(f"banco não encontrado: {args.db}")
        estado = ler_estado_sqlite(args.db)
        origem = f"sqlite:{os.path.basename(args.db)}"

    retrato = retratar(estado, origem)

    print(f"formato: {retrato['formato']}", end="")
    if retrato["formato"] == "multi-perfil":
        print(f" | perfis: {retrato['perfis']} | ativo: {retrato['perfil_ativo']}", end="")
    print(f" | origem: {origem}")
    t = retrato["totais"]
    print(
        f"{t['chaves_topo']} chaves no topo · {t['chaves_config']} no config · "
        f"{t['itens_em_listas_do_topo']} itens somados nas listas do topo\n"
    )
    for chave, v in retrato["topo"].items():
        if v["t"] == "lista":
            print(f"  {chave:<26} {v['n']}")
    print()

    if args.salvar:
        with open(args.salvar, "w", encoding="utf-8") as f:
            json.dump(retrato, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"retrato salvo em {args.salvar}")

    if args.comparar:
        with open(args.comparar, encoding="utf-8") as f:
            antes = json.load(f)
        sumiram, surgiram, mudaram = comparar(antes, retrato)
        print(f"comparando com {args.comparar} (de {antes['gerado_em']}, formato {antes['formato']})")
        if not (sumiram or surgiram or mudaram):
            print("OK — nada sumiu, nada mudou de tamanho.")
            return 0
        for rotulo, itens in (("SUMIU", sumiram), ("SURGIU", surgiram), ("MUDOU", mudaram)):
            for k in itens:
                if rotulo == "MUDOU":
                    a = achatar_para_diff(json.loads(json.dumps(antes["topo"])))[k]
                    b = achatar_para_diff(json.loads(json.dumps(retrato["topo"])))[k]
                    print(f"  {rotulo:<7} {k}: {a} -> {b}")
                else:
                    print(f"  {rotulo:<7} {k}")
        print("\nDIVERGÊNCIA — o plano manda abortar e corrigir antes de seguir.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
